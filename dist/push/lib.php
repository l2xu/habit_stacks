<?php
/**
 * Push-Dienst für Habit Stacks: Web Push (RFC 8030, 8291, 8292) ohne Abhängigkeiten – PHP 8.0+ mit openssl und curl.
 *
 * Die App plant ihre Nachrichten selbst (src/features/notify/plan.ts) und schickt den Plan an api.php.
 * cron.php (Cronjob, jede Minute) verschickt, was fällig ist. Gespeichert wird in HABIT_PUSH_DATA, Standard: push/data
 * neben diesem Skript. Der Ordner liegt im Webroot, weil Plesk PHP per open_basedir oft darauf beschränkt; Web und Cron
 * finden ihn so sicher am selben Ort. Damit nichts abrufbar ist, sind alle Dateien PHP, die mit `exit` beginnen
 * (PUSH_GUARD), dazu sperrt eine .htaccess den Ordner. Nicht im Git.
 *   vapid.php            Schlüsselpaar des Servers, wird beim ersten Aufruf erzeugt
 *   devices/<hash>.php   Abo und geplante Nachrichten eines Geräts
 *   cron-last.php        letzter Cron-Lauf
 *   log.php              Fehler beim Senden
 */

declare(strict_types=1);

const PUSH_MAX_DEVICES = 50;
const PUSH_MAX_ITEMS = 500;
/** Verpasste Nachrichten (Cron lief nicht) werden höchstens so spät noch verschickt. */
const PUSH_LATE_LIMIT_MS = 15 * 60 * 1000;
/** So lange hält der Push-Dienst eine Nachricht für ein Gerät bereit, das gerade offline ist. */
const PUSH_TTL = 2 * 3600;
/** Geräte ohne geplante Nachrichten, die so lange nichts gemeldet haben, werden aufgeräumt. */
const PUSH_STALE_SECONDS = 60 * 86400;
/** Push-Dienste der Browser (Google, Apple, Mozilla, Microsoft) – an andere Adressen schickt der Server nichts. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];

// ───────────────────────────── Speicher ─────────────────────────────

/** Steht vor jeder Datendatei: Ruft jemand sie im Browser auf, beendet PHP sofort und gibt nichts aus. */
const PUSH_GUARD = "<?php exit; ?>\n";

function push_data_dir(): string
{
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }
    $path = getenv('HABIT_PUSH_DATA') ?: __DIR__ . '/data';
    if (!is_dir("$path/devices") && !@mkdir("$path/devices", 0700, true) && !is_dir("$path/devices")) {
        $why = error_get_last()['message'] ?? 'unbekannt';
        throw new RuntimeException("Ordner $path lässt sich nicht anlegen ($why)");
    }
    if (!is_file("$path/.htaccess")) {
        @file_put_contents("$path/.htaccess", "Require all denied\n");
    }
    return $dir = $path;
}

function push_device_file(string $endpoint): string
{
    return push_data_dir() . '/devices/' . hash('sha256', $endpoint) . '.php';
}

/** @return string[] */
function push_device_files(): array
{
    return glob(push_data_dir() . '/devices/*.php') ?: [];
}

/** Inhalt einer Datendatei ohne PUSH_GUARD; null, wenn leer oder kein JSON-Objekt. */
function push_decode(string|false $raw): ?array
{
    if (!$raw) {
        return null;
    }
    if (str_starts_with($raw, PUSH_GUARD)) {
        $raw = substr($raw, strlen(PUSH_GUARD));
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

/** Datendatei nur lesen (ohne Sperre). */
function push_read(string $file): ?array
{
    return push_decode(@file_get_contents($file));
}

/**
 * Liest und ändert eine Datendatei (PUSH_GUARD + JSON) unter Sperre. $fn bekommt den Inhalt (null = neu) und gibt den neuen zurück;
 * null löscht die Datei, ein unveränderter Inhalt wird nicht neu geschrieben.
 */
function push_with_file(string $file, callable $fn): void
{
    $fp = fopen($file, 'c+');
    if ($fp === false) {
        throw new RuntimeException("$file lässt sich nicht öffnen");
    }
    try {
        flock($fp, LOCK_EX);
        $data = push_decode(stream_get_contents($fp));
        $next = $fn($data);
        if ($next === null) {
            unlink($file);
        } elseif ($next !== $data) {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, PUSH_GUARD . json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            fflush($fp);
        }
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

/** Letzter Cron-Lauf ({ at: ms }) – zeigt die App in den Einstellungen, damit man sieht, ob der Cronjob läuft. */
function push_cron_file(): string
{
    return push_data_dir() . '/cron-last.php';
}

/** Schreibt nach data/log.php – oder ins PHP-Fehlerprotokoll, wenn der Datenordner selbst das Problem ist. */
function push_log(string $message): void
{
    try {
        $file = push_data_dir() . '/log.php';
    } catch (Throwable) {
        error_log("habit-stacks push: $message");
        return;
    }
    if (@filesize($file) > 200_000) {
        @rename($file, "$file.1.php");
    }
    $line = date('Y-m-d H:i:s') . " $message\n";
    @file_put_contents($file, (is_file($file) ? '' : PUSH_GUARD) . $line, FILE_APPEND | LOCK_EX);
}

// ───────────────────────────── Prüfen ─────────────────────────────

function b64u_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64u_decode(string $s): string|false
{
    $s = strtr($s, '-_', '+/');
    return base64_decode(str_pad($s, (int) ceil(strlen($s) / 4) * 4, '='), true);
}

function push_allowed_host(string $host): bool
{
    foreach (PUSH_HOSTS as $allowed) {
        if ($host === $allowed || str_ends_with($host, ".$allowed")) {
            return true;
        }
    }
    return false;
}

/** Abo aus dem Browser (PushSubscription.toJSON()) – null, wenn es nicht wie eines aussieht. */
function push_valid_subscription(mixed $sub): ?array
{
    $endpoint = $sub['endpoint'] ?? null;
    $p256dh = $sub['keys']['p256dh'] ?? null;
    $auth = $sub['keys']['auth'] ?? null;
    if (!is_string($endpoint) || !is_string($p256dh) || !is_string($auth) || strlen($endpoint) > 1024) {
        return null;
    }
    $url = parse_url($endpoint);
    if (($url['scheme'] ?? '') !== 'https' || !push_allowed_host($url['host'] ?? '')) {
        return null;
    }
    $public = b64u_decode($p256dh);
    $secret = b64u_decode($auth);
    if ($public === false || strlen($public) !== 65 || $public[0] !== "\x04" || $secret === false || strlen($secret) !== 16) {
        return null;
    }
    return ['endpoint' => $endpoint, 'keys' => ['p256dh' => $p256dh, 'auth' => $auth]];
}

/** Geplante Nachrichten: [{ at: ms, towerId, title, body }] – null bei ungültigen Daten. */
function push_valid_items(mixed $items): ?array
{
    if (!is_array($items) || array_values($items) !== $items || count($items) > PUSH_MAX_ITEMS) {
        return null;
    }
    $out = [];
    foreach ($items as $item) {
        $at = $item['at'] ?? null;
        $towerId = $item['towerId'] ?? null;
        $title = $item['title'] ?? null;
        $body = $item['body'] ?? null;
        if (!is_int($at) || !is_string($towerId) || !is_string($title) || !is_string($body)) {
            return null;
        }
        // Bytes, nicht Zeichen (Umlaute zählen doppelt) – Apple nimmt höchstens 4 KB pro Nachricht.
        if (strlen($towerId) > 80 || strlen($title) > 300 || strlen($body) > 1200) {
            return null;
        }
        $out[] = ['at' => $at, 'towerId' => $towerId, 'title' => $title, 'body' => $body];
    }
    return $out;
}

// ───────────────────────────── Krypto ─────────────────────────────

/** P-256-Schlüsselpaar; öffentlicher Schlüssel als unkomprimierter Punkt (65 Bytes). */
function push_new_key(): array
{
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if ($key === false) {
        throw new RuntimeException('openssl: Schlüssel lässt sich nicht erzeugen');
    }
    $ec = openssl_pkey_get_details($key)['ec'];
    $pad = fn (string $n) => str_pad($n, 32, "\0", STR_PAD_LEFT);
    return [$key, "\x04" . $pad($ec['x']) . $pad($ec['y'])];
}

/** Rohen öffentlichen P-256-Schlüssel (65 Bytes) als PEM verpacken. */
function push_public_pem(string $raw): string
{
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** VAPID-Schlüssel des Servers; beim ersten Aufruf erzeugt. Wer ihn löscht, macht alle Abos ungültig (die App abonniert neu). */
function push_vapid(): array
{
    $vapid = null;
    push_with_file(push_data_dir() . '/vapid.php', function (?array $stored) use (&$vapid) {
        if (!$stored) {
            [$key, $public] = push_new_key();
            openssl_pkey_export($key, $pem);
            $stored = ['publicKey' => b64u_encode($public), 'privateKey' => $pem];
        }
        $vapid = $stored;
        return $stored;
    });
    @chmod(push_data_dir() . '/vapid.php', 0600);
    return $vapid;
}

/** ECDSA-Signatur von DER (SEQUENCE { r, s }) in das JWT-Format r‖s (je 32 Bytes). */
function push_der_to_raw(string $der): string
{
    $pos = 2;
    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$pos + 1]);
        $int = substr($der, $pos + 2, $len);
        $parts[] = str_pad(ltrim($int, "\0"), 32, "\0", STR_PAD_LEFT);
        $pos += 2 + $len;
    }
    return $parts[0] . $parts[1];
}

/** VAPID-JWT (RFC 8292) für den Push-Dienst `aud`. */
function push_vapid_jwt(string $aud, string $subject, string $privatePem): string
{
    $header = b64u_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64u_encode(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $subject], JSON_UNESCAPED_SLASHES));
    if (!openssl_sign("$header.$claims", $der, $privatePem, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('openssl: Signieren fehlgeschlagen');
    }
    return "$header.$claims." . b64u_encode(push_der_to_raw($der));
}

/** Verschlüsselt den Inhalt für ein Gerät (RFC 8291, aes128gcm, ein Datensatz). */
function push_encrypt(string $payload, string $uaPublic, string $authSecret): string
{
    [$local, $asPublic] = push_new_key();
    $shared = openssl_pkey_derive(push_public_pem($uaPublic), $local);
    if ($shared === false) {
        throw new RuntimeException('openssl: ECDH fehlgeschlagen');
    }
    $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $asPublic, $authSecret);
    $salt = random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
    // 0x02 = letzter (einziger) Datensatz, ohne Polsterung.
    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    return $salt . pack('N', 4096) . chr(strlen($asPublic)) . $asPublic . $cipher . $tag;
}

// ───────────────────────────── Senden ─────────────────────────────

/**
 * Schickt eine Nachricht { title, body, tag } an ein Abo. Gibt den HTTP-Status des Push-Dienstes zurück
 * (201 = angenommen, 404/410 = Abo abgelaufen).
 */
function push_send(array $sub, array $message, array $vapid, string $subject, int $ttl = PUSH_TTL): int
{
    $endpoint = $sub['endpoint'];
    $url = parse_url($endpoint);
    $aud = 'https://' . $url['host'] . (isset($url['port']) ? ':' . $url['port'] : '');
    $jwt = push_vapid_jwt($aud, $subject, $vapid['privateKey']);
    $body = push_encrypt(
        json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        b64u_decode($sub['keys']['p256dh']),
        b64u_decode($sub['keys']['auth']),
    );

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            "TTL: $ttl",
            'Urgency: high',
            "Authorization: vapid t=$jwt, k={$vapid['publicKey']}",
        ],
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $GLOBALS['push_last_error'] = null;
    if ($status < 200 || $status >= 300) {
        $detail = $response === false ? curl_error($ch) : substr((string) $response, 0, 200);
        $GLOBALS['push_last_error'] = trim("$status $detail");
        push_log("{$url['host']}: $status $detail");
    }
    return $status;
}

/** Antwort des Push-Dienstes beim letzten fehlgeschlagenen push_send() (Status + Text), sonst null. */
function push_last_error(): ?string
{
    return $GLOBALS['push_last_error'] ?? null;
}

/** `sub` im VAPID-JWT: die Adresse der App (Apple verlangt eine https- oder mailto-Angabe). */
function push_origin(): string
{
    return 'https://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}

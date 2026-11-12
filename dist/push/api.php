<?php
/**
 * Schnittstelle für die App (src/features/notify/push.ts):
 *   GET  ?action=key          → { publicKey }                 VAPID-Schlüssel zum Abonnieren
 *   POST ?action=sync         { subscription, items, stamp }  ersetzt den Plan eines Geräts
 *   POST ?action=unsubscribe  { endpoint }                    Gerät vergessen
 *   POST ?action=test         { subscription }                sofort eine Test-Nachricht
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

/** Antwortet und beendet das Skript. */
function reply(int $status, array $body)
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $action = $_GET['action'] ?? '';
    if ($action === 'key') {
        $cron = push_read(push_cron_file());
        reply(200, ['publicKey' => push_vapid()['publicKey'], 'cronAt' => is_int($cron['at'] ?? null) ? $cron['at'] : null]);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        reply(405, ['error' => 'POST erwartet']);
    }
    // Nur die App selbst darf planen – keine fremde Seite im selben Browser.
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $host = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
    if ($origin !== null && parse_url($origin, PHP_URL_HOST) !== $host) {
        reply(403, ['error' => 'Fremder Ursprung']);
    }
    $in = json_decode(file_get_contents('php://input', false, null, 0, 256 * 1024) ?: 'null', true);
    if (!is_array($in)) {
        reply(400, ['error' => 'JSON erwartet']);
    }

    switch ($action) {
        case 'sync':
            $sub = push_valid_subscription($in['subscription'] ?? null) ?? reply(400, ['error' => 'Ungültiges Abo']);
            $items = push_valid_items($in['items'] ?? null) ?? reply(400, ['error' => 'Ungültiger Plan']);
            $stamp = is_int($in['stamp'] ?? null) ? $in['stamp'] : 0;
            $file = push_device_file($sub['endpoint']);
            if (!is_file($file) && count(push_device_files()) >= PUSH_MAX_DEVICES) {
                reply(429, ['error' => 'Zu viele Geräte']);
            }
            push_with_file($file, fn (?array $device) => $device && ($device['stamp'] ?? 0) > $stamp ? $device : [
                'subscription' => $sub,
                'origin' => push_origin(),
                'stamp' => $stamp,
                'updatedAt' => time(),
                'items' => $items,
            ]);
            reply(200, ['ok' => true, 'items' => count($items)]);

        case 'unsubscribe':
            $endpoint = $in['endpoint'] ?? null;
            if (!is_string($endpoint)) {
                reply(400, ['error' => 'endpoint fehlt']);
            }
            $file = push_device_file($endpoint);
            if (is_file($file)) {
                push_with_file($file, fn () => null);
            }
            reply(200, ['ok' => true]);

        case 'test':
            $sub = push_valid_subscription($in['subscription'] ?? null) ?? reply(400, ['error' => 'Ungültiges Abo']);
            $status = push_send($sub, [
                'title' => 'Habit Stacks',
                'body' => 'Push funktioniert! So kommen deine Erinnerungen und Warnungen an.',
                'tag' => 'test',
            ], push_vapid(), push_origin(), 60);
            if ($status < 200 || $status >= 300) {
                reply(502, ['ok' => false, 'status' => $status, 'error' => 'Push-Dienst antwortet ' . (push_last_error() ?? $status)]);
            }
            reply(200, ['ok' => true, 'status' => $status]);

        default:
            reply(404, ['error' => 'Unbekannte Aktion']);
    }
} catch (Throwable $e) {
    push_log('api: ' . $e->getMessage());
    // Eigener Server, eigene App: Die Ursache hilft bei der Einrichtung mehr als ein allgemeiner Fehler.
    reply(500, ['error' => 'Serverfehler: ' . $e->getMessage()]);
}

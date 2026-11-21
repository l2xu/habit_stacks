<?php
/**
 * Verschickt fällige Nachrichten. Als Cronjob jede Minute aufrufen (Plesk: Geplante Aufgaben → PHP-Skript ausführen,
 * Zeitplan `* * * * *`), nur über die Kommandozeile. Lokal: `npm run push:cron`.
 * Pro Turm geht höchstens die neueste fällige Nachricht raus; ältere als PUSH_LATE_LIMIT_MS verfallen still.
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

try {
    $now = (int) floor(microtime(true) * 1000);
    push_with_file(push_cron_file(), fn () => ['at' => $now]);
    $vapid = push_vapid();
    // Geräte, bei denen etwas anderes als ein ungültiger Schlüssel schiefging – meist ein Problem des Servers.
    $failed = 0;

    foreach (push_device_files() as $file) {
        // Jedes Gerät für sich: Ein defektes Abo darf den Lauf für alle anderen nicht abbrechen.
        try {
            push_with_file($file, function (?array $device) use ($now, $vapid): ?array {
                if (!$device || !isset($device['subscription'])) {
                    return null;
                }
                $items = $device['items'] ?? [];
                if (!$items && time() - ($device['updatedAt'] ?? 0) > PUSH_STALE_SECONDS) {
                    return null;
                }
                $due = array_filter($items, fn (array $item) => $item['at'] <= $now);
                if (!$due) {
                    return $device;
                }

                $latest = [];
                foreach ($due as $item) {
                    if ($now - $item['at'] <= PUSH_LATE_LIMIT_MS) {
                        $latest[$item['towerId']] = $item;
                    }
                }
                foreach ($latest as $item) {
                    $status = push_send(
                        $device['subscription'],
                        ['title' => $item['title'], 'body' => $item['body'], 'tag' => 'tower-' . $item['towerId']],
                        $vapid,
                        $device['origin'] ?? 'https://localhost',
                    );
                    // Abo abgelaufen oder vom Nutzer entfernt: Gerät vergessen. Die App meldet sich beim nächsten Öffnen neu.
                    if ($status === 404 || $status === 410) {
                        return null;
                    }
                }
                $device['items'] = array_values(array_filter($items, fn (array $item) => $item['at'] > $now));
                // Lauf ohne Ausnahme: frühere Fehlversuche zurücksetzen.
                if (!empty($device['sendFails'])) {
                    $device['sendFails'] = 0;
                }
                return $device;
            });
        } catch (PushKeyError $e) {
            push_log('cron: ' . basename($file) . ': ' . $e->getMessage());
            // Fehlversuch am Gerät zählen; nach PUSH_MAX_FAILS Versuchen in Folge wird es vergessen, damit es nicht ewig scheitert.
            try {
                push_with_file($file, function (?array $device): ?array {
                    if (!$device) {
                        return null;
                    }
                    $device['sendFails'] = ($device['sendFails'] ?? 0) + 1;
                    return $device['sendFails'] >= PUSH_MAX_FAILS ? null : $device;
                });
            } catch (Throwable $e2) {
                push_log('cron: ' . basename($file) . ': Fehlerzähler: ' . $e2->getMessage());
            }
        } catch (Throwable $e) {
            // Kein Grund, das Gerät zu vergessen: Trifft der Fehler alle (z. B. curl fehlt nach einem PHP-Wechsel),
            // wären sonst nach wenigen Minuten alle Geräte weg. Die anderen Geräte laufen trotzdem weiter.
            push_log('cron: ' . basename($file) . ': ' . $e->getMessage());
            $failed++;
        }
    }
    // Fehler melden (Exit 1), damit z. B. Plesk mit „nur bei Fehlern“ Bescheid gibt.
    if ($failed) {
        fwrite(STDERR, "$failed Gerät(e) mit Fehler, Details in data/log.php\n");
        exit(1);
    }
} catch (Throwable $e) {
    push_log('cron: ' . $e->getMessage());
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

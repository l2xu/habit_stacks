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

    foreach (push_device_files() as $file) {
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
            return $device;
        });
    }
} catch (Throwable $e) {
    push_log('cron: ' . $e->getMessage());
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

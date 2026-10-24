<?php

namespace App\Console\Commands;

use App\Services\DisplayCompositeService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class ComposeDisplays extends Command
{
    protected $signature = 'displays:compose {--watch : Check for admin changes continuously}';

    protected $description = 'Render one Samsung-compatible MP4 from active display playlists';

    public function handle(DisplayCompositeService $composite): int
    {
        $stopping = false;
        if (extension_loaded('pcntl')) {
            $this->trap([SIGINT, SIGTERM], function () use (&$stopping): void {
                $stopping = true;
            });
        }

        do {
            try {
                $this->line('Composite: '.$composite->build());
            } catch (Throwable $error) {
                Log::error('Display composite rendering failed.', ['exception' => $error]);
                $this->error('Composite generation failed; check the application log.');
                if (! $this->option('watch')) {
                    return self::FAILURE;
                }
            }

            if (! $this->option('watch') || $stopping) {
                break;
            }
            // Sleep in small steps so shutdown does not wait for a full poll.
            $seconds = max(5, min(60, (int) config('display_composite.poll_seconds', 15)));
            for ($i = 0; $i < $seconds && ! $stopping; $i++) {
                sleep(1);
            }
        } while (! $stopping);

        return self::SUCCESS;
    }
}

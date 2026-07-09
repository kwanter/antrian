<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public-facing printer profile shape for the default profile endpoint
 * (consumed by the kiosk to render tickets).
 *
 * The kiosk reads template.connection_type, baud_rate, cut_mode, copy_count,
 * paper_size, etc., so `template` is preserved. F-23 is addressed by
 * restricting `logo_url` to local /storage/ paths only (admin-controlled URL
 * could otherwise point to internal hosts).
 */
class PublicPrinterProfileResource extends JsonResource
{
    public function toArray($request): array
    {
        /** @var \App\Models\PrinterProfile $profile */
        $profile = $this->resource;

        return [
            'id' => $profile->id,
            'name' => $profile->name,
            'paper_size' => $profile->paper_size,
            'copy_count' => $profile->copy_count,
            'header_text' => $profile->header_text,
            'footer_text' => $profile->footer_text,
            // logo_url is admin-controlled; expose only local storage paths.
            'logo_url' => $this->safeLogoUrl($profile->logo_url),
            // Operational printer config consumed by the kiosk.
            'template' => $profile->template,
        ];
    }

    private function safeLogoUrl(?string $logoUrl): ?string
    {
        if (! is_string($logoUrl) || $logoUrl === '') {
            return null;
        }

        // Only local /storage/ paths are exposed. External/arbitrary URLs
        // are dropped (F-23: logo_url could otherwise point to internal hosts).
        return str_starts_with($logoUrl, '/storage/') ? $logoUrl : null;
    }
}

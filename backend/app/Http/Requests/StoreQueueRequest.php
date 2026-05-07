<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreQueueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'layanan_id' => 'nullable|integer|exists:layanans,id',
            'service_type' => 'required_without:layanan_id|string|max:100',
            'customer_name' => 'nullable|string|max:255',
            'customer_phone' => 'nullable|string|max:20',
        ];
    }

    public function messages(): array
    {
        return [
            'layanan_id.exists' => 'Layanan tidak valid',
            'service_type.required_without' => 'Jenis layanan wajib dipilih',
            'service_type.max' => 'Jenis layanan maksimal 100 karakter',
            'customer_name.max' => 'Nama maksimal 255 karakter',
            'customer_phone.max' => 'Nomor telepon maksimal 20 karakter',
        ];
    }
}
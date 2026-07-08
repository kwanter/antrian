<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LayananRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rules = [
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:20|unique:layanans,code',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
            'counter_id' => 'nullable|exists:counters,id',
        ];

        if ($this->isMethod('put') || $this->isMethod('patch')) {
            $layananId = $this->route('layanan');
            $id = $layananId instanceof \App\Models\Layanan ? $layananId->id : $layananId;
            $rules['code'] = 'required|string|max:20|unique:layanans,code,' . $id;
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nama layanan wajib diisi',
            'name.max' => 'Nama layanan maksimal 255 karakter',
            'code.required' => 'Kode layanan wajib diisi',
            'code.max' => 'Kode layanan maksimal 20 karakter',
            'code.unique' => 'Kode layanan sudah digunakan',
            'counter_id.exists' => 'Counter tidak ditemukan',
        ];
    }
}
'use client';

import { useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ensureCsrfToken } from '../utils/api';
import type { ApiResponse } from '@/types/api';

/** POST /api/admin/bulk/products/validate */
interface CsvValidation {
    valid: boolean;
    totalRows: number;
    validRows: number;
    errorCount: number;
    warningCount: number;
    errors: string[];
    warnings: string[];
}

/** POST /api/admin/bulk/products/upload */
interface UploadResult {
    successful: number;
    failed: number;
    errors: { row: number; sku: string; error: string }[];
}

/**
 * BulkUploadView Component
 * Handles bulk product upload via CSV
 */
export default function BulkUploadView() {
    const t = useTranslations('BulkUpload');
    const [file, setFile] = useState<File | null>(null);
    const [validation, setValidation] = useState<CsvValidation | null>(null);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (!selectedFile.name.endsWith('.csv')) {
                setError(t('errSelectCsv'));
                return;
            }
            if (selectedFile.size > 5 * 1024 * 1024) {
                setError(t('errFileSize'));
                return;
            }
            setFile(selectedFile);
            setError('');
            setValidation(null);
            setUploadResult(null);
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            // Cookie-based auth via the /api proxy (port 6666 is browser-blocked).
            const response = await fetch('/api/admin/bulk/products/template', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to download template');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'product_template.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Error downloading template:', err);
            setError(t('errDownloadTemplate'));
        }
    };

    const handleValidate = async () => {
        if (!file) {
            setError(t('errSelectFirst'));
            return;
        }

        setIsValidating(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            // Cookie-based auth via the /api proxy. The validate route does not
            // mutate data, so it requires no CSRF token (see bulkOperationsRoutes).
            const response = await fetch('/api/admin/bulk/products/validate', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            const data: ApiResponse<CsvValidation> = await response.json();

            if (data.status === 'SUCCESS') {
                setValidation(data.keyValueTable);
            } else {
                setError(data.message || t('errValidationFailed'));
            }
        } catch (err) {
            console.error('Error validating file:', err);
            setError(t('errValidationNetwork'));
        } finally {
            setIsValidating(false);
        }
    };

    const handleUpload = async () => {
        if (!file || !validation || !validation.valid) {
            setError(t('errValidateFirst'));
            return;
        }

        setIsUploading(true);
        setError('');

        try {
            // Cookie-based auth via the /api proxy. Upload mutates data, so the
            // backend requires a double-submit CSRF token (X-CSRF-Token header +
            // csrf_token cookie). FormData is sent raw so the browser can set the
            // multipart boundary — do not force a JSON Content-Type here.
            const csrfToken = await ensureCsrfToken();
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/admin/bulk/products/upload', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: formData
            });

            const data: ApiResponse<UploadResult> = await response.json();

            if (data.status === 'SUCCESS') {
                setUploadResult(data.keyValueTable);
                setFile(null);
                setValidation(null);
            } else {
                setError(data.message || t('errUploadFailed'));
            }
        } catch (err) {
            console.error('Error uploading file:', err);
            setError(t('errUploadNetwork'));
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('title')}</h1>
                <p className="text-gray-600">{t('subtitle')}</p>
            </div>

            {/* Download Template Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-blue-900 mb-2">{t('firstTime')}</h3>
                        <p className="text-blue-800 mb-4">
                            {t('firstTimeDesc')}
                        </p>
                        <button
                            onClick={handleDownloadTemplate}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                            {t('downloadTemplate')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
                    {error}
                </div>
            )}

            {/* Upload Result */}
            {uploadResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                    <div className="flex items-start gap-4">
                        <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <h3 className="text-lg font-semibold text-green-900 mb-2">{t('uploadComplete')}</h3>
                            <div className="space-y-1 text-green-800">
                                <p>✓ {t('productsCreated', { count: uploadResult.successful })}</p>
                                {uploadResult.failed > 0 && (
                                    <p className="text-red-600">✗ {t('productsFailed', { count: uploadResult.failed })}</p>
                                )}
                            </div>
                            {uploadResult.errors && uploadResult.errors.length > 0 && (
                                <details className="mt-4">
                                    <summary className="cursor-pointer font-medium">{t('viewErrors')}</summary>
                                    <ul className="mt-2 space-y-1 text-sm">
                                        {uploadResult.errors.map((err, idx) => (
                                            <li key={idx} className="text-red-700">
                                                {t('rowError', { row: err.row, sku: err.sku, error: err.error })}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* File Upload Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">{t('step1')}</h2>
                
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer">
                        <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-lg font-medium text-gray-900 mb-1">
                            {file ? file.name : t('clickToSelect')}
                        </p>
                        <p className="text-sm text-gray-500">{t('maxFileSize')}</p>
                    </label>
                </div>

                {file && (
                    <div className="mt-4 flex items-center justify-between bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div>
                                <p className="font-medium text-gray-900">{file.name}</p>
                                <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setFile(null);
                                setValidation(null);
                                setUploadResult(null);
                            }}
                            className="text-red-600 hover:text-red-700"
                        >
                            {t('remove')}
                        </button>
                    </div>
                )}
            </div>

            {/* Validation Section */}
            {file && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">{t('step2')}</h2>

                    <button
                        onClick={handleValidate}
                        disabled={isValidating}
                        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isValidating ? t('validating') : t('validateCsv')}
                    </button>

                    {validation && (
                        <div className="mt-6">
                            <div className={`rounded-lg p-4 ${validation.valid ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                                <h3 className="font-semibold mb-2 flex items-center gap-2">
                                    {validation.valid ? (
                                        <>
                                            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            <span className="text-green-900">{t('validationPassed')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                            <span className="text-yellow-900">{t('validationIssues')}</span>
                                        </>
                                    )}
                                </h3>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                    <div>
                                        <p className="text-sm text-gray-600">{t('totalRows')}</p>
                                        <p className="text-2xl font-bold">{validation.totalRows}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{t('validRows')}</p>
                                        <p className="text-2xl font-bold text-green-600">{validation.validRows}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{t('errorsLabel')}</p>
                                        <p className="text-2xl font-bold text-red-600">{validation.errorCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{t('warningsLabel')}</p>
                                        <p className="text-2xl font-bold text-yellow-600">{validation.warningCount}</p>
                                    </div>
                                </div>

                                {validation.errors && validation.errors.length > 0 && (
                                    <details className="mt-4">
                                        <summary className="cursor-pointer font-medium text-red-700">
                                            {t('viewErrorsCount', { count: validation.errors.length })}
                                        </summary>
                                        <ul className="mt-2 space-y-1 text-sm text-red-700 max-h-40 overflow-y-auto">
                                            {validation.errors.map((err, idx) => (
                                                <li key={idx}>• {err}</li>
                                            ))}
                                        </ul>
                                    </details>
                                )}

                                {validation.warnings && validation.warnings.length > 0 && (
                                    <details className="mt-4">
                                        <summary className="cursor-pointer font-medium text-yellow-700">
                                            {t('viewWarningsCount', { count: validation.warnings.length })}
                                        </summary>
                                        <ul className="mt-2 space-y-1 text-sm text-yellow-700 max-h-40 overflow-y-auto">
                                            {validation.warnings.map((warn, idx) => (
                                                <li key={idx}>• {warn}</li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Upload Section */}
            {validation && validation.valid && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h2 className="text-xl font-semibold mb-4">{t('step3')}</h2>

                    <p className="text-gray-600 mb-4">
                        {t('readyToUpload', { count: validation.validRows })}
                    </p>

                    <button
                        onClick={handleUpload}
                        disabled={isUploading}
                        className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {isUploading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                {t('uploading')}
                            </span>
                        ) : (
                            t('uploadProducts')
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}

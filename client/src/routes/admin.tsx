import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

interface OrphanImage {
    id: number;
    storage_key: string;
    filename: string;
    original_filename: string;
    file_url: string;
    file_size: number;
    mime_type: string;
    width: number | null;
    height: number | null;
    created_at: string | null;
}

interface OrphanStats {
    total_active_images: number;
    orphan_images: number;
    orphan_expired: number;
    soft_deleted_images: number;
    purgeable_images: number;
    policy: {
        orphan_ttl_hours: number;
        soft_delete_ttl_days: number;
    };
}

const Admin: React.FC = () => {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [stats, setStats] = useState<OrphanStats | null>(null);
    const [orphanImages, setOrphanImages] = useState<OrphanImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
    const [isCleaningUp, setIsCleaningUp] = useState(false);
    const [cleanupResult, setCleanupResult] = useState<string | null>(null);
    const [brokenImageIds, setBrokenImageIds] = useState<Set<number>>(new Set());

    // 인증 안 된 경우 리다이렉트
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            navigate('/login?redirect=/admin');
        }
    }, [authLoading, isAuthenticated, navigate]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [statsRes, listRes] = await Promise.all([
                api.get('/api/upload/admin/orphans'),
                api.get('/api/upload/admin/orphans/list'),
            ]);
            setStats(statsRes.data);
            setOrphanImages(listRes.data.images);
        } catch (err) {
            console.error('Failed to fetch admin data:', err);
            setError('데이터를 불러오는데 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            fetchData();
        }
    }, [isAuthenticated, fetchData]);

    const handleDeleteImage = async (image: OrphanImage) => {
        if (deletingIds.has(image.id)) return;

        setDeletingIds(prev => new Set(prev).add(image.id));
        try {
            await api.delete(`/api/upload/image/${image.filename}`);
            setOrphanImages(prev => prev.filter(img => img.id !== image.id));
            // 통계 업데이트
            if (stats) {
                setStats({
                    ...stats,
                    orphan_images: stats.orphan_images - 1,
                    total_active_images: stats.total_active_images - 1,
                });
            }
        } catch (err) {
            console.error('Failed to delete image:', err);
            alert('이미지 삭제에 실패했습니다.');
        } finally {
            setDeletingIds(prev => {
                const next = new Set(prev);
                next.delete(image.id);
                return next;
            });
        }
    };

    const handleCleanup = async () => {
        if (isCleaningUp) return;
        if (!confirm('고아 이미지를 강제로 정리하시겠습니까?\n(TTL과 무관하게 모든 고아 이미지가 정리됩니다)')) return;

        setIsCleaningUp(true);
        setCleanupResult(null);
        try {
            const res = await api.post('/api/upload/admin/cleanup');
            const data = res.data;
            if (data.skipped) {
                setCleanupResult('정리 작업이 이미 실행 중이라 이번 요청은 건너뛰었습니다. 잠시 후 다시 시도해주세요.');
                await fetchData();
                return;
            }
            const orphanDeleted = data.orphan_cleanup?.deleted ?? 0;
            const purged = data.purge_soft_deleted?.purged ?? 0;
            setCleanupResult(
                `강제 정리 완료: 고아 이미지 ${orphanDeleted}개 삭제, 영구 삭제 ${purged}개 처리`
            );
            // 데이터 새로고침
            await fetchData();
        } catch (err) {
            console.error('Cleanup failed:', err);
            setCleanupResult('정리 작업에 실패했습니다.');
        } finally {
            setIsCleaningUp(false);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDate = (dateStr: string | null): string => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold text-gray-800">관리자 페이지</h1>
                <button
                    onClick={fetchData}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                    새로고침
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                </div>
            )}

            {/* 통계 카드 */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                    <StatCard label="전체 이미지" value={stats.total_active_images} color="blue" />
                    <StatCard label="고아 이미지" value={stats.orphan_images} color="yellow" />
                    <StatCard label="만료된 고아" value={stats.orphan_expired} color="red" />
                    <StatCard label="소프트 삭제됨" value={stats.soft_deleted_images} color="gray" />
                    <StatCard label="영구 삭제 대상" value={stats.purgeable_images} color="purple" />
                </div>
            )}

            {/* 정책 정보 & 정리 버튼 */}
            {stats && (
                <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="text-sm text-gray-600">
                        <span className="font-medium">정리 정책:</span>{' '}
                        고아 이미지 TTL {stats.policy.orphan_ttl_hours}시간 / 소프트 삭제 보존 {stats.policy.soft_delete_ttl_days}일
                    </div>
                    <button
                        onClick={handleCleanup}
                        disabled={isCleaningUp}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
                    >
                        {isCleaningUp && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        )}
                        고아 이미지 강제 정리
                    </button>
                </div>
            )}

            {cleanupResult && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">
                    {cleanupResult}
                </div>
            )}

            {/* 고아 이미지 목록 */}
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                    고아 이미지 목록
                    {!isLoading && (
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            ({orphanImages.length}개)
                        </span>
                    )}
                </h2>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                </div>
            ) : orphanImages.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                    고아 이미지가 없습니다.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {orphanImages.map((image) => (
                        <div
                            key={image.id}
                            className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                        >
                            {/* 이미지 미리보기 */}
                            <div className="aspect-video bg-gray-100 relative overflow-hidden">
                                {brokenImageIds.has(image.id) ? (
                                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">미리보기 불가</div>
                                ) : (
                                    <img
                                        src={image.file_url}
                                        alt={image.original_filename}
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                        onError={() => {
                                            setBrokenImageIds(prev => new Set(prev).add(image.id));
                                        }}
                                    />
                                )}
                            </div>

                            {/* 이미지 정보 */}
                            <div className="p-3">
                                <p className="text-sm font-medium text-gray-800 truncate" title={image.original_filename}>
                                    {image.original_filename}
                                </p>
                                <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                                    <p>크기: {formatFileSize(image.file_size)}</p>
                                    {image.width && image.height && (
                                        <p>해상도: {image.width} x {image.height}</p>
                                    )}
                                    <p>업로드: {formatDate(image.created_at)}</p>
                                </div>

                                {/* 삭제 버튼 */}
                                <button
                                    onClick={() => handleDeleteImage(image)}
                                    disabled={deletingIds.has(image.id)}
                                    className="mt-3 w-full px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                >
                                    {deletingIds.has(image.id) ? (
                                        <>
                                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-red-600"></div>
                                            삭제 중...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            삭제
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// 통계 카드 컴포넌트
const StatCard: React.FC<{
    label: string;
    value: number;
    color: 'blue' | 'yellow' | 'red' | 'gray' | 'purple';
}> = ({ label, value, color }) => {
    const colorMap = {
        blue: 'bg-blue-50 border-blue-200 text-blue-700',
        yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
        red: 'bg-red-50 border-red-200 text-red-700',
        gray: 'bg-gray-50 border-gray-200 text-gray-700',
        purple: 'bg-purple-50 border-purple-200 text-purple-700',
    };

    return (
        <div className={`p-4 rounded-lg border ${colorMap[color]}`}>
            <p className="text-xs font-medium opacity-75">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
    );
};

export default Admin;

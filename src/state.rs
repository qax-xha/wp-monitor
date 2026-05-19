use crate::application::layer_service::LayerService;
use crate::application::miss_service::{MissService, MissSource};
use crate::domain::miss_repository::MissRepository;
use crate::domain::vm_repository::VmRepository;
use crate::infrastructure::miss_repository_impl::{FileMissRepository, VlogMissRepository};
use crate::infrastructure::vlog_repository::VlogHttpRepository;
use crate::infrastructure::vm_repository::VmHttpRepository;
use crate::shared::config::AppConfig;
use crate::shared::error::AppError;
use std::path::Path;
use std::sync::Arc;
use tracing::info;

/// 应用全局依赖容器。
///
/// 在组合根 `main.rs` 中一次性构建，注入 Actix 后由各 handler 按需取用。
pub struct AppState {
    pub layer: LayerService,
    pub miss: MissService,
}

impl AppState {
    pub fn build(cfg: &AppConfig) -> Result<Self, AppError> {
        // ── 基础设施层 ──

        let vm_repo: Arc<dyn VmRepository> = Arc::new(VmHttpRepository::new(&cfg.vm_base_url));

        let vlog_repo = VlogHttpRepository::new(cfg.vlog_base_url.clone().unwrap_or_default());

        // 选择 Miss 仓储：配置了 miss_file_path 且文件存在 → 文件模式，否则 → vlog 模式
        let (miss_repo, miss_source): (Arc<dyn MissRepository>, MissSource) =
            match &cfg.miss_file_path {
                Some(path) if Path::new(path).exists() => {
                    info!(miss_file_path = %path, "miss_repository.use_file");
                    (Arc::new(FileMissRepository::new(path)?), MissSource::File)
                }
                Some(path) => {
                    info!(miss_file_path = %path, "miss_repository.file_not_found_fallback_vlog");
                    (
                        Arc::new(VlogMissRepository::new(vlog_repo.clone())),
                        MissSource::Vlog,
                    )
                }
                None => {
                    info!("miss_repository.use_vlog");
                    (
                        Arc::new(VlogMissRepository::new(vlog_repo.clone())),
                        MissSource::Vlog,
                    )
                }
            };

        // ── 应用层 ──

        Ok(Self {
            layer: LayerService::new(vm_repo, miss_repo.clone(), cfg.clone()),
            miss: MissService::new(miss_repo, miss_source),
        })
    }
}

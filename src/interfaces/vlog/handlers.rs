use actix_web::{HttpResponse, Result, get, http::header, web};
use chrono::{DateTime, Utc};
use serde::Serialize;
use tracing::{debug, error, info};

use crate::{
    application::miss_service::MissSource,
    domain::miss_repository::{MissQuery, MissRecord},
    shared::api::ApiResponse,
    shared::error::AppErrorResponse,
    state::AppState,
};

#[derive(Debug, serde::Deserialize)]
pub struct VlogMissedPageQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub query: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct MissedLogItem {
    pub content: String,
}

impl From<MissRecord> for MissedLogItem {
    fn from(r: MissRecord) -> Self {
        Self { content: r.content }
    }
}

#[derive(Debug, Serialize)]
pub struct VlogMissedPageData {
    pub start: String,
    pub end: String,
    pub query: String,
    pub page: u32,
    pub page_size: u32,
    pub has_more: bool,
    pub total: u64,
    pub items: Vec<MissedLogItem>,
}

/// 文件模式的简化响应（无分页）。
#[derive(Debug, Serialize)]
pub struct FileMissedData {
    pub source: String,
    pub total: u64,
    pub items: Vec<MissedLogItem>,
}

#[derive(Debug, serde::Deserialize)]
pub struct VlogMissedExportQuery {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub query: Option<String>,
}

const DEFAULT_MISS_QUERY: &str = "wp_stage:miss";
const DEFAULT_PAGE_SIZE: u32 = 10;
const MAX_PAGE_SIZE: u32 = 100;
const MAX_FETCH_ROWS: u32 = 5000;

fn normalize_page(page: Option<u32>) -> u32 {
    page.unwrap_or(1).max(1)
}

fn normalize_page_size(page_size: Option<u32>) -> u32 {
    page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE)
}

fn normalize_query(query: &Option<String>) -> String {
    query
        .as_ref()
        .map(|q| q.trim().to_string())
        .filter(|q| !q.is_empty())
        .unwrap_or_else(|| DEFAULT_MISS_QUERY.to_string())
}

/// 获取缺失数据。
/// - 文件模式：返回最后 N 条，无分页。
/// - Vlog 模式：走 logsql 分页查询。
#[get("/vlog/missed")]
pub async fn get_missed_data(
    state: web::Data<AppState>,
    req: web::Query<VlogMissedPageQuery>,
) -> Result<HttpResponse> {
    let req = req.into_inner();
    let page_size = normalize_page_size(req.page_size);

    match state.miss.source {
        MissSource::File => {
            debug!(page_size = page_size, "vlog.handlers.missed_page.file_mode");
            let (records, total) = tokio::try_join!(
                state.miss.fetch_records(MissQuery {
                    limit: page_size as usize,
                    start: req.start,
                    end: req.end,
                    query: None,
                }),
                state.miss.count_total(),
            )
            .map_err(|e| {
                error!(error = %e, "vlog.handlers.missed_page.file_failed");
                AppErrorResponse::from(e)
            })?;
            let items: Vec<MissedLogItem> = records.into_iter().map(MissedLogItem::from).collect();
            Ok(HttpResponse::Ok().json(ApiResponse::ok(FileMissedData {
                source: "file".to_string(),
                total,
                items,
            })))
        }
        MissSource::Vlog => {
            let query = normalize_query(&req.query);
            let page = normalize_page(req.page);
            let offset = (page - 1).saturating_mul(page_size);
            let fetch_limit = page_size.saturating_add(1).min(MAX_PAGE_SIZE + 1);
            let paged_query = format!(
                "{} | sort by (_time) asc | offset {} | limit {}",
                query, offset, fetch_limit
            );
            debug!(
                start_time = %req.start,
                end_time = %req.end,
                page = page,
                page_size = page_size,
                paged_query = &paged_query,
                "vlog.handlers.missed_page.vlog_mode"
            );
            let (records, total) = tokio::try_join!(
                state.miss.fetch_records(MissQuery {
                    limit: fetch_limit as usize,
                    start: req.start,
                    end: req.end,
                    query: Some(paged_query),
                }),
                state.miss.count_total(),
            )
            .map_err(|e| {
                error!(
                    start_time = %req.start,
                    end_time = %req.end,
                    page = page,
                    page_size = page_size,
                    error = %e,
                    "vlog.handlers.missed_page.failed"
                );
                AppErrorResponse::from(e)
            })?;
            let has_more = records.len() > page_size as usize;
            let items: Vec<MissedLogItem> = records
                .into_iter()
                .take(page_size as usize)
                .map(MissedLogItem::from)
                .collect();
            Ok(HttpResponse::Ok().json(ApiResponse::ok(VlogMissedPageData {
                start: req.start.to_rfc3339(),
                end: req.end.to_rfc3339(),
                query,
                page,
                page_size,
                has_more,
                total,
                items,
            })))
        }
    }
}

/// 导出缺失数据（DAT，仅 raw 字段）。
#[get("/vlog/missed/export")]
pub async fn export_missed_data(
    state: web::Data<AppState>,
    req: web::Query<VlogMissedExportQuery>,
) -> Result<HttpResponse> {
    let req = req.into_inner();

    match state.miss.source {
        MissSource::File => {
            info!("vlog.handlers.missed_export.file_mode");
            let records = state
                .miss
                .export_records(req.start, req.end)
                .await
                .map_err(|e| {
                    error!(error = %e, "vlog.handlers.missed_export.file_failed");
                    AppErrorResponse::from(e)
                })?;
            let content = records
                .into_iter()
                .map(|r| r.content)
                .collect::<Vec<_>>()
                .join("\n");
            let filename = format!(
                "miss-{}-{}.dat",
                req.start.format("%Y%m%d%H%M%S"),
                req.end.format("%Y%m%d%H%M%S")
            );
            info!(
                filename = %filename,
                line_count = content.lines().count(),
                "vlog.handlers.missed_export.file_success"
            );
            Ok(HttpResponse::Ok()
                .insert_header((header::CONTENT_TYPE, "text/plain; charset=utf-8"))
                .insert_header((
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{}\"", filename),
                ))
                .body(content))
        }
        MissSource::Vlog => {
            let query = normalize_query(&req.query);
            let export_query =
                format!("{} | sort by (_time) asc | limit {}", query, MAX_FETCH_ROWS);
            info!(
                start_time = %req.start,
                end_time = %req.end,
                limit = MAX_FETCH_ROWS,
                "vlog.handlers.missed_export.vlog_mode"
            );
            let records = state
                .miss
                .fetch_records(MissQuery {
                    limit: MAX_FETCH_ROWS as usize,
                    start: req.start,
                    end: req.end,
                    query: Some(export_query),
                })
                .await
                .map_err(|e| {
                    error!(
                        start_time = %req.start,
                        end_time = %req.end,
                        error = %e,
                        "vlog.handlers.missed_export.failed"
                    );
                    AppErrorResponse::from(e)
                })?;
            let mut content = String::new();
            for r in records {
                content.push_str(&r.content);
                if !r.content.ends_with('\n') {
                    content.push('\n');
                }
            }
            let filename = format!(
                "miss-{}-{}.dat",
                req.start.format("%Y%m%d%H%M%S"),
                req.end.format("%Y%m%d%H%M%S")
            );
            info!(
                filename = %filename,
                line_count = content.lines().count(),
                "vlog.handlers.missed_export.success"
            );
            Ok(HttpResponse::Ok()
                .insert_header((header::CONTENT_TYPE, "text/plain; charset=utf-8"))
                .insert_header((
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{}\"", filename),
                ))
                .body(content))
        }
    }
}

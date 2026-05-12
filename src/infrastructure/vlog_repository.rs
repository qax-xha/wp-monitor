use crate::interfaces::vlog::handlers::VlogInstantQuery;
use crate::shared::error::{AppError, AppReason};
use async_trait::async_trait;
use chrono::Utc;
use orion_error::{OperationContext, prelude::*};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::debug;

/// VLOG 单条日志记录。
///
/// 仅解析业务必需字段：
/// - `_time`
/// - `_stream_id`
/// - `_stream`
/// - `_msg`
/// - `raw`
///
/// 其余字段由 serde 默认忽略，确保接口对字段扩展兼容。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VlogRecord {
    #[serde(rename = "_time")]
    pub time: String,
    #[serde(rename = "_stream_id")]
    pub stream_id: String,
    #[serde(rename = "_stream")]
    pub stream: String,
    #[serde(rename = "_msg")]
    pub msg: String,
    pub raw: String,
}

/// VLOG 仓储抽象：
/// - instant_query：查一次“当前时刻”聚合快照；
/// - fetch_node_timeseries：按节点拉区间序列。
#[async_trait]
pub trait VlogRepository: Send + Sync {
    async fn instant_query(&self, query: VlogInstantQuery) -> Result<Vec<VlogRecord>, AppError>;
}

/// 基于 HTTP 协议访问 VLOG 的仓储实现。
pub struct VlogHttpRepository {
    client: Client,
    base_url: String,
}

impl VlogHttpRepository {
    /// 创建仓储实例，自动去掉 base_url 尾部 `/`，避免 URL 拼接重复分隔符。
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.into().trim_end_matches('/').to_string(),
        }
    }

    /// 执行 instant query（单时刻查询）。
    async fn instant_query(&self, query: &VlogInstantQuery) -> Result<Vec<VlogRecord>, AppError> {
        let url = format!("{}/select/logsql/query", self.base_url);
        let ctx = OperationContext::doing("log instance query")
            .with_field("url", url.clone())
            .with_field("query sql", query.query.clone());
        let params = &[
            ("start", &query.start.to_rfc3339()),
            ("end", &query.end.to_rfc3339()),
            ("query", &query.query),
            ("limit", &query.limit.to_string()),
        ];
        debug!(
            start_time = %query.start,
            end_time = %query.end,
            limit = query.limit,
            "vlog_repository.instant_query.start"
        );
        let resp = self
            .client
            .get(url)
            .query(params)
            .send()
            .await
            .source_raw_err(
                AppReason::VlogRequestFailed,
                "vlog instant query http request failed",
            )
            .with_context(&ctx)?;
        let body = resp
            .text()
            .await
            .source_raw_err(
                AppReason::VlogRequestFailed,
                "vlog instant query response body read failed",
            )
            .with_context(&ctx)?;
        let records = Self::parse_records(&body)?;
        debug!(
            record_count = records.len(),
            "vlog_repository.instant_query.success"
        );
        Ok(records)
    }

    /// 解析 VLOG 查询响应：
    /// - 支持 JSON 数组：`[{...}, {...}]`
    /// - 支持多个 JSON 对象拼接：`{...}{...}` 或按换行分隔对象
    fn parse_records(body: &str) -> Result<Vec<VlogRecord>, AppError> {
        let trimmed = body.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        if trimmed.starts_with('[') {
            return serde_json::from_str::<Vec<VlogRecord>>(trimmed).source_err(
                AppReason::VlogResponseInvalid,
                "vlog json array response parsing failed",
            );
        }

        let mut records = Vec::new();
        let iter = serde_json::Deserializer::from_str(trimmed).into_iter::<VlogRecord>();
        for item in iter {
            let record = item.source_err(
                AppReason::VlogResponseInvalid,
                "vlog json record parsing failed",
            )?;
            records.push(record);
        }
        Ok(records)
    }
}

#[async_trait]
impl VlogRepository for VlogHttpRepository {
    async fn instant_query(&self, query: VlogInstantQuery) -> Result<Vec<VlogRecord>, AppError> {
        let vlog_query = VlogInstantQuery {
            query: query.query.clone(),
            limit: query.limit,
            start: query.start.with_timezone(&Utc),
            end: query.end.with_timezone(&Utc),
        };
        self.instant_query(&vlog_query).await
    }
}

#[cfg(test)]
pub mod tests {

    use super::*;

    #[test]
    fn test_parse_concatenated_json_records() {
        let body = r#"{
    "_time": "2026-04-01T02:29:43.680555Z",
    "_stream_id": "0000000000000000e934a84adb05276890d7f7bfcadabe92",
    "_stream": "{}",
    "_msg": "{\"raw\":\"first\"}",
    "raw": "first",
    "extra_field": "ignored"
}{
    "_time": "2026-04-01T02:29:43.641403Z",
    "_stream_id": "0000000000000000e934a84adb05276890d7f7bfcadabe92",
    "_stream": "{}",
    "_msg": "{\"raw\":\"second\"}",
    "raw": "second"
}"#;

        let records = VlogHttpRepository::parse_records(body).unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].raw, "first");
        assert_eq!(records[1].raw, "second");
    }
}

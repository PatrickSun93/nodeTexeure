//! Where emails go: AWS SES in production, an HTML outbox folder in development.

use std::path::PathBuf;

use anyhow::Context;
use aws_sdk_sesv2::types::{Body, Content, Destination, EmailContent, Message};

use crate::config::Config;
use crate::render::Rendered;

/// Result of a successful send, recorded in `processing_details.delivery_info`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Delivery {
    pub info: String,
}

/// Something that can deliver one rendered email.
pub trait Mailer {
    fn send(
        &self,
        to: &str,
        email: &Rendered,
    ) -> impl std::future::Future<Output = anyhow::Result<Delivery>> + Send;
}

pub struct SesMailer {
    client: aws_sdk_sesv2::Client,
    from: String,
    reply_to: String,
}

impl SesMailer {
    pub async fn new(config: &Config) -> Self {
        let aws = aws_config::from_env()
            .region(aws_config::Region::new(config.ses_region.clone()))
            .load()
            .await;
        Self {
            client: aws_sdk_sesv2::Client::new(&aws),
            from: config.from.clone(),
            reply_to: config.reply_to.clone(),
        }
    }
}

fn utf8(data: &str) -> anyhow::Result<Content> {
    Ok(Content::builder().data(data).charset("UTF-8").build()?)
}

impl Mailer for SesMailer {
    async fn send(&self, to: &str, email: &Rendered) -> anyhow::Result<Delivery> {
        // SES rejects an empty text part; fall back to the subject like the Node service.
        let text = if email.text.is_empty() {
            &email.subject
        } else {
            &email.text
        };
        let message = Message::builder()
            .subject(utf8(&email.subject)?)
            .body(
                Body::builder()
                    .html(utf8(&email.html)?)
                    .text(utf8(text)?)
                    .build(),
            )
            .build();
        let output = self
            .client
            .send_email()
            .from_email_address(&self.from)
            .destination(Destination::builder().to_addresses(to).build())
            .reply_to_addresses(&self.reply_to)
            .content(EmailContent::builder().simple(message).build())
            .send()
            .await
            .map_err(|err| anyhow::anyhow!(aws_sdk_sesv2::error::DisplayErrorContext(err)))?;
        Ok(Delivery {
            info: format!(
                "SES MessageId: {}",
                output.message_id().unwrap_or("unknown")
            ),
        })
    }
}

/// Development sink: one HTML file per email, so mail can be read (or asserted
/// on by tests) without SES.
pub struct OutboxMailer {
    dir: PathBuf,
}

impl OutboxMailer {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }
}

/// File-name-safe fragment: runs of non-alphanumerics become `_`, max 40 chars.
fn slug(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('_') {
            out.push('_');
        }
    }
    out.chars().take(40).collect()
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

impl Mailer for OutboxMailer {
    async fn send(&self, to: &str, email: &Rendered) -> anyhow::Result<Delivery> {
        tokio::fs::create_dir_all(&self.dir)
            .await
            .with_context(|| format!("creating outbox {}", self.dir.display()))?;
        let millis = chrono::Utc::now().timestamp_millis();
        let name = format!("{millis}_{}_{}.html", slug(to), slug(&email.subject));
        let body = if email.html.is_empty() {
            format!("<pre>{}</pre>", escape_html(&email.text))
        } else {
            email.html.clone()
        };
        let doc = format!(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>{subject}</title></head>\
             <body style=\"margin:0\"><div style=\"font:13px/1.5 system-ui,sans-serif;padding:12px 16px;\
             background:#2A2621;color:#F3EBDD\"><div><b>To:</b> {to}</div><div><b>Subject:</b> {subject}</div>\
             </div><div style=\"padding:16px\">{body}</div></body></html>",
            subject = escape_html(&email.subject),
            to = escape_html(to),
        );
        let path = self.dir.join(&name);
        tokio::fs::write(&path, doc)
            .await
            .with_context(|| format!("writing {}", path.display()))?;
        Ok(Delivery {
            info: format!("Saved to outbox: {name}"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_collapses_and_truncates() {
        assert_eq!(slug("a.b@example.com"), "a_b_example_com");
        assert_eq!(slug("Order #1 — shipped!"), "Order_1_shipped_");
        assert_eq!(slug(&"x".repeat(60)).len(), 40);
    }

    #[tokio::test]
    async fn outbox_writes_escaped_header_and_html_body() {
        let dir = tempfile::tempdir().unwrap();
        let mailer = OutboxMailer::new(dir.path());
        let email = Rendered {
            subject: "Hi <b>".into(),
            html: "<p>body</p>".into(),
            text: String::new(),
        };
        let delivery = mailer.send("a@example.com", &email).await.unwrap();
        assert!(delivery.info.starts_with("Saved to outbox: "));
        let file = std::fs::read_dir(dir.path())
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let html = std::fs::read_to_string(file).unwrap();
        assert!(html.contains("Hi &lt;b&gt;"));
        assert!(html.contains("<p>body</p>"));
    }
}

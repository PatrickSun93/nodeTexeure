//! The client address, chosen exactly like Express's `req.ip` with
//! `app.set('trust proxy', <hops>)` (backend/server.js reads the same
//! `TRUST_PROXY` variable):
//!
//! * the candidate list is the socket peer followed by the `X-Forwarded-For`
//!   entries from right to left (proxy-addr / forwarded: entries split on `,`,
//!   spaces trimmed, empty entries skipped; several header lines are joined
//!   with `, ` as Node does);
//! * the first `hops` candidates are trusted proxies, so `req.ip` is candidate
//!   number `hops` (or the last one when the list is shorter).
//!
//! `hops = 0` (the default) is the socket peer and ignores the header, which is
//! the only safe choice when clients can reach the service directly. Behind the
//! storefront (`next start` rewrites pass `X-Forwarded-For` through unchanged and
//! add nothing) use 1 — and only if the reverse proxy in front of the storefront
//! sets or appends `X-Forwarded-For`. See docs/DEPLOYMENT.md.

use std::net::{IpAddr, SocketAddr};

use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::HeaderMap;
use axum::http::request::Parts;

use crate::AppState;

/// `TRUST_PROXY`: how many proxy hops in front of this service are trusted.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TrustProxy(pub usize);

impl TrustProxy {
    /// `TRUST_PROXY` as a non-negative hop count; unset, empty or anything else
    /// is 0 (trust nothing), like backend/server.js.
    pub fn from_env() -> Self {
        Self::parse(std::env::var("TRUST_PROXY").ok().as_deref())
    }

    pub fn parse(value: Option<&str>) -> Self {
        match value.map(str::trim) {
            None | Some("") => Self(0),
            // Digits only, like backend/utils/trustProxy.js (`/^\d+$/`).
            Some(v) if v.bytes().all(|b| b.is_ascii_digit()) => {
                Self(v.parse::<usize>().unwrap_or(usize::MAX))
            }
            Some(v) => {
                tracing::warn!(
                    value = v,
                    "TRUST_PROXY must be a hop count (0, 1, 2, …); trusting no proxy"
                );
                Self(0)
            }
        }
    }
}

/// The `X-Forwarded-For` entries, nearest proxy first (forwarded's `parse`).
fn forwarded_for(headers: &HeaderMap) -> Vec<String> {
    let joined = headers
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .collect::<Vec<_>>()
        .join(", ");
    joined
        .rsplit(',')
        .map(|entry| entry.trim_matches(' '))
        .filter(|entry| !entry.is_empty())
        .map(str::to_owned)
        .collect()
}

/// `req.ip`: `peer` is the socket address (`None` when unknown, e.g. in tests
/// that don't attach `ConnectInfo`).
pub fn client_ip(headers: &HeaderMap, peer: Option<IpAddr>, trust: TrustProxy) -> String {
    let socket = peer.map_or_else(|| "unknown".to_owned(), |ip| ip.to_string());
    if trust.0 == 0 {
        return socket;
    }
    let mut candidates = vec![socket];
    candidates.extend(forwarded_for(headers));
    let index = trust.0.min(candidates.len() - 1);
    candidates.swap_remove(index)
}

/// The peer address axum recorded (`into_make_service_with_connect_info`).
pub fn peer(parts: &Parts) -> Option<IpAddr> {
    parts
        .extensions
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(addr)| addr.ip())
}

/// Extractor for `req.ip`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientIp(pub String);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(Self(client_ip(
            &parts.headers,
            peer(parts),
            state.trust_proxy,
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn headers(xff: &[&str]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for v in xff {
            h.append("x-forwarded-for", v.parse().unwrap());
        }
        h
    }

    #[test]
    fn hop_counts_follow_proxy_addr() {
        let peer = Some("10.0.0.2".parse().unwrap());
        let h = headers(&["1.1.1.1, 2.2.2.2"]);
        assert_eq!(client_ip(&h, peer, TrustProxy(0)), "10.0.0.2");
        assert_eq!(client_ip(&h, peer, TrustProxy(1)), "2.2.2.2");
        assert_eq!(client_ip(&h, peer, TrustProxy(2)), "1.1.1.1");
        assert_eq!(client_ip(&h, peer, TrustProxy(9)), "1.1.1.1");
        assert_eq!(
            client_ip(&HeaderMap::new(), peer, TrustProxy(1)),
            "10.0.0.2"
        );
        assert_eq!(
            client_ip(&headers(&["1.1.1.1", "3.3.3.3"]), peer, TrustProxy(1)),
            "3.3.3.3",
            "header lines join in order"
        );
        assert_eq!(
            client_ip(&headers(&[" , ,5.5.5.5 ,"]), peer, TrustProxy(1)),
            "5.5.5.5",
            "empty entries are skipped"
        );
        assert_eq!(client_ip(&h, None, TrustProxy(0)), "unknown");
    }

    #[test]
    fn env_parsing() {
        assert_eq!(TrustProxy::parse(None), TrustProxy(0));
        assert_eq!(TrustProxy::parse(Some("")), TrustProxy(0));
        assert_eq!(TrustProxy::parse(Some(" 1 ")), TrustProxy(1));
        assert_eq!(TrustProxy::parse(Some("true")), TrustProxy(0));
        assert_eq!(TrustProxy::parse(Some("-1")), TrustProxy(0));
        assert_eq!(
            TrustProxy::parse(Some("+1")),
            TrustProxy(0),
            "digits only, as in Node"
        );
        assert_eq!(TrustProxy::parse(Some("1.5")), TrustProxy(0));
    }

    /// Express (`app.set('trust proxy', n)` + proxy-addr) on the same inputs.
    #[test]
    fn matches_express_req_ip() {
        let fx = crate::cookies::tests::fixtures();
        let cases = fx["req_ip"].as_array().unwrap();
        assert!(!cases.is_empty());
        for case in cases {
            let xff: Vec<&str> = case["xff"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap())
                .collect();
            let peer: IpAddr = case["socket"].as_str().unwrap().parse().unwrap();
            let hops = case["hops"].as_u64().unwrap() as usize;
            assert_eq!(
                Value::String(client_ip(&headers(&xff), Some(peer), TrustProxy(hops))),
                case["ip"],
                "{case}"
            );
        }
    }
}

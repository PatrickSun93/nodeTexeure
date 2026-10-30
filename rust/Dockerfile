# Rust services image (api + email-daemon). Queries are checked against the committed .sqlx data,
# so building needs no database. Build: docker build -t nodetexeure-rust rust/
# Base images are overridable (e.g. a registry mirror):
#   --build-arg REGISTRY=public.ecr.aws/docker/library/
ARG REGISTRY=
FROM ${REGISTRY}rust:1.97-bookworm AS build
WORKDIR /src
ENV SQLX_OFFLINE=true
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY .sqlx .sqlx
COPY crates crates
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p email-daemon -p api \
 && cp target/release/email-daemon target/release/api /usr/local/bin/

FROM ${REGISTRY}debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home-dir /app app \
 && mkdir -p /app/email-outbox && chown app /app/email-outbox
WORKDIR /app
COPY --from=build /usr/local/bin/email-daemon /usr/local/bin/api /usr/local/bin/
USER app
ENV RUST_LOG=info EMAIL_OUTBOX_DIR=/app/email-outbox API_PORT=7000
EXPOSE 7000
# One image, one binary per service: `api` (HTTP) or `email-daemon`.
CMD ["api"]

//! Product thumbnails, as backend/services/s3Service.js makes them with sharp:
//!
//! ```js
//! sharp(buffer).resize(width, width, { fit: 'cover', withoutEnlargement: true })
//!   .jpeg({ quality: 85 }).toBuffer()
//! ```
//!
//! Geometry is sharp's (`ResolveShrink` + the centre crop): the shrink factor
//! is the smaller of `w/size` and `h/size`, never below 1 (no enlargement), so
//! an image larger than the box on both sides is scaled to cover it and
//! centre-cropped to `size × size`, and anything else is only centre-cropped:
//! the output is always `min(size, w) × min(size, h)`. The crop offset is
//! `(in - out + 1) / 2`. Pixels are not byte-identical to libvips (different
//! resampling and JPEG encoder; alpha is flattened onto black like sharp's
//! JPEG output), but sizes, format and success/failure match.
//!
//! Inputs: what sharp's prebuilt libvips reads and the `image` crate also
//! decodes — JPEG, PNG, GIF (first frame), WebP, TIFF (not JPEG-compressed
//! YCbCr TIFF, sharp's own default). Those TIFFs, SVG, AVIF and HEIF, which
//! sharp would also read, fail here (the route then stores the original as
//! every thumbnail, as it does for any failed thumbnail).
//! sharp's default `limitInputPixels` (0x3FFF²) applies.

use std::io::Cursor;

use image::{DynamicImage, ImageFormat, ImageReader, RgbImage};

/// s3Service.js's THUMBNAIL_SIZES, in its order.
pub const THUMBNAIL_SIZES: [(&str, u32); 3] = [("small", 150), ("medium", 400), ("large", 800)];
/// sharp's `limitInputPixels` default.
const PIXEL_LIMIT: u64 = 0x3FFF * 0x3FFF;
const JPEG_QUALITY: u8 = 85;

/// Output size for an input of `w × h` and a `size × size` cover box.
pub fn thumbnail_size(w: u32, h: u32, size: u32) -> (u32, u32) {
    (size.min(w), size.min(h))
}

fn decode(input: &[u8]) -> Result<DynamicImage, String> {
    if input.is_empty() {
        return Err("Input Buffer is empty".into());
    }
    let unsupported = || "Input buffer contains unsupported image format".to_owned();
    let reader = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .map_err(|_| unsupported())?;
    match reader.format() {
        Some(
            ImageFormat::Jpeg
            | ImageFormat::Png
            | ImageFormat::Gif
            | ImageFormat::WebP
            | ImageFormat::Tiff,
        ) => {}
        _ => return Err(unsupported()),
    }
    let (w, h) = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .map_err(|_| unsupported())?
        .into_dimensions()
        .map_err(|e| e.to_string())?;
    if u64::from(w) * u64::from(h) > PIXEL_LIMIT {
        return Err("Input image exceeds pixel limit".into());
    }
    reader.decode().map_err(|e| e.to_string())
}

/// sharp's JPEG output: RGB with any alpha flattened onto black.
fn flatten(img: &DynamicImage) -> RgbImage {
    if !img.color().has_alpha() {
        return img.to_rgb8();
    }
    let rgba = img.to_rgba8();
    RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let p = rgba.get_pixel(x, y).0;
        let a = u16::from(p[3]);
        let f = |c: u8| ((u16::from(c) * a + 127) / 255) as u8;
        image::Rgb([f(p[0]), f(p[1]), f(p[2])])
    })
}

/// One thumbnail: JPEG bytes, or the reason sharp would have failed.
pub fn thumbnail(input: &[u8], size: u32) -> Result<Vec<u8>, String> {
    let img = decode(input)?;
    let (w, h) = (img.width(), img.height());
    let img = if w > size && h > size {
        // Cover: scale by the smaller shrink so the box is filled.
        let shrink = (f64::from(w) / f64::from(size)).min(f64::from(h) / f64::from(size));
        let rw = ((f64::from(w) / shrink).round() as u32).max(1);
        let rh = ((f64::from(h) / shrink).round() as u32).max(1);
        img.thumbnail_exact(rw, rh)
    } else {
        img
    };
    let (out_w, out_h) = thumbnail_size(w, h, size);
    let (out_w, out_h) = (out_w.min(img.width()), out_h.min(img.height()));
    let left = (img.width() - out_w).div_ceil(2);
    let top = (img.height() - out_h).div_ceil(2);
    let cropped = img.crop_imm(left, top, out_w, out_h);
    let rgb = flatten(&cropped);
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use serde_json::Value;

    /// The sizes sharp produced for the same inputs
    /// (backend/scripts/gen-payments-fixtures.js).
    #[test]
    fn sizes_match_sharp() {
        let f: Value =
            serde_json::from_str(include_str!("../fixtures/payments_images.json")).unwrap();
        for case in f["thumbnails"].as_array().unwrap() {
            let input = base64::engine::general_purpose::STANDARD
                .decode(case["input"].as_str().unwrap())
                .unwrap();
            let label = format!("{} {} {}", case["format"], case["width"], case["height"]);
            if case["format"] == "tiff-jpeg" {
                // JPEG-compressed (YCbCr) TIFF: sharp reads it, the tiff crate
                // doesn't, so the route falls back to the original.
                assert!(thumbnail(&input, 150).is_err(), "{label}");
                continue;
            }
            if case["format"] == "none" {
                assert!(thumbnail(&input, 150).is_err(), "{label}");
                assert_eq!(
                    thumbnail(&input, 150).unwrap_err(),
                    case["error"],
                    "{label}"
                );
                continue;
            }
            for (name, size) in THUMBNAIL_SIZES {
                let out = thumbnail(&input, size).unwrap_or_else(|e| panic!("{label}: {e}"));
                let expected = &case["thumbnails"][name];
                let decoded = image::load_from_memory(&out).unwrap();
                assert_eq!(
                    image::guess_format(&out).unwrap(),
                    ImageFormat::Jpeg,
                    "{label} {name}"
                );
                assert_eq!(
                    (decoded.width(), decoded.height()),
                    (
                        expected["width"].as_u64().unwrap() as u32,
                        expected["height"].as_u64().unwrap() as u32
                    ),
                    "{label} {name}"
                );
            }
        }
    }

    #[test]
    fn geometry() {
        assert_eq!(thumbnail_size(1001, 333, 400), (400, 333));
        assert_eq!(thumbnail_size(799, 801, 800), (799, 800));
        assert_eq!(thumbnail_size(3000, 2000, 150), (150, 150));
    }

    #[test]
    fn unsupported_inputs_fail() {
        // BMP: decodable by many tools, not by sharp's libvips.
        let bmp = b"BM\x3a\0\0\0\0\0\0\0\x36\0\0\0\x28\0\0\0\x01\0\0\0\x01\0\0\0\x01\0\x18\0\0\0\0\0\x04\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\xff\0\0\0";
        assert!(thumbnail(bmp, 150).is_err());
        assert!(thumbnail(b"<svg xmlns='http://www.w3.org/2000/svg'/>", 150).is_err());
    }
}

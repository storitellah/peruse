// Map a photo's make/model onto a recognisable device type, so the Devices
// matrix can show a glyph that actually resembles the hardware in use.

export type DeviceKind =
  | "iphone"
  | "ipad"
  | "pixel"
  | "galaxy"
  | "android"
  | "camera"
  | "unknown";

export interface DeviceClass {
  kind: DeviceKind;
  /** Brand-ish accent for the glyph. */
  color: string;
}

export function classifyDevice(make?: string, model?: string): DeviceClass {
  const m = `${make ?? ""} ${model ?? ""}`.toLowerCase();

  if (/ipad/.test(m)) return { kind: "ipad", color: "#8e8e93" };
  if (/iphone/.test(m)) return { kind: "iphone", color: "#1d1d1f" };
  if (/pixel/.test(m)) return { kind: "pixel", color: "#4285f4" };
  if (/(sm-|galaxy|samsung)/.test(m)) return { kind: "galaxy", color: "#1428a0" };
  if (/(oneplus|xiaomi|redmi|oppo|vivo|huawei|honor|motorola|moto|nokia|realme|android)/.test(m))
    return { kind: "android", color: "#3ddc84" };
  if (/(canon|nikon|sony|fujifilm|fuji|leica|panasonic|lumix|olympus|pentax|hasselblad|gopro|dji|ricoh|sigma)/.test(m))
    return { kind: "camera", color: "#5a6270" };
  // A make with no phone keyword but a real model is most likely a camera body.
  if (make && model) return { kind: "camera", color: "#5a6270" };
  return { kind: "unknown", color: "#8e8e93" };
}

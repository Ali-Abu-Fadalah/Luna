globalThis.LunaImageUploadCore = (() => {
  // Ayshei's draft-image API rejects either edge at or below 300 pixels.
  const MIN_DIMENSION = 320;
  const MAX_CONVERTED_EDGE = 2400;
  const SAFE_TYPES = Object.freeze(["image/jpeg", "image/png"]);

  const normalizeContentType = (value) => {
    const type = String(value || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    return ["image/jpg", "image/pjpeg"].includes(type) ? "image/jpeg" : type;
  };

  const acceptTokens = (value) =>
    String(value || "")
      .toLowerCase()
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

  const acceptsType = (accept, contentType) => {
    const type = normalizeContentType(contentType);
    if (!SAFE_TYPES.includes(type)) return false;
    const tokens = acceptTokens(accept);
    if (!tokens.length || tokens.includes("image/*")) return true;
    const extensions = type === "image/png" ? [".png"] : [".jpg", ".jpeg", ".jfif"];
    return tokens.includes(type) || extensions.some((extension) => tokens.includes(extension));
  };

  const preferredConvertedType = (accept) => {
    if (acceptsType(accept, "image/jpeg")) return "image/jpeg";
    if (acceptsType(accept, "image/png")) return "image/png";
    return "image/png";
  };

  const makeUploadPlan = ({ accept = "", contentType, height, width }) => {
    const sourceWidth = Math.round(Number(width));
    const sourceHeight = Math.round(Number(height));
    if (
      !Number.isSafeInteger(sourceWidth) ||
      !Number.isSafeInteger(sourceHeight) ||
      sourceWidth < 1 ||
      sourceHeight < 1
    ) {
      throw new Error("Vehicle image dimensions could not be read.");
    }
    const normalizedType = normalizeContentType(contentType);
    const needsResize = sourceWidth < MIN_DIMENSION || sourceHeight < MIN_DIMENSION;
    const needsConversion = needsResize || !acceptsType(accept, normalizedType);
    if (!needsConversion) {
      return Object.freeze({
        contentType: normalizedType,
        drawHeight: sourceHeight,
        drawWidth: sourceWidth,
        height: sourceHeight,
        needsConversion: false,
        offsetX: 0,
        offsetY: 0,
        width: sourceWidth
      });
    }

    let scale = Math.max(1, MIN_DIMENSION / sourceWidth, MIN_DIMENSION / sourceHeight);
    let drawWidth = Math.max(1, Math.round(sourceWidth * scale));
    let drawHeight = Math.max(1, Math.round(sourceHeight * scale));
    if (Math.max(drawWidth, drawHeight) > MAX_CONVERTED_EDGE) {
      scale = MAX_CONVERTED_EDGE / Math.max(drawWidth, drawHeight);
      drawWidth = Math.max(1, Math.round(drawWidth * scale));
      drawHeight = Math.max(1, Math.round(drawHeight * scale));
    }
    const outputWidth = Math.max(MIN_DIMENSION, drawWidth);
    const outputHeight = Math.max(MIN_DIMENSION, drawHeight);
    return Object.freeze({
      contentType: preferredConvertedType(accept),
      drawHeight,
      drawWidth,
      height: outputHeight,
      needsConversion: true,
      offsetX: Math.floor((outputWidth - drawWidth) / 2),
      offsetY: Math.floor((outputHeight - drawHeight) / 2),
      width: outputWidth
    });
  };

  return Object.freeze({
    MAX_CONVERTED_EDGE,
    MIN_DIMENSION,
    acceptsType,
    makeUploadPlan,
    normalizeContentType
  });
})();

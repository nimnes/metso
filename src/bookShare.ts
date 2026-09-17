// Send a URL item to native share targets, rather than a text item containing URLs.
// The page supplies the title and cover through its Open Graph metadata.
export function getBookShareData(origin: string, finnaId: string): { url: string } {
  return { url: `${origin}/share/${encodeURIComponent(finnaId)}?v=share6` }
}

export function getTelegramShareUrl(origin: string, finnaId: string): string {
  const params = new URLSearchParams({ url: getBookShareData(origin, finnaId).url })
  return `https://t.me/share/url?${params.toString()}`
}

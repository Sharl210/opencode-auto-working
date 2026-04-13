export function durationParts(text: string) {
  const parts = [...text.matchAll(/(\d+)([a-z]+)/g)].flatMap((item) => {
    if (!item[1] || !item[2]) return []
    return [{ n: item[1], u: item[2] }]
  })
  const join = parts.map((item) => `${item.n}${item.u}`).join(" ")
  return parts.length > 0 && join === text.trim() ? parts : null
}

export function split(text: string) {
  const sep = text.includes(": ") ? ": " : " "
  const idx = sep === ": " ? text.indexOf(sep) : text.lastIndexOf(sep)
  if (idx < 0) return { key: text, value: "", duration: null as null | Array<{ n: string; u: string }> }

  const key = sep === ": " ? text.slice(0, idx + 2) : text.slice(0, idx)
  const value = text.slice(idx + sep.length)
  return {
    key,
    value,
    duration: durationParts(value),
  }
}

export function el(tag, attrs, kids) {
  const node = document.createElement(tag);
  let value;
  let hasValue = false;
  for (const [key, val] of Object.entries(attrs || {})) {
    if (key === "value") {
      value = val;
      hasValue = true;
      continue;
    }
    if (val == null || val === false) continue;
    if (key === "class") node.className = val;
    else if (key.startsWith("on") && typeof val === "function") node.addEventListener(key.slice(2).toLowerCase(), val);
    else if (key === "checked" || key === "disabled" || key === "selected" || key === "htmlFor") node[key] = val;
    else node.setAttribute(key, val === true ? "" : String(val));
  }
  append(node, kids);
  if (hasValue && "value" in node) node.value = value == null ? "" : String(value);
  return node;
}

export function append(node, kids) {
  if (kids == null || kids === false) return;
  if (Array.isArray(kids)) {
    for (const kid of kids) append(node, kid);
    return;
  }
  node.append(kids.nodeType ? kids : document.createTextNode(String(kids)));
}

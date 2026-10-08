// Paleta nativa do Google Agenda, para a cor cair igual à que aparece no app.
const named: Record<string, string> = {
  tomate: "#D50000",
  vermelho: "#D50000",
  "vermelho escuro": "#A50000",
  "vermelho vivo": "#E10600",
  "vermelho corrida": "#E10600",
  vinho: "#7B1F2B",
  bordo: "#7B1F2B",
  flamingo: "#E67C73",
  rosa: "#E67C73",
  "rosa choque": "#D81B60",
  tangerina: "#F4511E",
  laranja: "#F4511E",
  abobora: "#EF6C00",
  banana: "#F6BF26",
  amarelo: "#F6BF26",
  dourado: "#E4C441",
  salvia: "#33B679",
  "verde claro": "#7CB342",
  verde: "#0B8043",
  manjericao: "#0B8043",
  "verde escuro": "#0B8043",
  pavao: "#039BE5",
  "azul claro": "#039BE5",
  ciano: "#039BE5",
  turquesa: "#009688",
  azul: "#3F51B5",
  mirtilo: "#3F51B5",
  "azul escuro": "#283593",
  marinho: "#283593",
  lavanda: "#7986CB",
  lilas: "#B39DDB",
  roxo: "#8E24AA",
  uva: "#8E24AA",
  violeta: "#8E24AA",
  grafite: "#616161",
  cinza: "#616161",
  preto: "#212121",
  marrom: "#795548",
  cacau: "#795548",
};

export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveColor(raw: string) {
  const value = raw.trim();
  const hex = value.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return `#${digits.toUpperCase()}`;
  }

  const key = normalize(value);
  if (named[key]) return named[key];
  const partial = Object.keys(named)
    .sort((a, b) => b.length - a.length)
    .find((name) => key.includes(name));
  return partial ? named[partial] : null;
}

// Texto branco ou preto, o que ler melhor em cima da cor.
export function foregroundFor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1D1D1D" : "#FFFFFF";
}

export const colorNames = Object.keys(named);

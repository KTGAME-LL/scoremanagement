/**
 * Trình ghi tệp Excel (.xlsx) tối giản, tự viết, không phụ thuộc thư viện ngoài.
 * Hỗ trợ: nhiều sheet, kiểu ô (phông, màu, viền, căn lề, định dạng số), gộp ô,
 * cố định hàng/cột, bộ lọc, độ rộng cột, in ngang vừa trang và biểu đồ đường.
 * Chuỗi luôn được ghi dạng văn bản nên Excel không bao giờ diễn giải thành công thức.
 */

export interface Style {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string; // RRGGBB
  bg?: string; // RRGGBB
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  wrap?: boolean;
  border?: boolean;
  numFmt?: string;
}

export type CellValue = string | number | null;

export interface LineSeries {
  name: string;
  /** Địa chỉ ô (đã gồm tên sheet) và dữ liệu đệm để Excel/LibreOffice vẽ ngay. */
  nameRef: string;
  catRef: string;
  valRef: string;
  cats: string[];
  vals: (number | null)[];
  color: string;
  dashed?: boolean;
  marker?: 'circle' | 'square' | 'diamond';
}
export interface LineChartSpec {
  title: string;
  from: { col: number; row: number }; // 0-based
  to: { col: number; row: number };
  series: LineSeries[];
  yMin: number;
  yMax: number;
  yFormat?: string;
}

const enc = new TextEncoder();
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function esc(s: string): string {
  return s.replace(CTRL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function colName(c: number): string {
  let n = c;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export const ref = (r: number, c: number) => `${colName(c)}${r}`;
export const absRef = (sheet: string, r1: number, c1: number, r2 = r1, c2 = c1) =>
  `'${sheet.replace(/'/g, "''")}'!$${colName(c1)}$${r1}${r1 === r2 && c1 === c2 ? '' : `:$${colName(c2)}$${r2}`}`;

export function safeSheetName(name: string, used: Set<string>): string {
  let n = name.replace(/[\[\]:*?/\\]/g, ' ').replace(/'/g, '').trim().slice(0, 31) || 'Sheet';
  let k = 2;
  const base = n;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${k++}`;
  used.add(n.toLowerCase());
  return n;
}

interface Cell { v: CellValue; s?: Style }

export class Sheet {
  cells = new Map<number, Map<number, Cell>>();
  widths = new Map<number, number>();
  heights = new Map<number, number>();
  merges: string[] = [];
  freezeAt: { row: number; col: number } | null = null;
  filterRange: string | null = null;
  tabColor: string | null = null;
  charts: LineChartSpec[] = [];
  constructor(public name: string) {}

  cell(r: number, c: number, v: CellValue, s?: Style): this {
    let row = this.cells.get(r);
    if (!row) this.cells.set(r, (row = new Map()));
    row.set(c, { v, s });
    return this;
  }
  /** Gán kiểu cho cả vùng (kể cả ô trống) để viền và nền liền mạch. */
  fill(r1: number, c1: number, r2: number, c2: number, s: Style): this {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!this.cells.get(r)?.has(c)) this.cell(r, c, null, s);
    return this;
  }
  width(c: number, w: number): this { this.widths.set(c, w); return this; }
  height(r: number, h: number): this { this.heights.set(r, h); return this; }
  merge(r1: number, c1: number, r2: number, c2: number): this { this.merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`); return this; }
  freeze(row: number, col = 0): this { this.freezeAt = { row, col }; return this; }
  filter(r1: number, c1: number, r2: number, c2: number): this { this.filterRange = `${ref(r1, c1)}:${ref(r2, c2)}`; return this; }
  tab(color: string): this { this.tabColor = color; return this; }
  addChart(spec: LineChartSpec): this { this.charts.push(spec); return this; }
}

/* ---------- ZIP (không nén) ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true);
  const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n, true);
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, dosTime); u16(lv, 12, dosDate);
    u32(lv, 14, crc); u32(lv, 18, f.data.length); u32(lv, 22, f.data.length); u16(lv, 26, name.length); u16(lv, 28, 0);
    lh.set(name, 30);
    parts.push(lh, f.data);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, dosTime); u16(cv, 14, dosDate);
    u32(cv, 16, crc); u32(cv, 20, f.data.length); u32(cv, 24, f.data.length); u16(cv, 28, name.length);
    u32(cv, 42, offset);
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, cdSize); u32(ev, 16, offset);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

/* ---------- Kiểu ô ---------- */
const BUILTIN_FMT: Record<string, number> = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10 };

class Styles {
  fonts: string[] = ['<font><sz val="11"/><color rgb="FF1F2933"/><name val="Calibri"/><family val="2"/></font>'];
  fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  fmts = new Map<string, number>();
  xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  cache = new Map<string, number>();

  private idx(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }

  get(s?: Style): number {
    if (!s) return 0;
    const key = JSON.stringify(s);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const font = this.idx(
      this.fonts,
      `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}<sz val="${s.size ?? 11}"/><color rgb="FF${s.color ?? '1F2933'}"/><name val="Calibri"/><family val="2"/></font>`,
    );
    const fill = s.bg ? this.idx(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.bg}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const edge = (n: string) => `<${n} style="thin"><color rgb="FFB8C4CE"/></${n}>`;
    const border = s.border ? this.idx(this.borders, `<border>${edge('left')}${edge('right')}${edge('top')}${edge('bottom')}<diagonal/></border>`) : 0;
    let fmt = 0;
    if (s.numFmt) {
      if (s.numFmt in BUILTIN_FMT) fmt = BUILTIN_FMT[s.numFmt];
      else {
        if (!this.fmts.has(s.numFmt)) this.fmts.set(s.numFmt, 164 + this.fmts.size);
        fmt = this.fmts.get(s.numFmt) as number;
      }
    }
    const al = `<alignment${s.align ? ` horizontal="${s.align}"` : ''} vertical="${s.valign ?? 'center'}"${s.wrap ? ' wrapText="1"' : ''}/>`;
    const xf = `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${fmt ? ' applyNumberFormat="1"' : ''}>${al}</xf>`;
    this.xfs.push(xf);
    const id = this.xfs.length - 1;
    this.cache.set(key, id);
    return id;
  }

  xml(): string {
    const nf = [...this.fmts.entries()].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (nf ? `<numFmts count="${this.fmts.size}">${nf}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

/* ---------- Biểu đồ ---------- */
function chartXml(c: LineChartSpec): string {
  const NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const txt = (sz: number, bold: boolean) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="44525F"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>`;
  const ser = c.series
    .map((s, i) => {
      const color = s.color.replace('#', '');
      const strCache = (arr: string[]) => `<c:strCache><c:ptCount val="${arr.length}"/>${arr.map((v, k) => `<c:pt idx="${k}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
      const numCache = `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.vals.length}"/>${s.vals
        .map((v, k) => (v === null ? '' : `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`))
        .join('')}</c:numCache>`;
      return (
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` +
        `<c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f>${strCache([s.name])}</c:strRef></c:tx>` +
        `<c:spPr><a:ln w="19050" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${s.dashed ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln></c:spPr>` +
        (s.dashed
          ? '<c:marker><c:symbol val="none"/></c:marker>'
          : `<c:marker><c:symbol val="${s.marker ?? 'circle'}"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="15875"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr></c:marker>`) +
        `<c:cat><c:strRef><c:f>${esc(s.catRef)}</c:f>${strCache(s.cats)}</c:strRef></c:cat>` +
        `<c:val><c:numRef><c:f>${esc(s.valRef)}</c:f>${numCache}</c:numRef></c:val>` +
        '<c:smooth val="1"/></c:ser>'
      );
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<c:chartSpace ${NS}><c:roundedCorners val="0"/><c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1200" b="1"/><a:t>${esc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' +
    `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="50010"/><c:axId val="50020"/></c:lineChart>` +
    `<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${txt(900, false)}<c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/><c:max val="${c.yMax}"/><c:min val="${c.yMin}"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D5DDE6"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(c.yFormat ?? '0')}" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${txt(900, false)}<c:crossAx val="50010"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
    '</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
    '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D5DDE6"/></a:solidFill></a:ln></c:spPr></c:chartSpace>'
  );
}

function drawingXml(charts: LineChartSpec[]): string {
  const anchors = charts
    .map(
      (c, i) =>
        `<xdr:twoCellAnchor><xdr:from><xdr:col>${c.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${c.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Biểu đồ ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
        `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/>` +
        '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>',
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`;
}

/* ---------- Workbook ---------- */
export class Workbook {
  sheets: Sheet[] = [];
  private used = new Set<string>();
  title = 'Bảng điểm';
  creator = 'Điểm học phần';

  addSheet(name: string): Sheet {
    const s = new Sheet(safeSheetName(name, this.used));
    this.sheets.push(s);
    return s;
  }

  build(): Uint8Array {
    const st = new Styles();
    const files: { name: string; data: Uint8Array }[] = [];
    const add = (name: string, xml: string) => files.push({ name, data: enc.encode(xml) });
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
    const hdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

    let chartNo = 0;
    let drawNo = 0;
    const overrides: string[] = [];
    const sheetXmls: string[] = [];

    this.sheets.forEach((sh, si) => {
      const rows = [...sh.cells.keys()].sort((a, b) => a - b);
      let maxC = 1;
      let maxR = 1;
      const sd = rows
        .map((r) => {
          const row = sh.cells.get(r) as Map<number, Cell>;
          const cols = [...row.keys()].sort((a, b) => a - b);
          maxR = Math.max(maxR, r);
          const h = sh.heights.get(r);
          const cs = cols
            .map((c) => {
              maxC = Math.max(maxC, c);
              const { v, s } = row.get(c) as Cell;
              const sid = st.get(s);
              const a = `r="${ref(r, c)}"${sid ? ` s="${sid}"` : ''}`;
              if (v === null || v === '') return `<c ${a}/>`;
              if (typeof v === 'number') return Number.isFinite(v) ? `<c ${a}><v>${v}</v></c>` : `<c ${a}/>`;
              return `<c ${a} t="inlineStr"><is><t xml:space="preserve">${esc(v.slice(0, 32000))}</t></is></c>`;
            })
            .join('');
          return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cs}</row>`;
        })
        .join('');
      const colsXml = sh.widths.size
        ? `<cols>${[...sh.widths.entries()].sort((a, b) => a[0] - b[0]).map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`).join('')}</cols>`
        : '';
      let pane = '';
      if (sh.freezeAt) {
        const { row, col } = sh.freezeAt;
        const tl = ref(row + 1, col + 1);
        const p = row && col ? 'bottomRight' : row ? 'bottomLeft' : 'topRight';
        pane = `<pane${col ? ` xSplit="${col}"` : ''}${row ? ` ySplit="${row}"` : ''} topLeftCell="${tl}" activePane="${p}" state="frozen"/><selection pane="${p}"/>`;
      }
      const hasCharts = sh.charts.length > 0;
      let drawRef = '';
      if (hasCharts) {
        drawNo++;
        drawRef = '<drawing r:id="rId1"/>';
        add(`xl/worksheets/_rels/sheet${si + 1}.xml.rels`, `${hdr}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/drawing" Target="../drawings/drawing${drawNo}.xml"/></Relationships>`);
        add(`xl/drawings/drawing${drawNo}.xml`, drawingXml(sh.charts));
        const rels = sh.charts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/chart" Target="../charts/chart${chartNo + i + 1}.xml"/>`).join('');
        add(`xl/drawings/_rels/drawing${drawNo}.xml.rels`, `${hdr}<Relationships xmlns="${PR}">${rels}</Relationships>`);
        overrides.push(`<Override PartName="/xl/drawings/drawing${drawNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        sh.charts.forEach((c, i) => {
          chartNo++;
          add(`xl/charts/chart${chartNo}.xml`, chartXml(c));
          overrides.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
          void i;
        });
      }
      sheetXmls.push(
        `${hdr}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}">` +
          `<sheetPr>${sh.tabColor ? `<tabColor rgb="FF${sh.tabColor}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>` +
          `<dimension ref="A1:${ref(maxR, maxC)}"/>` +
          `<sheetViews><sheetView workbookViewId="0" showGridLines="0"${si === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>` +
          '<sheetFormatPr defaultRowHeight="18" customHeight="1"/>' +
          colsXml +
          `<sheetData>${sd}</sheetData>` +
          (sh.filterRange ? `<autoFilter ref="${sh.filterRange}"/>` : '') +
          (sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
          '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
          '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
          drawRef +
          '</worksheet>',
      );
    });
    sheetXmls.forEach((x, i) => add(`xl/worksheets/sheet${i + 1}.xml`, x));
    add('xl/styles.xml', st.xml());
    add(
      'xl/workbook.xml',
      `${hdr}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${this.sheets
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    );
    add(
      'xl/_rels/workbook.xml.rels',
      `${hdr}<Relationships xmlns="${PR}">${this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${this.sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    );
    add('_rels/.rels', `${hdr}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    add('docProps/core.xml', `${hdr}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(this.title)}</dc:title><dc:creator>${esc(this.creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created></cp:coreProperties>`);
    add('docProps/app.xml', `${hdr}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Điểm học phần</Application></Properties>`);
    add(
      '[Content_Types].xml',
      `${hdr}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        this.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        overrides.join('') +
        '</Types>',
    );
    // [Content_Types].xml nên đứng đầu gói.
    files.sort((a, b) => (a.name === '[Content_Types].xml' ? -1 : b.name === '[Content_Types].xml' ? 1 : 0));
    return zipStore(files);
  }
}

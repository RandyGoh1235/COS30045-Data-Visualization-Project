const DATA = {
  annualRoad: [],
  counterparty: [],
  ageRoad: [],
  monthRoad: [],
  sexRoad: [],
  remoteRoad: [],
  burdenAll: [],
  stateAll: [],
  fnAll: []
};

// Helper to reliably read column values, handling possible BOM, quotes, or case differences
function getCol(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
    const withBom = "\uFEFF" + k;
    if (row[withBom] !== undefined) return row[withBom];
  }
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const target = k.toLowerCase().replace(/^\uFEFF/, '').trim();
    const found = rowKeys.find(rk => rk.toLowerCase().replace(/^\uFEFF/, '').trim() === target);
    if (found && row[found] !== undefined) return row[found];
  }
  return "";
}

// Load all CSV data files and store them in the DATA object
function loadData() {
  return Promise.all([
    d3.csv("data/annualroad.csv", d => ({
      year: +getCol(d, "Calendar year", "year"),
      roadUser: getCol(d, "Road user", "roadUser"),
      value: +getCol(d, "Sum(Hospitalisations)", "value")
    })),
    d3.csv("data/counterparty.csv", d => ({
      year: +getCol(d, "Calendar year", "year"),
      counterparty: getCol(d, "Counterparty", "counterparty"),
      value: +getCol(d, "Sum(Hospitalisations)", "value")
    })),
    d3.csv("data/age_road.csv", d => ({
      year: +getCol(d, "Calendar year", "year"),
      age: getCol(d, "Age group", "age"),
      roadUser: getCol(d, "Road user", "roadUser"),
      value: +getCol(d, "Sum(Hospitalisations)", "value")
    })),
    d3.csv("data/month_road.csv", d => ({
      year: +getCol(d, "Calendar year", "year"),
      month: getCol(d, "Month", "month"),
      roadUser: getCol(d, "Road user", "roadUser"),
      value: +getCol(d, "Sum(Hospitalisations)", "value")
    })),
    d3.csv("data/sex_road.csv", d => ({
      year: +getCol(d, "Calendar year", "year"),
      sex: getCol(d, "Sex", "sex"),
      roadUser: getCol(d, "Road user", "roadUser"),
      value: +getCol(d, "Sum(Hospitalisations)", "value")
    })),
    d3.csv("data/remote_road.csv", d => ({
      year: +getCol(d, "Calendar year", "year"),
      area: getCol(d, "ABS remoteness area", "area", "Remoteness"),
      roadUser: getCol(d, "Road user", "roadUser"),
      value: +getCol(d, "Sum(Hospitalisations)", "value")
    })),
    d3.csv("data/burden_all.csv", d => {
      const cases = +getCol(d, "Sum(Hospitalisations)", "cases", "value");
      const bedDays = +getCol(d, "Sum(Bed days)", "bedDays");
      return {
        year: +getCol(d, "Calendar year", "year"),
        roadUser: getCol(d, "Road user", "roadUser"),
        cases: cases,
        bedDays: bedDays,
        avgStay: cases > 0 ? +(bedDays / cases).toFixed(2) : 0
      };
    }),
    d3.csv("data/state_all.csv", d => {
      const cases = +getCol(d, "Sum(count of cases excluding died in hospitals within 30 days)", "cases", "value");
      return {
        year: +getCol(d, "calendar year", "Calendar year", "year"),
        state: getCol(d, "state or territory", "state"),
        cases: cases,
        value: cases
      };
    }),
    d3.csv("data/first_nation_all.csv", d => {
      const cases = +getCol(d, "Sum(Hospitalisations)", "cases", "value");
      return {
        year: +getCol(d, "Calendar year", "year"),
        status: getCol(d, "First Nations status", "status"),
        roadUser: getCol(d, "Road user", "roadUser"),
        cases: cases,
        value: cases
      };
    })
  ]).then(([annualRoad, counterparty, ageRoad, monthRoad, sexRoad, remoteRoad, burdenAll, stateAll, fnAll]) => {
    DATA.annualRoad = annualRoad;
    DATA.counterparty = counterparty;
    DATA.ageRoad = ageRoad;
    DATA.monthRoad = monthRoad;
    DATA.sexRoad = sexRoad;
    DATA.remoteRoad = remoteRoad;
    DATA.burdenAll = burdenAll;
    DATA.stateAll = stateAll;
    DATA.fnAll = fnAll;
  });
}

const fmt = d3.format(",");
const pct = d3.format("+.1%");
const C = {mint:"#9CE5C3", dark:"#216B4E", blue:"#5DA785", gold:"#A9DCC1", coral:"#739C84", navy:"#141414", grey:"#899B8C", pale:"#EFF9F2"};
const CHART_BASE = "#9CE5C3";
const CHART_COMPARE = "#216B4E";
const CHART_MINTS = ["#216B4E", "#2C8862", "#43A778", "#65BF94", "#83D1A8", "#9CE5C3", "#BDEAD2"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tooltip = d3.select("#tooltip");
let filters = {compareRoad:"Motorcyclist", base:2019, compare:2020};
let activeView = "overview";

// Tooltip functions
function tip(ev, html) {
  tooltip.html(html).style("opacity", 1).style("left", (ev.clientX+12)+"px").style("top", (ev.clientY+12)+"px")
}

// Hide tooltip
function hideTip() {
  tooltip.style("opacity", 0)
}

// Create a card element in the grid with specified span, title, question, type, and footer
function card(grid, span, title, question, type, foot) {
  const el = document.createElement("section");
  el.className = "chart-card span-"+span;
  el.innerHTML = `<div class="chart-card-header"><div><div class="chart-card-title">${title}</div><div class="chart-card-subtitle">${question}</div></div></div><div class="chart-body"></div><div class="chart-card-footer">${foot}</div>`;
  grid.appendChild(el);
  return el.querySelector(".chart-body");
}

// Create a chart frame with specified margins and return the SVG element, dimensions, and group element for drawing
function chartFrame(el, m = {top:10, right:15, bottom:28, left:45}) {
  el.innerHTML = "";
  const w = Math.max(220, el.clientWidth), h = Math.max(115, el.clientHeight);

  m = {...m, right:2};
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("preserveAspectRatio", "xMidYMid meet");
  return {svg, w, h, m, iw:w-m.left-m.right, ih:h-m.top-m.bottom, g:svg.append("g").attr("transform", `translate(${m.left},${m.top})`)};
}

// Calculate the total value for a given year and road user type, or all road users if specified
function totalByYearRoad(year, road) {
  return DATA.annualRoad.filter(d => d.year === +year && (road === "All road users" || d.roadUser === road)).reduce((s, d) => s+d.value, 0)
}

// Create a nice axis with grid lines and formatted ticks for the given scales and dimensions
function niceAxis(g, x, y, iw, ih, opts = {}) {
  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(opts.yTicks || 4).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(opts.xTicks || 5).tickFormat(opts.xFormat || d3.format("~s")));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(opts.yTicks || 4).tickFormat(opts.yFormat || d3.format("~s")));
}

// Split a label into multiple lines based on maximum characters and lines, adding ellipsis if necessary
function splitWrapLabel(text, maxChars = 14, maxLines = 2) {
  const raw = String(text || "").trim();
  if (!raw) return [""];
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    if (raw.length <= maxChars) return [raw];
    if (raw.length <= maxChars*2) return [raw.slice(0, maxChars), raw.slice(maxChars)];
    return [raw.slice(0, maxChars), raw.slice(maxChars, maxChars*2-1)+"…"];
  }
  const lines = [];
  let line = "";
  words.forEach(word => {
    const candidate = line?`${line} ${word}`:word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines-1] = kept[maxLines-1].replace(/…?$/, '')+"…";
  return kept;
}

// Wrap tick text elements to fit within specified character and line limits, adjusting position and anchor
function wrapTickText(textSel, maxChars = 14, maxLines = 2) {
  textSel.each(function() {
    const t = d3.select(this);
    const full = (t.attr("data-full-label") || t.text() || "").trim();
    const lines = splitWrapLabel(full, maxChars, maxLines);
    t.attr("data-full-label", full).text(null).attr("text-anchor", "end").attr("x", -6);
    lines.forEach((line, i) => {
      t.append("tspan")
        .attr("x", -6)
        .attr("dy", i === 0?`${-(lines.length-1)*0.56}em`:`1.08em`)
        .text(line);
    });
  });
}
let labelMeasureCanvas = null;

// Measure the width of a label in pixels based on the specified font size, using a canvas context for accurate measurement
function measureLabelWidth(text, fontSize = 9.2) {
  if (typeof document === "undefined")return String(text || "").length*fontSize*.54;
  if (!labelMeasureCanvas)labelMeasureCanvas = document.createElement("canvas");
  const ctx = labelMeasureCanvas.getContext("2d");
  if (!ctx)return String(text || "").length*fontSize*.54;
  ctx.font = `${fontSize}px "DM Sans", Arial, sans-serif`;
  return ctx.measureText(String(text || "")).width;
}

// Wrap a label into multiple lines based on pixel width, font size, and maximum lines, adding ellipsis if necessary
function wrapLabelPixels(text, maxWidth, fontSize = 9.2, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length)return [""];
  const lines = [];
  let line = "";
  words.forEach(word => {
    if (measureLabelWidth(word, fontSize) > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const ch of word) {
        if (chunk && measureLabelWidth(chunk+ch, fontSize) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      if (chunk)line = chunk;
    } else {
      const candidate = line?`${line} ${word}`:word;
      if (!line || measureLabelWidth(candidate, fontSize) <= maxWidth)line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
  });
  if (line)lines.push(line);
  if (lines.length <= maxLines)return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines-1];
  while (last.length > 1 && measureLabelWidth(last+"…", fontSize) > maxWidth)last = last.slice(0, -1);
  kept[maxLines-1] = last.replace(/…?$/, '')+"…";
  return kept;
}

// Calculate dynamic left margin for category labels based on their pixel width, font size, and minimum margin
function dynamicCategoryMargin(el, labels, fontSize = 9.2, min = 38) {
  const width = el.clientWidth || 480;
  const cap = Math.max(56, Math.min(width*.32, 132));
  let widest = 0;
  (labels || []).forEach(label => wrapLabelPixels(label, cap, fontSize, 2).forEach(line => {
    widest = Math.max(widest, measureLabelWidth(line, fontSize));
  }));
  return Math.max(min, Math.ceil(widest)+12);
}

// Render a trend chart comparing pedal cyclist data with a specified comparator over the years
function renderTrend(el) {
  const allYears = [...new Set(DATA.annualRoad.map(d => d.year))].sort((a, b) => a-b);
  const cyclist = allYears.map(year => ({year, value:totalByYearRoad(year, "Pedal cyclist")}));
  const comparator = allYears.map(year => ({year, value:totalByYearRoad(year, filters.compareRoad)}));
  const index = (arr) => {
    const base = arr.find(d => d.year === allYears[0])?.value || 1;
    return arr.map(d => ({...d, index:d.value/base*100}))
  };
  const series = [
    {name:"Pedal cyclist", values:index(cyclist), color:CHART_COMPARE},
    {name:filters.compareRoad, values:index(comparator), color:CHART_BASE}
  ];
  const b = chartFrame(el, {top:22, right:14, bottom:28, left:34}), {g, iw, ih} = b;
  const x = d3.scaleLinear().domain(d3.extent(allYears)).range([0, iw]);
  const y = d3.scaleLinear().domain([0, d3.max(series.flatMap(s => s.values.map(d => d.index)))*1.12]).nice().range([ih, 0]);
  niceAxis(g, x, y, iw, ih, {xTicks:6, yTicks:4, xFormat:d3.format("d"), yFormat:d => Math.round(d)});
  [filters.base, filters.compare].forEach((yr, i) => {
    if (yr >= d3.min(allYears) && yr <= d3.max(allYears)) {
      g.append("line").attr("x1", x(yr)).attr("x2", x(yr)).attr("y1", 0).attr("y2", ih)
        .attr("stroke", i === 0?CHART_BASE:CHART_COMPARE).attr("stroke-width", 1.2).attr("stroke-dasharray", "3 3").attr("opacity", .8);
      g.append("text").attr("x", x(yr)+3).attr("y", 9+i*11).attr("font-size", 8).attr("font-weight", 800)
        .attr("fill", "#26332C").text(yr);
    }
  });
  series.forEach(s => {
    const line = d3.line().defined(d => Number.isFinite(d.year) && Number.isFinite(d.index))
      .x(d => x(d.year)).y(d => y(d.index)).curve(d3.curveMonotoneX);
    g.append("path").datum(s.values).attr("class", "series-line")
      .attr("fill", "none").attr("stroke", s.color).style("stroke", s.color)
      .attr("stroke-width", s.name === "Pedal cyclist"?3.6:2.6)
      .attr("stroke-linecap", "round").attr("stroke-linejoin", "round")
      .attr("stroke-dasharray", s.name === "Pedal cyclist"?"none":"5 4")
      .attr("opacity", 1).attr("d", line);
    g.selectAll(null).data(s.values).enter().append("circle").attr("cx", d => x(d.year)).attr("cy", d => y(d.index)).attr("r", 2.8).attr("fill", s.color)
      .on("mousemove", (ev, d) => tip(ev, `<b>${s.name}</b><br>${d.year}: ${fmt(d.value)} cases<br>Index: ${d.index.toFixed(1)} (2011=100)`)).on("mouseleave", hideTip);
  });
  series.forEach((s, i) => {
    g.append("circle").attr("cx", i*155+5).attr("cy", -12).attr("r", 3).attr("fill", s.color);
    g.append("text").attr("class", "legend-text").attr("x", i*155+12).attr("y", -9).text(s.name)
  });
}

// Create a comparison of values for a given label and value key between two specified years, returning an array of objects with name, values, change, and percentage change
function makeComparison(arr, labelKey, valueKey, year0, year1) {
  const names = [...new Set(arr.map(d => d[labelKey]))];
  return names.map(name => {
    const a = arr.find(d => d[labelKey] === name && +d.year === +year0)?.[valueKey] || 0;
    const b = arr.find(d => d[labelKey] === name && +d.year === +year1)?.[valueKey] || 0;
    return {name, a, b, change:b-a, pct:a?(b-a)/a:null};
  });
}

// Render a diverging bar chart for the given element, rows of data, label key, metric, and options
function renderDiverging(el, rows, labelKey = "name", metric = "change", opts = {}) {
  const width = el.clientWidth || 480;
  const leftMargin = opts.hideLabels ? 20 : dynamicCategoryMargin(el, rows.map(d => d[labelKey]), opts.compactLabels?8.8:9.2, 38);
  const b = chartFrame(el, {top:10, right:opts.compactLabels?15:20, bottom:30, left:leftMargin}), {g, iw, ih} = b;
  rows = [...rows].sort((a, b) => a[metric]-b[metric]);
  const low = Math.min(0, d3.min(rows, d => d[metric]) ?? 0);
  const high = Math.max(0, d3.max(rows, d => d[metric]) ?? 0);
  const span = Math.max(1, high-low);

  const leftPad = low < 0 ? Math.max(span*.04, Math.abs(low)*.08) : 0;
  const rightPad = high > 0 ? Math.max(span*.04, Math.abs(high)*.08) : 0;
  const x = d3.scaleLinear().domain([low-leftPad, high+rightPad]).range([0, iw]);
  const y = d3.scaleBand().domain(rows.map(d => d[labelKey])).range([0, ih]).padding(.18);
  const axisY = g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0));
  if (!opts.hideLabels) {
    wrapTickText(axisY.selectAll(".tick text"), opts.compactLabels?10:14, 2);
  } else {
    axisY.selectAll(".tick text").remove();
  }
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("~s")));
  g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", ih).attr("stroke", "#838d81").attr("stroke-width", 1.2);
  g.selectAll("rect").data(rows).enter().append("rect")
    .attr("x", d => Math.min(x(0), x(d[metric])))
    .attr("y", d => y(d[labelKey]))
    .attr("width", d => Math.max(1, Math.abs(x(d[metric])-x(0))))
    .attr("height", y.bandwidth())

    .attr("fill", d => d[metric] >= 0?CHART_COMPARE:CHART_BASE)
    .on("mousemove", (ev, d) => tip(ev, `<b>${d[labelKey]}</b><br>${filters.base}: ${fmt(d.a??0)}<br>${filters.compare}: ${fmt(d.b??0)}<br>Change: ${d.change>0?"+":""}${fmt(d.change)}${d.pct===null?"":`<br>Change: ${pct(d.pct)}`}`))
    .on("mouseleave", hideTip);
}

// Render a diverging bar chart for counterparty data, filtering out "Not applicable" and "Missing" entries
function renderCounterparty(el) {
  const rows = makeComparison(DATA.counterparty.filter(d => d.counterparty !== "Not applicable" && d.counterparty !== "Missing"), "counterparty", "value", filters.base, filters.compare).map(d => ({...d, name:d.name}));
  renderDiverging(el, rows, "name", "change");
}

// Render a diverging bar chart for counterparty data, showing the top 8 counterparties by maximum value between the two years
function renderClassCounts(el) {
  const rows = makeComparison(
    DATA.counterparty.filter(d => !["Missing", "Not applicable"].includes(d.counterparty)),
    "counterparty", "value", filters.base, filters.compare
  ).sort((a, b) => Math.max(b.a, b.b)-Math.max(a.a, a.b)).slice(0, 8);

  const b = chartFrame(el, {top:19, right:5, bottom:30, left:5}), {g, iw, ih} = b;
  const centerW = Math.min(142, Math.max(112, iw*.27));
  const halfW = Math.max(35, (iw-centerW)/2);
  const centerL = halfW, centerR = halfW+centerW;
  const maxVal = Math.max(1, d3.max(rows, d => Math.max(d.a, d.b))*1.08);
  const xLeft = d3.scaleLinear().domain([0, maxVal]).range([centerL, 0]);
  const xRight = d3.scaleLinear().domain([0, maxVal]).range([0, halfW]);
  const y = d3.scaleBand().domain(rows.map(d => d.name)).range([0, ih]).padding(.19);

  const ticks = xRight.ticks(3);
  ticks.forEach(t => {
    const lx = xLeft(t), rx = centerR+xRight(t);
    g.append("line").attr("x1", lx).attr("x2", lx).attr("y1", 0).attr("y2", ih)
      .attr("stroke", "#DDE7DF").attr("stroke-width", .8);
    g.append("line").attr("x1", rx).attr("x2", rx).attr("y1", 0).attr("y2", ih)
      .attr("stroke", "#DDE7DF").attr("stroke-width", .8);
  });

  rows.forEach(d => {
    const yy = y(d.name), hh = y.bandwidth();
    g.append("rect")
      .attr("x", xLeft(d.a)).attr("y", yy)
      .attr("width", Math.max(0, centerL-xLeft(d.a))).attr("height", hh)
      .attr("fill", CHART_BASE)
      .on("mousemove", ev => tip(ev, `<b>${d.name}</b><br>${filters.base}: ${fmt(d.a)} cases`))
      .on("mouseleave", hideTip);
    g.append("rect")
      .attr("x", centerR).attr("y", yy)
      .attr("width", Math.max(0, xRight(d.b))).attr("height", hh)
      .attr("fill", CHART_COMPARE)
      .on("mousemove", ev => tip(ev, `<b>${d.name}</b><br>${filters.compare}: ${fmt(d.b)} cases`))
      .on("mouseleave", hideTip);

    const label = g.append("text")
      .attr("x", centerL+centerW/2)
      .attr("y", yy+hh/2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 8.2)
      .attr("font-weight", 600)
      .attr("fill", "#26332C");
    const lines = wrapLabelPixels(d.name, centerW-8, 8.2, 2);
    lines.forEach((line, i) => {
      label.append("tspan")
        .attr("x", centerL+centerW/2)
        .attr("dy", i === 0?`${-(lines.length-1)*.52}em`:"1.04em")
        .text(line);
    });
  });

  const leftAxis = g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(xLeft).ticks(3).tickFormat(d3.format("~s")));
  const rightAxis = g.append("g").attr("class", "axis")
    .attr("transform", `translate(${centerR},${ih})`)
    .call(d3.axisBottom(xRight).ticks(3).tickFormat(d3.format("~s")));
  leftAxis.select(".domain").attr("stroke", "#89988E");
  rightAxis.select(".domain").attr("stroke", "#89988E");

  g.append("text").attr("class", "legend-text")
    .attr("x", centerL-8).attr("y", -7).attr("text-anchor", "end")
    .attr("font-weight", 800).attr("fill", "#557E69").text(filters.base);
  g.append("text").attr("class", "legend-text")
    .attr("x", centerR+8).attr("y", -7).attr("text-anchor", "start")
    .attr("font-weight", 800).attr("fill", "#216B4E").text(filters.compare);
}

// Render a diverging bar chart showing the change in share of hospitalisations by counterparty between two years
function renderClassShare(el) {

  const years = [filters.base, filters.compare];
  const all = DATA.counterparty.filter(d =>
    years.includes(+d.year) && !["Missing", "Not applicable"].includes(d.counterparty)
  );
  const categories = [...new Set(all.map(d => d.counterparty))];
  const totals = new Map(years.map(yr => [
        yr,
        d3.sum(all.filter(d => +d.year === yr), d => d.value) || 1
      ]));
  const rows = categories.map(name => {
    const a = d3.sum(all.filter(d => +d.year === filters.base && d.counterparty === name), d => d.value);
    const b = d3.sum(all.filter(d => +d.year === filters.compare && d.counterparty === name), d => d.value);
    const ap = a/totals.get(filters.base)*100;
    const bp = b/totals.get(filters.compare)*100;
    return {name, a, b, ap, bp, change:bp-ap};
  }).sort((a, b) => Math.abs(b.change)-Math.abs(a.change));

  const left = dynamicCategoryMargin(el, rows.map(d => d.name), 9.2, 38);
  const f = chartFrame(el, {top:17, right:12, bottom:30, left}), {g, iw, ih} = f;
  const maxAbs = Math.max(.5, d3.max(rows, d => Math.abs(d.change)) || 0);
  const extent = maxAbs*1.18;
  const x = d3.scaleLinear().domain([-extent, extent]).range([0, iw]);
  const y = d3.scaleBand().domain(rows.map(d => d.name)).range([0, ih]).padding(.22);

  g.append('g').attr('class', 'grid')
    .attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-ih).tickFormat(''));

  g.append('g').attr('class', 'axis').call(d3.axisLeft(y).tickSize(0));

  g.append('g').attr('class', 'axis')
    .attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d>0?'+':''}${d.toFixed(1)}`));

  g.append('line')
    .attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ih)
    .attr('stroke', '#53685B').attr('stroke-width', 1.25);

  rows.forEach(d => {
    const x0 = x(0), x1 = x(d.change);
    g.append('rect')
      .attr('x', Math.min(x0, x1))
      .attr('y', y(d.name))
      .attr('width', Math.max(1, Math.abs(x1-x0)))
      .attr('height', y.bandwidth())

      .attr('fill', d.change >= 0?CHART_COMPARE:CHART_BASE)
      .on('mousemove', ev => tip(ev,
        `<b>${d.name}</b><br>`+
        `${filters.base}: ${d.ap.toFixed(1)}% (${fmt(d.a)} cases)<br>`+
        `${filters.compare}: ${d.bp.toFixed(1)}% (${fmt(d.b)} cases)<br>`+
        `Share change: ${d.change>0?'+':''}${d.change.toFixed(1)} percentage points`
      ))
      .on('mouseleave', hideTip);
  });

  g.append('text')
    .attr('class', 'legend-text')
    .attr('x', iw).attr('y', ih+27)
    .attr('text-anchor', 'end')
    .text('Change in share (percentage points)');
}

// Render a grouped bar chart comparing pedal cyclist data with a specified comparator for different road user types
function renderGroupedRoad(el) {
  const rows = makeComparison(
    DATA.annualRoad.filter(d => d.roadUser === "Pedal cyclist" || d.roadUser === filters.compareRoad),
    "roadUser", "value", filters.base, filters.compare
  );
  const chosen = rows.sort((a, b) => a.name === "Pedal cyclist"?-1:b.name === "Pedal cyclist"?1:0);
  const width = el.clientWidth || 480;
  const left = dynamicCategoryMargin(el, chosen.map(d => d.name), 9.2, 38);
  const b = chartFrame(el, {top:11, right:14, bottom:29, left}), {g, iw, ih} = b;
  const x = d3.scaleLinear().domain([0, d3.max(chosen, d => Math.max(d.a, d.b))*1.08]).nice().range([0, iw]);
  const y = d3.scaleBand().domain(chosen.map(d => d.name)).range([0, ih]).padding(.22);
  const sub = d3.scaleBand().domain([String(filters.base), String(filters.compare)]).range([0, y.bandwidth()]).padding(.12);
  const axisY = g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0));
  wrapTickText(axisY.selectAll(".tick text"), 14, 2);
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("~s")));
  chosen.forEach(d => [[String(filters.base), d.a, CHART_BASE], [String(filters.compare), d.b, CHART_COMPARE]].forEach(([yr, v, c]) => {
    g.append("rect").attr("x", 0).attr("y", y(d.name)+sub(yr)).attr("width", x(v)).attr("height", sub.bandwidth()).attr("fill", c)
      .on("mousemove", ev => tip(ev, `<b>${d.name}</b><br>${yr}: ${fmt(v)} cases`)).on("mouseleave", hideTip);
  }));
  g.append("circle").attr("cx", iw-95).attr("cy", -1).attr("r", 3).attr("fill", CHART_BASE);
  g.append("text").attr("class", "legend-text").attr("x", iw-88).attr("y", 2).text(String(filters.base));
  g.append("circle").attr("cx", iw-48).attr("cy", -1).attr("r", 3).attr("fill", CHART_COMPARE);
  g.append("text").attr("class", "legend-text").attr("x", iw-41).attr("y", 2).text(String(filters.compare));
}

// Render a line chart showing the number of pedal cyclist cases by age group for two specified years, with areas and points for each year
function renderAge(el) {
  const order = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
  const ageRows = DATA.ageRoad.filter(d => d.roadUser === "Pedal cyclist" && order.includes(d.age));
  const rows = order.map(age => {
    const a = ageRows.filter(d => +d.year === +filters.base && d.age === age).reduce((s, d) => s+d.value, 0);
    const b = ageRows.filter(d => +d.year === +filters.compare && d.age === age).reduce((s, d) => s+d.value, 0);
    return {age, a, b, change:b-a};
  });
  const f = chartFrame(el, {top:24, right:12, bottom:34, left:42}), {g, iw, ih} = f;
  const maxValue = d3.max(rows, d => Math.max(d.a, d.b)) || 1;
  const x = d3.scalePoint().domain(order).range([0, iw]).padding(.22);
  const y = d3.scaleLinear().domain([0, maxValue*1.14]).nice().range([ih, 0]);

  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickSize(0));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));

  const baseArea = d3.area()
    .x(d => x(d.age))
    .y0(y(0))
    .y1(d => y(d.a))
    .curve(d3.curveLinear);

  const compareArea = d3.area()
    .x(d => x(d.age))
    .y0(y(0))
    .y1(d => y(d.b))
    .curve(d3.curveLinear);

  g.append("path").datum(rows)
    .attr("d", compareArea)
    .attr("fill", CHART_COMPARE)
    .attr("opacity", .09)
    .attr("stroke", "none");

  g.append("path").datum(rows)
    .attr("d", baseArea)
    .attr("fill", CHART_BASE)
    .attr("opacity", .12)
    .attr("stroke", "none");

  const baseLine = d3.line()
    .x(d => x(d.age)).y(d => y(d.a))
    .curve(d3.curveLinear);

  const compareLine = d3.line()
    .x(d => x(d.age)).y(d => y(d.b))
    .curve(d3.curveLinear);

  g.append("path").datum(rows)
    .attr("d", baseLine)
    .attr("fill", "none")
    .attr("stroke", CHART_BASE)
    .attr("stroke-width", 2.5)
    .attr("stroke-linejoin", "round");

  g.append("path").datum(rows)
    .attr("d", compareLine)
    .attr("fill", "none")
    .attr("stroke", CHART_COMPARE)
    .attr("stroke-width", 2.5)
    .attr("stroke-linejoin", "round");

  const series = [
    {key:"a", year:filters.base, color:CHART_BASE},
    {key:"b", year:filters.compare, color:CHART_COMPARE}
  ];

  series.forEach(s => {
    g.selectAll(`.age-point-${s.key}`).data(rows).enter().append("circle")
      .attr("class", `age-point-${s.key}`)
      .attr("cx", d => x(d.age))
      .attr("cy", d => y(d[s.key]))
      .attr("r", 3.4)
      .attr("fill", s.color)
      .attr("stroke", "none")
      .on("mousemove", (ev, d) => tip(ev,
        `<b>${d.age}</b><br>${filters.base}: ${fmt(d.a)} cases<br>`+
        `${filters.compare}: ${fmt(d.b)} cases<br>`+
        `Change: ${d.change>0?"+":""}${fmt(d.change)} cases`
      ))
      .on("mouseleave", hideTip);
  });

  const legendY = -14;
  const legendStart = Math.max(4, iw-124);
  series.forEach((s, i) => {
    const lx = legendStart+i*66;
    g.append("line")
      .attr("x1", lx).attr("x2", lx+12)
      .attr("y1", legendY).attr("y2", legendY)
      .attr("stroke", s.color).attr("stroke-width", 2.5);
    g.append("circle")
      .attr("cx", lx+6).attr("cy", legendY)
      .attr("r", 2.6).attr("fill", s.color).attr("stroke", "none");
    g.append("text")
      .attr("class", "legend-text")
      .attr("x", lx+16).attr("y", legendY+3)
      .attr("font-size", 8)
      .attr("font-weight", 750)
      .text(String(s.year));
  });
}

// Render a composition chart showing the distribution of road user types for two specified years, with a focus on the top categories and an "Other" category for the rest
function renderComposition(el) {
  const rows = makeComparison(DATA.annualRoad, "roadUser", "value", filters.base, filters.compare);
  rows.sort((a, b) => Math.max(b.a, b.b)-Math.max(a.a, a.b));
  const top = rows.slice(0, 6), other = rows.slice(6);
  const groups = [{year:filters.base, values:top.map(d => ({name:d.name, v:d.a}))}, {year:filters.compare, values:top.map(d => ({name:d.name, v:d.b}))}];
  groups.forEach(g => g.values.push({name:"Other", v:other.reduce((s, d) => s+(g.year === filters.base?d.a:d.b), 0)}));
  const keys = groups[0].values.map(d => d.name), total = groups.map(g => d3.sum(g.values, d => d.v));
  const left = 34;
  const b = chartFrame(el, {top:30, right:18, bottom:30, left}), {g, iw, ih} = b;
  const x = d3.scaleLinear().domain([0, 1]).range([0, iw]), y = d3.scaleBand().domain(groups.map(d => String(d.year))).range([0, ih]).padding(.35);
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
  const palette = CHART_MINTS;
  const fillCategory = name => name === "Pedal cyclist"?C.dark:(name === filters.compareRoad?CHART_BASE:palette[keys.indexOf(name)]);
  groups.forEach(gr => {
    let start = 0;
    gr.values.forEach((d, i) => {
      const share = d.v/(total[gr.year === filters.base?0:1] || 1);
      g.append("rect").attr("x", x(start)).attr("y", y(String(gr.year))).attr("width", x(share)-x(0)).attr("height", y.bandwidth()).attr("fill", fillCategory(d.name)).on("mousemove", ev => tip(ev, `<b>${gr.year} · ${d.name}</b><br>${fmt(d.v)} cases<br>${(share*100).toFixed(1)}% of total`)).on("mouseleave", hideTip);
      start += share;
    });
  });
  keys.forEach((k, i) => {
    const col = i%4, row = Math.floor(i/4);
    g.append("rect").attr("x", col*iw/4).attr("y", -19+row*10).attr("width", 6).attr("height", 6).attr("fill", fillCategory(k));
    g.append("text").attr("class", "legend-text").attr("x", col*iw/4+9).attr("y", -13+row*10).text(k.length > 17?k.slice(0, 16)+"…":k)
  });
}

// Render a heatmap showing the number of pedal cyclist hospitalisations by month and year, with color intensity representing the number of cases
function renderSeason(el) {

  const years = [...new Set(
      DATA.monthRoad.filter(d => d.roadUser === "Pedal cyclist").map(d => +d.year)
    )].sort((a, b) => a-b);

  const monthAgg = new Map();
  DATA.monthRoad.filter(d => d.roadUser === "Pedal cyclist").forEach(d => {
    const key = +d.year+"|"+d.month;
    monthAgg.set(key, (monthAgg.get(key) || 0)+d.value);
  });

  const values = [...monthAgg.values()];
  const max = d3.max(values) || 1;
  const min = d3.min(values) || 0;
  const left = 38;
  const b = chartFrame(el, {top:22, right:10, bottom:25, left}), {g, iw, ih} = b;
  const x = d3.scaleBand().domain(shortMonths).range([0, iw]).padding(.07);
  const y = d3.scaleBand().domain(years).range([0, ih]).padding(.13);
  const col = d3.scaleLinear()
    .domain([min, min+(max-min)*0.45, max])
    .range(["#E6F3EA", "#7FC5A3", "#0F8A64"]);

  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickSize(0));

  const yAxis = g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0));
  yAxis.selectAll(".tick").each(function(yr) {
    const isBase = +yr === +filters.base;
    const isCompare = +yr === +filters.compare;
    const t = d3.select(this).select("text");
    if (isBase || isCompare) {
      t.attr("font-weight", 900)
        .attr("fill", "#26332C");
    }
  });

  years.forEach(yr => months.forEach((m, i) => {
    const v = monthAgg.get(yr+"|"+m) || 0;
    const isBase = +yr === +filters.base;
    const isCompare = +yr === +filters.compare;
    g.append("rect")
      .attr("x", x(shortMonths[i]))
      .attr("y", y(yr))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())

      .attr("fill", col(v))
      .on("mousemove", ev => tip(ev,
        `<b>${m} ${yr}</b><br>${fmt(v)} Pedal Cyclist hospitalisations`+
        `${isBase?"<br><b>Selected base year</b>":""}`+
        `${isCompare?"<br><b>Selected comparison year</b>":""}`
      ))
      .on("mouseleave", hideTip);
  }));
}

// Render a line chart comparing pedal cyclist hospitalisations by sex for two specified years, with lines and points for each sex category
function renderSex(el) {
  const sexRows = DATA.sexRoad.filter(d => (d.sex === "Male" || d.sex === "Female") && d.roadUser === "Pedal cyclist");
  const rows = makeComparison(sexRows, "sex", "value", filters.base, filters.compare)
    .sort((a, b) => a.name.localeCompare(b.name));
  const b = chartFrame(el, {top:22, right:42, bottom:28, left:36}), {g, iw, ih} = b;
  const x = d3.scalePoint().domain([String(filters.base), String(filters.compare)]).range([0, iw]).padding(.3);
  const max = (d3.max(rows, d => Math.max(d.a, d.b)) || 1)*1.15;
  const y = d3.scaleLinear().domain([0, max]).nice().range([ih, 0]);

  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickFormat(""));

  rows.forEach((d, i) => {
    const col = d.name === "Female"?CHART_COMPARE:CHART_BASE;
    const x1 = x(String(filters.base)), x2 = x(String(filters.compare));
    const y1 = y(d.a), y2 = y(d.b);
    const mx = (x1+x2)/2, my = (y1+y2)/2;

    g.append("line")
      .attr("x1", x1).attr("y1", y1)
      .attr("x2", x2).attr("y2", y2)
      .attr("stroke", col)
      .attr("stroke-width", 2.5);

    [[d.a, filters.base], [d.b, filters.compare]].forEach(([v, yr]) => {
      const cx = x(String(yr)), cy = yr === filters.base?y1:y2;
      g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 4.2)
        .attr("fill", col).attr("stroke", "none")
        .on("mousemove", ev => tip(ev, `<b>${d.name}</b><br>${yr}: ${fmt(v)} cases`))
        .on("mouseleave", hideTip);
    });

    const diffText = `${d.change>0?"+":""}${fmt(d.change)}`;
    g.append("text")
      .attr("class", "legend-text")
      .attr("x", mx).attr("y", my+1+(i === 0?-8:8))
      .attr("text-anchor", "middle")
      .attr("font-size", 9.5)
      .attr("font-weight", 800)
      .attr("fill", col)
      .text(diffText);

    g.append("text")
      .attr("class", "legend-text")
      .attr("x", x2+7).attr("y", y2+3)
      .attr("font-weight", 700)
      .text(d.name);
  });
}

// Render a line chart showing the change in pedal cyclist hospitalisations by month for two specified years, with lines and points for each year and a diverging color scheme for positive and negative changes
function renderMonthChange(el) {
  const rows = months.map(m => {
    const a = DATA.monthRoad.filter(d => d.month === m && +d.year === filters.base && d.roadUser === "Pedal cyclist").reduce((s, d) => s+d.value, 0);
    const b = DATA.monthRoad.filter(d => d.month === m && +d.year === filters.compare && d.roadUser === "Pedal cyclist").reduce((s, d) => s+d.value, 0);
    return {month:m, a, b, change:b-a};
  });
  const f = chartFrame(el, {top:12, right:12, bottom:28, left:42}), {g, iw, ih} = f;
  const absMax = Math.max(1, d3.max(rows, d => Math.abs(d.change)) || 0);
  const x = d3.scalePoint().domain(shortMonths).range([0, iw]).padding(.35);
  const y = d3.scaleLinear().domain([-absMax*1.18, absMax*1.18]).nice().range([ih, 0]);

  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickSize(0));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d>0?"+":""}${d3.format("~s")(d)}`));

  g.append("line")
    .attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0))
    .attr("stroke", "#53685B").attr("stroke-width", 1.25);

  const signOf = v => v < 0?-1:1;
  const expanded = [];
  rows.forEach((d, i) => {
    const point = {x:x(shortMonths[i]), change:d.change, sign:signOf(d.change)};
    if (i === 0) {
      expanded.push(point);
      return;
    }
    const prev = rows[i-1];
    const prevX = x(shortMonths[i-1]);
    const currX = x(shortMonths[i]);
    const prevSign = signOf(prev.change);
    const currSign = signOf(d.change);

    if (prevSign !== currSign) {
      const t = prev.change/(prev.change-d.change);
      const crossX = prevX+(currX-prevX)*t;
      expanded.push({x:crossX, change:0, sign:prevSign, crossing:true});
      expanded.push({x:crossX, change:0, sign:currSign, crossing:true});
    }
    expanded.push(point);
  });

  const segments = [];
  let current = [];
  let currentSign = expanded[0]?.sign || 1;
  expanded.forEach(p => {
    if (p.sign !== currentSign) {
      if (current.length > 1)segments.push({sign:currentSign, points:current});
      current = [current[current.length-1], p];
      currentSign = p.sign;
    } else {
      current.push(p);
    }
  });
  if (current.length > 1)segments.push({sign:currentSign, points:current});

  segments.forEach(segment => {
    const line = d3.line().x(d => d.x).y(d => y(d.change))
      .curve(d3.curveMonotoneX);
    g.append("path").datum(segment.points)
      .attr("class", "series-line")
      .attr("fill", "none")
      .attr("stroke", segment.sign < 0?CHART_BASE:CHART_COMPARE)
      .attr("stroke-width", 2.7)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("d", line);
  });

  g.selectAll("circle.month-change").data(rows).enter().append("circle")
    .attr("class", "month-change")
    .attr("cx", d => x(shortMonths[months.indexOf(d.month)]))
    .attr("cy", d => y(d.change))
    .attr("r", 4)
    .attr("fill", d => d.change < 0?CHART_BASE:CHART_COMPARE)
    .attr("stroke", "none")
    .on("mousemove", (ev, d) => tip(ev,
      `<b>${d.month}</b><br>${filters.base}: ${fmt(d.a)} cases<br>`+
      `${filters.compare}: ${fmt(d.b)} cases<br>`+
      `Change: ${d.change>0?"+":""}${fmt(d.change)} cases`
    ))
    .on("mouseleave", hideTip);
}

// Render a grid of tiles showing the change in pedal cyclist hospitalisations by state between two specified years, with color intensity representing the percentage change
function renderState(el) {
  const rows = makeComparison(DATA.stateAll, "state", "cases", filters.base, filters.compare)
    .sort((a, b) => b.change-a.change);
  const f = chartFrame(el, {top:9, right:9, bottom:9, left:9}), {g, iw, ih} = f;
  const cols = iw < 460?2:4, nRows = Math.ceil(rows.length/cols), gap = 9;
  const cw = (iw-gap*(cols-1))/cols, ch = (ih-gap*(nRows-1))/nRows;

  const validPct = rows.map(d => d.pct === null?null:d.pct*100).filter(v => v !== null && Number.isFinite(v));
  const minPct = d3.min(validPct) ?? 0;
  const maxPct = d3.max(validPct) ?? 1;
  const midPct = (minPct+maxPct)/2;
  const col = d3.scaleLinear()
    .domain(minPct === maxPct?[minPct-1, minPct, maxPct+1]:[minPct, midPct, maxPct])
    .range(["#E6F3EA", "#7FC5A3", "#0F8A64"])
    .clamp(true);
  const lightTextFrom = minPct+(maxPct-minPct)*0.72;

  rows.forEach((d, i) => {
    const px = (i%cols)*(cw+gap), py = Math.floor(i/cols)*(ch+gap);
    const grp = g.append("g").attr("transform", `translate(${px},${py})`);
    const pctValue = d.pct === null?null:d.pct*100;
    const tileFill = pctValue === null?"#F7F4ED":col(pctValue);
    const textFill = pctValue !== null && pctValue >= lightTextFrom?"#FFFDF8":"#13211a";
    const secondaryFill = pctValue !== null && pctValue >= lightTextFrom?"#E7F4EC":"#406451";

    grp.append("rect")
      .attr("width", cw).attr("height", ch)
      .attr("fill", tileFill)
      .attr("stroke", "none");

    grp.append("text")
      .attr("x", cw/2).attr("y", ch*0.25)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.max(14, Math.min(18, cw*0.15)))
      .attr("font-weight", 850)
      .attr("fill", textFill)
      .text(d.name);

    grp.append("text")
      .attr("x", cw/2).attr("y", ch*0.55)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.max(22, Math.min(30, cw*0.24)))
      .attr("font-weight", 900)
      .attr("fill", textFill)
      .text((d.change > 0?"+":"")+fmt(d.change));

    grp.append("text")
      .attr("x", cw/2).attr("y", ch*0.82)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.max(12, Math.min(14, cw*0.11)))
      .attr("font-weight", 700)
      .attr("fill", secondaryFill)
      .text(d.pct === null?"n/a":`${d.pct>=0?"+":""}${pctValue.toFixed(1)}%`);

    grp.on("mousemove", ev => tip(ev,
        `<b>${d.name}</b><br>`+
        `${filters.base}: ${fmt(d.a)} cases<br>`+
        `${filters.compare}: ${fmt(d.b)} cases<br>`+
        `Change: ${(d.change>0?"+":"")+fmt(d.change)} `+
        `(${d.pct===null?"n/a":`${pctValue.toFixed(1)}%`})`
      )).on("mouseleave", hideTip);
  });
}

// Render a line chart showing the number of pedal cyclist hospitalisations by remoteness area for each year, with separate panels for each area and lines and points for each year
function renderRemoteness(el) {
  const raw = DATA.remoteRoad.filter(d => d.roadUser === "Pedal cyclist" && d.area !== "Missing");
  const areas = ["Major Cities", "Regional", "Remote"];
  const years = [...new Set(raw.map(d => +d.year))].sort((a, b) => a-b);
  const f = chartFrame(el, {top:7, right:11, bottom:20, left:10}), {g, iw, ih} = f;
  if (!years.length) {
    g.append("text").attr("x", 10).attr("y", 25).text("No remoteness data available");
    return;
  }
  const gap = 8, panelH = (ih-gap*2)/3;
  const palette = [CHART_COMPARE, "#5DA785", CHART_BASE];
  areas.forEach((area, i) => {
    const values = years.map(year => ({year, value:d3.sum(raw.filter(d => d.area === area && +d.year === year), d => d.value)}));
    const top = i*(panelH+gap);
    const panel = g.append("g").attr("transform", `translate(0,${top})`);
    panel.append("rect").attr("width", iw).attr("height", panelH).attr("fill", i%2?"#F0F7F0":"#FAF8F5").attr("stroke", "#B9CABC").attr("stroke-width", .5);
    const l = Math.min(110, Math.max(76, iw*.28)), r = 11, innerW = Math.max(40, iw-l-r);
    const x = d3.scaleLinear().domain(d3.extent(years)).range([l, l+innerW]);
    const lim = d3.extent(values, d => d.value), pad = Math.max(1, (lim[1]-lim[0])*.25);
    const y = d3.scaleLinear().domain([Math.max(0, lim[0]-pad), lim[1]+pad]).range([panelH-12, 10]);
    panel.append("text").attr("x", 9).attr("y", Math.max(16, panelH*.33)).attr("font-size", 11).attr("font-weight", 800).attr("fill", "#152d20").text(area);
    panel.append("text").attr("x", 9).attr("y", Math.max(30, panelH*.67)).attr("font-size", 10).attr("fill", "#54705d").text(`${fmt(values[values.length-1].value)} in ${years[years.length-1]}`);
    panel.append("path").datum(values).attr("class", "series-line").attr("d", d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX)).attr("fill", "none").attr("stroke", palette[i]).attr("stroke-width", 2.9);
    panel.selectAll("circle").data(values).enter().append("circle").attr("cx", d => x(d.year)).attr("cy", d => y(d.value)).attr("r", 2.7).attr("fill", palette[i]).attr("stroke", "none").on("mousemove", (ev, d) => tip(ev, `<b>${area}</b><br>${d.year}: ${fmt(d.value)} cyclist hospitalisations`)).on("mouseleave", hideTip);
    if (i === 2)panel.append("g").attr("class", "axis").attr("transform", `translate(0,${panelH-1})`).call(d3.axisBottom(x).ticks(Math.min(5, years.length)).tickFormat(d3.format("d"))).select(".domain").remove();
  });
}

// Render a line chart showing the number of pedal cyclist hospitalisations by Indigenous status for each year, with lines and points for each status and a shared y-axis
function renderPopulation(el) {
  const rows = DATA.fnAll.filter(d => d.roadUser === "Pedal cyclist");
  const statuses = ["First Nations people", "Non-Indigenous"];
  const years = [...new Set(rows.map(d => d.year))].sort((a, b) => a-b);
  const series = statuses.map((status, i) => {
    const vals = years.map(year => ({year, value:rows.filter(d => d.status === status && d.year === year).reduce((s, d) => s+d.cases, 0)}));
    const base = vals.find(d => d.year === 2011)?.value || 1;
    return {name:status, values:vals.map(d => ({...d, index:d.value/base*100})), color:i === 0?CHART_COMPARE:CHART_BASE};
  });
  const b = chartFrame(el, {top:22, right:15, bottom:26, left:34}), {g, iw, ih} = b;
  const x = d3.scaleLinear().domain(d3.extent(years)).range([0, iw]), y = d3.scaleLinear().domain([0, d3.max(series.flatMap(s => s.values.map(d => d.index)))*1.12]).nice().range([ih, 0]);
  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickFormat(d => Math.round(d)));
  series.forEach((s, i) => {
    const line = d3.line().x(d => x(d.year)).y(d => y(d.index)).curve(d3.curveMonotoneX);
    g.append("path").datum(s.values).attr("class", "series-line").attr("fill", "none").attr("stroke", s.color).style("stroke", s.color).attr("stroke-width", 3.1).attr("stroke-linecap", "round").attr("d", line);
    s.values.forEach(d => g.append("circle").attr("cx", x(d.year)).attr("cy", y(d.index)).attr("r", 2.5).attr("fill", s.color).on("mousemove", ev => tip(ev, `<b>${s.name}</b><br>${d.year}: ${fmt(d.value)} cyclist cases<br>Index: ${d.index.toFixed(1)} (2011=100)`)).on("mouseleave", hideTip));
    g.append("circle").attr("cx", i*150+5).attr("cy", -12).attr("r", 3).attr("fill", s.color);
    g.append("text").attr("class", "legend-text").attr("x", i*150+12).attr("y", -9).text(s.name);
  });
}

// Render a heatmap showing the average hospital stay for different road user types in a specified year, with color intensity representing the length of stay
function renderBurden(el) {
  const rows = DATA.burdenAll
    .filter(d => +d.year === filters.compare && d.roadUser !== "Other or unknown" && d.cases > 0)
    .sort((a, b) => b.avgStay-a.avgStay).slice(0, 9);

  const f = chartFrame(el, {top:12, right:8, bottom:8, left:8}), {g, iw, ih} = f;
  const labelW = iw*.57;
  const cellX = labelW+8;
  const cellW = iw-cellX-2;
  const y = d3.scaleBand().domain(rows.map(d => d.roadUser)).range([0, ih]).padding(.17);
  const vals = rows.map(d => d.avgStay);
  const min = d3.min(vals) || 0, max = d3.max(vals) || 1;
  const mid = (min+max)/2;
  const fill = d3.scaleLinear()
    .domain(min === max?[min-1, min, max+1]:[min, mid, max])
    .range(["#E6F3EA", "#7FC5A3", "#0F8A64"])
    .clamp(true);

  rows.forEach((d, i) => {
    const yy = y(d.roadUser), hh = y.bandwidth();
    const isCyclist = d.roadUser === "Pedal cyclist";
    const cellColor = fill(d.avgStay);
    const textColor = d.avgStay >= min+(max-min)*.68?"#FFFDF8":"#183326";

    g.append("text")
      .attr("x", 0)
      .attr("y", yy+hh/2+4)
      .attr("font-size", 9.4)
      .attr("font-weight", isCyclist?850:600)
      .attr("fill", isCyclist?"#174F37":"#34443A")
      .text(d.roadUser);

    g.append("rect")
      .attr("x", cellX)
      .attr("y", yy)
      .attr("width", cellW)
      .attr("height", hh)
      .attr("fill", cellColor)
      .attr("stroke", "none")
      .on("mousemove", ev => tip(ev,
        `<b>${d.roadUser}</b><br>${filters.compare}: ${fmt(d.cases)} hospitalisations<br>`+
        `Bed days: ${fmt(d.bedDays)}<br>Average stay: ${d.avgStay.toFixed(2)} days`
      )).on("mouseleave", hideTip);

    g.append("text")
      .attr("x", cellX+cellW/2)
      .attr("y", yy+hh/2+4)
      .attr("text-anchor", "middle")
      .attr("font-size", 10.5)
      .attr("font-weight", 900)
      .attr("fill", textColor)
      .text(`${d.avgStay.toFixed(1)} days`);
  });

  g.append("text")
    .attr("class", "legend-text")
    .attr("x", cellX)
    .attr("y", -3)
    .attr("font-size", 8)
    .attr("font-weight", 800)
    .attr("fill", "#66776B")
    .text("AVERAGE HOSPITAL STAY");
}

const views = {
  overview:{title:"National overview", desc:"Pedal Cyclist is the fixed focus; compare its trend with the selected road user.", count:3},
  classification:{title:"Cyclist classification", desc:"Explore which recorded cyclist counterparty categories changed and how their composition shifted.", count:2},
  roadusers:{title:"Road-user comparison", desc:"Keep Pedal Cyclist as the anchor while comparing its counts and age profile with the selected road user.", count:3},
  patterns:{title:"Time and demographic patterns", desc:"Explore monthly and sex patterns for Pedal Cyclist only.", count:3},
  place:{title:"Time and place", desc:"Track Pedal Cyclist hospitalisations across states, territories and remoteness areas.", count:2},
  population:{title:"Population and healthcare burden", desc:"Keep the focus on cyclist trends and show healthcare burden in the wider road-user context.", count:2}
};

// Update the visibility of filter fields based on the selected view, showing or hiding the road user and year selection fields as appropriate
function updateFilterVisibility(view) {

  const showRoad = view === "overview" || view === "roadusers";
  const showBase = view !== "population";
  document.getElementById("roadFilterField").hidden = !showRoad;
  document.getElementById("baseYearField").hidden = !showBase;
  document.getElementById("compareYearField").hidden = false;
}

// Update the story text and metrics based on the selected view, using pre-defined comparison data to populate the content
function updateStory(view) {
  const b = filters.base, c = filters.compare;
  const cyclistB = totalByYearRoad(b, "Pedal cyclist");
  const cyclistC = totalByYearRoad(c, "Pedal cyclist");
  const change = cyclistC-cyclistB;
  const mark = n => (n > 0?"+":"")+fmt(n);
  const pct = (delta, total) => total?`${delta>0?"+":""}${(delta/total*100).toFixed(1)}%`:"not available";
  const cp = makeComparison(
    DATA.counterparty.filter(d => d.counterparty !== "Not applicable" && d.counterparty !== "Missing"),
    "counterparty", "value", b, c
  );
  const topCP = [...cp].sort((x, y) => Math.abs(y.change)-Math.abs(x.change))[0];
  const jurisdiction = makeComparison(DATA.stateAll, "state", "cases", b, c);
  const ups = jurisdiction.filter(d => d.change > 0).length;
  const topState = [...jurisdiction].filter(d => d.change > 0).sort((x, y) => y.change-x.change)[0];
  const topDecline = [...jurisdiction].filter(d => d.change < 0).sort((x, y) => x.change-y.change)[0];
  const fnb = (DATA.fnAll || []).filter(d => d.year === b && d.status === "First Nations people" && d.roadUser === "Pedal cyclist").reduce((t, d) => t+d.cases, 0);
  const fnc = (DATA.fnAll || []).filter(d => d.year === c && d.status === "First Nations people" && d.roadUser === "Pedal cyclist").reduce((t, d) => t+d.cases, 0);
  const fnChange = fnc-fnb;
  const comps = {
    overview:{
      title:"National overview",
      intro:"Track annual pedal cyclist hospitalisations and compare the selected years.",
      signal:`Pedal cyclist cases: ${fmt(cyclistB)} in ${b} and ${fmt(cyclistC)} in ${c} (${mark(change)}; ${pct(change,cyclistB)}).`,
      reading:`Compare the cyclist trend with ${filters.compareRoad}. The counterparty chart breaks down cyclist cases only.`,
      metric:"Annual hospitalised injury case counts; trend indexed to 2011 = 100.",
      limit:"These are case counts, not population or travel-exposure-adjusted rates. They do not measure individual crash risk."
    },
    roadusers:{
      title:"Road-user comparison",
      intro:"Compare pedal cyclist hospitalisations with the selected road-user group.",
      signal:`Pedal cyclist cases changed by ${mark(change)} (${pct(change,cyclistB)}) from ${b} to ${c}.`,
      reading:`The selected comparator is ${filters.compareRoad}. The age profile covers pedal cyclists only; the mix chart shows each road-user group's share of the selected-year total.`,
      metric:"Hospitalised cases by road-user group, cyclist age group, and within-year road-user share.",
      limit:"Counts are not adjusted for population size or travel exposure, so they should not be interpreted as relative risk."
    },
    patterns:{
      title:"Time and demographic patterns",
      intro:"Examine monthly variation and recorded sex differences in pedal cyclist cases.",
      signal:`National pedal cyclist cases: ${fmt(cyclistB)} in ${b} and ${fmt(cyclistC)} in ${c} (${mark(change)}).`,
      reading:"The seasonal heatmap shows monthly counts across available years. The monthly-change chart calculates compare year minus base year; the sex chart compares recorded male and female cases.",
      metric:"Hospitalised cyclist cases by calendar month and recorded sex.",
      limit:"These are descriptive counts. They do not account for changes in population or cycling exposure, and they cannot establish causes."
    },
    place:{
      title:"Time and place",
      intro:"Assess how pedal cyclist hospitalisations vary across jurisdictions and remoteness areas.",
      signal:topState
      ?`${ups} of ${jurisdiction.length} jurisdictions recorded an increase. The largest increase was in ${topState.name} (${mark(topState.change)} cases).`
      :`No jurisdiction recorded an increase. The largest decline was in ${topDecline?.name||"—"} (${mark(topDecline?.change||0)} cases).`,
      reading:"The jurisdiction comparison uses the selected base and comparison years. Remoteness trends are shown separately and use their own scale.",
      metric:"Pedal cyclist hospitalised case counts by state or territory and remoteness category.",
      limit:"Counts are not population-adjusted. Jurisdiction and remoteness series are separate data groupings and may not reconcile directly with the national total."
    },
    population:{
      title:"Population and hospital burden",
      intro:"Review the recorded First Nations cyclist series alongside the national trend and hospital-stay measures.",
      signal:`First Nations cyclist cases: ${fmt(fnb)} in ${b} and ${fmt(fnc)} in ${c} (${mark(fnChange)}). National cyclist cases changed by ${mark(change)}.`,
      reading:"Indexed trends compare direction of change rather than absolute case volumes. The hospital-stay measure describes time spent in hospital, not the number of cases.",
      metric:"Indexed hospitalised cyclist cases and average hospital stay.",
      limit:"First Nations cases are part of the national series, not an additional group to be added to it. Neither count is adjusted for population size or cycling exposure."
    },
    classification:{
      title:"Cyclist incident classification",
      intro:"Compare the recorded counterparty categories associated with hospitalised pedal cyclist cases.",
      signal:topCP
      ?`The largest absolute change was in ${topCP.name} (${mark(topCP.change)} cases, ${fmt(topCP.a)} to ${fmt(topCP.b)}).`
      :"No comparable counterparty categories are available for these years.",
      reading:"Categories describe the recorded counterparty in the dataset. They are not a direct measure of crash cause, responsibility, or severity.",
      metric:"Hospitalised pedal cyclist cases by published counterparty classification.",
      limit:"Some records may be missing or classified as not applicable. Interpret category changes within the limits of the published coding."
    }
  };
  const v = comps[view] || comps.overview;
  const idx = ["overview", "roadusers", "classification", "patterns", "place", "population"].indexOf(view)+1;
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el)el.textContent = value
  };
  set("storyIndex", String(idx).padStart(2, "0")+" / 06");
  set("storyTitle", v.title);
  set("storyIntro", v.intro);
  set("storySignal", v.signal);
  set("storyReading", v.reading);
  set("storyMetric", v.metric);
  set("storyLimit", v.limit);
}

// Render the selected view, updating the filter visibility, story text, and chart grid with the appropriate visualizations for that view
function render(view = activeView) {
  activeView = view;
  updateFilterVisibility(view);
  updateStory(view);
  const grid = document.getElementById("chartGrid");
  grid.innerHTML = "";
  grid.className = "chart-grid"+(views[view].count === 2?" two":"");
  document.getElementById("sectionTitle").textContent = views[view].title;
  document.getElementById("sectionDesc").textContent = views[view].desc;
  if (view === "overview") {
    let el = card(grid, 8, "Pedal Cyclist vs selected road user", `Annual trend · selected years highlighted: ${filters.base} and ${filters.compare}`, "Indexed line", "Source: National raw · Traffic · year × road user");
    renderTrend(el);
    el = card(grid, 4, "Pedal Cyclist vs comparator", `${filters.base} compared with ${filters.compare}`, "Diverging bars", "Source: National raw · Traffic · road user × hospitalisations");
    renderDiverging(el, makeComparison(DATA.annualRoad.filter(d => d.roadUser === "Pedal cyclist" || d.roadUser === filters.compareRoad), "roadUser", "value", filters.base, filters.compare), "name", "change");
    el = card(grid, 12, "Cyclist counterparty contribution", "Which counterparty categories changed most for pedal cyclists?", "Ranked diverging bars", "Source: National raw · Pedal cyclist · counterparty × hospitalisations");
    renderCounterparty(el);
  } else if (view === "roadusers") {
    let el = card(grid, 7, "Pedal Cyclist vs selected road user", `${filters.base} and ${filters.compare}`, "Grouped horizontal bars", "Source: National raw · Traffic · road user × year × hospitalisations");
    renderGroupedRoad(el);
    el = card(grid, 5, "Pedal Cyclist age profile", `Age-group hospitalisations · ${filters.base} vs ${filters.compare}`, "Age profile ribbon chart", "Source: National raw · Traffic · age group × year");
    renderAge(el);
    el = card(grid, 12, "National road-user mix", "Pedal Cyclist shown within the wider national distribution.", "100% stacked bars", "Source: National raw · Traffic · road user share within each selected year");
    renderComposition(el);
  } else if (view === "classification") {
    let el = card(grid, 6, "Cyclist classification cases", `${filters.base} left · ${filters.compare} right · published categories`, "Butterfly bars", "Source: National raw · Pedal cyclist counterparty classification");
    renderClassCounts(el);
    el = card(grid, 6, "Classification share change", `${filters.compare} minus ${filters.base} · percentage-point change`, "Diverging bars", "Source: National raw · Pedal cyclist counterparty classification · share of included categories");
    renderClassShare(el);
  } else if (view === "patterns") {
    let el = card(grid, 8, "Seasonal pattern", `All years shown · ${filters.base} base and ${filters.compare} comparison highlighted`, "Monthly heatmap", "Source: National raw · Traffic · calendar year × month · all available years");
    renderSeason(el);
    el = card(grid, 4, "Pedal Cyclist by sex", `${filters.base} compared with ${filters.compare}`, "Slope chart", "Source: National raw · Traffic · sex × year");
    renderSex(el);
    el = card(grid, 12, "Pedal Cyclist monthly change", `Monthly difference: ${filters.compare} minus ${filters.base}`, "Diverging line", "Source: National raw · Traffic · month × hospitalisations");
    renderMonthChange(el);
  } else if (view === "place") {
    let el = card(grid, 7, "Cyclist state & territory changes", `${filters.base} compared with ${filters.compare}`, "State comparison tiles", "Source: State raw · Pedal cyclist · six-monthly case counts summed to calendar year");
    renderState(el);
    el = card(grid, 5, "Pedal Cyclist by remoteness", "Independent trends for Major Cities, Regional and Remote (different scales)", "Multi-line trend", "Source: National raw · Traffic · remoteness × year");
    renderRemoteness(el);
  } else if (view === "population") {
    let el = card(grid, 6, "Pedal cyclist trend by population group", "Indexed within each group · 2011 = 100", "Indexed line", "Source: First Nations raw · First Nations status × year · six-monthly values summed");
    renderPopulation(el);
    el = card(grid, 6, "Average hospital stay by road user", `Days per hospitalisation · ${filters.compare} · Pedal Cyclist highlighted`, "Ranked heatmap table", "Source: National raw · Traffic · selected comparison year");
    renderBurden(el);
  }
  improveChartLabels();
  emphasizeSeasonSelectedYears();
}

// Improve chart labels for better readability, adjusting font sizes and wrapping text as necessary based on the chart's width and axis orientation
function improveChartLabels() {
  const all = document.querySelectorAll('#chartGrid .chart-body svg');
  all.forEach(svg => {
    const card = svg.closest('.chart-card');
    const cardTitle = (card?.querySelector('.chart-card-title')?.textContent || '').trim().toLowerCase();
    if (cardTitle === 'pedal cyclist by remoteness')return;
    const frame = svg.viewBox.baseVal;
    const width = frame && frame.width?frame.width:svg.clientWidth;
    const narrow = width < 370;

    svg.querySelectorAll('.axis').forEach(axis => {
      const transform = axis.getAttribute('transform') || '';
      const isBottom = /translate\(\s*0\s*,/.test(transform);
      const texts = [...axis.querySelectorAll('.tick text')];
      if (!texts.length)return;

      if (isBottom) {
        texts.forEach(t => {
          const full = t.getAttribute('data-full-label') || t.textContent || '';
          if (!t.getAttribute('data-full-label'))t.setAttribute('data-full-label', full);
          t.style.fontSize = narrow?'9.5px':'10.5px';
        });
        const boxes = () => texts.filter(t => t.style.display !== 'none').map(t => ({t, b:t.getBBox()})).sort((a, b) => a.b.x-b.b.x);
        for (let attempts = 0; attempts < 4; attempts++) {
          const bs = boxes();
          let crowded = false;
          for (let i = 1; i < bs.length; i++)if (bs[i].b.x < bs[i-1].b.x+bs[i-1].b.width+5) {
            crowded = true;
            break;
          }
          if (!crowded)break;
          const alive = texts.filter(t => t.style.display !== 'none');
          if (alive.length <= 2)break;
          alive.forEach((t, i) => {
            if (i > 0 && i < alive.length-1 && i%2 === 1)t.style.display = 'none';
          });
        }
        return;
      }

      const labels = texts.map(t => (t.getAttribute('data-full-label') || t.textContent || '').trim());
      const numericAxis = labels.every(v => /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:\s?(?:%|d|k|m))?$/i.test(v));
      if (numericAxis) {

        texts.forEach(t => {
          const full = (t.getAttribute('data-full-label') || t.textContent || '').trim();
          if (!t.getAttribute('data-full-label'))t.setAttribute('data-full-label', full);
          t.style.fontSize = narrow?'9.5px':'10.5px';
          t.setAttribute('text-anchor', 'end');
          t.setAttribute('x', '-7');
          t.textContent = full;
        });
        return;
      }

      const parent = axis.parentElement;
      const parentTransform = parent?.getAttribute('transform') || '';
      const leftOffset = Number((parentTransform.match(/translate\(\s*([\d.]+)/) || [])[1] || 0);
      const xStart = -leftOffset;
      const fontSize = narrow?8.6:9.2;
      const labelWidth = Math.max(34, leftOffset-12);
      texts.forEach(t => {
        const full = (t.getAttribute('data-full-label') || t.textContent || '').trim();
        if (!t.getAttribute('data-full-label'))t.setAttribute('data-full-label', full);
        t.style.fontSize = fontSize+'px';
        t.setAttribute('text-anchor', 'start');
        t.setAttribute('x', String(xStart));
        const lines = wrapLabelPixels(full, labelWidth, fontSize, 2);
        t.textContent = '';
        lines.forEach((line, i) => {
          const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          span.textContent = line;
          span.setAttribute('x', String(xStart));
          span.setAttribute('dy', i === 0?(lines.length > 1?'-0.48em':'0em'):'0.96em');
          t.appendChild(span);
        });
        let title = t.querySelector('title');
        if (!title) {
          title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          t.appendChild(title);
        }
        title.textContent = full;
      });
    });
  });
}

// Emphasize the selected base and comparison years in the seasonal pattern chart by adjusting font weight, size, and color for the corresponding axis labels
function emphasizeSeasonSelectedYears() {
  const cards = [...document.querySelectorAll('#chartGrid .chart-card')];
  const seasonal = cards.find(card =>
    (card.querySelector('.chart-card-title')?.textContent || '').trim().toLowerCase() === 'seasonal pattern'
  );
  if (!seasonal)return;
  const svg = seasonal.querySelector('.chart-body svg');
  if (!svg)return;
  svg.querySelectorAll('.axis').forEach(axis => {
    const transform = axis.getAttribute('transform') || '';

    if (/translate\(\s*0\s*,/.test(transform))return;
    axis.querySelectorAll('.tick text').forEach(label => {
      const year = Number((label.textContent || '').trim());
      const selected = year === Number(filters.base) || year === Number(filters.compare);
      label.style.fontWeight = selected?'900':'500';
      label.style.fontSize = selected?'10.5px':'9.5px';
      label.style.fill = selected?'#141414':'#53645A';
    });
  });
}

// Set up the filter controls for road user and year selection, populating the dropdowns with available options and attaching event listeners for applying or resetting filters
function setupControls() {
  const roadSel = document.getElementById("roadFilter");
  const roads = [...new Set(DATA.annualRoad.map(d => d.roadUser))].filter(r => r !== "Pedal cyclist").sort();
  roadSel.innerHTML = roads.map(r => `<option value="${r}" ${r==="Motorcyclist"?"selected":""}>${r}</option>`).join("");
  const yearOpts = [...Array(11)].map((_, i) => 2011+i);
  document.getElementById("baseYear").innerHTML = yearOpts.map(y => `<option value="${y}" ${y===2019?"selected":""}>${y}</option>`).join("");
  document.getElementById("compareYear").innerHTML = yearOpts.map(y => `<option value="${y}" ${y===2020?"selected":""}>${y}</option>`).join("");
  document.getElementById("apply").addEventListener("click", () => {
    filters.compareRoad = roadSel.value;
    filters.base = +document.getElementById("baseYear").value;
    filters.compare = +document.getElementById("compareYear").value;
    renderKpis();
    render(activeView);
  });
  document.getElementById("reset").addEventListener("click", () => {
    roadSel.value = "Motorcyclist";
    document.getElementById("baseYear").value = "2019";
    document.getElementById("compareYear").value = "2020";
    filters = {compareRoad:"Motorcyclist", base:2019, compare:2020};
    renderKpis();
    render(activeView);
  });
}
document.querySelectorAll(".tab-bar button").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab-bar button").forEach(b => b.classList.toggle("active", b === btn));
  render(btn.dataset.view);
}));

// Render the key performance indicators (KPIs) for pedal cyclist hospitalisations, updating the displayed values based on the selected base and comparison years
function renderKpis() {
  const base = filters.base, compare = filters.compare;
  const baseCases = totalByYearRoad(base, "Pedal cyclist");
  const compareCases = totalByYearRoad(compare, "Pedal cyclist");
  const change = compareCases-baseCases;
  const changePct = baseCases?change/baseCases:0;
  document.getElementById("kpiBaseLabel").textContent = `Pedal Cyclist · ${base}`;
  document.getElementById("kpiCompareLabel").textContent = `Pedal Cyclist · ${compare}`;
  document.getElementById("kpi19").textContent = fmt(baseCases);
  document.getElementById("kpi20").textContent = fmt(compareCases);
  document.getElementById("kpiPct").textContent = (change > 0?"+":"")+fmt(change);
  document.getElementById("kpiChangeNote").textContent = `${compare} minus ${base}`;
  document.getElementById("kpiCyclist").textContent = (changePct > 0?"+":"")+(changePct*100).toFixed(1)+"%";
  document.getElementById("kpiPctNote").textContent = `${base} to ${compare} · Pedal Cyclist`;
}

loadData().then(() => {
  setupControls();
  renderKpis();
  render();
}).catch(err => {
  console.error("Error loading dashboard data files:", err);
  if (window.location.protocol === "file:") {
    console.warn("Local file access via file:// may be restricted by browser security policies. Consider using a local web server (e.g. npx serve or Live Server).");
  }
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => render(activeView), 120);
});
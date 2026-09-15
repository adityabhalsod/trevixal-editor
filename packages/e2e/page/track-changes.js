"use strict";
(() => {
  // ../core/dist/index.js
  var emptyAttrs = Object.freeze({});
  function attrsEq(a, b) {
    if (a === b) return true;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => a[key] === b[key]);
  }
  function computeAttrs(specAttrs, given, owner) {
    if (!specAttrs) return emptyAttrs;
    const result = {};
    for (const [name, spec] of Object.entries(specAttrs)) {
      if (given && name in given) {
        result[name] = given[name];
      } else if ("default" in spec) {
        result[name] = spec.default;
      } else {
        throw new RangeError(`Missing required attribute "${name}" on ${owner}`);
      }
    }
    return Object.freeze(result);
  }
  var Mark = class {
    constructor(type, attrs) {
      this.type = type;
      this.attrs = attrs;
    }
    type;
    attrs;
    eq(other) {
      return this === other || this.type === other.type && attrsEq(this.attrs, other.attrs);
    }
    isInSet(set) {
      return set.some((mark) => mark.eq(this));
    }
    /**
     * Add this mark to a set, honoring mark-exclusion rules and keeping the set
     * ordered by schema rank. Returns the same array when nothing changes.
     */
    addToSet(set) {
      if (this.isInSet(set)) return set;
      const kept = set.filter(
        (mark) => !mark.type.excludes(this.type) && !this.type.excludes(mark.type)
      );
      const result = [...kept, this].sort((a, b) => a.type.rank - b.type.rank);
      return result;
    }
    removeFromSet(set) {
      const result = set.filter((mark) => !mark.eq(this));
      return result.length === set.length ? set : result;
    }
    toJSON() {
      return Object.keys(this.attrs).length > 0 ? { type: this.type.name, attrs: { ...this.attrs } } : { type: this.type.name };
    }
  };
  var noMarks = Object.freeze([]);
  function marksEq(a, b) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return a.every((mark, i) => mark.eq(b[i]));
  }
  var Fragment = class _Fragment {
    constructor(children) {
      this.children = children;
    }
    children;
    static empty = new _Fragment(Object.freeze([]));
    static from(nodes) {
      return nodes.length === 0 ? _Fragment.empty : new _Fragment(Object.freeze([...nodes]));
    }
    static of(...nodes) {
      return _Fragment.from(nodes);
    }
    get childCount() {
      return this.children.length;
    }
    child(index) {
      const node = this.children[index];
      if (!node) throw new RangeError(`Fragment child index ${index} out of range`);
      return node;
    }
    maybeChild(index) {
      return this.children[index] ?? null;
    }
    replaceChild(index, node) {
      const next = [...this.children];
      next[index] = node;
      return _Fragment.from(next);
    }
    /** Replace children in [from, to) with the given fragment's children. */
    replaceRange(from, to, insert) {
      return _Fragment.from([
        ...this.children.slice(0, from),
        ...insert.children,
        ...this.children.slice(to)
      ]);
    }
    slice(from, to = this.childCount) {
      return _Fragment.from(this.children.slice(from, to));
    }
    append(other) {
      if (other.childCount === 0) return this;
      if (this.childCount === 0) return other;
      return _Fragment.from([...this.children, ...other.children]);
    }
    eq(other) {
      if (this === other) return true;
      if (this.childCount !== other.childCount) return false;
      return this.children.every((child, i) => child.eq(other.children[i]));
    }
    toJSON() {
      return this.children.map((child) => child.toJSON());
    }
  };
  var EditorNode = class _EditorNode {
    constructor(type, attrs = emptyAttrs, content = Fragment.empty, marks = noMarks) {
      this.type = type;
      this.attrs = attrs;
      this.content = content;
      this.marks = marks;
    }
    type;
    attrs;
    content;
    marks;
    get isText() {
      return false;
    }
    get isInline() {
      return this.type.isInline;
    }
    get isBlock() {
      return !this.type.isInline;
    }
    /** True when this node has no editable content of its own (image, hr, …). */
    get isAtom() {
      return this.type.isAtom;
    }
    /** True when this node directly contains inline content (paragraph, heading, …). */
    get isTextblock() {
      return this.type.inlineContent;
    }
    get childCount() {
      return this.content.childCount;
    }
    child(index) {
      return this.content.child(index);
    }
    get textContent() {
      let text = "";
      for (const child of this.content.children) {
        text += child.isText ? child.text : child.textContent;
      }
      return text;
    }
    withContent(content) {
      return new _EditorNode(this.type, this.attrs, content, this.marks);
    }
    withAttrs(attrs) {
      return new _EditorNode(this.type, attrs, this.content, this.marks);
    }
    withMarks(marks) {
      return new _EditorNode(this.type, this.attrs, this.content, marks);
    }
    eq(other) {
      if (this === other) return true;
      return this.type === other.type && attrsEq(this.attrs, other.attrs) && marksEq(this.marks, other.marks) && this.content.eq(other.content);
    }
    toJSON() {
      const json = { type: this.type.name };
      const attrs = nonDefaultAttrs(this.type.spec.attrs, this.attrs);
      if (attrs) json.attrs = attrs;
      if (this.content.childCount > 0) json.content = this.content.children.map((c) => c.toJSON());
      if (this.marks.length > 0) json.marks = this.marks.map((m) => m.toJSON());
      return json;
    }
  };
  var TextNode = class _TextNode extends EditorNode {
    constructor(type, text, marks = noMarks) {
      if (text.length === 0) throw new RangeError("TextNode may not be empty");
      super(type, emptyAttrs, Fragment.empty, marks);
      this.text = text;
    }
    text;
    get isText() {
      return true;
    }
    get textContent() {
      return this.text;
    }
    withText(text) {
      return new _TextNode(this.type, text, this.marks);
    }
    withMarks(marks) {
      return new _TextNode(this.type, this.text, marks);
    }
    cut(from, to = this.text.length) {
      return this.withText(this.text.slice(from, to));
    }
    eq(other) {
      if (this === other) return true;
      return other.isText && other.text === this.text && marksEq(this.marks, other.marks);
    }
    toJSON() {
      const json = {
        type: this.type.name,
        text: this.text
      };
      if (this.marks.length > 0) json.marks = this.marks.map((m) => m.toJSON());
      return json;
    }
  };
  function nonDefaultAttrs(specAttrs, attrs) {
    const out = {};
    for (const [name, value] of Object.entries(attrs)) {
      const spec = specAttrs?.[name];
      if (spec && "default" in spec && spec.default === value) continue;
      out[name] = value;
    }
    return Object.keys(out).length > 0 ? out : void 0;
  }
  var TERM_PATTERN = /^([a-zA-Z_][\w]*)([+*?])?$/;
  function parseContentExpr(expr, resolveName) {
    const trimmed = expr.trim();
    if (trimmed === "") return [];
    return trimmed.split(/\s+/).map((token) => {
      const match = TERM_PATTERN.exec(token);
      if (!match) throw new SyntaxError(`Invalid content expression term "${token}" in "${expr}"`);
      const [, name, quantifier] = match;
      const names = resolveName(name);
      if (names.length === 0) {
        throw new RangeError(`Unknown node or group "${name}" in content expression "${expr}"`);
      }
      switch (quantifier) {
        case "+":
          return { names: new Set(names), min: 1, max: Number.POSITIVE_INFINITY };
        case "*":
          return { names: new Set(names), min: 0, max: Number.POSITIVE_INFINITY };
        case "?":
          return { names: new Set(names), min: 0, max: 1 };
        default:
          return { names: new Set(names), min: 1, max: 1 };
      }
    });
  }
  function matchesContent(terms, childNames) {
    let i = 0;
    for (const term of terms) {
      let count2 = 0;
      while (i < childNames.length && count2 < term.max && term.names.has(childNames[i])) {
        i++;
        count2++;
      }
      if (count2 < term.min) return false;
    }
    return i === childNames.length;
  }
  var NodeType = class {
    constructor(name, schema2, spec) {
      this.name = name;
      this.schema = schema2;
      this.spec = spec;
    }
    name;
    schema;
    spec;
    contentTerms = [];
    allowedMarks = "none";
    /** Whether this node's content expression admits inline children. */
    inlineContent = false;
    get isText() {
      return this.name === "text";
    }
    get isInline() {
      return this.isText || this.spec.inline === true;
    }
    get isAtom() {
      return this.spec.atom === true;
    }
    get groups() {
      return this.spec.group ? this.spec.group.split(/\s+/) : [];
    }
    /** @internal Resolve content expression and mark rules; called once by Schema. */
    resolve(resolveName) {
      this.contentTerms = this.spec.content ? parseContentExpr(this.spec.content, resolveName) : [];
      const childNames = /* @__PURE__ */ new Set();
      for (const term of this.contentTerms) {
        for (const name of term.names) childNames.add(name);
      }
      const childTypes = [...childNames].map((name) => this.schema.nodeType(name));
      const hasInline = childTypes.some((type) => type.isInline);
      const hasBlock = childTypes.some((type) => !type.isInline);
      if (hasInline && hasBlock) {
        throw new RangeError(`Node "${this.name}" mixes inline and block content`);
      }
      this.inlineContent = hasInline;
      const marks = this.spec.marks;
      if (marks === void 0) {
        this.allowedMarks = this.inlineContent ? "all" : "none";
      } else if (marks === "_") {
        this.allowedMarks = "all";
      } else if (marks.trim() === "") {
        this.allowedMarks = "none";
      } else {
        this.allowedMarks = new Set(marks.trim().split(/\s+/));
      }
    }
    validContent(content) {
      return matchesContent(
        this.contentTerms,
        content.children.map((child) => child.type.name)
      );
    }
    allowsMarkType(markType) {
      if (this.allowedMarks === "all") return true;
      if (this.allowedMarks === "none") return false;
      return this.allowedMarks.has(markType.name);
    }
    /** True when this type can hold an empty fragment as content. */
    get allowsEmptyContent() {
      return matchesContent(this.contentTerms, []);
    }
    create(attrs, content = Fragment.empty, marks = noMarks) {
      if (this.isText) throw new RangeError("Use schema.text() to create text nodes");
      return new EditorNode(
        this,
        computeAttrs(this.spec.attrs, attrs, `node "${this.name}"`),
        content,
        marks
      );
    }
    /** Like {@link create} but validates the content against this type's expression. */
    createChecked(attrs, content = Fragment.empty, marks = noMarks) {
      if (!this.validContent(content)) {
        throw new RangeError(`Invalid content for node type "${this.name}"`);
      }
      return this.create(attrs, content, marks);
    }
  };
  var MarkType = class {
    constructor(name, rank, spec) {
      this.name = name;
      this.rank = rank;
      this.spec = spec;
      const excludes = spec.excludes;
      if (excludes === "_") {
        this.excluded = "all";
      } else {
        const names = excludes ? excludes.trim().split(/\s+/).filter(Boolean) : [];
        this.excluded = new Set(names);
      }
    }
    name;
    rank;
    spec;
    excluded;
    /** Whether adding this mark should displace marks of `other`'s type. */
    excludes(other) {
      if (other === this) return true;
      if (this.excluded === "all") return true;
      return this.excluded.has(other.name);
    }
    create(attrs) {
      return new Mark(this, computeAttrs(this.spec.attrs, attrs, `mark "${this.name}"`));
    }
  };
  var Schema = class {
    constructor(spec) {
      this.spec = spec;
      const nodes = {};
      for (const [name, nodeSpec] of Object.entries(spec.nodes)) {
        nodes[name] = new NodeType(name, this, nodeSpec);
      }
      const marks = {};
      let rank = 0;
      for (const [name, markSpec] of Object.entries(spec.marks ?? {})) {
        marks[name] = new MarkType(name, rank++, markSpec);
      }
      this.nodes = nodes;
      this.marks = marks;
      const topName = spec.topNode ?? "doc";
      const top = nodes[topName];
      if (!top) throw new RangeError(`Schema is missing its top node type "${topName}"`);
      const text = nodes.text;
      if (!text) throw new RangeError('Schema is missing the required "text" node type');
      this.topType = top;
      this.textType = text;
      const groups = /* @__PURE__ */ new Map();
      for (const type of Object.values(nodes)) {
        for (const group of type.groups) {
          const members = groups.get(group) ?? [];
          members.push(type.name);
          groups.set(group, members);
        }
      }
      const resolveName = (name) => {
        if (nodes[name]) return [name];
        return groups.get(name) ?? [];
      };
      for (const type of Object.values(nodes)) type.resolve(resolveName);
    }
    spec;
    nodes;
    marks;
    topType;
    textType;
    nodeType(name) {
      const type = this.nodes[name];
      if (!type) throw new RangeError(`Unknown node type "${name}"`);
      return type;
    }
    markType(name) {
      const type = this.marks[name];
      if (!type) throw new RangeError(`Unknown mark type "${name}"`);
      return type;
    }
    node(name, attrs, content, marks) {
      const fragment = content instanceof Fragment ? content : Fragment.from(content ?? []);
      return this.nodeType(name).create(attrs, fragment, marks);
    }
    text(text, marks = noMarks) {
      return new TextNode(this.textType, text, marks);
    }
    mark(name, attrs) {
      return this.markType(name).create(attrs);
    }
    /** First non-text node type with inline content, used as the default block. */
    firstTextblockType() {
      for (const type of Object.values(this.nodes)) {
        if (!type.isText && type.inlineContent && !type.isInline) return type;
      }
      throw new RangeError("Schema has no textblock node type");
    }
  };
  function inlineSize(node) {
    return node.isText ? node.text.length : 1;
  }
  function inlineLength(frag) {
    return frag.children.reduce((sum, child) => sum + inlineSize(child), 0);
  }
  function lastGraphemeLength(text) {
    if (text.length === 0) return 0;
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      let last = "";
      for (const { segment } of new Intl.Segmenter().segment(text)) last = segment;
      return last.length;
    }
    const codePoint = text.codePointAt(text.length - 2);
    return codePoint !== void 0 && codePoint > 65535 ? 2 : 1;
  }
  function firstGraphemeLength(text) {
    if (text.length === 0) return 0;
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      for (const { segment } of new Intl.Segmenter().segment(text)) return segment.length;
    }
    const codePoint = text.codePointAt(0);
    return codePoint !== void 0 && codePoint > 65535 ? 2 : 1;
  }
  function previousInlineBoundary(frag, offset) {
    if (offset <= 0) return -1;
    let pos2 = 0;
    for (const child of frag.children) {
      const size = inlineSize(child);
      const end = pos2 + size;
      if (offset > pos2 && offset <= end) {
        if (!child.isText) return pos2;
        const local = offset - pos2;
        return offset - lastGraphemeLength(child.text.slice(0, local));
      }
      pos2 = end;
    }
    return -1;
  }
  function nextInlineBoundary(frag, offset) {
    if (offset >= inlineLength(frag)) return -1;
    let pos2 = 0;
    for (const child of frag.children) {
      const size = inlineSize(child);
      const end = pos2 + size;
      if (offset >= pos2 && offset < end) {
        if (!child.isText) return end;
        const local = offset - pos2;
        return offset + firstGraphemeLength(child.text.slice(local));
      }
      pos2 = end;
    }
    return -1;
  }
  function sliceInline(frag, from, to) {
    if (from >= to) return Fragment.empty;
    const out = [];
    let pos2 = 0;
    for (const child of frag.children) {
      const size = inlineSize(child);
      const start = pos2;
      const end = pos2 + size;
      pos2 = end;
      if (end <= from) continue;
      if (start >= to) break;
      if (child.isText) {
        const cutFrom = Math.max(from - start, 0);
        const cutTo = Math.min(to - start, size);
        out.push(cutFrom === 0 && cutTo === size ? child : child.cut(cutFrom, cutTo));
      } else if (start >= from && end <= to) {
        out.push(child);
      }
    }
    return Fragment.from(out);
  }
  function mergeInline(frag) {
    const out = [];
    for (const child of frag.children) {
      const last = out[out.length - 1];
      if (last?.isText && child.isText && marksEq(last.marks, child.marks)) {
        const lastText = last;
        out[out.length - 1] = lastText.withText(lastText.text + child.text);
      } else {
        out.push(child);
      }
    }
    return out.length === frag.childCount ? frag : Fragment.from(out);
  }
  function coerceInlineFor(type, nodes) {
    const out = [];
    for (const node of nodes) {
      if (node.isText) {
        const kept = node.marks.filter((mark) => type.allowsMarkType(mark.type));
        out.push(kept.length === node.marks.length ? node : node.withMarks(kept));
        continue;
      }
      if (type.validContent(Fragment.of(node))) {
        out.push(node);
        continue;
      }
      const text = node.type.name === "hardBreak" ? "\n" : node.textContent;
      if (text.length > 0) out.push(node.type.schema.text(text));
    }
    return mergeInline(Fragment.from(out)).children;
  }
  function inlineOffsetFromText(frag, textOffset) {
    let chars = 0;
    let inline = 0;
    for (const child of frag.children) {
      const childChars = child.textContent.length;
      if (chars + childChars >= textOffset) {
        if (child.isText) return inline + (textOffset - chars);
        return textOffset <= chars ? inline : inline + 1;
      }
      chars += childChars;
      inline += inlineSize(child);
    }
    return inline;
  }
  function replaceInline(frag, from, to, insert) {
    const before = sliceInline(frag, 0, from);
    const after = sliceInline(frag, to, inlineLength(frag));
    return mergeInline(before.append(insert).append(after));
  }
  function applyInlineMark(frag, from, to, mark, add) {
    const out = [];
    let pos2 = 0;
    for (const child of frag.children) {
      const size = inlineSize(child);
      const start = pos2;
      const end = pos2 + size;
      pos2 = end;
      if (end <= from || start >= to) {
        out.push(child);
        continue;
      }
      const apply = (node) => node.withMarks(add ? mark.addToSet(node.marks) : mark.removeFromSet(node.marks));
      if (!child.isText) {
        out.push(start >= from && end <= to ? apply(child) : child);
        continue;
      }
      const text = child;
      const cutFrom = Math.max(from - start, 0);
      const cutTo = Math.min(to - start, size);
      if (cutFrom > 0) out.push(text.cut(0, cutFrom));
      out.push(apply(text.cut(cutFrom, cutTo)));
      if (cutTo < size) out.push(text.cut(cutTo, size));
    }
    return mergeInline(Fragment.from(out));
  }
  function rangeHasMark(frag, from, to, markType) {
    let sawContent = false;
    let pos2 = 0;
    for (const child of frag.children) {
      const size = inlineSize(child);
      const start = pos2;
      const end = pos2 + size;
      pos2 = end;
      if (end <= from || start >= to) continue;
      if (!child.isText) continue;
      sawContent = true;
      if (!child.marks.some((mark) => mark.type === markType)) return false;
    }
    return sawContent;
  }
  function rangesWithMark(frag, from, to, markType) {
    const ranges = [];
    let pos2 = 0;
    for (const child of frag.children) {
      const size = inlineSize(child);
      const start = pos2;
      const end = pos2 + size;
      pos2 = end;
      if (end <= from || start >= to) continue;
      const mark = child.marks.find((candidate) => candidate.type === markType);
      if (!mark) continue;
      const overlapFrom = Math.max(start, from);
      const overlapTo = Math.min(end, to);
      const last = ranges[ranges.length - 1];
      if (last && last.to === overlapFrom && last.mark.eq(mark)) {
        last.to = overlapTo;
      } else {
        ranges.push({ from: overlapFrom, to: overlapTo, mark });
      }
    }
    return ranges;
  }
  function marksAtInlineOffset(frag, offset) {
    let pos2 = 0;
    for (const child of frag.children) {
      const size = inlineSize(child);
      const end = pos2 + size;
      if (offset > pos2 && offset <= end) return child.isText ? child.marks : [];
      pos2 = end;
    }
    const first = frag.maybeChild(0);
    return first?.isText ? first.marks : [];
  }
  function pathsEqual(a, b) {
    return a.length === b.length && a.every((index, i) => index === b[i]);
  }
  function pathStartsWith(path, prefix) {
    return prefix.length <= path.length && prefix.every((index, i) => index === path[i]);
  }
  function nodeAtPath(doc, path) {
    let node = doc;
    for (const index of path) {
      const child = node.content.maybeChild(index);
      if (!child) return null;
      node = child;
    }
    return node;
  }
  function updateAtPath(doc, path, fn) {
    if (path.length === 0) return fn(doc);
    const [index, ...rest] = path;
    const child = doc.content.maybeChild(index);
    if (!child) throw new RangeError(`No node at path index ${index}`);
    return doc.withContent(doc.content.replaceChild(index, updateAtPath(child, rest, fn)));
  }
  function pos(path, offset) {
    return { path, offset };
  }
  function comparePositions(a, b) {
    const aTrail = [...a.path, a.offset];
    const bTrail = [...b.path, b.offset];
    const length = Math.min(aTrail.length, bTrail.length);
    for (let i = 0; i < length; i++) {
      const av = aTrail[i];
      const bv = bTrail[i];
      if (av !== bv) return av < bv ? -1 : 1;
    }
    if (aTrail.length === bTrail.length) return 0;
    return aTrail.length < bTrail.length ? -1 : 1;
  }
  function positionsEqual(a, b) {
    return a.offset === b.offset && a.path.length === b.path.length && comparePositions(a, b) === 0;
  }
  function minPosition(a, b) {
    return comparePositions(a, b) <= 0 ? a : b;
  }
  function maxPosition(a, b) {
    return comparePositions(a, b) >= 0 ? a : b;
  }
  function clampPosition(doc, position) {
    const path = [];
    let node = doc;
    for (const rawIndex of position.path) {
      if (node.childCount === 0) break;
      const index = Math.max(0, Math.min(rawIndex, node.childCount - 1));
      path.push(index);
      node = node.child(index);
    }
    const maxOffset = node.isTextblock ? inlineLength(node.content) : node.childCount;
    const offset = Math.max(0, Math.min(position.offset, maxOffset));
    return { path, offset };
  }
  function textblocks(doc) {
    const found = [];
    const walk = (node, path) => {
      if (node.isTextblock) {
        found.push({ path, node });
        return;
      }
      node.content.children.forEach((child, index) => {
        walk(child, [...path, index]);
      });
    };
    walk(doc, []);
    return found;
  }
  function firstTextblockPath(doc) {
    return textblocks(doc)[0]?.path ?? null;
  }
  function blocksInRange(doc, from, to) {
    const ranges = [];
    for (const { path, node } of textblocks(doc)) {
      const length = inlineLength(node.content);
      if (comparePositions(pos(path, length), from) < 0) continue;
      if (comparePositions(pos(path, 0), to) > 0) break;
      ranges.push({
        path,
        node,
        from: pathsEqual(path, from.path) ? from.offset : 0,
        to: pathsEqual(path, to.path) ? to.offset : length
      });
    }
    return ranges;
  }
  function markFromJSON(schema2, json) {
    return schema2.markType(json.type).create(json.attrs);
  }
  function nodeFromJSON(schema2, json) {
    const marks = (json.marks ?? []).map((mark) => markFromJSON(schema2, mark));
    if (json.type === "text") {
      if (typeof json.text !== "string") {
        throw new RangeError('Text node JSON is missing its "text" property');
      }
      return schema2.text(json.text, marks);
    }
    const content = Fragment.from((json.content ?? []).map((child) => nodeFromJSON(schema2, child)));
    return schema2.nodeType(json.type).create(json.attrs, content, marks);
  }
  function normalizeDoc(doc) {
    const schema2 = doc.type.schema;
    let normalized = normalizeNode(doc);
    if (normalized.childCount === 0 && !normalized.type.allowsEmptyContent) {
      normalized = normalized.withContent(Fragment.of(schema2.firstTextblockType().create()));
    }
    return normalized;
  }
  function normalizeNode(node) {
    if (node.isText) return node;
    if (!node.type.spec.content) {
      return node.childCount === 0 ? node : node.withContent(Fragment.empty);
    }
    let children = node.content.children.map(
      (child) => stripDisallowedMarks(normalizeNode(child), node)
    );
    if (node.isTextblock) {
      children = children.flatMap(
        (child) => child.isInline ? [child] : child.content.children.filter((inner) => inner.isInline)
      );
      return node.withContent(mergeInline(Fragment.from(children)));
    }
    const schema2 = node.type.schema;
    const wrapped = [];
    let inlineRun = [];
    const flushRun = () => {
      if (inlineRun.length > 0) {
        wrapped.push(
          schema2.firstTextblockType().create(void 0, mergeInline(Fragment.from(inlineRun)))
        );
        inlineRun = [];
      }
    };
    for (const child of children) {
      if (child.isInline) {
        inlineRun.push(child);
      } else {
        flushRun();
        wrapped.push(child);
      }
    }
    flushRun();
    return node.withContent(Fragment.from(wrapped));
  }
  function stripDisallowedMarks(child, parent) {
    if (child.marks.length === 0) return child;
    const allowed = child.marks.filter((mark) => parent.type.allowsMarkType(mark.type));
    return allowed.length === child.marks.length ? child : child.withMarks(allowed);
  }
  function stepOk(doc) {
    return { doc, failed: null };
  }
  function stepFail(reason) {
    return { doc: null, failed: reason };
  }
  var Step = class {
  };
  var ReplaceInlineStep = class _ReplaceInlineStep extends Step {
    constructor(blockPath, from, to, insert) {
      super();
      this.blockPath = blockPath;
      this.from = from;
      this.to = to;
      this.insert = insert;
      if (from > to || from < 0) throw new RangeError(`Invalid inline range [${from}, ${to})`);
    }
    blockPath;
    from;
    to;
    insert;
    get insertLength() {
      return inlineLength(this.insert);
    }
    apply(doc) {
      const block = nodeAtPath(doc, this.blockPath);
      if (!block) return stepFail("ReplaceInlineStep: no node at path");
      if (!block.isTextblock) return stepFail("ReplaceInlineStep: target is not a textblock");
      if (this.to > inlineLength(block.content))
        return stepFail("ReplaceInlineStep: range out of bounds");
      if (this.insert.children.some((child) => !child.isInline)) {
        return stepFail("ReplaceInlineStep: fragment contains non-inline nodes");
      }
      return stepOk(
        updateAtPath(
          doc,
          this.blockPath,
          (node) => node.withContent(replaceInline(node.content, this.from, this.to, this.insert))
        )
      );
    }
    invert(docBefore) {
      const block = nodeAtPath(docBefore, this.blockPath);
      if (!block) throw new RangeError("ReplaceInlineStep.invert: no node at path");
      const removed = sliceInline(block.content, this.from, this.to);
      return new _ReplaceInlineStep(this.blockPath, this.from, this.from + this.insertLength, removed);
    }
    mapPosition(position, bias = 1) {
      if (!pathsEqual(position.path, this.blockPath)) return position;
      const { offset } = position;
      if (offset < this.from) return position;
      const delta = this.insertLength - (this.to - this.from);
      if (offset > this.to) return { path: position.path, offset: offset + delta };
      const mapped = bias < 0 ? this.from : this.from + this.insertLength;
      return { path: position.path, offset: mapped };
    }
    toJSON() {
      return {
        stepType: "replaceInline",
        blockPath: [...this.blockPath],
        from: this.from,
        to: this.to,
        insert: this.insert.toJSON()
      };
    }
  };
  var ReplaceNodesStep = class _ReplaceNodesStep extends Step {
    constructor(parentPath, from, to, insert) {
      super();
      this.parentPath = parentPath;
      this.from = from;
      this.to = to;
      this.insert = insert;
      if (from > to || from < 0) throw new RangeError(`Invalid child range [${from}, ${to})`);
    }
    parentPath;
    from;
    to;
    insert;
    apply(doc) {
      const parent = nodeAtPath(doc, this.parentPath);
      if (!parent) return stepFail("ReplaceNodesStep: no node at path");
      if (parent.isTextblock || parent.isText) {
        return stepFail("ReplaceNodesStep: target children are inline; use ReplaceInlineStep");
      }
      if (this.to > parent.childCount) return stepFail("ReplaceNodesStep: range out of bounds");
      return stepOk(
        updateAtPath(
          doc,
          this.parentPath,
          (node) => node.withContent(node.content.replaceRange(this.from, this.to, this.insert))
        )
      );
    }
    invert(docBefore) {
      const parent = nodeAtPath(docBefore, this.parentPath);
      if (!parent) throw new RangeError("ReplaceNodesStep.invert: no node at path");
      const removed = parent.content.slice(this.from, this.to);
      return new _ReplaceNodesStep(
        this.parentPath,
        this.from,
        this.from + this.insert.childCount,
        removed
      );
    }
    mapPosition(position, bias = 1) {
      if (!pathStartsWith(position.path, this.parentPath)) return position;
      const delta = this.insert.childCount - (this.to - this.from);
      if (position.path.length === this.parentPath.length) {
        const index = position.offset;
        if (index < this.from) return position;
        if (index >= this.to) return { path: position.path, offset: index + delta };
        return {
          path: position.path,
          offset: bias < 0 ? this.from : this.from + this.insert.childCount
        };
      }
      const childIndex = position.path[this.parentPath.length];
      if (childIndex < this.from) return position;
      if (childIndex >= this.to) {
        const path = [...position.path];
        path[this.parentPath.length] = childIndex + delta;
        return { path, offset: position.offset };
      }
      return {
        path: this.parentPath,
        offset: bias < 0 ? this.from : this.from + this.insert.childCount
      };
    }
    toJSON() {
      return {
        stepType: "replaceNodes",
        parentPath: [...this.parentPath],
        from: this.from,
        to: this.to,
        insert: this.insert.toJSON()
      };
    }
  };
  function replaceNodeAt(path, insert) {
    if (path.length === 0) throw new RangeError("Cannot replace the root node");
    const index = path[path.length - 1];
    return new ReplaceNodesStep(path.slice(0, -1), index, index + 1, insert);
  }
  var MarkStep = class extends Step {
    constructor(blockPath, from, to, mark) {
      super();
      this.blockPath = blockPath;
      this.from = from;
      this.to = to;
      this.mark = mark;
      if (from > to || from < 0) throw new RangeError(`Invalid mark range [${from}, ${to})`);
    }
    blockPath;
    from;
    to;
    mark;
    applyMark(doc, add, name) {
      const block = nodeAtPath(doc, this.blockPath);
      if (!block) return stepFail(`${name}: no node at path`);
      if (!block.isTextblock) return stepFail(`${name}: target is not a textblock`);
      if (this.to > inlineLength(block.content)) return stepFail(`${name}: range out of bounds`);
      if (!block.type.allowsMarkType(this.mark.type)) {
        return stepFail(`${name}: mark "${this.mark.type.name}" not allowed here`);
      }
      return stepOk(
        updateAtPath(
          doc,
          this.blockPath,
          (node) => node.withContent(applyInlineMark(node.content, this.from, this.to, this.mark, add))
        )
      );
    }
    /** Mark steps never move content. */
    mapPosition(position) {
      return position;
    }
  };
  var AddMarkStep = class extends MarkStep {
    apply(doc) {
      return this.applyMark(doc, true, "AddMarkStep");
    }
    invert() {
      return new RemoveMarkStep(this.blockPath, this.from, this.to, this.mark);
    }
    toJSON() {
      return {
        stepType: "addMark",
        blockPath: [...this.blockPath],
        from: this.from,
        to: this.to,
        mark: this.mark.toJSON()
      };
    }
  };
  var RemoveMarkStep = class extends MarkStep {
    apply(doc) {
      return this.applyMark(doc, false, "RemoveMarkStep");
    }
    invert() {
      return new AddMarkStep(this.blockPath, this.from, this.to, this.mark);
    }
    toJSON() {
      return {
        stepType: "removeMark",
        blockPath: [...this.blockPath],
        from: this.from,
        to: this.to,
        mark: this.mark.toJSON()
      };
    }
  };
  var SetNodeAttrsStep = class _SetNodeAttrsStep extends Step {
    constructor(path, attrs) {
      super();
      this.path = path;
      this.attrs = attrs;
    }
    path;
    attrs;
    apply(doc) {
      const node = nodeAtPath(doc, this.path);
      if (!node) return stepFail("SetNodeAttrsStep: no node at path");
      if (node.isText) return stepFail("SetNodeAttrsStep: text nodes have no attributes");
      return stepOk(updateAtPath(doc, this.path, (target) => target.withAttrs(this.attrs)));
    }
    invert(docBefore) {
      const node = nodeAtPath(docBefore, this.path);
      if (!node) throw new RangeError("SetNodeAttrsStep.invert: no node at path");
      return new _SetNodeAttrsStep(this.path, node.attrs);
    }
    mapPosition(position) {
      return position;
    }
    toJSON() {
      return { stepType: "setNodeAttrs", path: [...this.path], attrs: { ...this.attrs } };
    }
  };
  function siblingShift(position, parentPath, fromIndex, delta) {
    if (!pathStartsWith(position.path, parentPath)) return null;
    if (position.path.length === parentPath.length) {
      return position.offset > fromIndex ? { path: position.path, offset: position.offset + delta } : position;
    }
    const index = position.path[parentPath.length];
    if (index <= fromIndex) return position;
    const path = [...position.path];
    path[parentPath.length] = index + delta;
    return { path, offset: position.offset };
  }
  var SplitNodeStep = class extends Step {
    constructor(path, offset, afterType, afterAttrs) {
      super();
      this.path = path;
      this.offset = offset;
      this.afterType = afterType;
      this.afterAttrs = afterAttrs;
      if (path.length === 0) throw new RangeError("Cannot split the root node");
    }
    path;
    offset;
    afterType;
    afterAttrs;
    apply(doc) {
      const node = nodeAtPath(doc, this.path);
      if (!node) return stepFail("SplitNodeStep: no node at path");
      if (!node.isTextblock) return stepFail("SplitNodeStep: only textblocks can be split");
      const length = inlineLength(node.content);
      if (this.offset > length) return stepFail("SplitNodeStep: offset out of bounds");
      const before = sliceInline(node.content, 0, this.offset);
      const after = sliceInline(node.content, this.offset, length);
      const schema2 = node.type.schema;
      const secondType = this.afterType ? schema2.nodeType(this.afterType) : node.type;
      const secondAttrs = this.afterType ? this.afterAttrs : this.afterAttrs ?? node.attrs;
      const second = secondType.create(secondAttrs, after);
      const first = node.withContent(before);
      const parentPath = this.path.slice(0, -1);
      const index = this.path[this.path.length - 1];
      return stepOk(
        updateAtPath(
          doc,
          parentPath,
          (parent) => parent.withContent(
            parent.content.replaceRange(index, index + 1, Fragment.of(first, second))
          )
        )
      );
    }
    invert() {
      return new JoinNodesStep(this.path, this.offset);
    }
    mapPosition(position, bias = 1) {
      const parentPath = this.path.slice(0, -1);
      const index = this.path[this.path.length - 1];
      if (pathsEqual(position.path, this.path)) {
        if (position.offset < this.offset) return position;
        if (position.offset === this.offset && bias < 0) return position;
        return {
          path: [...parentPath, index + 1],
          offset: position.offset - this.offset
        };
      }
      return siblingShift(position, parentPath, index, 1) ?? position;
    }
    toJSON() {
      return {
        stepType: "splitNode",
        path: [...this.path],
        offset: this.offset,
        ...this.afterType ? { afterType: this.afterType } : {},
        ...this.afterAttrs ? { afterAttrs: { ...this.afterAttrs } } : {}
      };
    }
  };
  var JoinNodesStep = class extends Step {
    constructor(path, joinOffset) {
      super();
      this.path = path;
      this.joinOffset = joinOffset;
      if (path.length === 0) throw new RangeError("Cannot join the root node");
    }
    path;
    joinOffset;
    apply(doc) {
      const node = nodeAtPath(doc, this.path);
      if (!node) return stepFail("JoinNodesStep: no node at path");
      if (!node.isTextblock) return stepFail("JoinNodesStep: only textblocks can be joined");
      if (inlineLength(node.content) !== this.joinOffset) {
        return stepFail("JoinNodesStep: joinOffset does not match the block length");
      }
      const parentPath = this.path.slice(0, -1);
      const index = this.path[this.path.length - 1];
      const parent = nodeAtPath(doc, parentPath);
      const next = parent?.content.maybeChild(index + 1);
      if (!next) return stepFail("JoinNodesStep: no next sibling to join with");
      if (!next.isTextblock) return stepFail("JoinNodesStep: next sibling is not a textblock");
      const joined = node.withContent(mergeInline(node.content.append(next.content)));
      return stepOk(
        updateAtPath(
          doc,
          parentPath,
          (target) => target.withContent(target.content.replaceRange(index, index + 2, Fragment.of(joined)))
        )
      );
    }
    invert(docBefore) {
      const parentPath = this.path.slice(0, -1);
      const index = this.path[this.path.length - 1];
      const parent = nodeAtPath(docBefore, parentPath);
      const next = parent?.content.maybeChild(index + 1);
      if (!next) throw new RangeError("JoinNodesStep.invert: no next sibling");
      return new SplitNodeStep(this.path, this.joinOffset, next.type.name, next.attrs);
    }
    mapPosition(position) {
      const parentPath = this.path.slice(0, -1);
      const index = this.path[this.path.length - 1];
      const nextPath = [...parentPath, index + 1];
      if (pathsEqual(position.path, nextPath)) {
        return { path: this.path, offset: position.offset + this.joinOffset };
      }
      if (!pathStartsWith(position.path, parentPath)) return position;
      if (position.path.length === parentPath.length) {
        return position.offset >= index + 2 ? { path: position.path, offset: position.offset - 1 } : position;
      }
      const childIndex = position.path[parentPath.length];
      if (childIndex >= index + 2) {
        const path = [...position.path];
        path[parentPath.length] = childIndex - 1;
        return { path, offset: position.offset };
      }
      return position;
    }
    toJSON() {
      return { stepType: "joinNodes", path: [...this.path], joinOffset: this.joinOffset };
    }
  };
  var WrapNodesStep = class extends Step {
    constructor(parentPath, from, to, wrapperType, wrapperAttrs) {
      super();
      this.parentPath = parentPath;
      this.from = from;
      this.to = to;
      this.wrapperType = wrapperType;
      this.wrapperAttrs = wrapperAttrs;
      if (from >= to || from < 0) throw new RangeError(`Invalid wrap range [${from}, ${to})`);
    }
    parentPath;
    from;
    to;
    wrapperType;
    wrapperAttrs;
    apply(doc) {
      const parent = nodeAtPath(doc, this.parentPath);
      if (!parent) return stepFail("WrapNodesStep: no node at path");
      if (parent.isTextblock || parent.isText)
        return stepFail("WrapNodesStep: cannot wrap inline content");
      if (this.to > parent.childCount) return stepFail("WrapNodesStep: range out of bounds");
      const schema2 = parent.type.schema;
      const wrapper = schema2.nodeType(this.wrapperType).create(this.wrapperAttrs, parent.content.slice(this.from, this.to));
      return stepOk(
        updateAtPath(
          doc,
          this.parentPath,
          (node) => node.withContent(node.content.replaceRange(this.from, this.to, Fragment.of(wrapper)))
        )
      );
    }
    invert() {
      return new LiftNodesStep([...this.parentPath, this.from], this.to - this.from);
    }
    mapPosition(position) {
      if (!pathStartsWith(position.path, this.parentPath)) return position;
      const removed = this.to - this.from;
      if (position.path.length === this.parentPath.length) {
        const index = position.offset;
        if (index <= this.from) return position;
        if (index >= this.to) return { path: position.path, offset: index - removed + 1 };
        return { path: [...this.parentPath, this.from], offset: index - this.from };
      }
      const childIndex = position.path[this.parentPath.length];
      const rest = position.path.slice(this.parentPath.length + 1);
      if (childIndex < this.from) return position;
      if (childIndex >= this.to) {
        const path = [...position.path];
        path[this.parentPath.length] = childIndex - removed + 1;
        return { path, offset: position.offset };
      }
      return {
        path: [...this.parentPath, this.from, childIndex - this.from, ...rest],
        offset: position.offset
      };
    }
    toJSON() {
      return {
        stepType: "wrapNodes",
        parentPath: [...this.parentPath],
        from: this.from,
        to: this.to,
        wrapperType: this.wrapperType,
        ...this.wrapperAttrs ? { wrapperAttrs: { ...this.wrapperAttrs } } : {}
      };
    }
  };
  var LiftNodesStep = class extends Step {
    constructor(path, liftedCount) {
      super();
      this.path = path;
      this.liftedCount = liftedCount;
      if (path.length === 0) throw new RangeError("Cannot lift the root node");
    }
    path;
    liftedCount;
    apply(doc) {
      const node = nodeAtPath(doc, this.path);
      if (!node) return stepFail("LiftNodesStep: no node at path");
      if (node.isTextblock || node.isText)
        return stepFail("LiftNodesStep: cannot lift inline content");
      if (node.childCount !== this.liftedCount) {
        return stepFail("LiftNodesStep: liftedCount does not match the node");
      }
      const parentPath = this.path.slice(0, -1);
      const index = this.path[this.path.length - 1];
      return stepOk(
        updateAtPath(
          doc,
          parentPath,
          (parent) => parent.withContent(parent.content.replaceRange(index, index + 1, node.content))
        )
      );
    }
    invert(docBefore) {
      const node = nodeAtPath(docBefore, this.path);
      if (!node) throw new RangeError("LiftNodesStep.invert: no node at path");
      const index = this.path[this.path.length - 1];
      return new WrapNodesStep(
        this.path.slice(0, -1),
        index,
        index + node.childCount,
        node.type.name,
        node.attrs
      );
    }
    mapPosition(position) {
      const parentPath = this.path.slice(0, -1);
      const index = this.path[this.path.length - 1];
      if (pathStartsWith(position.path, this.path)) {
        if (position.path.length === this.path.length) {
          return { path: parentPath, offset: index + position.offset };
        }
        const childIndex2 = position.path[this.path.length];
        const rest = position.path.slice(this.path.length + 1);
        return { path: [...parentPath, index + childIndex2, ...rest], offset: position.offset };
      }
      if (!pathStartsWith(position.path, parentPath)) return position;
      const delta = this.liftedCount - 1;
      if (position.path.length === parentPath.length) {
        return position.offset > index ? { path: position.path, offset: position.offset + delta } : position;
      }
      const childIndex = position.path[parentPath.length];
      if (childIndex > index) {
        const path = [...position.path];
        path[parentPath.length] = childIndex + delta;
        return { path, offset: position.offset };
      }
      return position;
    }
    toJSON() {
      return { stepType: "liftNodes", path: [...this.path], liftedCount: this.liftedCount };
    }
  };
  var Transaction = class {
    steps = [];
    /** The document before each step, parallel to {@link steps}. */
    docs = [];
    /** Creation time, used by the undo history for grouping. */
    time = Date.now();
    currentDoc;
    baseSelection;
    explicitSelection = null;
    stored;
    metadata = null;
    constructor(state) {
      this.currentDoc = state.doc;
      this.baseSelection = state.selection;
      this.stored = state.storedMarks;
    }
    get doc() {
      return this.currentDoc;
    }
    get docChanged() {
      return this.steps.length > 0;
    }
    /** Apply a step; returns false (leaving the transaction untouched) on failure. */
    maybeStep(step) {
      return this.tryStep(step) === null;
    }
    /** Apply a step; throws on failure. */
    step(step) {
      const failed = this.tryStep(step);
      if (failed !== null) throw new RangeError(`Step failed: ${failed}`);
      return this;
    }
    tryStep(step) {
      const result = step.apply(this.currentDoc);
      if (result.failed !== null || result.doc === null) {
        return result.failed ?? "unknown step failure";
      }
      this.docs.push(this.currentDoc);
      this.steps.push(step);
      this.currentDoc = result.doc;
      return null;
    }
    /** Map a position from before this transaction to after it. */
    mapPosition(position, bias) {
      return this.mapThrough(position, 0, bias);
    }
    mapThrough(position, fromStep, bias) {
      let mapped = position;
      for (let i = fromStep; i < this.steps.length; i++) {
        mapped = this.steps[i].mapPosition(mapped, bias);
      }
      return mapped;
    }
    /**
     * The selection after this transaction: the explicitly set one (remapped
     * through any later steps), or the input selection mapped through all steps.
     */
    get selection() {
      if (this.explicitSelection) {
        const { selection, atStep } = this.explicitSelection;
        return selection.map(this.currentDoc, {
          mapPosition: (position, bias) => this.mapThrough(position, atStep, bias)
        });
      }
      return this.baseSelection.map(this.currentDoc, this);
    }
    setSelection(selection) {
      this.explicitSelection = { selection, atStep: this.steps.length };
      this.stored = null;
      return this;
    }
    get storedMarks() {
      return this.stored;
    }
    setStoredMarks(marks) {
      this.stored = marks;
      return this;
    }
    setMeta(key, value) {
      this.metadata ??= /* @__PURE__ */ new Map();
      this.metadata.set(key, value);
      return this;
    }
    getMeta(key) {
      return this.metadata?.get(key);
    }
    /**
     * Every metadata key set on this transaction, in the order it was set.
     *
     * For the one caller that has to hand a transaction's whole provenance on:
     * a dispatch transform that replaces a transaction with a different one
     * (suggestion mode rewriting an edit, say) drops every key the original
     * carried unless it copies them, and the keys it does not know about are
     * exactly the ones it cannot afford to guess at. A replay guard silently
     * lost is an editing loop.
     */
    metaKeys() {
      return this.metadata ? [...this.metadata.keys()] : [];
    }
  };
  var Selection = class {
    get empty() {
      return positionsEqual(this.from, this.to);
    }
  };
  var TextSelection = class _TextSelection extends Selection {
    constructor(anchor, head = anchor) {
      super();
      this.anchor = anchor;
      this.head = head;
    }
    anchor;
    head;
    get from() {
      return minPosition(this.anchor, this.head);
    }
    get to() {
      return maxPosition(this.anchor, this.head);
    }
    get isCursor() {
      return positionsEqual(this.anchor, this.head);
    }
    map(doc, mapper) {
      const anchor = clampPosition(doc, mapper.mapPosition(this.anchor, -1));
      const head = clampPosition(doc, mapper.mapPosition(this.head, -1));
      return new _TextSelection(anchor, head);
    }
    eq(other) {
      return other instanceof _TextSelection && positionsEqual(other.anchor, this.anchor) && positionsEqual(other.head, this.head);
    }
    toJSON() {
      return {
        type: "text",
        anchor: { path: [...this.anchor.path], offset: this.anchor.offset },
        head: { path: [...this.head.path], offset: this.head.offset }
      };
    }
    /** Cursor at the start of the document's first textblock. */
    static atStart(doc) {
      const path = firstTextblockPath(doc);
      return new _TextSelection(pos(path ?? [], 0));
    }
    /** Cursor at the end of the document's last textblock. */
    static atEnd(doc) {
      const blocks = textblocks(doc);
      const last = blocks[blocks.length - 1];
      if (!last) return new _TextSelection(pos([], 0));
      return new _TextSelection(pos(last.path, inlineLength(last.node.content)));
    }
  };
  var NodeSelection = class _NodeSelection extends Selection {
    constructor(path) {
      super();
      this.path = path;
      if (path.length === 0) throw new RangeError("Cannot node-select the root");
    }
    path;
    get parentPath() {
      return this.path.slice(0, -1);
    }
    get index() {
      return this.path[this.path.length - 1];
    }
    get from() {
      return pos(this.parentPath, this.index);
    }
    get to() {
      return pos(this.parentPath, this.index + 1);
    }
    map(doc, mapper) {
      const mapped = clampPosition(doc, mapper.mapPosition(this.from, -1));
      const node = nodeAtPath(doc, [...mapped.path, mapped.offset]);
      if (node && !node.isText) return new _NodeSelection([...mapped.path, mapped.offset]);
      return new TextSelection(mapped).map(doc, identityMapper);
    }
    eq(other) {
      return other instanceof _NodeSelection && pathsEqual(other.path, this.path);
    }
    toJSON() {
      return { type: "node", path: [...this.path] };
    }
  };
  var AllSelection = class _AllSelection extends Selection {
    constructor(doc) {
      super();
      this.doc = doc;
    }
    doc;
    get from() {
      return pos([], 0);
    }
    get to() {
      return pos([], this.doc.childCount);
    }
    map(doc) {
      return new _AllSelection(doc);
    }
    eq(other) {
      return other instanceof _AllSelection;
    }
    toJSON() {
      return { type: "all" };
    }
  };
  var identityMapper = {
    mapPosition: (position) => position
  };
  function selectionNear(doc, position) {
    const clamped = clampPosition(doc, position);
    const node = nodeAtPath(doc, clamped.path);
    if (node?.isTextblock) return new TextSelection(clamped);
    for (const { path, node: block } of textblocks(doc)) {
      if (comparePositions(pos(path, inlineLength(block.content)), clamped) >= 0) {
        return new TextSelection(pos(path, 0));
      }
    }
    return TextSelection.atEnd(doc);
  }
  var EditorState = class _EditorState {
    constructor(schema2, doc, selection, storedMarks) {
      this.schema = schema2;
      this.doc = doc;
      this.selection = selection;
      this.storedMarks = storedMarks;
    }
    schema;
    doc;
    selection;
    storedMarks;
    static create(config) {
      const { schema: schema2 } = config;
      const initial = config.doc ?? (config.content ? nodeFromJSON(schema2, config.content) : schema2.topType.create(void 0, Fragment.of(schema2.firstTextblockType().create())));
      const doc = normalizeDoc(initial);
      const selection = config.selection ? validateSelection(doc, config.selection) : TextSelection.atStart(doc);
      return new _EditorState(schema2, doc, selection, null);
    }
    /** Start building a transaction from this state. */
    get tr() {
      return new Transaction(this);
    }
    apply(tr) {
      return new _EditorState(
        this.schema,
        tr.doc,
        validateSelection(tr.doc, tr.selection),
        tr.storedMarks
      );
    }
    toJSON() {
      return { doc: this.doc.toJSON(), selection: this.selection.toJSON() };
    }
  };
  function validateSelection(doc, selection) {
    if (selection instanceof AllSelection) return new AllSelection(doc);
    if (selection instanceof NodeSelection) {
      const node = nodeAtPath(doc, selection.path);
      return node && !node.isText ? selection : selectionNear(doc, selection.from);
    }
    if (selection instanceof TextSelection) {
      const anchor = clampPosition(doc, selection.anchor);
      const head = clampPosition(doc, selection.head);
      const anchorNode = nodeAtPath(doc, anchor.path);
      const headNode = nodeAtPath(doc, head.path);
      if (anchorNode?.isTextblock && headNode?.isTextblock) {
        return new TextSelection(anchor, head);
      }
      return selectionNear(doc, anchor);
    }
    return selectionNear(doc, selection.from);
  }
  var SAFE_PROTOCOLS = /^(?:https?|mailto|tel|ftp):/i;
  function safeHref(href) {
    if (typeof href !== "string" || href.length === 0) return null;
    const trimmed = href.trim();
    if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !SAFE_PROTOCOLS.test(trimmed)) return null;
    return trimmed;
  }
  var CSS_UNSAFE = /[<>"'();{}]|url\(|expression|javascript:|@import/i;
  function safeCSSValue(value, maxLength = 120) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) return null;
    if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null;
    if (CSS_UNSAFE.test(trimmed)) return null;
    return trimmed;
  }
  function safeFontFamily(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 200) return null;
    if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null;
    if (/[<>();{}]|url\(|expression|javascript:|@import/i.test(trimmed)) return null;
    const families = trimmed.split(",").map((family) => family.trim());
    if (families.length === 0 || families.length > 12) return null;
    return families.every((family) => FONT_FAMILY.test(family)) ? families.join(", ") : null;
  }
  var FONT_FAMILY = /^("[\w \-]+"|'[\w \-]+'|[\w-]+)$/;
  function safeColor(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 64) return null;
    if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return null;
    return COLOR.test(trimmed) ? trimmed : null;
  }
  var COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\( *\d{1,3}%? *(,| ) *\d{1,3}%? *(,| ) *\d{1,3}%? *((,|\/) *[\d.]+%? *)?\)|hsla?\( *[\d.]+(deg|rad|turn)? *(,| ) *[\d.]+%? *(,| ) *[\d.]+%? *((,|\/) *[\d.]+%? *)?\))$/i;
  function safeLength(value) {
    const css = safeCSSValue(value, 32);
    if (!css) return null;
    if (/^\d+(\.\d+)?$/.test(css)) return `${css}px`;
    return /^\d+(\.\d+)?(px|pt|em|rem|%|vw|vh|ch)$/i.test(css) ? css : null;
  }
  function blockLayoutAttrs() {
    return {
      align: { default: null },
      indent: { default: 0 },
      lineHeight: { default: null },
      spaceBefore: { default: null },
      spaceAfter: { default: null }
    };
  }
  function safeLineHeight(value) {
    const raw = typeof value === "number" ? String(value) : value;
    const css = safeCSSValue(raw, 32);
    if (!css) return null;
    if (/^\d+(\.\d+)?$/.test(css)) return Number.parseFloat(css) <= 10 ? css : null;
    return safeLength(css);
  }
  var ALIGNMENTS = /* @__PURE__ */ new Set(["left", "center", "right", "justify"]);
  var MAX_INDENT = 8;
  function safeElementId(value) {
    if (typeof value !== "string") return null;
    if (!/^[A-Za-z][\w:.-]{0,127}$/.test(value) || value.startsWith("tvx-")) return null;
    return value;
  }
  function blockLayoutHTML(node) {
    const declarations = [];
    const align = typeof node.attrs.align === "string" ? node.attrs.align : null;
    if (align && ALIGNMENTS.has(align)) declarations.push(`text-align: ${align}`);
    const indent = typeof node.attrs.indent === "number" ? node.attrs.indent : 0;
    const steps = Math.min(MAX_INDENT, Math.max(0, Math.round(indent)));
    if (steps > 0) declarations.push(`margin-left: ${steps * 2.5}rem`);
    const lineHeight = safeLineHeight(node.attrs.lineHeight);
    if (lineHeight) declarations.push(`line-height: ${lineHeight}`);
    const before = safeLength(node.attrs.spaceBefore);
    if (before) declarations.push(`margin-top: ${before}`);
    const after = safeLength(node.attrs.spaceAfter);
    if (after) declarations.push(`margin-bottom: ${after}`);
    return declarations.length > 0 ? { style: declarations.join("; ") } : {};
  }
  function parseBlockLayout(element) {
    const attrs = {};
    const align = element.style.textAlign || element.getAttribute("align");
    if (align && ALIGNMENTS.has(align)) attrs.align = align;
    const margin = Number.parseFloat(element.style.marginLeft);
    if (Number.isFinite(margin) && margin > 0) {
      attrs.indent = Math.min(MAX_INDENT, Math.round(margin / 2.5));
    }
    const lineHeight = safeLineHeight(element.style.lineHeight);
    if (lineHeight) attrs.lineHeight = lineHeight;
    const before = safeLength(element.style.marginTop);
    if (before) attrs.spaceBefore = before;
    const after = safeLength(element.style.marginBottom);
    if (after) attrs.spaceAfter = after;
    return attrs;
  }
  var BULLET_LIST_STYLES = /* @__PURE__ */ new Set(["disc", "circle", "square"]);
  var ORDERED_LIST_STYLES = /* @__PURE__ */ new Set([
    "decimal",
    "lower-alpha",
    "upper-alpha",
    "lower-roman",
    "upper-roman"
  ]);
  var LIST_STYLES = /* @__PURE__ */ new Set([
    ...BULLET_LIST_STYLES,
    ...ORDERED_LIST_STYLES
  ]);
  function listStylesFor(listTypeName) {
    if (listTypeName === "bulletList") return BULLET_LIST_STYLES;
    if (listTypeName === "orderedList") return ORDERED_LIST_STYLES;
    return EMPTY_STYLES;
  }
  var EMPTY_STYLES = /* @__PURE__ */ new Set();
  function listStyleHTML(node, allowed) {
    const style = node.attrs.listStyle;
    if (typeof style !== "string" || !allowed.has(style)) return {};
    return { style: `list-style-type: ${style}` };
  }
  function parseListStyle(element, allowed) {
    const style = element.style.listStyleType;
    return allowed.has(style) ? { listStyle: style } : {};
  }
  function ownCheckbox(element) {
    for (const child of element.children) {
      if (isCheckbox(child)) return child;
      if (child.tagName.toLowerCase() !== "p") continue;
      for (const inner of child.children) {
        if (isCheckbox(inner)) return inner;
      }
    }
    return null;
  }
  function isCheckbox(element) {
    return element.tagName.toLowerCase() === "input" && (element.getAttribute("type") ?? "").toLowerCase() === "checkbox";
  }
  function safeLanguageName(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9+#._-]{0,31}$/.test(trimmed) ? trimmed : null;
  }
  function languageOf(element) {
    const declared = safeLanguageName(element.getAttribute("data-language"));
    if (declared) return declared;
    const code = element.querySelector("code");
    for (const host of [element, code]) {
      for (const name of host?.classList ?? []) {
        const match = /^(?:language|lang)-(.+)$/.exec(name);
        const language = match ? safeLanguageName(match[1]) : null;
        if (language) return language;
      }
    }
    return null;
  }
  function defaultNodes() {
    return {
      doc: { content: "block+" },
      paragraph: {
        content: "inline*",
        group: "block",
        attrs: blockLayoutAttrs(),
        toHTML: (node) => ({ tag: "p", attrs: blockLayoutHTML(node) }),
        parseHTML: [{ tag: "p", getAttrs: parseBlockLayout }]
      },
      heading: {
        content: "inline*",
        group: "block",
        // `id` makes a heading a link target within the document; it is null
        // until something (the link dialog, an import) needs one.
        attrs: { level: { default: 1 }, id: { default: null }, ...blockLayoutAttrs() },
        toHTML: (node) => {
          const attrs = blockLayoutHTML(node);
          const id = safeElementId(node.attrs.id);
          return { tag: `h${clampLevel(node.attrs.level)}`, attrs: id ? { ...attrs, id } : attrs };
        },
        parseHTML: [1, 2, 3, 4, 5, 6].map((level) => ({
          tag: `h${level}`,
          getAttrs: (element) => ({
            level,
            id: safeElementId(element.getAttribute("id")),
            ...parseBlockLayout(element)
          })
        }))
      },
      blockquote: {
        content: "block+",
        group: "block",
        toHTML: () => ({ tag: "blockquote" }),
        parseHTML: [{ tag: "blockquote" }]
      },
      codeBlock: {
        content: "text*",
        group: "block",
        marks: "",
        attrs: { language: { default: null } },
        preserveWhitespace: true,
        toHTML: (node) => {
          const language = safeLanguageName(node.attrs.language);
          const attrs = {};
          if (language) attrs["data-language"] = language;
          return { tag: "pre", attrs, childTag: "code" };
        },
        parseHTML: [{ tag: "pre", getAttrs: (element) => ({ language: languageOf(element) }) }]
      },
      horizontalRule: {
        group: "block",
        atom: true,
        toHTML: () => ({ tag: "hr", isVoid: true }),
        parseHTML: [{ tag: "hr" }]
      },
      hardBreak: {
        inline: true,
        atom: true,
        group: "inline",
        toHTML: () => ({ tag: "br", isVoid: true }),
        parseHTML: [{ tag: "br" }]
      },
      taskList: {
        content: "taskItem+",
        group: "block",
        toHTML: () => ({ tag: "ul", attrs: { "data-type": "taskList" } }),
        // Registered before bulletList so both rules below are consulted first
        // (RuleSet tries attribute-constrained rules ahead of bare ones, and
        // otherwise keeps registration order).
        parseHTML: [
          {
            tag: "ul",
            attribute: "data-type",
            getAttrs: (element) => element.getAttribute("data-type") === "taskList" ? {} : false
          },
          // A bare `<ul>` whose items carry checkboxes, GitHub-flavoured
          // markdown, and most markdown renderers. The items themselves parse
          // as `taskItem`, which only a `taskList` may contain, so this rule is
          // what keeps the pasted list schema-valid.
          {
            tag: "ul",
            getAttrs: (element) => [...element.children].some(
              (child) => child.tagName.toLowerCase() === "li" && ownCheckbox(child)
            ) ? {} : false
          }
        ]
      },
      taskItem: {
        content: "block+",
        attrs: { checked: { default: false } },
        toHTML: (node) => ({
          tag: "li",
          attrs: {
            "data-type": "taskItem",
            "data-checked": node.attrs.checked === true ? "true" : "false"
          }
        }),
        parseHTML: [
          {
            tag: "li",
            attribute: "data-checked",
            getAttrs: (element) => ({ checked: element.getAttribute("data-checked") === "true" })
          },
          // GitHub-flavoured markdown and other editors paste a bare `<li>`
          // holding an `<input type=checkbox>`. The parser drops the input
          // itself (it is on the dangerous-tags list), so the state has to be
          // read here, before the element's children are walked. Matching on
          // the input is also what distinguishes such an `<li>` from a plain
          // one, which must stay a `listItem`.
          {
            tag: "li",
            getAttrs: (element) => {
              const box = ownCheckbox(element);
              return box ? { checked: box.hasAttribute("checked") } : false;
            }
          }
        ]
      },
      bulletList: {
        content: "listItem+",
        group: "block",
        attrs: { listStyle: { default: null } },
        toHTML: (node) => ({ tag: "ul", attrs: listStyleHTML(node, BULLET_LIST_STYLES) }),
        parseHTML: [
          { tag: "ul", getAttrs: (element) => parseListStyle(element, BULLET_LIST_STYLES) }
        ]
      },
      orderedList: {
        content: "listItem+",
        group: "block",
        attrs: { start: { default: 1 }, listStyle: { default: null } },
        toHTML: (node) => {
          const attrs = listStyleHTML(node, ORDERED_LIST_STYLES);
          if (node.attrs.start !== 1) attrs.start = String(node.attrs.start);
          return { tag: "ol", attrs };
        },
        parseHTML: [
          {
            tag: "ol",
            getAttrs: (element) => {
              const start = Number.parseInt(element.getAttribute("start") ?? "1", 10);
              return {
                start: Number.isNaN(start) ? 1 : start,
                ...parseListStyle(element, ORDERED_LIST_STYLES)
              };
            }
          }
        ]
      },
      listItem: {
        content: "block+",
        toHTML: () => ({ tag: "li" }),
        parseHTML: [{ tag: "li" }]
      },
      text: { group: "inline" }
    };
  }
  function defaultMarks() {
    return {
      bold: {
        toHTML: () => ({ tag: "strong" }),
        parseHTML: [{ tag: "strong" }, { tag: "b" }]
      },
      italic: {
        toHTML: () => ({ tag: "em" }),
        parseHTML: [{ tag: "em" }, { tag: "i" }]
      },
      underline: {
        toHTML: () => ({ tag: "u" }),
        parseHTML: [{ tag: "u" }]
      },
      strikethrough: {
        toHTML: () => ({ tag: "s" }),
        parseHTML: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }]
      },
      code: {
        toHTML: () => ({ tag: "code" }),
        parseHTML: [{ tag: "code" }]
      },
      link: {
        attrs: { href: {}, title: { default: null }, target: { default: null } },
        toHTML: (mark) => {
          const href = safeHref(mark.attrs.href);
          const attrs = href ? { href } : {};
          if (typeof mark.attrs.title === "string") attrs.title = mark.attrs.title;
          if (mark.attrs.target === "_blank") {
            attrs.target = "_blank";
            attrs.rel = "noopener noreferrer";
          }
          return { tag: "a", attrs };
        },
        parseHTML: [
          {
            tag: "a",
            getAttrs: (element) => {
              const href = safeHref(element.getAttribute("href"));
              if (!href) return false;
              const title = element.getAttribute("title");
              const target = element.getAttribute("target") === "_blank" ? "_blank" : null;
              const attrs = { href };
              if (title) attrs.title = title;
              if (target) attrs.target = target;
              return attrs;
            }
          }
        ]
      },
      highlight: {
        toHTML: () => ({ tag: "mark" }),
        parseHTML: [{ tag: "mark" }]
      },
      subscript: {
        excludes: "superscript",
        toHTML: () => ({ tag: "sub" }),
        parseHTML: [{ tag: "sub" }]
      },
      superscript: {
        excludes: "subscript",
        toHTML: () => ({ tag: "sup" }),
        parseHTML: [{ tag: "sup" }]
      },
      fontFamily: {
        attrs: { family: {} },
        toHTML: (mark) => styleSpan("font-family", safeFontFamily(mark.attrs.family)),
        parseHTML: [
          {
            tag: "span",
            getAttrs: (element) => {
              const family = safeFontFamily(element.style.fontFamily);
              return family ? { family } : false;
            }
          },
          {
            tag: "font",
            getAttrs: (element) => {
              const family = safeFontFamily(element.getAttribute("face"));
              return family ? { family } : false;
            }
          }
        ]
      },
      fontSize: {
        attrs: { size: {} },
        toHTML: (mark) => styleSpan("font-size", safeLength(mark.attrs.size)),
        parseHTML: [
          {
            tag: "span",
            getAttrs: (element) => {
              const size = safeLength(element.style.fontSize);
              return size ? { size } : false;
            }
          }
        ]
      },
      textColor: {
        attrs: { color: {} },
        toHTML: (mark) => styleSpan("color", safeColor(mark.attrs.color)),
        parseHTML: [
          {
            tag: "span",
            getAttrs: (element) => {
              const color = safeColor(element.style.color);
              return color ? { color } : false;
            }
          }
        ]
      },
      backgroundColor: {
        attrs: { color: {} },
        toHTML: (mark) => styleSpan("background-color", safeColor(mark.attrs.color)),
        parseHTML: [
          {
            tag: "span",
            getAttrs: (element) => {
              const color = safeColor(element.style.backgroundColor);
              return color ? { color } : false;
            }
          }
        ]
      },
      smallCaps: {
        toHTML: () => styleSpan("font-variant-caps", "small-caps"),
        parseHTML: [
          {
            tag: "span",
            getAttrs: (element) => {
              const caps = element.style.fontVariantCaps || element.style.fontVariant || "";
              return caps.trim().toLowerCase() === "small-caps" ? {} : false;
            }
          }
        ]
      },
      letterSpacing: {
        attrs: { spacing: {} },
        toHTML: (mark) => styleSpan("letter-spacing", safeLength(mark.attrs.spacing)),
        parseHTML: [
          {
            tag: "span",
            getAttrs: (element) => {
              const spacing = safeLength(element.style.letterSpacing);
              return spacing ? { spacing } : false;
            }
          }
        ]
      }
    };
  }
  function styleSpan(property, value) {
    return value ? { tag: "span", attrs: { style: `${property}: ${value}` } } : { tag: "span" };
  }
  function clampLevel(level) {
    const value = typeof level === "number" ? Math.round(level) : 1;
    return Math.min(6, Math.max(1, value));
  }
  function deleteRange(tr, from, to) {
    if (pathsEqual(from.path, to.path)) {
      if (from.offset < to.offset) {
        tr.step(new ReplaceInlineStep(from.path, from.offset, to.offset, Fragment.empty));
      }
      return;
    }
    const firstBlock = nodeAtPath(tr.doc, from.path);
    const lastBlock = nodeAtPath(tr.doc, to.path);
    if (!firstBlock?.isTextblock || !lastBlock?.isTextblock) return;
    const firstLength = inlineLength(firstBlock.content);
    if (from.offset < firstLength) {
      tr.step(new ReplaceInlineStep(from.path, from.offset, firstLength, Fragment.empty));
    }
    if (to.offset > 0) {
      tr.step(new ReplaceInlineStep(to.path, 0, to.offset, Fragment.empty));
    }
    let divergence = 0;
    while (from.path[divergence] === to.path[divergence]) divergence++;
    const commonPath = from.path.slice(0, divergence);
    const firstIndex = from.path[divergence];
    const lastIndex = to.path[divergence];
    if (lastIndex > firstIndex + 1) {
      tr.step(new ReplaceNodesStep(commonPath, firstIndex + 1, lastIndex, Fragment.empty));
    }
    const directSiblings = from.path.length === divergence + 1 && to.path.length === divergence + 1;
    if (directSiblings) {
      tr.step(new JoinNodesStep(from.path, from.offset));
    }
  }
  function chainCommands(...commands) {
    return (state) => {
      for (const command of commands) {
        const tr = command(state);
        if (tr) return tr;
      }
      return null;
    };
  }
  function insertText(text) {
    return (state) => {
      if (text.length === 0) return null;
      const selection = state.selection;
      if (!(selection instanceof TextSelection)) return null;
      const tr = state.tr;
      if (!selection.empty) deleteRange(tr, selection.from, selection.to);
      const point = selection.from;
      const block = nodeAtPath(tr.doc, point.path);
      if (!block?.isTextblock) return null;
      const inherited = state.storedMarks ?? marksAtInlineOffset(block.content, point.offset);
      const marks = inherited.filter((mark) => block.type.allowsMarkType(mark.type));
      tr.step(
        new ReplaceInlineStep(
          point.path,
          point.offset,
          point.offset,
          Fragment.of(state.schema.text(text, marks))
        )
      );
      tr.setSelection(new TextSelection(pos(point.path, point.offset + text.length)));
      return tr;
    };
  }
  var deleteSelection = (state) => {
    const selection = state.selection;
    if (selection.empty) return null;
    const tr = state.tr;
    if (selection instanceof AllSelection) {
      const paragraph = state.schema.firstTextblockType().create();
      tr.step(new ReplaceNodesStep([], 0, state.doc.childCount, Fragment.of(paragraph)));
      tr.setSelection(new TextSelection(pos([0], 0)));
      return tr;
    }
    if (selection instanceof NodeSelection) {
      tr.step(
        new ReplaceNodesStep(
          selection.parentPath,
          selection.index,
          selection.index + 1,
          Fragment.empty
        )
      );
      tr.setSelection(selectionNear(tr.doc, selection.from));
      return tr;
    }
    deleteRange(tr, selection.from, selection.to);
    tr.setSelection(new TextSelection(selection.from));
    return tr;
  };
  function toggleMark(name, attrs) {
    return (state) => {
      const type = state.schema.markType(name);
      const mark = type.create(attrs);
      const selection = state.selection;
      if (selection.empty && selection instanceof TextSelection) {
        const block = nodeAtPath(state.doc, selection.head.path);
        if (!block?.isTextblock || !block.type.allowsMarkType(type)) return null;
        const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset);
        const active2 = current.some((candidate) => candidate.type === type);
        const next = active2 ? current.filter((candidate) => candidate.type !== type) : mark.addToSet(current);
        return state.tr.setStoredMarks(next);
      }
      const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
        (block) => block.from < block.to && block.node.type.allowsMarkType(type)
      );
      if (blocks.length === 0) return null;
      const active = blocks.every(
        (block) => rangeHasMark(block.node.content, block.from, block.to, type)
      );
      const tr = state.tr;
      for (const block of blocks) {
        if (active) {
          for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
            tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark));
          }
        } else {
          tr.step(new AddMarkStep(block.path, block.from, block.to, mark));
        }
      }
      return tr.docChanged ? tr : null;
    };
  }
  function setBlockType(name, attrs) {
    return (state) => {
      const type = state.schema.nodeType(name);
      if (!type.inlineContent) return null;
      const selection = state.selection;
      const tr = state.tr;
      let changed = false;
      for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
        const replacement = type.create(attrs, block.node.content);
        if (block.node.type === type && attrsEq(block.node.attrs, replacement.attrs)) continue;
        tr.step(replaceNodeAt(block.path, Fragment.of(replacement)));
        changed = true;
      }
      if (!changed) return null;
      tr.setSelection(selection);
      return tr;
    };
  }
  function setMark(name, attrs) {
    return (state) => {
      const type = state.schema.markType(name);
      const mark = type.create(attrs);
      const selection = state.selection;
      if (selection.empty && selection instanceof TextSelection) {
        const block = nodeAtPath(state.doc, selection.head.path);
        if (!block?.isTextblock || !block.type.allowsMarkType(type)) return null;
        const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset);
        return state.tr.setStoredMarks(mark.addToSet(current));
      }
      const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
        (block) => block.from < block.to && block.node.type.allowsMarkType(type)
      );
      if (blocks.length === 0) return null;
      const tr = state.tr;
      for (const block of blocks) {
        for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
          tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark));
        }
        tr.step(new AddMarkStep(block.path, block.from, block.to, mark));
      }
      return tr.docChanged ? tr : null;
    };
  }
  function unsetMark(name) {
    return (state) => {
      const type = state.schema.markType(name);
      const selection = state.selection;
      if (selection.empty && selection instanceof TextSelection) {
        const block = nodeAtPath(state.doc, selection.head.path);
        if (!block?.isTextblock) return null;
        const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset);
        const next = current.filter((candidate) => candidate.type !== type);
        return next.length === current.length ? null : state.tr.setStoredMarks(next);
      }
      const tr = state.tr;
      for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
        if (block.from >= block.to) continue;
        for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
          tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark));
        }
      }
      return tr.docChanged ? tr : null;
    };
  }
  var clearFormatting = (state) => {
    const selection = state.selection;
    const tr = state.tr;
    for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
      if (block.from >= block.to) continue;
      for (const type of Object.values(state.schema.marks)) {
        for (const range of rangesWithMark(block.node.content, block.from, block.to, type)) {
          tr.step(new RemoveMarkStep(block.path, range.from, range.to, range.mark));
        }
      }
    }
    return tr.docChanged ? tr : null;
  };
  var clearBlockFormatting = (state) => {
    const tr = state.tr;
    const defaults = blockLayoutAttrs();
    for (const block of blocksInRange(state.doc, state.selection.from, state.selection.to)) {
      const attrs = block.node.attrs;
      const next = { ...attrs };
      for (const [name, spec] of Object.entries(defaults)) {
        if (name in next) next[name] = spec.default ?? null;
      }
      if (attrsEq(attrs, next)) continue;
      tr.step(new SetNodeAttrsStep(block.path, next));
    }
    return tr.docChanged ? tr : null;
  };
  var clearAllFormatting = (state) => {
    const marks = clearFormatting(state);
    const layout = clearBlockFormatting(marks ? state.apply(marks) : state);
    if (!marks) return layout;
    if (!layout) return marks;
    for (const step of layout.steps) marks.step(step);
    return marks;
  };
  function setBlockAttrs(attrs) {
    return (state) => {
      const selection = state.selection;
      const tr = state.tr;
      for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
        const next = { ...block.node.attrs, ...attrs };
        if (attrsEq(block.node.attrs, next)) continue;
        tr.step(new SetNodeAttrsStep(block.path, next));
      }
      return tr.docChanged ? tr : null;
    };
  }
  function setTextAlign(align) {
    return setBlockAttrs({ align });
  }
  function indentBlocks(delta) {
    return (state) => {
      const selection = state.selection;
      const tr = state.tr;
      for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
        const current = typeof block.node.attrs.indent === "number" ? block.node.attrs.indent : 0;
        const next = Math.min(MAX_INDENT, Math.max(0, current + delta));
        if (next === current) continue;
        tr.step(new SetNodeAttrsStep(block.path, { ...block.node.attrs, indent: next }));
      }
      return tr.docChanged ? tr : null;
    };
  }
  function setLineHeight(value) {
    return setBlockAttrs({ lineHeight: value === null ? null : String(value) });
  }
  function setParagraphSpacing(opts) {
    const attrs = {};
    if ("before" in opts) attrs.spaceBefore = opts.before ?? null;
    if ("after" in opts) attrs.spaceAfter = opts.after ?? null;
    return (state) => Object.keys(attrs).length === 0 ? null : setBlockAttrs(attrs)(state);
  }
  function setLetterSpacing(spacing) {
    return spacing === null ? unsetMark("letterSpacing") : setMark("letterSpacing", { spacing });
  }
  var toggleSmallCaps = toggleMark("smallCaps");
  var WORD_CHARACTER = /[\p{L}\p{N}']/u;
  function convertCase(mode) {
    return (state) => {
      const selection = state.selection;
      if (selection.empty) return null;
      const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
        (block) => block.from < block.to
      );
      if (blocks.length === 0) return null;
      const tr = state.tr;
      let inWord = false;
      let changed = false;
      let lengthDelta = 0;
      for (const block of blocks) {
        const slice = sliceInline(block.node.content, block.from, block.to);
        const out = [];
        let blockChanged = false;
        inWord = false;
        for (const child of slice.children) {
          if (!child.isText) {
            out.push(child);
            inWord = false;
            continue;
          }
          const node = child;
          const next = convertText(node.text, mode, inWord);
          inWord = next.inWord;
          if (next.text !== node.text) blockChanged = true;
          out.push(node.withText(next.text));
          lengthDelta += next.text.length - node.text.length;
        }
        if (!blockChanged) continue;
        changed = true;
        tr.step(new ReplaceInlineStep(block.path, block.from, block.to, Fragment.from(out)));
      }
      if (!changed) return null;
      if (lengthDelta === 0) tr.setSelection(selection);
      return tr;
    };
  }
  function convertText(text, mode, startsInWord) {
    if (mode === "upper") return { text: text.toUpperCase(), inWord: false };
    if (mode === "lower") return { text: text.toLowerCase(), inWord: false };
    let inWord = startsInWord;
    let out = "";
    for (const character of text) {
      const isWord = WORD_CHARACTER.test(character);
      out += isWord && !inWord ? character.toUpperCase() : character.toLowerCase();
      inWord = isWord;
    }
    return { text: out, inWord };
  }
  var CODE_INDENT = "  ";
  var CODE_BRACKETS = /* @__PURE__ */ new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"]
  ]);
  var CODE_QUOTES = /* @__PURE__ */ new Set(['"', "'", "`"]);
  var CODE_PAIRS = new Map([
    ...CODE_BRACKETS,
    ...[...CODE_QUOTES].map((quote) => [quote, quote])
  ]);
  var CODE_CLOSERS = new Set(CODE_PAIRS.values());
  var CLOSE_BEFORE = /* @__PURE__ */ new Set([
    ";",
    ":",
    ".",
    ",",
    "=",
    ")",
    "]",
    "}",
    ">",
    " ",
    "	",
    "\n"
  ]);
  var CODE_WORD = /[\p{L}\p{N}_$]/u;
  function lineIndentation(text, lineStart) {
    let end = lineStart;
    while (end < text.length && (text[end] === " " || text[end] === "	")) end++;
    return text.slice(lineStart, end);
  }
  function preformattedAt(state) {
    const selection = state.selection;
    if (!(selection instanceof TextSelection)) return null;
    const block = nodeAtPath(state.doc, selection.from.path);
    if (!block?.isTextblock || !block.type.spec.preserveWhitespace) return null;
    if (!pathsEqual(selection.from.path, selection.to.path)) return null;
    return block;
  }
  function insertAt(tr, state, path, offset, text) {
    tr.step(new ReplaceInlineStep(path, offset, offset, Fragment.from([state.schema.text(text)])));
  }
  function lineStarts(text, from, to) {
    const starts = [from];
    for (let index = from; index < to; index++) {
      if (text[index] === "\n") starts.push(index + 1);
    }
    return starts;
  }
  function leadingIndent(text, start) {
    if (text[start] === "	") return 1;
    let spaces = 0;
    while (spaces < CODE_INDENT.length && text[start + spaces] === " ") spaces++;
    return spaces;
  }
  var indentInPreformatted = (state) => {
    const block = preformattedAt(state);
    if (!block) return null;
    const selection = state.selection;
    const text = block.textContent;
    const path = selection.from.path;
    if (!text.slice(selection.from.offset, selection.to.offset).includes("\n")) {
      const tr2 = state.tr;
      if (!selection.empty) deleteRange(tr2, selection.from, selection.to);
      const at = tr2.mapPosition(selection.from, -1);
      insertAt(tr2, state, at.path, at.offset, CODE_INDENT);
      return tr2.setSelection(new TextSelection(pos(at.path, at.offset + CODE_INDENT.length)));
    }
    const firstLine = text.lastIndexOf("\n", selection.from.offset - 1) + 1;
    const lastBreak = text.indexOf("\n", selection.to.offset);
    const starts = lineStarts(text, firstLine, lastBreak === -1 ? text.length : lastBreak);
    const tr = state.tr;
    for (const start of [...starts].reverse()) insertAt(tr, state, path, start, CODE_INDENT);
    return tr.setSelection(
      new TextSelection(
        pos(path, selection.from.offset + CODE_INDENT.length),
        pos(path, selection.to.offset + CODE_INDENT.length * starts.length)
      )
    );
  };
  var outdentInPreformatted = (state) => {
    const block = preformattedAt(state);
    if (!block) return null;
    const selection = state.selection;
    const text = block.textContent;
    const path = selection.from.path;
    const firstLine = text.lastIndexOf("\n", selection.from.offset - 1) + 1;
    const lastBreak = text.indexOf("\n", selection.to.offset);
    const starts = lineStarts(text, firstLine, lastBreak === -1 ? text.length : lastBreak);
    const cuts = starts.map((start) => ({ start, length: leadingIndent(text, start) })).filter((cut) => cut.length > 0);
    if (cuts.length === 0) return null;
    const tr = state.tr;
    for (const cut of [...cuts].reverse()) {
      deleteRange(tr, pos(path, cut.start), pos(path, cut.start + cut.length));
    }
    const removedBefore = cuts.filter((cut) => cut.start < selection.from.offset).reduce((total, cut) => total + cut.length, 0);
    const removedTotal = cuts.reduce((total, cut) => total + cut.length, 0);
    const from = Math.max(firstLine, selection.from.offset - removedBefore);
    const to = Math.max(from, selection.to.offset - removedTotal);
    return tr.setSelection(new TextSelection(pos(path, from), pos(path, to)));
  };
  var lastNewline = null;
  var splitBlockInPreformatted = (state) => {
    const selection = state.selection;
    if (!(selection instanceof TextSelection)) return null;
    const block = nodeAtPath(state.doc, selection.from.path);
    if (!block?.isTextblock || !block.type.spec.preserveWhitespace) return null;
    const tr = state.tr;
    if (!selection.empty) deleteRange(tr, selection.from, selection.to);
    const point = tr.mapPosition(selection.from, -1);
    const current = nodeAtPath(tr.doc, point.path);
    if (!current) return null;
    const text = current.textContent;
    const atEnd = point.offset === inlineLength(current.content);
    const lineStart = text.lastIndexOf("\n", point.offset - 1) + 1;
    const onBlankLine = lineStart > 0 && /^[ \t]*$/.test(text.slice(lineStart, point.offset));
    const consecutive = lastNewline !== null && lastNewline.offset === point.offset && pathsEqual(lastNewline.path, point.path);
    if (atEnd && onBlankLine && consecutive) {
      const paragraph = state.schema.nodes.paragraph;
      if (paragraph) {
        deleteRange(tr, pos(point.path, lineStart - 1), point);
        const end = tr.mapPosition(point, -1);
        tr.step(new SplitNodeStep(end.path, end.offset, paragraph.name));
        const parentPath = end.path.slice(0, -1);
        const index = end.path[end.path.length - 1];
        tr.setSelection(new TextSelection(pos([...parentPath, index + 1], 0)));
        lastNewline = null;
        return tr;
      }
    }
    const indent = lineIndentation(text, lineStart);
    const before = text[point.offset - 1];
    const closer = before === void 0 ? void 0 : CODE_BRACKETS.get(before);
    const deeper = closer !== void 0;
    const opensBlock = deeper && text[point.offset] === closer;
    const inserted = `
${indent}${deeper ? CODE_INDENT : ""}`;
    const trailing = opensBlock ? `
${indent}` : "";
    tr.step(
      new ReplaceInlineStep(
        point.path,
        point.offset,
        point.offset,
        Fragment.from([state.schema.text(inserted + trailing)])
      )
    );
    const caret = point.offset + inserted.length;
    tr.setSelection(new TextSelection(pos(point.path, caret)));
    lastNewline = { path: point.path, offset: caret };
    return tr;
  };
  var exitPreformatted = (state) => {
    const block = preformattedAt(state);
    if (!block) return null;
    const paragraph = state.schema.nodes.paragraph;
    if (!paragraph) return null;
    const path = state.selection.from.path;
    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];
    const tr = state.tr;
    tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 1, Fragment.of(paragraph.create())));
    tr.setSelection(new TextSelection(pos([...parentPath, index + 1], 0)));
    lastNewline = null;
    return tr;
  };
  var insertNewlineInPreformatted = (state) => {
    if (!preformattedAt(state)) return null;
    return insertText("\n")(state);
  };
  function typeInPreformatted(text) {
    return (state) => {
      const block = preformattedAt(state);
      if (!block || text.length !== 1) return null;
      const selection = state.selection;
      const source = block.textContent;
      const path = selection.from.path;
      const closer = CODE_PAIRS.get(text);
      if (!selection.empty) {
        if (closer === void 0) return null;
        const inner = source.slice(selection.from.offset, selection.to.offset);
        const tr2 = state.tr;
        tr2.step(
          new ReplaceInlineStep(
            path,
            selection.from.offset,
            selection.to.offset,
            Fragment.from([state.schema.text(`${text}${inner}${closer}`)])
          )
        );
        return tr2.setSelection(
          new TextSelection(pos(path, selection.from.offset + 1), pos(path, selection.to.offset + 1))
        );
      }
      const offset = selection.from.offset;
      const before = source[offset - 1];
      const after = source[offset];
      if (CODE_CLOSERS.has(text) && after === text) {
        return state.tr.setSelection(new TextSelection(pos(path, offset + 1)));
      }
      if (closer === void 0) return null;
      if (after !== void 0 && !CLOSE_BEFORE.has(after)) return null;
      if (CODE_QUOTES.has(text) && before !== void 0 && (CODE_WORD.test(before) || before === text)) {
        return null;
      }
      const tr = state.tr;
      tr.step(
        new ReplaceInlineStep(
          path,
          offset,
          offset,
          Fragment.from([state.schema.text(text + closer)])
        )
      );
      return tr.setSelection(new TextSelection(pos(path, offset + 1)));
    };
  }
  var deleteBackwardInPreformatted = (state) => {
    const block = preformattedAt(state);
    if (!block) return null;
    const selection = state.selection;
    if (!selection.empty) return null;
    const source = block.textContent;
    const path = selection.from.path;
    const offset = selection.from.offset;
    const before = source[offset - 1];
    if (before === void 0) return null;
    const closer = CODE_PAIRS.get(before);
    if (closer !== void 0 && source[offset] === closer) {
      const tr = state.tr;
      tr.step(new ReplaceInlineStep(path, offset - 1, offset + 1, Fragment.empty));
      return tr.setSelection(new TextSelection(pos(path, offset - 1)));
    }
    const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
    const leading = source.slice(lineStart, offset);
    if (leading.length > 1 && /^ +$/.test(leading)) {
      const remove = (leading.length - 1) % CODE_INDENT.length + 1;
      const tr = state.tr;
      tr.step(new ReplaceInlineStep(path, offset - remove, offset, Fragment.empty));
      return tr.setSelection(new TextSelection(pos(path, offset - remove)));
    }
    return null;
  };
  var splitBlock = (state) => {
    const selection = state.selection;
    if (!(selection instanceof TextSelection)) return null;
    const tr = state.tr;
    if (!selection.empty) deleteRange(tr, selection.from, selection.to);
    const point = selection.from;
    const block = nodeAtPath(tr.doc, point.path);
    if (!block?.isTextblock) return null;
    const paragraph = state.schema.nodes.paragraph;
    const atEnd = point.offset === inlineLength(block.content);
    const afterType = atEnd && paragraph && block.type !== paragraph ? paragraph.name : void 0;
    tr.step(new SplitNodeStep(point.path, point.offset, afterType));
    const parentPath = point.path.slice(0, -1);
    const index = point.path[point.path.length - 1];
    tr.setSelection(new TextSelection(pos([...parentPath, index + 1], 0)));
    return tr;
  };
  function insertContent(nodes) {
    return (state) => {
      if (nodes.length === 0) return null;
      const selection = state.selection;
      if (!(selection instanceof TextSelection)) return null;
      const tr = state.tr;
      if (!selection.empty) deleteRange(tr, selection.from, selection.to);
      const point = selection.from;
      const block = nodeAtPath(tr.doc, point.path);
      if (!block?.isTextblock) return null;
      const allInline = nodes.every((node) => node.isInline);
      const parentPath = point.path.slice(0, -1);
      const index = point.path[point.path.length - 1];
      const blockEmpty = inlineLength(block.content) === 0;
      if (!allInline && blockEmpty) {
        tr.step(new ReplaceNodesStep(parentPath, index, index + 1, Fragment.from(nodes)));
        tr.setSelection(selectionAfterBlocks(parentPath, index - 1, nodes));
        return tr;
      }
      const single = nodes.length === 1 ? nodes[0] : null;
      if (allInline || single?.isTextblock) {
        const source = allInline ? nodes : single.content.children;
        const inline = Fragment.from(coerceInlineFor(block.type, source));
        if (inline.childCount === 0) return null;
        const length = inlineLength(inline);
        tr.step(new ReplaceInlineStep(point.path, point.offset, point.offset, inline));
        tr.setSelection(new TextSelection(pos(point.path, point.offset + length)));
        return tr;
      }
      tr.step(new SplitNodeStep(point.path, point.offset));
      tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 1, Fragment.from(nodes)));
      tr.setSelection(selectionAfterBlocks(parentPath, index, nodes));
      return tr;
    };
  }
  function selectionAfterBlocks(parentPath, index, nodes) {
    const lastNode = nodes[nodes.length - 1];
    const lastPath = [...parentPath, index + nodes.length];
    return new TextSelection(
      lastNode.isTextblock ? pos(lastPath, inlineLength(lastNode.content)) : pos(parentPath, index + nodes.length + 1)
    );
  }
  var deleteCharBackward = (state) => {
    const selection = state.selection;
    if (!selection.empty) return deleteSelection(state);
    if (!(selection instanceof TextSelection)) return null;
    const point = selection.head;
    const block = nodeAtPath(state.doc, point.path);
    if (!block?.isTextblock) return null;
    const boundary = previousInlineBoundary(block.content, point.offset);
    if (boundary < 0) return joinBackward(state);
    const tr = state.tr;
    tr.step(new ReplaceInlineStep(point.path, boundary, point.offset, Fragment.empty));
    tr.setSelection(new TextSelection(pos(point.path, boundary)));
    return tr;
  };
  var deleteCharForward = (state) => {
    const selection = state.selection;
    if (!selection.empty) return deleteSelection(state);
    if (!(selection instanceof TextSelection)) return null;
    const point = selection.head;
    const block = nodeAtPath(state.doc, point.path);
    if (!block?.isTextblock) return null;
    const boundary = nextInlineBoundary(block.content, point.offset);
    if (boundary < 0) return joinForward(state);
    const tr = state.tr;
    tr.step(new ReplaceInlineStep(point.path, point.offset, boundary, Fragment.empty));
    tr.setSelection(new TextSelection(point));
    return tr;
  };
  var joinForward = (state) => {
    const selection = state.selection;
    if (!(selection instanceof TextSelection) || !selection.empty) return null;
    const point = selection.head;
    const block = nodeAtPath(state.doc, point.path);
    if (!block?.isTextblock || point.offset !== inlineLength(block.content)) return null;
    if (point.path.length === 0) return null;
    const index = point.path[point.path.length - 1];
    const parentPath = point.path.slice(0, -1);
    const next = nodeAtPath(state.doc, [...parentPath, index + 1]);
    if (!next) return null;
    const tr = state.tr;
    if (!next.isTextblock) {
      if (!next.isAtom) return null;
      tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 2, Fragment.empty));
      return tr;
    }
    tr.step(new JoinNodesStep(point.path, point.offset));
    tr.setSelection(new TextSelection(point));
    return tr;
  };
  var joinBackward = (state) => {
    const selection = state.selection;
    if (!(selection instanceof TextSelection) || !selection.empty) return null;
    const point = selection.head;
    if (point.offset !== 0 || point.path.length === 0) return null;
    const index = point.path[point.path.length - 1];
    if (index === 0) return null;
    const parentPath = point.path.slice(0, -1);
    const previousPath = [...parentPath, index - 1];
    const previous = nodeAtPath(state.doc, previousPath);
    if (!previous) return null;
    const tr = state.tr;
    if (!previous.isTextblock) {
      if (!previous.isAtom) return null;
      tr.step(new ReplaceNodesStep(parentPath, index - 1, index, Fragment.empty));
      return tr;
    }
    const joinOffset = inlineLength(previous.content);
    tr.step(new JoinNodesStep(previousPath, joinOffset));
    tr.setSelection(new TextSelection(pos(previousPath, joinOffset)));
    return tr;
  };
  function insertInlineNode(name, attrs) {
    return (state) => {
      const type = state.schema.nodeType(name);
      if (!type.isInline || !type.isAtom) return null;
      const selection = state.selection;
      if (!(selection instanceof TextSelection)) return null;
      const tr = state.tr;
      if (!selection.empty) deleteRange(tr, selection.from, selection.to);
      const point = selection.from;
      tr.step(
        new ReplaceInlineStep(
          point.path,
          point.offset,
          point.offset,
          Fragment.of(type.create(attrs))
        )
      );
      tr.setSelection(new TextSelection(pos(point.path, point.offset + 1)));
      return tr;
    };
  }
  function insertBlockAfter(name, attrs) {
    return (state) => {
      const type = state.schema.nodeType(name);
      if (type.isInline || type.inlineContent) return null;
      const selection = state.selection;
      const blockPath = selection.to.path;
      if (blockPath.length === 0) return null;
      const parentPath = blockPath.slice(0, -1);
      const index = blockPath[blockPath.length - 1];
      const tr = state.tr;
      tr.step(new ReplaceNodesStep(parentPath, index + 1, index + 1, Fragment.of(type.create(attrs))));
      return tr;
    };
  }
  function wrapIn(name, attrs) {
    return (state) => {
      const selection = state.selection;
      const blocks = blocksInRange(state.doc, selection.from, selection.to);
      const first = blocks[0];
      const last = blocks[blocks.length - 1];
      if (!first || !last) return null;
      const parentPath = first.path.slice(0, -1);
      if (!pathsEqual(parentPath, last.path.slice(0, -1))) return null;
      const from = first.path[first.path.length - 1];
      const to = last.path[last.path.length - 1] + 1;
      const tr = state.tr;
      tr.step(new WrapNodesStep(parentPath, from, to, name, attrs));
      return tr;
    };
  }
  var lift = (state) => {
    const selection = state.selection;
    const blockPath = selection.from.path;
    if (blockPath.length < 2) return null;
    const wrapperPath = blockPath.slice(0, -1);
    const wrapper = nodeAtPath(state.doc, wrapperPath);
    if (!wrapper || wrapper.isTextblock) return null;
    const tr = state.tr;
    tr.step(new LiftNodesStep(wrapperPath, wrapper.childCount));
    return tr;
  };
  var selectAll = (state) => {
    return state.tr.setSelection(new AllSelection(state.doc));
  };
  function isMarkActive(state, name) {
    const type = state.schema.marks[name];
    if (!type) return false;
    const selection = state.selection;
    if (selection.empty && selection instanceof TextSelection) {
      const block = nodeAtPath(state.doc, selection.head.path);
      if (!block?.isTextblock) return false;
      const current = state.storedMarks ?? marksAtInlineOffset(block.content, selection.head.offset);
      return current.some((mark) => mark.type === type);
    }
    const blocks = blocksInRange(state.doc, selection.from, selection.to).filter(
      (block) => block.from < block.to
    );
    return blocks.length > 0 && blocks.every((block) => rangeHasMark(block.node.content, block.from, block.to, type));
  }
  var ITEM_TYPES = {
    bulletList: "listItem",
    orderedList: "listItem",
    taskList: "taskItem"
  };
  var ITEM_TYPE_NAMES = new Set(Object.values(ITEM_TYPES));
  function isListItemTypeName(typeName) {
    return typeName !== void 0 && ITEM_TYPE_NAMES.has(typeName);
  }
  function itemTypeNameFor(listTypeName) {
    return ITEM_TYPES[listTypeName] ?? "listItem";
  }
  function listContextAt(doc, blockPath) {
    if (blockPath.length < 3) return null;
    const itemPath = blockPath.slice(0, -1);
    const item = nodeAtPath(doc, itemPath);
    if (!item || !ITEM_TYPE_NAMES.has(item.type.name)) return null;
    const listPath = itemPath.slice(0, -1);
    const list = nodeAtPath(doc, listPath);
    if (!list) return null;
    return { listPath, list, itemPath, item, itemIndex: itemPath[itemPath.length - 1] };
  }
  function toggleList(listTypeName) {
    return (state) => {
      const type = state.schema.nodeType(listTypeName);
      const selection = state.selection;
      const blocks = blocksInRange(state.doc, selection.from, selection.to);
      const first = blocks[0];
      const last = blocks[blocks.length - 1];
      if (!first || !last) return null;
      const tr = state.tr;
      const context = listContextAt(state.doc, first.path);
      if (context) {
        if (context.list.type === type) {
          const flat = context.list.content.children.flatMap((item) => item.content.children);
          tr.step(replaceNodeAt(context.listPath, Fragment.from(flat)));
          tr.setSelection(mapOutOfList(selection.from, selection.to, context));
        } else {
          const itemType2 = state.schema.nodeType(itemTypeNameFor(listTypeName));
          const items2 = context.list.content.children.map(
            (item) => item.type === itemType2 ? item : itemType2.create(void 0, item.content)
          );
          tr.step(
            replaceNodeAt(
              context.listPath,
              Fragment.of(type.create(void 0, Fragment.from(items2)))
            )
          );
          tr.setSelection(new TextSelection(selection.from, selection.to));
        }
        return tr;
      }
      const parentPath = first.path.slice(0, -1);
      if (!pathsEqual(parentPath, last.path.slice(0, -1))) return null;
      const parent = nodeAtPath(state.doc, parentPath);
      if (!parent) return null;
      const fromIndex = first.path[first.path.length - 1];
      const toIndex = last.path[last.path.length - 1] + 1;
      const itemType = state.schema.nodeType(itemTypeNameFor(listTypeName));
      const items = parent.content.children.slice(fromIndex, toIndex).map((block) => itemType.create(void 0, Fragment.of(block)));
      tr.step(
        new ReplaceNodesStep(
          parentPath,
          fromIndex,
          toIndex,
          Fragment.of(type.create(void 0, Fragment.from(items)))
        )
      );
      const intoList = (position) => {
        const index = position.path[position.path.length - 1];
        if (!pathsEqual(position.path.slice(0, -1), parentPath) || index < fromIndex || index >= toIndex) {
          return position;
        }
        return pos([...parentPath, fromIndex, index - fromIndex, 0], position.offset);
      };
      tr.setSelection(new TextSelection(intoList(selection.from), intoList(selection.to)));
      return tr;
    };
  }
  function mapOutOfList(from, to, context) {
    const map = (position) => {
      if (position.path.length !== context.listPath.length + 2) return position;
      if (!pathsEqual(position.path.slice(0, context.listPath.length), context.listPath))
        return position;
      const itemIndex = position.path[context.listPath.length];
      const blockIndex = position.path[context.listPath.length + 1];
      let flat = 0;
      for (let i = 0; i < itemIndex; i++) flat += context.list.content.child(i).childCount;
      const listIndex = context.listPath[context.listPath.length - 1];
      return pos([...context.listPath.slice(0, -1), listIndex + flat + blockIndex], position.offset);
    };
    return new TextSelection(map(from), map(to));
  }
  var splitListItem = (state) => {
    const selection = state.selection;
    if (!(selection instanceof TextSelection)) return null;
    const context = listContextAt(state.doc, selection.from.path);
    if (!context) return null;
    const point = selection.from;
    const blockIndex = point.path[point.path.length - 1];
    const currentBlock = nodeAtPath(state.doc, point.path);
    if (!currentBlock) return null;
    if (selection.empty && context.item.childCount === 1 && inlineLength(currentBlock.content) === 0) {
      return liftListItem(state);
    }
    const tr = state.tr;
    if (!selection.empty) deleteRange(tr, selection.from, selection.to);
    tr.step(new SplitNodeStep(point.path, point.offset));
    const item = nodeAtPath(tr.doc, context.itemPath);
    if (!item) return null;
    const moved = item.content.slice(blockIndex + 1);
    tr.step(new ReplaceNodesStep(context.itemPath, blockIndex + 1, item.childCount, Fragment.empty));
    const itemType = context.item.type;
    const newAttrs = "checked" in context.item.attrs ? { checked: false } : void 0;
    tr.step(
      new ReplaceNodesStep(
        context.listPath,
        context.itemIndex + 1,
        context.itemIndex + 1,
        Fragment.of(itemType.create(newAttrs, moved))
      )
    );
    tr.setSelection(new TextSelection(pos([...context.listPath, context.itemIndex + 1, 0], 0)));
    return tr;
  };
  var sinkListItem = (state) => {
    const selection = state.selection;
    const context = listContextAt(state.doc, selection.from.path);
    if (!context || context.itemIndex === 0) return null;
    const previous = context.list.content.child(context.itemIndex - 1);
    const lastChild = previous.content.maybeChild(previous.childCount - 1);
    const restPath = selection.from.path.slice(context.listPath.length + 1);
    let replacement;
    let newBlockPath;
    if (lastChild && lastChild.type === context.list.type) {
      const nested = lastChild.withContent(lastChild.content.append(Fragment.of(context.item)));
      replacement = previous.withContent(
        previous.content.replaceChild(previous.childCount - 1, nested)
      );
      newBlockPath = [
        ...context.listPath,
        context.itemIndex - 1,
        previous.childCount - 1,
        lastChild.childCount,
        ...restPath
      ];
    } else {
      const nested = context.list.type.create(void 0, Fragment.of(context.item));
      replacement = previous.withContent(previous.content.append(Fragment.of(nested)));
      newBlockPath = [...context.listPath, context.itemIndex - 1, previous.childCount, 0, ...restPath];
    }
    const tr = state.tr;
    tr.step(
      new ReplaceNodesStep(
        context.listPath,
        context.itemIndex - 1,
        context.itemIndex + 1,
        Fragment.of(replacement)
      )
    );
    tr.setSelection(new TextSelection(pos(newBlockPath, selection.from.offset)));
    return tr;
  };
  var liftListItem = (state) => {
    const selection = state.selection;
    const context = listContextAt(state.doc, selection.from.path);
    if (!context) return null;
    const items = context.list.content.children;
    const before = items.slice(0, context.itemIndex);
    const after = items.slice(context.itemIndex + 1);
    const blockIndex = selection.from.path[context.listPath.length + 1] ?? 0;
    const tr = state.tr;
    const parentItemPath = context.listPath.slice(0, -1);
    const parentItem = parentItemPath.length > 0 ? nodeAtPath(state.doc, parentItemPath) : null;
    if (parentItem && isListItemTypeName(parentItem.type.name)) {
      const listIndexInItem = context.listPath[context.listPath.length - 1];
      const outerPath = parentItemPath.slice(0, -1);
      const parentIndex = parentItemPath[parentItemPath.length - 1];
      const keptNested = before.length > 0 ? [context.list.withContent(Fragment.from(before))] : [];
      const newParent = parentItem.withContent(
        parentItem.content.replaceRange(
          listIndexInItem,
          listIndexInItem + 1,
          Fragment.from(keptNested)
        )
      );
      const carried = after.length > 0 ? [context.list.type.create(void 0, Fragment.from(after))] : [];
      const newItem = context.item.withContent(context.item.content.append(Fragment.from(carried)));
      tr.step(
        new ReplaceNodesStep(
          outerPath,
          parentIndex,
          parentIndex + 1,
          Fragment.of(newParent, newItem)
        )
      );
      tr.setSelection(
        new TextSelection(pos([...outerPath, parentIndex + 1, blockIndex], selection.from.offset))
      );
      return tr;
    }
    const replacement = [];
    if (before.length > 0) replacement.push(context.list.withContent(Fragment.from(before)));
    replacement.push(...context.item.content.children);
    if (after.length > 0) {
      replacement.push(context.list.type.create(void 0, Fragment.from(after)));
    }
    tr.step(replaceNodeAt(context.listPath, Fragment.from(replacement)));
    const listIndex = context.listPath[context.listPath.length - 1];
    const newIndex = listIndex + (before.length > 0 ? 1 : 0) + blockIndex;
    tr.setSelection(
      new TextSelection(pos([...context.listPath.slice(0, -1), newIndex], selection.from.offset))
    );
    return tr;
  };
  var toggleTaskList = toggleList("taskList");
  var toggleTaskChecked = (state) => {
    const context = listContextAt(state.doc, state.selection.from.path);
    if (context?.item.type.name !== "taskItem") return null;
    return state.tr.step(
      new SetNodeAttrsStep(context.itemPath, {
        ...context.item.attrs,
        checked: context.item.attrs.checked !== true
      })
    );
  };
  function setTaskChecked(itemPath, checked) {
    return (state) => {
      const item = nodeAtPath(state.doc, itemPath);
      if (item?.type.name !== "taskItem" || item.attrs.checked === checked) return null;
      return state.tr.step(new SetNodeAttrsStep(itemPath, { ...item.attrs, checked }));
    };
  }
  function setListStyle(style) {
    return (state) => {
      const context = listContextAt(state.doc, state.selection.from.path);
      if (!context) return null;
      if (style !== null && !listStylesFor(context.list.type.name).has(style)) return null;
      if (!("listStyle" in context.list.attrs)) return null;
      const attrs = { ...context.list.attrs, listStyle: style };
      if (attrsEq(context.list.attrs, attrs)) return null;
      return state.tr.step(new SetNodeAttrsStep(context.listPath, attrs));
    };
  }
  var restartNumbering = continueNumbering(1);
  var continueNumberingFromPrevious = (state) => {
    const context = listContextAt(state.doc, state.selection.from.path);
    if (context?.list.type.name !== "orderedList") return null;
    const parent = nodeAtPath(state.doc, context.listPath.slice(0, -1));
    if (!parent) return null;
    const index = context.listPath[context.listPath.length - 1];
    for (let i = index - 1; i >= 0; i--) {
      const sibling = parent.child(i);
      if (sibling.type.name !== "orderedList") continue;
      const start = typeof sibling.attrs.start === "number" ? sibling.attrs.start : 1;
      return continueNumbering(start + sibling.childCount)(state);
    }
    return null;
  };
  function continueNumbering(start) {
    return (state) => {
      const context = listContextAt(state.doc, state.selection.from.path);
      if (context?.list.type.name !== "orderedList") return null;
      const value = Math.round(start);
      if (!Number.isFinite(value) || context.list.attrs.start === value) return null;
      return state.tr.step(
        new SetNodeAttrsStep(context.listPath, { ...context.list.attrs, start: value })
      );
    };
  }
  var URL_IN_TEXT = /(?:https?:\/\/|www\.)[^\s<>"'`]{2,2000}/gi;
  var URL_TRAILING_PUNCTUATION = ".,;:!?'\"`)";
  function linkifyText(schema2, text, marks = []) {
    const type = schema2.marks.link;
    if (!type) return null;
    const nodes = [];
    let last = 0;
    for (const match of text.matchAll(URL_IN_TEXT)) {
      let url = match[0];
      while (url.length > 0 && URL_TRAILING_PUNCTUATION.includes(url[url.length - 1])) {
        url = url.slice(0, -1);
      }
      const href = safeHref(/^www\./i.test(url) ? `https://${url}` : url);
      if (!href || url.length === 0) continue;
      const start = match.index ?? 0;
      if (start > last) nodes.push(schema2.text(text.slice(last, start), marks));
      nodes.push(schema2.text(url, type.create({ href }).addToSet(marks)));
      last = start + url.length;
    }
    if (nodes.length === 0) return null;
    if (last < text.length) nodes.push(schema2.text(text.slice(last), marks));
    return nodes;
  }
  var ADD_TO_HISTORY = "addToHistory";
  var NEW_HISTORY_GROUP = "newHistoryGroup";
  var HISTORY_LABEL = "historyLabel";
  var History = class {
    undoStack = [];
    redoStack = [];
    groupDelay;
    depth;
    constructor(options = {}) {
      this.groupDelay = options.groupDelay ?? 500;
      this.depth = options.depth ?? 100;
    }
    get canUndo() {
      return this.undoStack.length > 0;
    }
    get canRedo() {
      return this.redoStack.length > 0;
    }
    /** Undo groups, oldest first: the last entry is what {@link undo} reverts next. */
    get undoEntries() {
      return this.undoStack.map(entryOf);
    }
    /** Redo groups; the last entry is what {@link redo} reapplies next. */
    get redoEntries() {
      return this.redoStack.map(entryOf);
    }
    /** Record a dispatched document-changing transaction. */
    record(tr, selectionBefore) {
      if (!tr.docChanged || tr.getMeta(ADD_TO_HISTORY) === false) return;
      const inverted = invertSteps(tr.steps, tr.docs);
      const label = labelFor(tr);
      const last = this.undoStack[this.undoStack.length - 1];
      if (last && tr.time - last.timestamp < this.groupDelay && tr.getMeta(NEW_HISTORY_GROUP) !== true) {
        last.steps = [...inverted, ...last.steps];
        last.timestamp = tr.time;
        last.at = tr.time;
        last.size += 1;
        if (last.label !== label) last.label = "Editing";
      } else {
        this.undoStack.push({
          steps: inverted,
          selectionBefore,
          timestamp: tr.time,
          at: tr.time,
          label,
          size: 1
        });
        if (this.undoStack.length > this.depth) this.undoStack.shift();
      }
      this.redoStack = [];
    }
    undo(state) {
      return this.move(state, this.undoStack, this.redoStack);
    }
    redo(state) {
      return this.move(state, this.redoStack, this.undoStack);
    }
    clear() {
      this.undoStack = [];
      this.redoStack = [];
    }
    move(state, from, to) {
      const group = from.pop();
      if (!group) return null;
      const exposed = from[from.length - 1];
      if (exposed) exposed.timestamp = 0;
      const tr = state.tr;
      for (const step of group.steps) tr.step(step);
      tr.setSelection(group.selectionBefore);
      tr.setMeta(ADD_TO_HISTORY, false);
      to.push({
        steps: invertSteps(tr.steps, tr.docs),
        selectionBefore: state.selection,
        timestamp: 0,
        // never merged with typing groups
        at: group.at,
        label: group.label,
        size: group.size
      });
      return tr;
    }
  };
  function entryOf(group) {
    return { label: group.label, timestamp: group.at, size: group.size };
  }
  function invertSteps(steps, docs) {
    return steps.map((step, i) => step.invert(docs[i])).reverse();
  }
  function labelFor(tr) {
    const custom = tr.getMeta(HISTORY_LABEL);
    if (typeof custom === "string" && custom.length > 0) return custom;
    const kinds = new Set(tr.steps.map(kindOf));
    if (kinds.has("structure")) return "Structure change";
    if (kinds.has("split")) return "Paragraph change";
    if (kinds.has("wrap")) return "Block change";
    if (kinds.has("attrs")) return "Block formatting";
    if (kinds.has("mark")) return "Text formatting";
    if (kinds.has("text")) return "Typing";
    return "Edit";
  }
  function kindOf(step) {
    if (step instanceof ReplaceInlineStep) return "text";
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return "mark";
    if (step instanceof SetNodeAttrsStep) return "attrs";
    if (step instanceof SplitNodeStep || step instanceof JoinNodesStep) return "split";
    if (step instanceof WrapNodesStep || step instanceof LiftNodesStep) return "wrap";
    if (step instanceof ReplaceNodesStep) return "structure";
    return "other";
  }
  function applyInputRules(state, typed, rules) {
    if (typed.length !== 1) return null;
    const selection = state.selection;
    if (!(selection instanceof TextSelection) || !selection.empty) return null;
    const point = selection.head;
    const block = nodeAtPath(state.doc, point.path);
    if (!block?.isTextblock) return null;
    if (block.type.spec.preserveWhitespace) return null;
    if (isInsideInlineCode(block, point.offset)) return null;
    if (block.content.children.some((child) => !child.isText)) return null;
    const textBefore = block.textContent.slice(0, point.offset);
    const candidate = textBefore + typed;
    for (const rule of rules) {
      const match = rule.match.exec(candidate);
      if (!match || match.index + match[0].length !== candidate.length) continue;
      const tr = rule.run(
        { state, blockPath: point.path, block, from: match.index, to: point.offset },
        match
      );
      if (tr) return tr.setMeta(NEW_HISTORY_GROUP, true);
    }
    return null;
  }
  function isInsideInlineCode(block, offset) {
    const marks = marksAtInlineOffset(block.content, offset);
    return marks.some((mark) => mark.type.name === "code");
  }
  function defaultInputRules(options = {}) {
    const rules = [
      // "## " → heading
      {
        match: /^(#{1,6}) $/,
        run: ({ state, blockPath, from, to }, match) => {
          const level = match[1].length;
          const tr = state.tr;
          tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty));
          const block = nodeAtPath(tr.doc, blockPath);
          if (!block) return null;
          tr.step(
            replaceNodeAt(
              blockPath,
              Fragment.of(state.schema.nodeType("heading").create({ level }, block.content))
            )
          );
          tr.setSelection(new TextSelection(pos(blockPath, 0)));
          return tr;
        }
      },
      // "- " / "* " / "+ " → bullet list; "1. " → ordered list
      {
        match: /^([-*+]) $/,
        run: (context) => wrapInList(context, "bulletList", void 0)
      },
      {
        match: /^(\d{1,9})\. $/,
        run: (context, match) => wrapInList(context, "orderedList", {
          start: Number.parseInt(match[1], 10)
        })
      },
      // "> " → blockquote
      {
        match: /^> $/,
        run: ({ state, blockPath, from, to }) => {
          const tr = state.tr;
          tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty));
          const parentPath = blockPath.slice(0, -1);
          const index = blockPath[blockPath.length - 1];
          tr.step(new WrapNodesStep(parentPath, index, index + 1, "blockquote"));
          tr.setSelection(new TextSelection(pos([...parentPath, index, 0], 0)));
          return tr;
        }
      },
      // "```" → code block
      {
        match: /^```$/,
        run: ({ state, blockPath, from, to }) => {
          const tr = state.tr;
          tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty));
          const block = nodeAtPath(tr.doc, blockPath);
          if (!block) return null;
          tr.step(
            replaceNodeAt(
              blockPath,
              Fragment.of(state.schema.nodeType("codeBlock").create(void 0, block.content))
            )
          );
          tr.setSelection(new TextSelection(pos(blockPath, 0)));
          return tr;
        }
      }
    ];
    if (options.autolink !== false) rules.push(autolinkRule());
    if (options.inlineCode !== false) rules.push(inlineCodeRule());
    if (options.emDash !== false) {
      rules.push({
        match: /--$/,
        run: ({ state, blockPath, from, to }) => {
          const tr = state.tr;
          tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.of(state.schema.text("\u2014"))));
          tr.setSelection(new TextSelection(pos(blockPath, from + 1)));
          return tr;
        }
      });
    }
    return rules;
  }
  function wrapInList(context, listTypeName, attrs) {
    const { state, blockPath, from, to } = context;
    if (context.block.type.name !== "paragraph") return null;
    const parentPath = blockPath.slice(0, -1);
    if (parentPath.length > 0 && isListItemTypeName(nodeAtPath(state.doc, parentPath)?.type.name)) {
      return null;
    }
    const tr = state.tr;
    tr.step(new ReplaceInlineStep(blockPath, from, to, Fragment.empty));
    const block = nodeAtPath(tr.doc, blockPath);
    if (!block) return null;
    const index = blockPath[blockPath.length - 1];
    const schema2 = state.schema;
    const item = schema2.nodeType("listItem").create(void 0, Fragment.of(block));
    tr.step(
      new ReplaceNodesStep(
        parentPath,
        index,
        index + 1,
        Fragment.of(schema2.nodeType(listTypeName).create(attrs, Fragment.of(item)))
      )
    );
    tr.setSelection(new TextSelection(pos([...parentPath, index, 0, 0], 0)));
    return tr;
  }
  var AUTOLINK = /(?:^|[\s(])((?:https?:\/\/|www\.)[^\s<>"'`]{2,2000})([\s)])$/i;
  function autolinkRule() {
    return {
      match: AUTOLINK,
      run: ({ state, blockPath, block, to }, match) => {
        const type = state.schema.markType("link");
        if (!block.type.allowsMarkType(type)) return null;
        const raw = match[1];
        const trailing = match[2];
        const url = trimTrailingPunctuation(raw);
        if (url.length === 0) return null;
        const href = safeHref(/^www\./i.test(url) ? `https://${url}` : url);
        if (!href) return null;
        const start = to - raw.length;
        if (start < 0) return null;
        const end = start + url.length;
        const tr = state.tr;
        tr.step(new AddMarkStep(blockPath, start, end, type.create({ href })));
        tr.step(new ReplaceInlineStep(blockPath, to, to, Fragment.of(state.schema.text(trailing))));
        tr.setSelection(new TextSelection(pos(blockPath, to + trailing.length)));
        return tr;
      }
    };
  }
  function inlineCodeRule() {
    return {
      match: /(?:^|[^`])`([^`]+)`$/,
      run: ({ state, blockPath, block, to }, match) => {
        const type = state.schema.marks.code;
        if (!type || !block.type.allowsMarkType(type)) return null;
        const inner = match[1];
        const start = to - inner.length - 1;
        if (start < 0) return null;
        const tr = state.tr;
        tr.step(
          new ReplaceInlineStep(
            blockPath,
            start,
            to,
            Fragment.of(state.schema.text(inner, [type.create()]))
          )
        );
        tr.setSelection(new TextSelection(pos(blockPath, start + inner.length)));
        return tr;
      }
    };
  }
  var TRAILING_PUNCTUATION = ".,;:!?'\"`";
  function trimTrailingPunctuation(url) {
    let end = url.length;
    while (end > 0) {
      const char = url[end - 1];
      if (char === ")") {
        const opens = (url.slice(0, end).match(/\(/g) ?? []).length;
        const closes = (url.slice(0, end).match(/\)/g) ?? []).length;
        if (opens >= closes) break;
        end -= 1;
        continue;
      }
      if (TRAILING_PUNCTUATION.includes(char)) {
        end -= 1;
        continue;
      }
      break;
    }
    return url.slice(0, end);
  }
  function characterCount(doc) {
    return textblocks(doc).reduce((sum, { node }) => sum + inlineLength(node.content), 0);
  }
  function wordCount(doc) {
    let count2 = 0;
    for (const { node } of textblocks(doc)) {
      count2 += blockText(node).split(/\s+/).filter((word) => word.length > 0).length;
    }
    return count2;
  }
  function sentenceCount(doc) {
    let count2 = 0;
    for (const { node } of textblocks(doc)) {
      const text = blockText(node).trim();
      if (text.length === 0) continue;
      count2 += Math.max(
        1,
        text.split(/[.!?…]+(?:\s+|$)/).filter((part) => part.trim().length > 0).length
      );
    }
    return count2;
  }
  function paragraphCount(doc) {
    let count2 = 0;
    for (const { node } of textblocks(doc)) {
      if (blockText(node).trim().length > 0) count2++;
    }
    return count2;
  }
  function blockText(node) {
    let text = "";
    for (const child of node.content.children) {
      text += child.isText ? child.text : " ";
    }
    return text;
  }
  function serializeToHTML(node, options = {}) {
    if (node.isText) return serializeText(node);
    const replacement = options.renderNode?.(node);
    if (replacement !== null && replacement !== void 0) return replacement;
    const spec = node.type.spec.toHTML?.(node);
    const children = node.content.children.map((child) => serializeToHTML(child, options)).join("");
    if (!spec) return children;
    return renderTag(spec, children);
  }
  function serializeText(node) {
    let html = escapeHTML(node.text);
    for (let i = node.marks.length - 1; i >= 0; i--) {
      const mark = node.marks[i];
      const spec = mark.type.spec.toHTML?.(mark);
      if (spec) html = renderTag(spec, html);
    }
    return html;
  }
  function renderTag(spec, children) {
    const attrs = Object.entries(spec.attrs ?? {}).map(([name, value]) => ` ${name}="${escapeHTML(value)}"`).join("");
    if (spec.isVoid) return `<${spec.tag}${attrs}>`;
    const body = children || spec.innerHTML || (spec.text ? escapeHTML(spec.text) : "");
    const inner = spec.childTag ? `<${spec.childTag}>${body}</${spec.childTag}>` : body;
    return `<${spec.tag}${attrs}>${inner}</${spec.tag}>`;
  }
  function escapeHTML(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function serializeToText(doc) {
    const lines = [];
    const walk = (node) => {
      if (node.isTextblock) {
        lines.push(node.textContent);
        return;
      }
      for (const child of node.content.children) walk(child);
    };
    walk(doc);
    return lines.join("\n");
  }
  var DANGEROUS_TAGS = /* @__PURE__ */ new Set([
    "script",
    "style",
    "iframe",
    "frame",
    "object",
    "embed",
    "applet",
    "link",
    "meta",
    "base",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "svg",
    "math",
    "template",
    "title",
    "head",
    "noscript"
  ]);
  var RuleSet = class {
    byTag = /* @__PURE__ */ new Map();
    add(owner, rule) {
      const list = this.byTag.get(rule.tag) ?? [];
      if (rule.attribute) list.unshift({ owner, rule });
      else list.push({ owner, rule });
      this.byTag.set(rule.tag, list);
    }
    /** Whether any rule claims this (lowercase) tag name. */
    hasTag(tag) {
      return this.byTag.has(tag);
    }
    /** First matching rule for an element, with resolved attributes. */
    match(element) {
      const list = this.byTag.get(element.tagName.toLowerCase());
      if (!list) return null;
      for (const { owner, rule } of list) {
        if (rule.attribute && !element.hasAttribute(rule.attribute)) continue;
        if (!rule.getAttrs) return { owner, attrs: null };
        const attrs = rule.getAttrs(element);
        if (attrs === false) continue;
        return { owner, attrs: attrs ?? null };
      }
      return null;
    }
  };
  var HTMLParser = class {
    constructor(schema2) {
      this.schema = schema2;
      for (const type of Object.values(schema2.nodes)) {
        for (const rule of type.spec.parseHTML ?? []) this.nodeRules.add(type, rule);
      }
      for (const type of Object.values(schema2.marks)) {
        for (const rule of type.spec.parseHTML ?? []) this.markRules.add(type, rule);
      }
    }
    schema;
    nodeRules = new RuleSet();
    markRules = new RuleSet();
    parse(root) {
      const children = this.parseChildren(root, [], false);
      const doc = this.schema.topType.create(void 0, Fragment.from(children));
      return normalizeDoc(doc);
    }
    /** Parse element children into a mixed node list; normalization sorts strays. */
    parseChildren(parent, marks, inlineContext) {
      const out = [];
      for (const child of [...parent.childNodes]) {
        out.push(...this.parseNode(child, marks, inlineContext));
      }
      return out;
    }
    parseNode(node, marks, inlineContext) {
      if (node.nodeType === 3) {
        const collapsed = (node.textContent ?? "").replace(/\s+/g, " ");
        if (collapsed === "") return [];
        if (collapsed === " ") {
          return inlineContext ? [this.schema.text(" ", marks)] : [];
        }
        return [this.schema.text(collapsed, marks)];
      }
      if (node.nodeType !== 1) return [];
      const element = node;
      const tag = element.tagName.toLowerCase();
      const dangerous = DANGEROUS_TAGS.has(tag);
      if (dangerous && !this.nodeRules.hasTag(tag)) return [];
      const markMatch = this.markRules.match(element);
      if (markMatch) {
        const mark = markMatch.owner.create(markMatch.attrs ?? void 0);
        return this.parseChildren(element, mark.addToSet(marks), inlineContext);
      }
      const nodeMatch = this.nodeRules.match(element);
      if (nodeMatch) {
        const type = nodeMatch.owner;
        const attrs = nodeMatch.attrs ?? void 0;
        if (type.spec.preserveWhitespace) {
          const text = element.textContent ?? "";
          const content = text ? Fragment.of(this.schema.text(text)) : Fragment.empty;
          return [type.create(attrs, content)];
        }
        if (!type.spec.content) {
          return [type.create(attrs)];
        }
        const inline = type.inlineContent;
        const children = this.parseChildren(element, inline ? marks : [], inline);
        if (inline) {
          const inlineChildren = children.filter((child) => child.isInline);
          return [type.create(attrs, mergeInline(Fragment.from(inlineChildren)))];
        }
        return [type.create(attrs, Fragment.from(children))];
      }
      if (dangerous) return [];
      return this.parseChildren(element, marks, inlineContext);
    }
  };
  var parserCache = /* @__PURE__ */ new WeakMap();
  function parseHTML(schema2, html, document2) {
    const dom = document2 ?? (typeof window !== "undefined" ? window.document : null);
    if (!dom) {
      throw new RangeError("parseHTML needs a DOM environment; pass a Document explicitly in Node");
    }
    const template = dom.createElement("template");
    template.innerHTML = html;
    let parser = parserCache.get(schema2);
    if (!parser) {
      parser = new HTMLParser(schema2);
      parserCache.set(schema2, parser);
    }
    return parser.parse(template.content);
  }
  var CONDITIONAL_COMMENT = /<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi;
  var XML_ISLAND = /<xml\b[^>]*>[\s\S]*?<\/xml>/gi;
  var STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
  var OFFICE_TAG = /<\/?[a-z]+:[a-z][^>]*>/gi;
  var STYLE_ATTRIBUTE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  var CLASS_ATTRIBUTE = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  var MSO_LIST_IGNORE = /<span\b[^>]*mso-list\s*:\s*ignore[^>]*>[\s\S]*?<\/span>/gi;
  var GOOGLE_BOLD_WRAPPER = /<b\b[^>]*id\s*=\s*"docs-internal-guid[^"]*"[^>]*>([\s\S]*)<\/b>/i;
  var NORMAL_WEIGHT = /^font-weight\s*:\s*(400|normal)$/i;
  var MSO_DECLARATION = /^\s*mso-/i;
  function detectPasteSource(html) {
    if (/id\s*=\s*"docs-internal-guid/i.test(html)) return "google-docs";
    if (/urn:schemas-microsoft-com:office:excel/i.test(html)) return "excel";
    if (/content\s*=\s*"?Microsoft Excel/i.test(html)) return "excel";
    if (/urn:schemas-microsoft-com:office:word/i.test(html)) return "word";
    if (/content\s*=\s*"?Microsoft Word/i.test(html)) return "word";
    if (/class\s*=\s*"?Mso[A-Z]/.test(html)) return "word";
    if (/\bmso-[a-z-]+\s*:/i.test(html)) return "word";
    return "html";
  }
  function cleanPastedHTML(html, source = detectPasteSource(html)) {
    if (source === "html") return html;
    let cleaned = html;
    if (source === "google-docs") {
      const wrapper = GOOGLE_BOLD_WRAPPER.exec(cleaned);
      if (wrapper?.[1] !== void 0) cleaned = wrapper[1];
    } else {
      cleaned = cleaned.replace(CONDITIONAL_COMMENT, "").replace(XML_ISLAND, "").replace(STYLE_BLOCK, "").replace(MSO_LIST_IGNORE, "").replace(OFFICE_TAG, "");
    }
    return cleaned.replace(STYLE_ATTRIBUTE, cleanStyleAttribute).replace(CLASS_ATTRIBUTE, cleanClassAttribute);
  }
  function cleanStyleAttribute(_match, doubled, single) {
    const kept = (doubled ?? single ?? "").split(";").map((declaration) => declaration.trim()).filter(
      (declaration) => declaration.length > 0 && !MSO_DECLARATION.test(declaration) && !NORMAL_WEIGHT.test(declaration)
    );
    return kept.length > 0 ? ` style="${kept.join("; ")}"` : "";
  }
  function cleanClassAttribute(_match, doubled, single, bare) {
    const kept = (doubled ?? single ?? bare ?? "").split(/\s+/).filter((name) => name.length > 0 && !/^Mso/.test(name));
    return kept.length > 0 ? ` class="${kept.join(" ")}"` : "";
  }
  var VISUALLY_HIDDEN = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";
  function createAnnouncer(document2, options = {}) {
    const clearAfterMs = options.clearAfterMs ?? 1e3;
    const root = document2.createElement("div");
    root.className = "trevixal-announcer";
    root.setAttribute("style", VISUALLY_HIDDEN);
    const regions = {
      polite: region(document2, "polite"),
      assertive: region(document2, "assertive")
    };
    root.append(regions.polite, regions.assertive);
    (options.container ?? document2.body)?.appendChild(root);
    let timer = null;
    return {
      element: root,
      announce(message, priority = "polite") {
        const text = message.trim();
        if (!text) return;
        const target = regions[priority] ?? regions.polite;
        if (timer !== null) clearTimeout(timer);
        target.textContent = "";
        target.textContent = text;
        timer = setTimeout(() => {
          target.textContent = "";
          timer = null;
        }, clearAfterMs);
      },
      clear() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        regions.polite.textContent = "";
        regions.assertive.textContent = "";
      },
      destroy() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        root.remove();
      }
    };
  }
  function region(document2, priority) {
    const element = document2.createElement("div");
    element.setAttribute("aria-live", priority);
    element.setAttribute("aria-atomic", "true");
    element.setAttribute("role", priority === "assertive" ? "alert" : "status");
    return element;
  }
  function count(n, singular) {
    return `${n} ${singular}${n === 1 ? "" : "s"}`;
  }
  function describeDocChange(before, after, blockTypeBefore, blockTypeAfter) {
    const removed = before.childCount - after.childCount;
    if (removed > 0) return `${count(removed, "block")} deleted`;
    if (blockTypeBefore && blockTypeAfter && blockTypeBefore !== blockTypeAfter) {
      return readableType(blockTypeAfter);
    }
    return null;
  }
  function readableType(name) {
    const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  var TEXT_NODE = 3;
  var ELEMENT_NODE = 1;
  function isNonContent(node) {
    if (node.nodeType !== ELEMENT_NODE) return false;
    const dataset = node.dataset;
    return dataset.trevixalPlaceholder === "true" || dataset.trevixalWidget === "true";
  }
  function modelAt(renderer, node) {
    return renderer.modelOf.get(node) ?? null;
  }
  function inlineDOMSize(renderer, node) {
    if (node.nodeType === TEXT_NODE) return (node.textContent ?? "").length;
    if (isNonContent(node)) return 0;
    const model = modelAt(renderer, node);
    if (model && !model.isText) return 1;
    let size = 0;
    for (const child of [...node.childNodes]) size += inlineDOMSize(renderer, child);
    return size;
  }
  function positionFromDOMPoint(root, renderer, domNode, domOffset) {
    let blockElement = null;
    for (let current = domNode; current && current !== root.parentNode; current = current.parentNode) {
      const model = current.nodeType === ELEMENT_NODE ? modelAt(renderer, current) : null;
      if (model?.isTextblock) {
        blockElement = current;
        break;
      }
      if (current === root) break;
    }
    if (!blockElement) {
      return positionInContainer(root, renderer, domNode, domOffset);
    }
    const path = pathOfElement(root, renderer, blockElement);
    if (!path) return null;
    const content = renderer.contentElementOf(blockElement);
    const offset = inlineOffsetOf(renderer, content, domNode, domOffset);
    return offset === null ? null : { path, offset };
  }
  function positionInContainer(root, renderer, container, index) {
    if (container.nodeType !== ELEMENT_NODE) return null;
    const children = [...container.children].filter(
      (child) => renderer.modelOf.get(child)
    );
    if (children.length === 0) return null;
    const atEnd = index >= children.length;
    const target = children[Math.min(index, children.length - 1)];
    if (!target) return null;
    const descend = (element) => {
      const model = renderer.modelOf.get(element);
      if (model?.isTextblock) {
        const path = pathOfElement(root, renderer, element);
        if (!path) return null;
        return { path, offset: atEnd ? inlineLength(model.content) : 0 };
      }
      const content = renderer.contentElementOf(element);
      const nested = [...content.children].filter(
        (child) => renderer.modelOf.get(child)
      );
      const next = atEnd ? nested[nested.length - 1] : nested[0];
      return next ? descend(next) : null;
    };
    return descend(target);
  }
  function pathOfElement(root, renderer, element) {
    const path = [];
    let current = element;
    while (current !== root) {
      const parent = current.parentElement;
      if (!parent) return null;
      let index = 0;
      let found = false;
      for (const sibling of [...parent.children]) {
        if (sibling === current) {
          found = true;
          break;
        }
        if (renderer.modelOf.get(sibling)) index++;
      }
      if (!found) return null;
      path.unshift(index);
      if (renderer.modelOf.get(parent) || parent === root) {
        current = parent;
      } else {
        const owner = parent.parentElement;
        if (!owner) return null;
        current = owner;
      }
    }
    return path;
  }
  function inlineOffsetOf(renderer, content, targetNode, targetOffset) {
    if (targetNode === content || targetNode.nodeType === ELEMENT_NODE) {
      if (targetNode === content || content.contains(targetNode)) {
        let sum = 0;
        if (targetNode !== content) {
          const before2 = offsetToNodeStart(renderer, content, targetNode);
          if (before2 === null) return null;
          sum = before2;
        }
        const children = [...targetNode.childNodes];
        for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
          sum += inlineDOMSize(renderer, children[i]);
        }
        return sum;
      }
      return null;
    }
    const before = offsetToNodeStart(renderer, content, targetNode);
    return before === null ? null : before + targetOffset;
  }
  function offsetToNodeStart(renderer, content, target) {
    let sum = 0;
    let found = false;
    const walk = (node) => {
      if (found) return;
      if (node === target) {
        found = true;
        return;
      }
      if (node.nodeType === TEXT_NODE) {
        sum += (node.textContent ?? "").length;
        return;
      }
      if (isNonContent(node)) return;
      const model = node !== content ? modelAt(renderer, node) : null;
      if (model && !model.isText && node !== content) {
        sum += 1;
        return;
      }
      for (const child of [...node.childNodes]) {
        walk(child);
        if (found) return;
      }
    };
    walk(content);
    return found ? sum : null;
  }
  function domPointFromPosition(root, renderer, position) {
    let element = root;
    for (const index of position.path) {
      const children = [...renderer.contentElementOf(element).children].filter(
        (child) => renderer.modelOf.get(child)
      );
      const next = children[index];
      if (!next) return null;
      element = next;
    }
    const model = renderer.modelOf.get(element);
    if (!model?.isTextblock) {
      const content2 = renderer.contentElementOf(element);
      return { node: content2, offset: Math.min(position.offset, content2.childNodes.length) };
    }
    const content = renderer.contentElementOf(element);
    let remaining = position.offset;
    let result = null;
    const walk = (node) => {
      if (node.nodeType === TEXT_NODE) {
        const length = (node.textContent ?? "").length;
        if (remaining <= length) {
          result = { node, offset: remaining };
          return true;
        }
        remaining -= length;
        return false;
      }
      if (isNonContent(node)) return false;
      const nodeModel = node !== content ? modelAt(renderer, node) : null;
      if (nodeModel && !nodeModel.isText) {
        if (remaining === 0) {
          const parent = node.parentNode;
          const index = [...parent.childNodes].indexOf(node);
          result = { node: parent, offset: index };
          return true;
        }
        remaining -= 1;
        return false;
      }
      for (const child of [...node.childNodes]) {
        if (walk(child)) return true;
      }
      return false;
    };
    if (walk(content) && result) return result;
    return { node: content, offset: content.childNodes.length };
  }
  function normalizeKeyName(name, isMac) {
    const parts = name.split("-");
    const key = parts.pop() ?? "";
    let mods = "";
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower === "mod") mods += isMac ? "m" : "c";
      else if (lower === "ctrl" || lower === "control") mods += "c";
      else if (lower === "meta" || lower === "cmd") mods += "m";
      else if (lower === "alt") mods += "a";
      else if (lower === "shift") mods += "s";
      else throw new RangeError(`Unknown modifier "${part}" in key binding "${name}"`);
    }
    return `${[...mods].sort().join("")}-${key.length === 1 ? key.toLowerCase() : key}`;
  }
  function eventKeyName(event) {
    let mods = "";
    if (event.altKey) mods += "a";
    if (event.ctrlKey) mods += "c";
    if (event.metaKey) mods += "m";
    if (event.shiftKey) mods += "s";
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    return `${[...mods].sort().join("")}-${key}`;
  }
  function keydownHandler(bindings, editor2, isMac) {
    const normalized = /* @__PURE__ */ new Map();
    for (const [name, binding] of Object.entries(bindings)) {
      normalized.set(normalizeKeyName(name, isMac), binding);
    }
    return (event) => {
      const binding = normalized.get(eventKeyName(event));
      if (!binding) return false;
      return binding(editor2);
    };
  }
  function baseKeymap() {
    return {
      "Mod-b": (editor2) => editor2.commands.toggleMark("bold"),
      "Mod-i": (editor2) => editor2.commands.toggleMark("italic"),
      "Mod-u": (editor2) => editor2.commands.toggleMark("underline"),
      "Mod-e": (editor2) => editor2.commands.toggleMark("code"),
      "Mod-z": (editor2) => editor2.commands.undo() || true,
      "Mod-Shift-z": (editor2) => editor2.commands.redo() || true,
      "Mod-y": (editor2) => editor2.commands.redo() || true,
      // In a code block these indent by two spaces; in a list they indent the
      // item; elsewhere they fall through to the browser, so Tab still moves
      // focus out of the editor the way keyboard users expect.
      Tab: (editor2) => editor2.exec(indentInPreformatted) || editor2.commands.sinkListItem(),
      "Shift-Tab": (editor2) => editor2.exec(outdentInPreformatted) || editor2.commands.liftListItem(),
      // Out of a code block from anywhere inside it; elsewhere the key is free.
      "Mod-Enter": (editor2) => editor2.exec(exitPreformatted)
    };
  }
  function decorationsEq(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((decoration, i) => {
      const other = b[i];
      return decoration.from === other.from && decoration.to === other.to && decoration.className === other.className && decoration.style === other.style && sameAttrs(decoration.attrs, other.attrs) && decoration.widget === other.widget;
    });
  }
  function sameAttrs(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
  }
  var DOMRenderer = class {
    constructor(document2, nodeViews = {}) {
      this.document = document2;
      this.nodeViews = nodeViews;
    }
    document;
    nodeViews;
    /** DOM element/text → the model node it renders. */
    modelOf = /* @__PURE__ */ new WeakMap();
    /** DOM element → the model node whose children it holds (differs for pre > code). */
    contentOf = /* @__PURE__ */ new WeakMap();
    /** Bumps when decorations change, invalidating otherwise-unchanged blocks. */
    epoch = 0;
    renderedEpoch = /* @__PURE__ */ new WeakMap();
    decorations = null;
    /** Decorations each content element last rendered with, for cheap change checks. */
    renderedDecorations = /* @__PURE__ */ new WeakMap();
    instances = /* @__PURE__ */ new WeakMap();
    /** Install a decoration source and invalidate rendered blocks. */
    setDecorations(source) {
      this.decorations = source;
      this.epoch++;
    }
    /** Sync the root element's children with the document node's children. */
    renderDoc(doc, root) {
      this.modelOf.set(root, doc);
      this.contentOf.set(root, root);
      this.patchChildren(root, doc.content);
    }
    /** The element that holds a rendered node's children. */
    contentElementOf(element) {
      return this.contentOf.get(element) ?? element;
    }
    isCurrent(element) {
      return this.renderedEpoch.get(element) === this.epoch;
    }
    /** Tear down node-view instances in a subtree about to leave the DOM. */
    destroyViews(element) {
      this.instances.get(element)?.destroy?.();
      for (const child of [...element.children]) this.destroyViews(child);
    }
    renderBlock(node) {
      const construct = this.nodeViews[node.type.name];
      if (construct) {
        const instance = construct(node);
        const element2 = instance.dom;
        this.modelOf.set(element2, node);
        this.contentOf.set(element2, instance.contentDOM ?? element2);
        this.renderedEpoch.set(element2, this.epoch);
        this.instances.set(element2, instance);
        if (instance.contentDOM) {
          if (node.isTextblock) this.renderInline(instance.contentDOM, node);
          else if (!node.isAtom) this.patchChildren(instance.contentDOM, node.content);
        } else {
          element2.contentEditable = "false";
        }
        return element2;
      }
      const spec = node.type.spec.toHTML?.(node);
      const element = this.document.createElement(spec?.tag ?? "div");
      for (const [name, value] of Object.entries(spec?.attrs ?? {})) {
        element.setAttribute(name, value);
      }
      let content = element;
      if (spec?.childTag) {
        content = this.document.createElement(spec.childTag);
        element.appendChild(content);
      }
      this.modelOf.set(element, node);
      this.contentOf.set(element, content);
      this.renderedEpoch.set(element, this.epoch);
      if (node.isAtom) {
        element.contentEditable = "false";
        this.renderAtomBody(content, spec);
        return element;
      }
      if (node.isTextblock) {
        this.renderInline(content, node);
      } else {
        this.patchChildren(content, node.content);
      }
      return element;
    }
    /** Rebuild a textblock's inline DOM, splitting runs at decoration edges. */
    renderInline(content, block) {
      while (content.firstChild) content.removeChild(content.firstChild);
      const frag = block.content;
      const decorations = this.decorations?.(block) ?? [];
      this.renderedDecorations.set(content, decorations);
      const ranges = decorations.filter((decoration) => decoration.to > decoration.from);
      const widgets = decorations.filter((decoration) => decoration.widget).sort((a, b) => a.from - b.from);
      let widgetIndex = 0;
      const flushWidgets = (upTo) => {
        while (widgetIndex < widgets.length) {
          const decoration = widgets[widgetIndex];
          if (decoration.from > upTo) break;
          widgetIndex++;
          const wrapper = this.document.createElement("span");
          wrapper.className = decoration.className;
          if (decoration.style) wrapper.setAttribute("style", decoration.style);
          for (const [name, value] of Object.entries(decoration.attrs ?? {})) {
            wrapper.setAttribute(name, value);
          }
          wrapper.contentEditable = "false";
          wrapper.dataset.trevixalWidget = "true";
          const inner = decoration.widget?.();
          if (inner) wrapper.appendChild(inner);
          content.appendChild(wrapper);
        }
      };
      let offset = 0;
      for (const child of frag.children) {
        const size = inlineSize(child);
        if (!child.isText) {
          flushWidgets(offset);
          const spec = child.type.spec.toHTML?.(child);
          const atom = this.document.createElement(spec?.tag ?? "span");
          for (const [name, value] of Object.entries(spec?.attrs ?? {})) {
            atom.setAttribute(name, value);
          }
          if (spec?.innerHTML !== void 0 || spec?.text) {
            this.renderAtomBody(atom, spec);
            atom.contentEditable = "false";
          }
          this.modelOf.set(atom, child);
          content.appendChild(atom);
          offset += size;
          continue;
        }
        const text = child;
        for (const [from, to] of segmentRange(offset, offset + size, decorations)) {
          flushWidgets(from);
          const piece = text.cut(from - offset, to - offset);
          const rendered = this.renderTextRun(piece);
          const covering = ranges.filter(
            (decoration) => decoration.from <= from && decoration.to >= to
          );
          if (covering.length > 0) {
            const span = this.document.createElement("span");
            span.className = covering.map((decoration) => decoration.className).join(" ");
            const style = covering.map((decoration) => decoration.style).filter(Boolean).join(";");
            if (style) span.setAttribute("style", style);
            for (const decoration of covering) {
              for (const [name, value] of Object.entries(decoration.attrs ?? {})) {
                span.setAttribute(name, value);
              }
            }
            span.appendChild(rendered);
            content.appendChild(span);
          } else {
            content.appendChild(rendered);
          }
        }
        offset += size;
      }
      flushWidgets(offset);
      if (frag.childCount === 0) {
        const br = this.document.createElement("br");
        br.dataset.trevixalPlaceholder = "true";
        content.appendChild(br);
      }
    }
    renderTextRun(node) {
      let rendered = this.document.createTextNode(node.text);
      this.modelOf.set(rendered, node);
      for (let i = node.marks.length - 1; i >= 0; i--) {
        const mark = node.marks[i];
        const spec = mark.type.spec.toHTML?.(mark);
        if (!spec) continue;
        const wrapper = this.document.createElement(spec.tag);
        for (const [name, value] of Object.entries(spec.attrs ?? {})) {
          wrapper.setAttribute(name, value);
        }
        wrapper.appendChild(rendered);
        rendered = wrapper;
      }
      return rendered;
    }
    /** Diff an element's children against a block-level fragment. */
    patchChildren(parent, frag) {
      const oldElements = [...parent.children];
      const oldNodes = oldElements.map((element) => this.modelOf.get(element) ?? null);
      const next = frag.children;
      const unchanged = (index, newIndex) => {
        const element = oldElements[index];
        return element !== void 0 && oldNodes[index] === next[newIndex] && this.isCurrent(element);
      };
      let start = 0;
      while (start < oldNodes.length && start < next.length && unchanged(start, start)) start++;
      let oldEnd = oldNodes.length;
      let newEnd = next.length;
      while (oldEnd > start && newEnd > start && unchanged(oldEnd - 1, newEnd - 1)) {
        oldEnd--;
        newEnd--;
      }
      const shared = Math.min(oldEnd - start, newEnd - start);
      for (let k = 0; k < shared; k++) {
        const element = oldElements[start + k];
        const oldNode = oldNodes[start + k];
        const node = next[start + k];
        if (!element || !node) continue;
        const isView = this.instances.has(element);
        const tag = (node.type.spec.toHTML?.(node)?.tag ?? "div").toUpperCase();
        if (oldNode && oldNode.type === node.type && (isView || element.tagName === tag)) {
          if (!this.patchElement(element, node)) {
            this.destroyViews(element);
            parent.replaceChild(this.renderBlock(node), element);
          }
        } else {
          this.destroyViews(element);
          parent.replaceChild(this.renderBlock(node), element);
        }
      }
      const suffixAnchor = oldElements[oldEnd] ?? null;
      for (let i = start + shared; i < newEnd; i++) {
        const node = next[i];
        if (node) parent.insertBefore(this.renderBlock(node), suffixAnchor);
      }
      for (let i = start + shared; i < oldEnd; i++) {
        const element = oldElements[i];
        if (!element) continue;
        this.destroyViews(element);
        element.remove();
      }
    }
    /** Update an element in place; false means the caller must rebuild it. */
    patchElement(element, node) {
      const previous = this.modelOf.get(element);
      const wasCurrent = this.isCurrent(element);
      if (previous === node && wasCurrent) return true;
      const instance = this.instances.get(element);
      if (instance) {
        if (!instance.update || !instance.update(node)) return false;
        this.modelOf.set(element, node);
        this.renderedEpoch.set(element, this.epoch);
        if (instance.contentDOM && !node.isAtom) {
          if (node.isTextblock) {
            if (this.inlineNeedsRender(instance.contentDOM, previous, wasCurrent, node)) {
              this.renderInline(instance.contentDOM, node);
            }
          } else {
            this.patchChildren(instance.contentDOM, node.content);
          }
        }
        return true;
      }
      const spec = node.type.spec.toHTML?.(node);
      const nextAttrs = spec?.attrs ?? {};
      if (previous) {
        const oldAttrs = previous.type.spec.toHTML?.(previous)?.attrs ?? {};
        for (const name of Object.keys(oldAttrs)) {
          if (!(name in nextAttrs)) element.removeAttribute(name);
        }
      }
      for (const [name, value] of Object.entries(nextAttrs)) {
        if (element.getAttribute(name) !== value) element.setAttribute(name, value);
      }
      this.modelOf.set(element, node);
      this.renderedEpoch.set(element, this.epoch);
      const content = this.contentElementOf(element);
      if (node.isAtom) {
        const previousSpec = previous ? previous.type.spec.toHTML?.(previous) : void 0;
        if (spec?.innerHTML !== previousSpec?.innerHTML || spec?.text !== previousSpec?.text) {
          this.renderAtomBody(content, spec);
        }
      } else if (node.isTextblock) {
        if (this.inlineNeedsRender(content, previous, wasCurrent, node)) {
          this.renderInline(content, node);
        }
      } else {
        this.patchChildren(content, node.content);
      }
      return true;
    }
    /** Fill an atom's element from its spec: trusted markup, or a text label. */
    renderAtomBody(element, spec) {
      if (spec?.innerHTML !== void 0) element.innerHTML = spec.innerHTML;
      else if (spec?.text !== void 0) element.textContent = spec.text;
      else element.textContent = "";
    }
    /**
     * A textblock's inline DOM must be rebuilt when its content changed, or
     * when the decorations it renders with changed, either from an epoch bump
     * or because this node itself is different. A decoration source may key off
     * a node's attributes (a code block's `language`, say), so identical
     * content is not on its own enough to reuse the rendered inline DOM.
     */
    inlineNeedsRender(content, previous, wasCurrent, node) {
      if (!previous || !previous.content.eq(node.content)) return true;
      if (wasCurrent && previous === node) return false;
      const next = this.decorations?.(node) ?? [];
      return !decorationsEq(this.renderedDecorations.get(content) ?? [], next);
    }
  };
  function segmentRange(from, to, decorations) {
    const cuts = /* @__PURE__ */ new Set([from, to]);
    for (const decoration of decorations) {
      if (decoration.from > from && decoration.from < to) cuts.add(decoration.from);
      if (decoration.to > from && decoration.to < to) cuts.add(decoration.to);
    }
    const sorted = [...cuts].sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      segments.push([sorted[i], sorted[i + 1]]);
    }
    return segments;
  }
  var TREVIXAL_MIME = "application/x-trevixal+json";
  var BARE_URL = /^(?:https?:\/\/|www\.)[^\s<>"'`]{2,2000}$/i;
  function detectMac() {
    if (typeof navigator === "undefined") return false;
    const platform = navigator.platform ?? "";
    return /Mac|iP(hone|ad|od)/.test(platform || navigator.userAgent || "");
  }
  var TEXT_NODE2 = 3;
  var EditorView = class {
    constructor(editor2, place, options = {}) {
      this.editor = editor2;
      this.document = place.ownerDocument;
      this.dom = this.document.createElement("div");
      this.dom.className = "trevixal-content";
      this.dom.setAttribute("role", "textbox");
      this.dom.setAttribute("aria-multiline", "true");
      this.dom.setAttribute("aria-label", options.ariaLabel ?? "Document");
      const constructors = {};
      for (const [name, factory] of Object.entries(options.nodeViews ?? {})) {
        constructors[name] = (node) => factory(node, editor2);
      }
      this.renderer = new DOMRenderer(this.document, constructors);
      if (!editor2.view) editor2.view = this;
      this.inputRules = options.inputRules ?? defaultInputRules();
      this.announcer = options.announce === false ? null : createAnnouncer(this.document, { container: place });
      this.stopAnnouncing = this.announcer ? this.watchForAnnouncements(this.announcer) : null;
      this.placeholder = options.placeholder ?? null;
      if (this.placeholder) this.dom.dataset.trevixalPlaceholder = this.placeholder;
      place.appendChild(this.dom);
      this.setEditable(options.editable !== false);
      if (options.spellcheck !== void 0) this.setSpellcheck(options.spellcheck);
      this.handleKey = keydownHandler(
        {
          ...baseKeymap(),
          "Mod-Shift-v": () => {
            this.pastePlainOnce = true;
            return false;
          },
          ...options.keymap ?? {}
        },
        editor2,
        detectMac()
      );
      this.dom.addEventListener("beforeinput", this.onBeforeInput);
      this.dom.addEventListener("mousedown", this.onMouseDown);
      this.dom.addEventListener("keydown", this.onKeyDown);
      this.dom.addEventListener("compositionstart", this.onCompositionStart);
      this.dom.addEventListener("compositionend", this.onCompositionEnd);
      this.dom.addEventListener("copy", this.onCopy);
      this.dom.addEventListener("cut", this.onCut);
      this.dom.addEventListener("paste", this.onPaste);
      this.document.addEventListener("selectionchange", this.onSelectionChange);
      if (typeof MutationObserver !== "undefined") {
        this.observer = new MutationObserver(this.onMutations);
        this.observer.observe(this.dom, { childList: true, characterData: true, subtree: true });
      }
      this.unsubscribe = editor2.on("transaction", () => this.update());
      this.update();
      if (options.autofocus) this.focus();
    }
    editor;
    dom;
    /** Advanced API: the renderer's DOM↔model mapping, used by adapters. */
    renderer;
    document;
    handleKey;
    unsubscribe;
    inputRules;
    placeholder;
    observer = null;
    composing = false;
    updatingDOM = false;
    destroyed = false;
    editable = true;
    pastePlainOnce = false;
    highlights = [];
    decorationLayers = /* @__PURE__ */ new Map();
    keydownInterceptors = /* @__PURE__ */ new Set();
    announcer;
    stopAnnouncing;
    /** Re-render from the editor state and push the selection into the DOM. */
    update() {
      if (this.destroyed || this.composing) return;
      this.withDOMUpdate(() => this.renderer.renderDoc(this.editor.state.doc, this.dom));
      this.updatePlaceholder();
      this.syncSelectionToDOM();
    }
    /** Toggle read-only mode. */
    setEditable(editable) {
      this.editable = editable;
      this.dom.contentEditable = String(editable);
      this.dom.setAttribute("aria-readonly", String(!editable));
    }
    get isEditable() {
      return this.editable;
    }
    /**
     * Turn the browser's spell checking of the surface on or off. Set as the
     * content attribute rather than the IDL property, so it survives a DOM that
     * does not reflect `spellcheck` (and shows up in the markup for tests).
     *
     * Switching it off is enough on its own. The browser drops the marks it has
     * already drawn. Switching it back on is not: the text is not new to the
     * spell checker, so nothing is re-scanned and the surface stays unmarked
     * until the next edit happens to touch a block. `refreshTextNodes` below is
     * what makes it look new.
     */
    setSpellcheck(enabled) {
      const changed = this.spellcheck !== enabled;
      this.dom.setAttribute("spellcheck", String(enabled));
      if (!changed || !enabled) return;
      this.withDOMUpdate(() => this.refreshTextNodes(this.dom));
      this.syncSelectionToDOM();
    }
    /**
     * Swap every rendered text node for an identical fresh one, so the browser
     * treats the text as newly arrived and spell checks it again. Only text is
     * replaced: elements keep their identity, so a node view, an embedded
     * iframe, a diagram, is not torn down and rebuilt behind the user's back.
     *
     * Nothing cheaper works. Flipping the attribute, a blur/focus cycle,
     * detaching the surface and re-toggling `contenteditable` all leave the
     * existing text unchecked.
     */
    refreshTextNodes(parent) {
      for (const child of [...parent.childNodes]) {
        if (child.nodeType !== TEXT_NODE2) {
          this.refreshTextNodes(child);
          continue;
        }
        const fresh = this.document.createTextNode(child.textContent ?? "");
        const model = this.renderer.modelOf.get(child);
        if (model) this.renderer.modelOf.set(fresh, model);
        child.replaceWith(fresh);
      }
    }
    /** Whether the surface is spell checked; the browser default until set. */
    get spellcheck() {
      return this.dom.getAttribute("spellcheck") !== "false";
    }
    /**
     * Highlight inline ranges (find & replace matches) as decorations, never
     * stored in the document. Pass an empty array to clear.
     */
    setHighlights(matches) {
      this.highlights = matches;
      if (matches.length === 0) {
        this.setDecorationLayer("search", null);
        return;
      }
      const byNode = /* @__PURE__ */ new WeakMap();
      for (const match of matches) {
        const node = nodeAtPath(this.editor.state.doc, match.path);
        if (!node) continue;
        const list = byNode.get(node) ?? [];
        list.push({ from: match.from, to: match.to, className: "trevixal-search-match" });
        byNode.set(node, list);
      }
      this.setDecorationLayer("search", (node) => byNode.get(node) ?? null);
    }
    get currentHighlights() {
      return this.highlights;
    }
    /**
     * Install (or clear, with `null`) an independent decoration layer.
     * Extensions each own a key: code highlighting, search matches and
     * track-change ranges compose without clobbering one another.
     */
    setDecorationLayer(key, source) {
      if (source) this.decorationLayers.set(key, source);
      else if (!this.decorationLayers.delete(key)) return;
      if (this.decorationLayers.size === 0) {
        this.renderer.setDecorations(null);
      } else {
        const layers = [...this.decorationLayers.values()];
        this.renderer.setDecorations((node) => {
          let result = null;
          for (const layer of layers) {
            const decorations = layer(node);
            if (decorations && decorations.length > 0) {
              result = result ? result.concat(decorations) : [...decorations];
            }
          }
          return result;
        });
      }
      this.update();
    }
    /**
     * Intercept keydown before the keymap runs; return true to consume the
     * event (suggestion popups take Enter/Arrows while open). Returns a
     * disposer.
     */
    addKeydownInterceptor(interceptor) {
      this.keydownInterceptors.add(interceptor);
      return () => this.keydownInterceptors.delete(interceptor);
    }
    updatePlaceholder() {
      if (!this.placeholder) return;
      const doc = this.editor.state.doc;
      const empty = doc.childCount === 1 && doc.child(0).isTextblock && inlineLength(doc.child(0).content) === 0;
      if (empty) {
        this.dom.dataset.trevixalEmpty = "true";
      } else {
        delete this.dom.dataset.trevixalEmpty;
      }
    }
    /**
     * Give the surface keyboard focus **without moving the page**.
     *
     * A bare `HTMLElement.focus()` scrolls the caret into view, and the caret
     * can be thousands of pixels from whatever the reader is actually looking
     * at. Every caller of this method is handing focus back after a piece of
     * chrome took it (a menu, the command palette, a dialog) and none of them
     * means "take me to the caret": the page simply jumped. So focus moves and
     * the viewport does not. To deliberately reveal the caret, which is a
     * different intention, call {@link scrollSelectionIntoView}.
     */
    focus() {
      this.syncSelectionToDOM();
      this.withDOMUpdate(() => this.dom.focus({ preventScroll: true }));
      this.syncSelectionToDOM();
    }
    /**
     * Scroll the caret into view, the least the scrollers involved allow.
     *
     * The counterpart to {@link focus}: navigation (an outline entry, a search
     * hit) means to move the reader, so it says so rather than relying on a
     * side effect of focusing.
     */
    scrollSelectionIntoView(options = { block: "nearest" }) {
      const point = domPointFromPosition(this.dom, this.renderer, this.editor.state.selection.from);
      const node = point?.node;
      const element = node instanceof Element ? node : node?.parentElement ?? null;
      element?.scrollIntoView?.(options);
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.unsubscribe();
      this.observer?.disconnect();
      this.dom.removeEventListener("beforeinput", this.onBeforeInput);
      this.dom.removeEventListener("mousedown", this.onMouseDown);
      this.dom.removeEventListener("keydown", this.onKeyDown);
      this.dom.removeEventListener("compositionstart", this.onCompositionStart);
      this.dom.removeEventListener("compositionend", this.onCompositionEnd);
      this.dom.removeEventListener("copy", this.onCopy);
      this.dom.removeEventListener("cut", this.onCut);
      this.dom.removeEventListener("paste", this.onPaste);
      this.document.removeEventListener("selectionchange", this.onSelectionChange);
      for (const child of [...this.dom.children]) {
        this.renderer.destroyViews(child);
      }
      this.stopAnnouncing?.();
      this.announcer?.destroy();
      this.dom.remove();
      if (this.editor.view === this) this.editor.view = null;
    }
    /**
     * Say out loud what the DOM alone does not report. Structural only. See
     * {@link describeDocChange} for why this is deliberately quiet.
     */
    watchForAnnouncements(announcer) {
      const blockTypeAt = (state) => nodeAtPath(state.doc, state.selection.from.path)?.type.name ?? null;
      return this.editor.onTransaction(({ before, state }) => {
        if (this.destroyed) return;
        const message = describeDocChange(
          before.doc,
          state.doc,
          blockTypeAt(before),
          blockTypeAt(state)
        );
        if (message) announcer.announce(message);
      });
    }
    // -------------------------------------------------------------- rendering
    withDOMUpdate(fn) {
      this.updatingDOM = true;
      try {
        fn();
      } finally {
        this.observer?.takeRecords();
        this.updatingDOM = false;
      }
    }
    // -------------------------------------------------------------- selection
    syncSelectionToDOM() {
      const selection = this.editor.state.selection;
      if (!(selection instanceof TextSelection)) return;
      const domSelection = this.document.getSelection?.();
      if (!domSelection || typeof domSelection.setBaseAndExtent !== "function") return;
      const anchor = domPointFromPosition(this.dom, this.renderer, selection.anchor);
      const head = domPointFromPosition(this.dom, this.renderer, selection.head);
      if (!anchor || !head) return;
      if (domSelection.anchorNode === anchor.node && domSelection.anchorOffset === anchor.offset && domSelection.focusNode === head.node && domSelection.focusOffset === head.offset) {
        return;
      }
      const active = this.document.activeElement;
      if (active !== this.dom && !this.dom.contains(active)) return;
      try {
        this.withDOMUpdate(() => {
          domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
        });
      } catch {
      }
    }
    /**
     * Pull the browser selection into the model. `selectionchange` is
     * asynchronous, so anything acting outside the input pipeline, a toolbar
     * button, which suppresses focus changes, must call this first to avoid
     * operating on a stale selection.
     */
    syncSelectionFromDOM() {
      this.onSelectionChange();
    }
    /** Read the DOM selection into the editor state (idempotent). */
    onSelectionChange = () => {
      if (this.destroyed || this.composing || this.updatingDOM) return;
      const domSelection = this.document.getSelection?.();
      const anchorNode = domSelection?.anchorNode;
      if (!domSelection || !anchorNode || !this.dom.contains(anchorNode)) return;
      const anchor = positionFromDOMPoint(
        this.dom,
        this.renderer,
        anchorNode,
        domSelection.anchorOffset
      );
      const head = domSelection.focusNode ? positionFromDOMPoint(
        this.dom,
        this.renderer,
        domSelection.focusNode,
        domSelection.focusOffset
      ) : anchor;
      if (!anchor || !head) return;
      const next = new TextSelection(anchor, head);
      if (this.editor.state.selection.eq(next)) return;
      this.editor.dispatch(this.editor.state.tr.setSelection(next));
    };
    // ------------------------------------------------------------------ input
    /**
     * A task item's checkbox is a CSS marker in the item's left gutter, not a
     * real `<input>`. An input inside contenteditable would take focus, sit in
     * the model's coordinate space and have to be kept in sync. That leaves
     * geometry as the way to recognise a click on it: a press whose target is
     * the `<li>` itself (the gutter holds no text) and whose x falls left of
     * the content box is a checkbox press.
     *
     * `mousedown` rather than `click`, and preventDefault, so the browser never
     * moves the caret into the item, toggling a task must not disturb where
     * the user was typing.
     */
    onMouseDown = (event) => {
      if (this.destroyed || !this.editable || event.button !== 0) return;
      const target = event.target;
      if (!target || target.nodeType !== 1) return;
      const element = target;
      const model = this.renderer.modelOf.get(element);
      if (model?.type.name !== "taskItem") return;
      const box = element.getBoundingClientRect();
      const gutter = Number.parseFloat(
        (element.ownerDocument.defaultView?.getComputedStyle(element).paddingLeft ?? "0") || "0"
      );
      const inGutter = Number.isFinite(gutter) ? event.clientX < box.left + gutter : event.clientX < box.left;
      if (!inGutter) return;
      const path = pathOfElement(this.dom, this.renderer, element);
      if (!path) return;
      event.preventDefault();
      this.editor.exec(setTaskChecked(path, model.attrs.checked !== true));
    };
    onKeyDown = (event) => {
      if (this.destroyed || this.composing || !this.editable) return;
      this.onSelectionChange();
      for (const interceptor of this.keydownInterceptors) {
        if (interceptor(event)) {
          event.preventDefault();
          return;
        }
      }
      if (this.handleKey(event)) event.preventDefault();
    };
    onBeforeInput = (event) => {
      if (this.destroyed) return;
      if (!this.editable) {
        event.preventDefault();
        return;
      }
      const type = event.inputType;
      if (this.composing || type === "insertCompositionText") return;
      this.onSelectionChange();
      const consume = (command) => {
        event.preventDefault();
        if (command) this.editor.exec(command);
      };
      switch (type) {
        case "insertText":
        case "insertReplacementText": {
          const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
          if (!text) {
            event.preventDefault();
            break;
          }
          const ruleTr = applyInputRules(this.editor.state, text, this.inputRules);
          if (ruleTr) {
            event.preventDefault();
            this.editor.dispatch(ruleTr);
            break;
          }
          consume(chainCommands(typeInPreformatted(text), insertText(text)));
          break;
        }
        case "insertParagraph":
          consume(chainCommands(splitBlockInPreformatted, splitListItem, splitBlock));
          break;
        case "insertLineBreak":
          consume(chainCommands(insertNewlineInPreformatted, insertInlineNode("hardBreak")));
          break;
        case "deleteContentBackward":
          consume(chainCommands(deleteBackwardInPreformatted, deleteCharBackward));
          break;
        case "deleteWordBackward":
        case "deleteSoftLineBackward":
          consume(deleteCharBackward);
          break;
        case "deleteContentForward":
        case "deleteWordForward":
          consume(deleteCharForward);
          break;
        case "deleteByCut":
        case "deleteByDrag":
          consume(deleteSelection);
          break;
        case "historyUndo":
          event.preventDefault();
          this.editor.undo();
          break;
        case "historyRedo":
          event.preventDefault();
          this.editor.redo();
          break;
        case "formatBold":
          consume(toggleMark("bold"));
          break;
        case "formatItalic":
          consume(toggleMark("italic"));
          break;
        case "formatUnderline":
          consume(toggleMark("underline"));
          break;
        case "insertFromPaste": {
          event.preventDefault();
          if (event.dataTransfer) this.insertFromClipboard(event.dataTransfer);
          break;
        }
        default:
          event.preventDefault();
      }
    };
    // -------------------------------------------------------------- clipboard
    onCopy = (event) => {
      if (this.destroyed || !event.clipboardData) return;
      if (this.writeClipboard(event.clipboardData)) event.preventDefault();
    };
    onCut = (event) => {
      if (this.destroyed || !event.clipboardData) return;
      if (!this.writeClipboard(event.clipboardData)) return;
      event.preventDefault();
      if (this.editable) this.editor.exec(deleteSelection);
    };
    onPaste = (event) => {
      if (this.destroyed || !this.editable || !event.clipboardData) return;
      event.preventDefault();
      this.onSelectionChange();
      this.insertFromClipboard(event.clipboardData);
    };
    /** Serialize the selected blocks as HTML, plain text and Trevixal JSON. */
    writeClipboard(data) {
      const state = this.editor.state;
      const selection = state.selection;
      if (selection.empty) return false;
      const blocks = blocksInRange(state.doc, selection.from, selection.to).filter((block) => block.from < block.to).map((block) => block.node.withContent(sliceInline(block.node.content, block.from, block.to)));
      if (blocks.length === 0) return false;
      data.setData("text/html", blocks.map((node) => serializeToHTML(node)).join(""));
      data.setData("text/plain", blocks.map((node) => node.textContent).join("\n"));
      data.setData(TREVIXAL_MIME, JSON.stringify(blocks.map((node) => node.toJSON())));
      return true;
    }
    /** Paste pipeline: own JSON, then sanitized HTML, then plain text. */
    insertFromClipboard(data) {
      const plainOnly = this.pastePlainOnce;
      this.pastePlainOnce = false;
      const schema2 = this.editor.schema;
      if (this.preservesWhitespaceAtSelection()) {
        const source = data.getData("text/plain");
        if (source) this.editor.exec(insertText(source));
        return;
      }
      if (!plainOnly) {
        const raw = data.getData(TREVIXAL_MIME);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const nodes2 = parsed.map((json) => nodeFromJSON(schema2, json));
              this.editor.exec(insertContent(nodes2));
              return;
            }
          } catch {
          }
        }
        const html = data.getData("text/html");
        if (html) {
          const parsed = parseHTML(schema2, cleanPastedHTML(html), this.document);
          this.editor.exec(insertContent(parsed.content.children));
          return;
        }
      }
      const text = data.getData("text/plain");
      if (!text) return;
      const lines = text.split(/\r?\n/);
      const linkable = this.linksAllowedAtSelection();
      if (lines.length === 1) {
        const trimmed = text.trim();
        if (linkable && !this.editor.state.selection.empty && BARE_URL.test(trimmed)) {
          const href = safeHref(/^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed);
          if (href && this.editor.exec(setMark("link", { href }))) return;
        }
        const linked = linkable ? linkifyText(schema2, text) : null;
        this.editor.exec(linked ? insertContent(linked) : insertText(text));
        return;
      }
      const paragraph = schema2.firstTextblockType();
      const nodes = lines.map((line) => {
        if (!line) return paragraph.create();
        const inline = (linkable ? linkifyText(schema2, line) : null) ?? [schema2.text(line)];
        return paragraph.create(void 0, Fragment.from(inline));
      });
      this.editor.exec(insertContent(nodes));
    }
    /** Whether the block at the selection stores its text verbatim (a code block). */
    preservesWhitespaceAtSelection() {
      const block = nodeAtPath(this.editor.state.doc, this.editor.state.selection.from.path);
      return block?.type.spec.preserveWhitespace === true;
    }
    /** Whether the block at the selection takes link marks (code blocks do not). */
    linksAllowedAtSelection() {
      const type = this.editor.schema.marks.link;
      if (!type) return false;
      const block = nodeAtPath(this.editor.state.doc, this.editor.state.selection.from.path);
      return block?.isTextblock === true && block.type.allowsMarkType(type);
    }
    // ------------------------------------------------------------ composition
    onCompositionStart = () => {
      if (!this.destroyed) this.composing = true;
    };
    onCompositionEnd = () => {
      if (this.destroyed || !this.composing) return;
      this.composing = false;
      const domSelection = this.document.getSelection?.();
      const anchorNode = domSelection?.anchorNode ?? null;
      const block = (anchorNode ? this.blockElementAround(anchorNode) : null) ?? this.findDirtyBlock();
      if (block) {
        this.repairBlock(block);
      } else {
        this.update();
      }
    };
    /** First rendered textblock whose DOM text no longer matches its model. */
    findDirtyBlock() {
      const walk = (element) => {
        const model = this.renderer.modelOf.get(element);
        if (model?.isTextblock) {
          const content = this.renderer.contentElementOf(element);
          return (content.textContent ?? "") === model.textContent ? null : element;
        }
        for (const child of [...element.children]) {
          const dirty = walk(child);
          if (dirty) return dirty;
        }
        return null;
      };
      for (const child of [...this.dom.children]) {
        const dirty = walk(child);
        if (dirty) return dirty;
      }
      return null;
    }
    // -------------------------------------------------------------- mutations
    onMutations = (records) => {
      if (this.destroyed || this.updatingDOM || this.composing || records.length === 0) return;
      const blocks = /* @__PURE__ */ new Set();
      let fallback = false;
      for (const record of records) {
        const block = this.blockElementAround(record.target);
        if (block) blocks.add(block);
        else fallback = true;
      }
      const [only] = blocks;
      if (!fallback && blocks.size === 1 && only) {
        this.repairBlock(only);
      } else {
        this.update();
      }
    };
    blockElementAround(node) {
      for (let current = node; current && current !== this.dom.parentNode; current = current.parentNode) {
        const model = this.renderer.modelOf.get(current);
        if (model?.isTextblock) return current;
        if (current === this.dom) break;
      }
      return null;
    }
    /**
     * Reconcile one textblock's DOM back into the model with a prefix/suffix
     * text diff. The recovery path for IME commits, autocorrect and browser
     * extensions.
     */
    repairBlock(blockElement) {
      const path = pathOfElement(this.dom, this.renderer, blockElement);
      const block = path ? nodeAtPath(this.editor.state.doc, path) : null;
      if (!path || !block?.isTextblock) {
        this.update();
        return;
      }
      const content = this.renderer.contentElementOf(blockElement);
      if (this.atomsChanged(content, block)) {
        this.update();
        return;
      }
      const newText = content.textContent ?? "";
      const oldText = block.textContent;
      if (newText === oldText) {
        this.update();
        return;
      }
      let start = 0;
      while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
        start++;
      }
      let oldEnd = oldText.length;
      let newEnd = newText.length;
      while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }
      const inserted = newText.slice(start, newEnd);
      const from = inlineOffsetFromText(block.content, start);
      const to = inlineOffsetFromText(block.content, oldEnd);
      const state = this.editor.state;
      const marks = marksAtInlineOffset(block.content, from).filter(
        (mark) => block.type.allowsMarkType(mark.type)
      );
      const fragment = inserted ? Fragment.of(state.schema.text(inserted, marks)) : Fragment.empty;
      const tr = state.tr.step(new ReplaceInlineStep(path, from, to, fragment));
      const domSelection = this.document.getSelection?.();
      const caret = domSelection?.anchorNode && this.dom.contains(domSelection.anchorNode) ? positionFromDOMPoint(
        this.dom,
        this.renderer,
        domSelection.anchorNode,
        domSelection.anchorOffset
      ) : null;
      tr.setSelection(new TextSelection(caret ?? pos(path, from + inserted.length)));
      this.editor.dispatch(tr);
    }
    /**
     * Whether the inline atoms rendered for a block still match its model, by
     * count. Composition only ever rewrites text, so a mismatch means the
     * browser did something the text diff cannot express.
     */
    atomsChanged(content, block) {
      const expected = block.content.children.filter((child) => !child.isText).length;
      let found = 0;
      for (const element of content.querySelectorAll("*")) {
        if (this.renderer.modelOf.get(element)?.isAtom) found++;
      }
      return found !== expected;
    }
  };
  var Editor = class {
    state;
    commands;
    /** The attached DOM view, when an `element` was supplied. */
    view = null;
    history;
    onChange;
    maxLength;
    listeners = /* @__PURE__ */ new Map();
    txListeners = /* @__PURE__ */ new Set();
    transforms = [];
    destroyed = false;
    snapshotCache = null;
    /** The last snapshot handed out, kept so an unchanged one can be reused. */
    lastSnapshot = null;
    constructor(options) {
      this.state = EditorState.create({
        schema: options.schema,
        doc: options.doc,
        content: options.content
      });
      this.history = new History(options.history);
      this.onChange = options.onChange;
      this.maxLength = options.maxLength ?? null;
      this.commands = new EditorCommands(this);
      if (options.element) {
        this.view = new EditorView(this, options.element, {
          autofocus: options.autofocus,
          keymap: options.keymap,
          placeholder: options.placeholder,
          ariaLabel: options.ariaLabel,
          editable: options.editable,
          spellcheck: options.spellcheck,
          inputRules: options.inputRules,
          nodeViews: options.nodeViews,
          announce: options.announce
        });
      }
    }
    get schema() {
      return this.state.schema;
    }
    get isDestroyed() {
      return this.destroyed;
    }
    /** Run a command against the current state; dispatches when it applies. */
    exec(command) {
      if (this.destroyed) return false;
      this.view?.syncSelectionFromDOM();
      const tr = command(this.state);
      if (!tr) return false;
      this.dispatch(tr);
      return true;
    }
    dispatch(tr) {
      if (this.destroyed) return;
      const before = this.state;
      let transaction = tr;
      for (const transform of this.transforms) {
        transaction = transform(transaction, before) ?? transaction;
      }
      if (this.maxLength !== null && transaction.docChanged) {
        const next = characterCount(transaction.doc);
        if (next > this.maxLength && next > characterCount(before.doc)) return;
      }
      this.history.record(transaction, before.selection);
      this.state = before.apply(transaction);
      this.snapshotCache = null;
      this.emit("transaction");
      for (const listener of [...this.txListeners]) {
        listener({ editor: this, transaction, before, state: this.state });
      }
      if (transaction.docChanged) {
        this.emit("update");
        this.onChange?.({ editor: this, json: this.getJSON(), html: this.getHTML() });
      }
      if (!this.state.selection.eq(before.selection)) this.emit("selectionUpdate");
    }
    /** Listen to applied transactions with their before/after states. */
    onTransaction(listener) {
      this.txListeners.add(listener);
      return () => this.txListeners.delete(listener);
    }
    /** Register a transform that can rewrite transactions before they apply. */
    addDispatchTransform(transform) {
      this.transforms.push(transform);
      return () => {
        this.transforms = this.transforms.filter((entry) => entry !== transform);
      };
    }
    /** Start a chained command sequence: `editor.chain().focus().setHeading(2).run()`. */
    chain() {
      return new Chain(this);
    }
    undo() {
      const tr = this.history.undo(this.state);
      if (!tr) return false;
      this.dispatch(tr);
      return true;
    }
    redo() {
      const tr = this.history.redo(this.state);
      if (!tr) return false;
      this.dispatch(tr);
      return true;
    }
    get canUndo() {
      return this.history.canUndo;
    }
    get canRedo() {
      return this.history.canRedo;
    }
    /** The undo and redo stacks as a history panel lists them. */
    historyEntries() {
      return { undo: this.history.undoEntries, redo: this.history.redoEntries };
    }
    /** Forget every undo and redo group. */
    clearHistory() {
      this.history.clear();
      this.snapshotCache = null;
      this.emit("transaction");
    }
    /**
     * Replace the whole document: loading a saved file, switching documents,
     * restoring a draft. That is not an edit of the current text, so by default
     * the change stays out of the undo history and the history is cleared;
     * pass `addToHistory: true` to make the replacement undoable instead.
     */
    setContent(content, options = {}) {
      if (this.destroyed) return;
      const doc = normalizeDoc(
        content instanceof EditorNode ? content : nodeFromJSON(this.schema, content)
      );
      const tr = this.state.tr;
      tr.step(new ReplaceNodesStep([], 0, this.state.doc.childCount, doc.content));
      tr.setSelection(selectionNear(tr.doc, pos([0], 0)));
      if (options.addToHistory !== true) tr.setMeta(ADD_TO_HISTORY, false);
      this.dispatch(tr);
      if (options.addToHistory !== true) this.history.clear();
    }
    getJSON() {
      return this.state.doc.toJSON();
    }
    getHTML() {
      return serializeToHTML(this.state.doc);
    }
    getText() {
      return serializeToText(this.state.doc);
    }
    getCharacterCount() {
      return characterCount(this.state.doc);
    }
    getWordCount() {
      return wordCount(this.state.doc);
    }
    getSentenceCount() {
      return sentenceCount(this.state.doc);
    }
    getParagraphCount() {
      return paragraphCount(this.state.doc);
    }
    /** Toggle read-only mode on the attached view. */
    setEditable(editable) {
      this.view?.setEditable(editable);
    }
    /** Turn the browser's spell checking of the editing surface on or off. */
    setSpellcheck(enabled) {
      this.view?.setSpellcheck(enabled);
    }
    get isEditable() {
      return this.view?.isEditable ?? true;
    }
    isActive(markName) {
      return isMarkActive(this.state, markName);
    }
    /**
     * Toolbar-facing snapshot.
     *
     * Reference-stable while its *contents* are unchanged, not merely between
     * transactions, so typing a character returns the very same object, and a
     * toolbar subscribed through `useSyncExternalStore`, a signal or a store
     * does not re-render on every keystroke. It changes identity when something
     * a toolbar would actually draw differently changes: a mark, the block
     * type, whether undo is available.
     *
     * Subscribers are still notified per transaction; what this decides is
     * whether they have anything new to look at.
     */
    getSnapshot() {
      if (this.snapshotCache) return this.snapshotCache;
      const selection = this.state.selection;
      let block = nodeAtPath(this.state.doc, selection.from.path);
      if (block && !block.isTextblock) {
        block = block.content.maybeChild(selection.from.offset) ?? block;
      }
      const textblock = block?.isTextblock ? block : null;
      const activeMarks = Object.keys(this.state.schema.marks).filter(
        (name) => isMarkActive(this.state, name)
      );
      const markAttrs = {};
      for (const name of activeMarks) {
        const attrs = activeMarkAttrs(this.state, name);
        if (attrs) markAttrs[name] = attrs;
      }
      const indent = textblock?.attrs.indent;
      const next = {
        activeMarks,
        markAttrs,
        blockType: textblock?.type.name ?? null,
        blockAttrs: textblock?.attrs ?? null,
        listType: enclosingListType(this.state.doc, selection.from.path),
        align: typeof textblock?.attrs.align === "string" ? textblock.attrs.align : null,
        indent: typeof indent === "number" ? indent : 0,
        canUndo: this.canUndo,
        canRedo: this.canRedo,
        selectionEmpty: selection.empty
      };
      const reusable = this.lastSnapshot && snapshotsEqual(this.lastSnapshot, next);
      this.snapshotCache = reusable ? this.lastSnapshot : next;
      this.lastSnapshot = this.snapshotCache;
      return this.snapshotCache;
    }
    /** Subscribe to state changes (the contract external stores expect). */
    subscribe(listener) {
      return this.on("transaction", listener);
    }
    on(event, listener) {
      let set = this.listeners.get(event);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        this.listeners.set(event, set);
      }
      set.add(listener);
      return () => set.delete(listener);
    }
    destroy() {
      this.view?.destroy();
      this.view = null;
      this.destroyed = true;
      this.listeners.clear();
      this.txListeners.clear();
      this.transforms = [];
    }
    emit(event) {
      for (const listener of this.listeners.get(event) ?? []) listener();
    }
  };
  function enclosingListType(doc, path) {
    if (path.length < 3) return null;
    const item = nodeAtPath(doc, path.slice(0, -1));
    if (item?.type.name !== "listItem" && item?.type.name !== "taskItem") return null;
    return nodeAtPath(doc, path.slice(0, -2))?.type.name ?? null;
  }
  function activeMarkAttrs(state, name) {
    const type = state.schema.marks[name];
    if (!type) return null;
    const selection = state.selection;
    if (selection.empty && selection instanceof TextSelection) {
      const block = nodeAtPath(state.doc, selection.head.path);
      const marks = state.storedMarks ?? (block?.isTextblock ? marksAtInlineOffset(block.content, selection.head.offset) : []);
      return marks.find((mark) => mark.type === type)?.attrs ?? null;
    }
    for (const block of blocksInRange(state.doc, selection.from, selection.to)) {
      if (block.from >= block.to) continue;
      const [range] = rangesWithMark(block.node.content, block.from, block.to, type);
      if (range) return range.mark.attrs;
    }
    return null;
  }
  function snapshotsEqual(a, b) {
    return a.blockType === b.blockType && a.listType === b.listType && a.align === b.align && a.indent === b.indent && a.canUndo === b.canUndo && a.canRedo === b.canRedo && a.selectionEmpty === b.selectionEmpty && sameStrings(a.activeMarks, b.activeMarks) && sameAttrs2(a.blockAttrs, b.blockAttrs) && sameAttrMap(a.markAttrs, b.markAttrs);
  }
  function sameStrings(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  function sameAttrs2(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return attrsEq(a, b);
  }
  function sameAttrMap(a, b) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((key) => {
      const other = b[key];
      return other !== void 0 && attrsEq(a[key], other);
    });
  }
  var EditorCommands = class {
    constructor(editor2) {
      this.editor = editor2;
    }
    editor;
    insertText(text) {
      return this.editor.exec(insertText(text));
    }
    deleteSelection() {
      return this.editor.exec(deleteSelection);
    }
    toggleMark(name, attrs) {
      return this.editor.exec(toggleMark(name, attrs));
    }
    /** Apply a mark with attributes, replacing any existing one of its type. */
    setMark(name, attrs) {
      return this.editor.exec(setMark(name, attrs));
    }
    unsetMark(name) {
      return this.editor.exec(unsetMark(name));
    }
    setFontFamily(family) {
      return this.setMark("fontFamily", { family });
    }
    setFontSize(size) {
      return this.setMark("fontSize", { size });
    }
    setTextColor(color) {
      return this.setMark("textColor", { color });
    }
    setBackgroundColor(color) {
      return this.setMark("backgroundColor", { color });
    }
    setLink(href, title) {
      return this.setMark("link", title ? { href, title } : { href });
    }
    unsetLink() {
      return this.unsetMark("link");
    }
    clearFormatting() {
      return this.editor.exec(clearFormatting);
    }
    clearBlockFormatting() {
      return this.editor.exec(clearBlockFormatting);
    }
    clearAllFormatting() {
      return this.editor.exec(clearAllFormatting);
    }
    setTextAlign(align) {
      return this.editor.exec(setTextAlign(align));
    }
    /** Line height on the selected blocks; a bare number is a multiplier. */
    setLineHeight(value) {
      return this.editor.exec(setLineHeight(value));
    }
    /** Space above and/or below the selected blocks. */
    setParagraphSpacing(opts) {
      return this.editor.exec(setParagraphSpacing(opts));
    }
    /** Letter spacing on the selection; `null` removes it. */
    setLetterSpacing(spacing) {
      return this.editor.exec(setLetterSpacing(spacing));
    }
    toggleSmallCaps() {
      return this.editor.exec(toggleSmallCaps);
    }
    /** Rewrite the selected text to upper, lower or title case. */
    convertCase(mode) {
      return this.editor.exec(convertCase(mode));
    }
    indent() {
      return this.editor.exec(indentBlocks(1));
    }
    outdent() {
      return this.editor.exec(indentBlocks(-1));
    }
    setBlockAttrs(attrs) {
      return this.editor.exec(setBlockAttrs(attrs));
    }
    setBlockType(name, attrs) {
      return this.editor.exec(setBlockType(name, attrs));
    }
    setParagraph() {
      return this.setBlockType("paragraph");
    }
    setHeading(level) {
      return this.setBlockType("heading", { level });
    }
    splitBlock() {
      return this.editor.exec(splitBlock);
    }
    joinBackward() {
      return this.editor.exec(joinBackward);
    }
    insertHardBreak() {
      return this.editor.exec(insertInlineNode("hardBreak"));
    }
    insertHorizontalRule() {
      return this.editor.exec(insertBlockAfter("horizontalRule"));
    }
    wrapIn(name, attrs) {
      return this.editor.exec(wrapIn(name, attrs));
    }
    toggleBulletList() {
      return this.editor.exec(toggleList("bulletList"));
    }
    toggleOrderedList() {
      return this.editor.exec(toggleList("orderedList"));
    }
    toggleTaskList() {
      return this.editor.exec(toggleTaskList);
    }
    /** Flip the done state of the task item holding the selection. */
    toggleTaskChecked() {
      return this.editor.exec(toggleTaskChecked);
    }
    /** Set the marker style of the list at the selection; `null` clears it. */
    setListStyle(style) {
      return this.editor.exec(setListStyle(style));
    }
    restartNumbering() {
      return this.editor.exec(restartNumbering);
    }
    continueNumbering(start) {
      return this.editor.exec(continueNumbering(start));
    }
    continueNumberingFromPrevious() {
      return this.editor.exec(continueNumberingFromPrevious);
    }
    splitListItem() {
      return this.editor.exec(splitListItem);
    }
    sinkListItem() {
      return this.editor.exec(sinkListItem);
    }
    liftListItem() {
      return this.editor.exec(liftListItem);
    }
    setCodeBlock() {
      return this.setBlockType("codeBlock");
    }
    lift() {
      return this.editor.exec(lift);
    }
    selectAll() {
      return this.editor.exec(selectAll);
    }
    undo() {
      return this.editor.undo();
    }
    redo() {
      return this.editor.redo();
    }
  };
  var Chain = class {
    constructor(editor2) {
      this.editor = editor2;
    }
    editor;
    queue = [];
    /** Focus the attached view (no-op for headless editors). */
    focus() {
      this.queue.push(() => {
        this.editor.view?.focus();
        return true;
      });
      return this;
    }
    command(command) {
      this.queue.push(() => this.editor.exec(command));
      return this;
    }
    insertText(text) {
      this.queue.push(() => this.editor.commands.insertText(text));
      return this;
    }
    toggleMark(name, attrs) {
      this.queue.push(() => this.editor.commands.toggleMark(name, attrs));
      return this;
    }
    setBlockType(name, attrs) {
      this.queue.push(() => this.editor.commands.setBlockType(name, attrs));
      return this;
    }
    setHeading(level) {
      this.queue.push(() => this.editor.commands.setHeading(level));
      return this;
    }
    setParagraph() {
      this.queue.push(() => this.editor.commands.setParagraph());
      return this;
    }
    run() {
      return this.queue.reduce((ok, step) => step() && ok, true);
    }
  };
  function createEditor(options) {
    return new Editor(options);
  }

  // ../extension-track-changes/dist/index.js
  var TRACK_CHANGES_META = "trackChanges$";
  function trackChangesMarks() {
    const attrs = { author: { default: "" }, timestamp: { default: 0 } };
    const htmlAttrs = (mark, className) => ({
      class: className,
      "data-trevixal-author": String(mark.attrs.author ?? ""),
      "data-trevixal-timestamp": String(Number(mark.attrs.timestamp ?? 0) || 0)
    });
    const parsedAttrs = (element) => ({
      author: element.getAttribute("data-trevixal-author") ?? "",
      timestamp: Number(element.getAttribute("data-trevixal-timestamp") ?? "0") || 0
    });
    return {
      insertion: {
        attrs,
        excludes: "deletion",
        toHTML: (mark) => ({ tag: "ins", attrs: htmlAttrs(mark, "trevixal-insertion") }),
        parseHTML: [{ tag: "ins", getAttrs: parsedAttrs }]
      },
      deletion: {
        attrs,
        excludes: "insertion",
        toHTML: (mark) => ({ tag: "del", attrs: htmlAttrs(mark, "trevixal-deletion") }),
        // `del` is also the strikethrough mark's tag in the default schema, and
        // rules that require an attribute are tried first, so an attributed
        // `del` parses back as a suggestion rather than as struck-through text.
        parseHTML: [
          { tag: "del", attribute: "data-trevixal-author", getAttrs: parsedAttrs },
          { tag: "del", getAttrs: parsedAttrs }
        ]
      }
    };
  }
  function effectOf(node, types, author) {
    if (!node.isText) return "strike";
    const own = node.marks.some(
      (mark) => mark.type === types.insertion && mark.attrs.author === author
    );
    if (own) return "remove";
    return node.marks.some((mark) => mark.type === types.deletion) ? "keep" : "strike";
  }
  function classifyDeletion(block, from, to, types, author) {
    const segments = [];
    let offset = 0;
    for (const child of block.content.children) {
      const start2 = offset;
      offset += inlineSize(child);
      if (start2 >= to || offset <= from) continue;
      const effect = effectOf(child, types, author);
      const clipped = { from: Math.max(start2, from), to: Math.min(offset, to), effect };
      const last = segments[segments.length - 1];
      if (last && last.to === clipped.from && last.effect === effect) {
        segments[segments.length - 1] = { from: last.from, to: clipped.to, effect };
      } else {
        segments.push(clipped);
      }
    }
    return segments;
  }
  function carryMeta(out, source) {
    for (const key of source.metaKeys()) {
      if (key === TRACK_CHANGES_META) continue;
      out.setMeta(key, source.getMeta(key));
    }
    return out;
  }
  function marksOfCharAt(block, index) {
    if (index < 0) return null;
    let offset = 0;
    for (const child of block.content.children) {
      const size = inlineSize(child);
      if (index < offset + size) return child.isText ? child.marks : null;
      offset += size;
    }
    return null;
  }
  function rangeIsAllText(block, from, to) {
    let offset = 0;
    for (const child of block.content.children) {
      const size = inlineSize(child);
      if (offset < to && offset + size > from && !child.isText) return false;
      offset += size;
    }
    return true;
  }
  var TrackChanges = class {
    constructor(editor2, options) {
      this.editor = editor2;
      this.options = options;
    }
    editor;
    options;
    detach = null;
    listeners = /* @__PURE__ */ new Set();
    get isEnabled() {
      return this.detach !== null;
    }
    /**
     * Subscribe to suggestion mode being switched on or off. Returns a disposer.
     *
     * Switching modes changes no document, so it raises no transaction, and
     * anything watching the editor alone never hears about it. A review bar
     * built that way sits reading "off" while every keystroke is in fact being
     * recorded as a suggestion, which is the worst way for this feature to be
     * wrong, because the user believes their edits are going in directly.
     */
    onEnabledChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    announce() {
      const enabled = this.isEnabled;
      for (const listener of [...this.listeners]) listener(enabled);
    }
    enable() {
      if (this.detach) return;
      this.detach = this.editor.addDispatchTransform(this.transform);
      this.announce();
    }
    disable() {
      if (!this.detach) return;
      this.detach();
      this.detach = null;
      this.announce();
    }
    /** All pending suggestions, in document order. */
    suggestions() {
      const out = [];
      const schema2 = this.editor.schema;
      for (const { path, node } of textblocks(this.editor.state.doc)) {
        const length = inlineLength(node.content);
        for (const kind of ["insertion", "deletion"]) {
          const type = schema2.marks[kind];
          if (!type) continue;
          for (const range of rangesWithMark(node.content, 0, length, type)) {
            out.push({
              path,
              from: range.from,
              to: range.to,
              kind,
              author: String(range.mark.attrs.author ?? ""),
              timestamp: Number(range.mark.attrs.timestamp ?? 0),
              mark: range.mark
            });
          }
        }
      }
      return out.sort((a, b) => comparePaths(a.path, b.path) || a.from - b.from);
    }
    get hasSuggestions() {
      return this.suggestions().length > 0;
    }
    acceptAll() {
      return this.apply(this.suggestions(), "accept");
    }
    rejectAll() {
      return this.apply(this.suggestions(), "reject");
    }
    /** Accept a specific set of suggestion ranges (e.g. one author's). */
    accept(suggestions) {
      return this.apply(suggestions, "accept");
    }
    reject(suggestions) {
      return this.apply(suggestions, "reject");
    }
    /** Accept the suggestion span containing `position`. */
    acceptAt(position) {
      return this.apply(this.at(position), "accept");
    }
    rejectAt(position) {
      return this.apply(this.at(position), "reject");
    }
    at(position) {
      const found = this.suggestions().find(
        (suggestion) => pathsEqual(suggestion.path, position.path) && suggestion.from <= position.offset && position.offset <= suggestion.to
      );
      return found ? [found] : [];
    }
    apply(suggestions, mode) {
      if (suggestions.length === 0) return false;
      const tr = this.editor.state.tr.setMeta(TRACK_CHANGES_META, true);
      const ordered2 = [...suggestions].sort((a, b) => {
        const byPath = comparePaths(b.path, a.path);
        return byPath !== 0 ? byPath : b.from - a.from;
      });
      for (const suggestion of ordered2) {
        const keepText = suggestion.kind === "insertion" === (mode === "accept");
        if (keepText) {
          tr.step(
            new RemoveMarkStep(suggestion.path, suggestion.from, suggestion.to, suggestion.mark)
          );
        } else {
          tr.step(
            new ReplaceInlineStep(suggestion.path, suggestion.from, suggestion.to, Fragment.empty)
          );
        }
      }
      this.editor.dispatch(tr);
      return true;
    }
    transform = (tr, state) => {
      if (!tr.docChanged || tr.getMeta(ADD_TO_HISTORY) === false) return null;
      if (tr.getMeta(TRACK_CHANGES_META)) return null;
      const step = normalizeInlineEdit(tr.steps);
      if (!step) return null;
      const schema2 = state.schema;
      const insertion = schema2.marks.insertion;
      const deletion = schema2.marks.deletion;
      if (!insertion || !deletion) return null;
      const block = nodeAtPath(state.doc, step.blockPath);
      if (!block?.isTextblock || !block.type.allowsMarkType(deletion)) return null;
      if (step.insert.children.some((child) => !child.isText)) return null;
      if (step.from < step.to && !rangeIsAllText(block, step.from, step.to)) return null;
      const author = this.options.author;
      const timestamp = this.options.now?.() ?? Date.now();
      const reusable = (index, type) => marksOfCharAt(block, index)?.find(
        (mark) => mark.type === type && mark.attrs.author === author
      ) ?? null;
      const segments = step.from < step.to ? classifyDeletion(block, step.from, step.to, { insertion, deletion }, author) : [];
      const vanishing = segments.reduce(
        (total, segment) => segment.effect === "remove" ? total + (segment.to - segment.from) : total,
        0
      );
      const insertAt2 = step.to - vanishing;
      const insertionMark = reusable(step.from - 1, insertion) ?? reusable(step.to, insertion) ?? schema2.mark("insertion", { author, timestamp });
      const markedInsert = Fragment.from(
        step.insert.children.map((child) => {
          const text = child;
          return schema2.text(text.text, insertionMark.addToSet(text.marks));
        })
      );
      const out = carryMeta(state.tr, tr);
      const caretAt = (offset) => {
        out.setSelection(new TextSelection(pos(step.blockPath, offset)));
      };
      if (step.from === step.to) {
        if (markedInsert.childCount === 0) return null;
        out.step(new ReplaceInlineStep(step.blockPath, step.from, step.from, markedInsert));
        caretAt(step.from + inlineLength(markedInsert));
        return out;
      }
      const head = state.selection instanceof TextSelection && pathsEqual(state.selection.head.path, step.blockPath) ? state.selection.head.offset : null;
      const backward = head === step.to;
      for (let index = segments.length - 1; index >= 0; index--) {
        const segment = segments[index];
        if (segment.effect === "remove") {
          out.step(new ReplaceInlineStep(step.blockPath, segment.from, segment.to, Fragment.empty));
        } else if (segment.effect === "strike") {
          const mark = reusable(segment.to, deletion) ?? reusable(segment.from - 1, deletion) ?? schema2.mark("deletion", { author, timestamp });
          out.step(new AddMarkStep(step.blockPath, segment.from, segment.to, mark));
        }
      }
      if (markedInsert.childCount > 0) {
        out.step(new ReplaceInlineStep(step.blockPath, insertAt2, insertAt2, markedInsert));
        caretAt(insertAt2 + inlineLength(markedInsert));
      } else {
        caretAt(backward ? step.from : insertAt2);
      }
      return out;
    };
  };
  function normalizeInlineEdit(steps) {
    if (steps.length === 1) {
      return steps[0] instanceof ReplaceInlineStep ? steps[0] : null;
    }
    if (steps.length === 2) {
      const [first, second] = steps;
      if (first instanceof ReplaceInlineStep && second instanceof ReplaceInlineStep && pathsEqual(first.blockPath, second.blockPath) && first.insert.childCount === 0 && first.from < first.to && second.from === second.to && second.from === first.from) {
        return new ReplaceInlineStep(first.blockPath, first.from, first.to, second.insert);
      }
    }
    return null;
  }
  function comparePaths(a, b) {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const delta = a[i] - b[i];
      if (delta !== 0) return delta;
    }
    return a.length - b.length;
  }

  // page/track-changes-entry.ts
  var schema = new Schema({
    nodes: defaultNodes(),
    marks: { ...defaultMarks(), ...trackChangesMarks() }
  });
  function mount(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`missing #${id}`);
    return element;
  }
  var editor = createEditor({ schema, element: mount("editor") });
  var track = new TrackChanges(editor, { author: "me" });
  window.trackChangesPage = {
    editor,
    // Selections a keyboard cannot reliably make from Playwright; the spec needs
    // an exact range, not whatever a double-click happens to pick.
    selectRange: (fromPath, fromOffset, toPath, toOffset) => {
      editor.dispatch(
        editor.state.tr.setSelection(
          new TextSelection(pos(fromPath, fromOffset), pos(toPath, toOffset))
        )
      );
    },
    track
  };
  document.getElementById("tc-enable")?.addEventListener("click", () => track.enable());
  document.getElementById("tc-accept")?.addEventListener("click", () => track.acceptAll());
  document.getElementById("tc-reject")?.addEventListener("click", () => track.rejectAll());
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vY29yZS9zcmMvbW9kZWwvYXR0cnMudHMiLCAiLi4vLi4vY29yZS9zcmMvbW9kZWwvbWFyay50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC9mcmFnbWVudC50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC9ub2RlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2NvbnRlbnQudHMiLCAiLi4vLi4vY29yZS9zcmMvbW9kZWwvc2NoZW1hLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2lubGluZS50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC90cmVlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL3Bvc2l0aW9uLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2Jsb2Nrcy50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC9qc29uLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL25vcm1hbGl6ZS50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS9zdGVwLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3JlcGxhY2Utbm9kZXMudHMiLCAiLi4vLi4vY29yZS9zcmMvc3RhdGUvc3RlcHMvbWFyay1zdGVwcy50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS9zdGVwcy9hdHRycy1zdGVwLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3NwbGl0LWpvaW4udHMiLCAiLi4vLi4vY29yZS9zcmMvc3RhdGUvc3RlcHMvbW92ZS1ub2RlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3dyYXAtbGlmdC50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS90cmFuc2FjdGlvbi50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS9zZWxlY3Rpb24udHMiLCAiLi4vLi4vY29yZS9zcmMvc3RhdGUvZWRpdG9yLXN0YXRlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3NjaGVtYS9iYXNpYy50cyIsICIuLi8uLi9jb3JlL3NyYy9jb21tYW5kcy9oZWxwZXJzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2NvbW1hbmRzL2NvbW1hbmRzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2NvbW1hbmRzL2xpc3RzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2NvbW1hbmRzL2xpbmtzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2hpc3RvcnkvaGlzdG9yeS50cyIsICIuLi8uLi9jb3JlL3NyYy9pbnB1dC1ydWxlcy9pbnB1dC1ydWxlcy50cyIsICIuLi8uLi9jb3JlL3NyYy9zZWFyY2gvZmluZC1yZXBsYWNlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2NvdW50cy50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvaHRtbC50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvaHRtbC1kb2N1bWVudC50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvbWFya2Rvd24udHMiLCAiLi4vLi4vY29yZS9zcmMvc2VyaWFsaXplL3BhcnNlLWh0bWwudHMiLCAiLi4vLi4vY29yZS9zcmMvc2VyaWFsaXplL3Bhc3RlLXNvdXJjZS50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvcGFyc2UtbWFya2Rvd24udHMiLCAiLi4vLi4vY29yZS9zcmMvYTExeS9hbm5vdW5jZS50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L2RvbS1wb2ludC50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L2tleW1hcC50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L3JlbmRlcmVyLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3ZpZXcvZWRpdG9yLXZpZXcudHMiLCAiLi4vLi4vY29yZS9zcmMvc3VnZ2VzdC9zdWdnZXN0LnRzIiwgIi4uLy4uL2NvcmUvc3JjL2VkaXRvci9mb3JtYXQtcGFpbnRlci50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L2VkaXRvci1kb2N1bWVudC50cyIsICIuLi8uLi9jb3JlL3NyYy9lcnJvcnMudHMiLCAiLi4vLi4vY29yZS9zcmMvZWRpdG9yL2VkaXRvci50cyIsICIuLi8uLi9leHRlbnNpb24tdHJhY2stY2hhbmdlcy9zcmMvaW5kZXgudHMiLCAiLi4vLi4vZXh0ZW5zaW9uLXRyYWNrLWNoYW5nZXMvc3JjL3VpLnRzIiwgInRyYWNrLWNoYW5nZXMtZW50cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKiBBdHRyaWJ1dGUgYmFnIGF0dGFjaGVkIHRvIG5vZGVzIGFuZCBtYXJrcy4gVmFsdWVzIG11c3QgYmUgSlNPTi1zZXJpYWxpemFibGUuICovXHJcbmV4cG9ydCB0eXBlIEF0dHJzID0gUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+XHJcblxyXG5leHBvcnQgY29uc3QgZW1wdHlBdHRyczogQXR0cnMgPSBPYmplY3QuZnJlZXplKHt9KVxyXG5cclxuLyoqIFNoYWxsb3cgc3RydWN0dXJhbCBlcXVhbGl0eSBmb3IgYXR0cmlidXRlIGJhZ3MuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBhdHRyc0VxKGE6IEF0dHJzLCBiOiBBdHRycyk6IGJvb2xlYW4ge1xyXG4gIGlmIChhID09PSBiKSByZXR1cm4gdHJ1ZVxyXG4gIGNvbnN0IGFLZXlzID0gT2JqZWN0LmtleXMoYSlcclxuICBjb25zdCBiS2V5cyA9IE9iamVjdC5rZXlzKGIpXHJcbiAgaWYgKGFLZXlzLmxlbmd0aCAhPT0gYktleXMubGVuZ3RoKSByZXR1cm4gZmFsc2VcclxuICByZXR1cm4gYUtleXMuZXZlcnkoKGtleSkgPT4gYVtrZXldID09PSBiW2tleV0pXHJcbn1cclxuXHJcbi8qKiBGaWxsIG1pc3NpbmcgYXR0cmlidXRlcyBmcm9tIHRoZSBzcGVjJ3MgZGVjbGFyZWQgZGVmYXVsdHMuIFRocm93cyBvbiBtaXNzaW5nIHJlcXVpcmVkIGF0dHJzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUF0dHJzKFxyXG4gIHNwZWNBdHRyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9Pj4gfCB1bmRlZmluZWQsXHJcbiAgZ2l2ZW46IEF0dHJzIHwgdW5kZWZpbmVkLFxyXG4gIG93bmVyOiBzdHJpbmcsXHJcbik6IEF0dHJzIHtcclxuICBpZiAoIXNwZWNBdHRycykgcmV0dXJuIGVtcHR5QXR0cnNcclxuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge31cclxuICBmb3IgKGNvbnN0IFtuYW1lLCBzcGVjXSBvZiBPYmplY3QuZW50cmllcyhzcGVjQXR0cnMpKSB7XHJcbiAgICBpZiAoZ2l2ZW4gJiYgbmFtZSBpbiBnaXZlbikge1xyXG4gICAgICByZXN1bHRbbmFtZV0gPSBnaXZlbltuYW1lXVxyXG4gICAgfSBlbHNlIGlmICgnZGVmYXVsdCcgaW4gc3BlYykge1xyXG4gICAgICByZXN1bHRbbmFtZV0gPSBzcGVjLmRlZmF1bHRcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBNaXNzaW5nIHJlcXVpcmVkIGF0dHJpYnV0ZSBcIiR7bmFtZX1cIiBvbiAke293bmVyfWApXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBPYmplY3QuZnJlZXplKHJlc3VsdClcclxufVxyXG4iLCAiaW1wb3J0IHsgdHlwZSBBdHRycywgYXR0cnNFcSB9IGZyb20gJy4vYXR0cnMnXHJcbmltcG9ydCB0eXBlIHsgTWFya1R5cGUgfSBmcm9tICcuL3NjaGVtYSdcclxuXHJcbi8qKiBKU09OIHNoYXBlIG9mIGEgc2VyaWFsaXplZCBtYXJrLiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtKU09OIHtcclxuICByZWFkb25seSB0eXBlOiBzdHJpbmdcclxuICByZWFkb25seSBhdHRycz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIHBpZWNlIG9mIGlubGluZSBmb3JtYXR0aW5nIChib2xkLCBsaW5rLCBcdTIwMjYpLiBJbW11dGFibGU7IGlkZW50aWZpZWQgYnkgaXRzXHJcbiAqIHR5cGUgcGx1cyBhdHRyaWJ1dGVzLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIE1hcmsge1xyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcmVhZG9ubHkgdHlwZTogTWFya1R5cGUsXHJcbiAgICByZWFkb25seSBhdHRyczogQXR0cnMsXHJcbiAgKSB7fVxyXG5cclxuICBlcShvdGhlcjogTWFyayk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMgPT09IG90aGVyIHx8ICh0aGlzLnR5cGUgPT09IG90aGVyLnR5cGUgJiYgYXR0cnNFcSh0aGlzLmF0dHJzLCBvdGhlci5hdHRycykpXHJcbiAgfVxyXG5cclxuICBpc0luU2V0KHNldDogcmVhZG9ubHkgTWFya1tdKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gc2V0LnNvbWUoKG1hcmspID0+IG1hcmsuZXEodGhpcykpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBZGQgdGhpcyBtYXJrIHRvIGEgc2V0LCBob25vcmluZyBtYXJrLWV4Y2x1c2lvbiBydWxlcyBhbmQga2VlcGluZyB0aGUgc2V0XHJcbiAgICogb3JkZXJlZCBieSBzY2hlbWEgcmFuay4gUmV0dXJucyB0aGUgc2FtZSBhcnJheSB3aGVuIG5vdGhpbmcgY2hhbmdlcy5cclxuICAgKi9cclxuICBhZGRUb1NldChzZXQ6IHJlYWRvbmx5IE1hcmtbXSk6IHJlYWRvbmx5IE1hcmtbXSB7XHJcbiAgICBpZiAodGhpcy5pc0luU2V0KHNldCkpIHJldHVybiBzZXRcclxuICAgIGNvbnN0IGtlcHQgPSBzZXQuZmlsdGVyKFxyXG4gICAgICAobWFyaykgPT4gIW1hcmsudHlwZS5leGNsdWRlcyh0aGlzLnR5cGUpICYmICF0aGlzLnR5cGUuZXhjbHVkZXMobWFyay50eXBlKSxcclxuICAgIClcclxuICAgIGNvbnN0IHJlc3VsdCA9IFsuLi5rZXB0LCB0aGlzXS5zb3J0KChhLCBiKSA9PiBhLnR5cGUucmFuayAtIGIudHlwZS5yYW5rKVxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgcmVtb3ZlRnJvbVNldChzZXQ6IHJlYWRvbmx5IE1hcmtbXSk6IHJlYWRvbmx5IE1hcmtbXSB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBzZXQuZmlsdGVyKChtYXJrKSA9PiAhbWFyay5lcSh0aGlzKSlcclxuICAgIHJldHVybiByZXN1bHQubGVuZ3RoID09PSBzZXQubGVuZ3RoID8gc2V0IDogcmVzdWx0XHJcbiAgfVxyXG5cclxuICB0b0pTT04oKTogTWFya0pTT04ge1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuYXR0cnMpLmxlbmd0aCA+IDBcclxuICAgICAgPyB7IHR5cGU6IHRoaXMudHlwZS5uYW1lLCBhdHRyczogeyAuLi50aGlzLmF0dHJzIH0gfVxyXG4gICAgICA6IHsgdHlwZTogdGhpcy50eXBlLm5hbWUgfVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IG5vTWFya3M6IHJlYWRvbmx5IE1hcmtbXSA9IE9iamVjdC5mcmVlemUoW10pXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbWFya3NFcShhOiByZWFkb25seSBNYXJrW10sIGI6IHJlYWRvbmx5IE1hcmtbXSk6IGJvb2xlYW4ge1xyXG4gIGlmIChhID09PSBiKSByZXR1cm4gdHJ1ZVxyXG4gIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZVxyXG4gIHJldHVybiBhLmV2ZXJ5KChtYXJrLCBpKSA9PiBtYXJrLmVxKGJbaV0pKVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuL25vZGUnXHJcblxyXG4vKiogSW1tdXRhYmxlIG9yZGVyZWQgbGlzdCBvZiBjaGlsZCBub2Rlcy4gKi9cclxuZXhwb3J0IGNsYXNzIEZyYWdtZW50IHtcclxuICBwcml2YXRlIGNvbnN0cnVjdG9yKHJlYWRvbmx5IGNoaWxkcmVuOiByZWFkb25seSBFZGl0b3JOb2RlW10pIHt9XHJcblxyXG4gIHN0YXRpYyByZWFkb25seSBlbXB0eTogRnJhZ21lbnQgPSBuZXcgRnJhZ21lbnQoT2JqZWN0LmZyZWV6ZShbXSkpXHJcblxyXG4gIHN0YXRpYyBmcm9tKG5vZGVzOiByZWFkb25seSBFZGl0b3JOb2RlW10pOiBGcmFnbWVudCB7XHJcbiAgICByZXR1cm4gbm9kZXMubGVuZ3RoID09PSAwID8gRnJhZ21lbnQuZW1wdHkgOiBuZXcgRnJhZ21lbnQoT2JqZWN0LmZyZWV6ZShbLi4ubm9kZXNdKSlcclxuICB9XHJcblxyXG4gIHN0YXRpYyBvZiguLi5ub2RlczogRWRpdG9yTm9kZVtdKTogRnJhZ21lbnQge1xyXG4gICAgcmV0dXJuIEZyYWdtZW50LmZyb20obm9kZXMpXHJcbiAgfVxyXG5cclxuICBnZXQgY2hpbGRDb3VudCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW4ubGVuZ3RoXHJcbiAgfVxyXG5cclxuICBjaGlsZChpbmRleDogbnVtYmVyKTogRWRpdG9yTm9kZSB7XHJcbiAgICBjb25zdCBub2RlID0gdGhpcy5jaGlsZHJlbltpbmRleF1cclxuICAgIGlmICghbm9kZSkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYEZyYWdtZW50IGNoaWxkIGluZGV4ICR7aW5kZXh9IG91dCBvZiByYW5nZWApXHJcbiAgICByZXR1cm4gbm9kZVxyXG4gIH1cclxuXHJcbiAgbWF5YmVDaGlsZChpbmRleDogbnVtYmVyKTogRWRpdG9yTm9kZSB8IG51bGwge1xyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW5baW5kZXhdID8/IG51bGxcclxuICB9XHJcblxyXG4gIHJlcGxhY2VDaGlsZChpbmRleDogbnVtYmVyLCBub2RlOiBFZGl0b3JOb2RlKTogRnJhZ21lbnQge1xyXG4gICAgY29uc3QgbmV4dCA9IFsuLi50aGlzLmNoaWxkcmVuXVxyXG4gICAgbmV4dFtpbmRleF0gPSBub2RlXHJcbiAgICByZXR1cm4gRnJhZ21lbnQuZnJvbShuZXh0KVxyXG4gIH1cclxuXHJcbiAgLyoqIFJlcGxhY2UgY2hpbGRyZW4gaW4gW2Zyb20sIHRvKSB3aXRoIHRoZSBnaXZlbiBmcmFnbWVudCdzIGNoaWxkcmVuLiAqL1xyXG4gIHJlcGxhY2VSYW5nZShmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIsIGluc2VydDogRnJhZ21lbnQpOiBGcmFnbWVudCB7XHJcbiAgICByZXR1cm4gRnJhZ21lbnQuZnJvbShbXHJcbiAgICAgIC4uLnRoaXMuY2hpbGRyZW4uc2xpY2UoMCwgZnJvbSksXHJcbiAgICAgIC4uLmluc2VydC5jaGlsZHJlbixcclxuICAgICAgLi4udGhpcy5jaGlsZHJlbi5zbGljZSh0byksXHJcbiAgICBdKVxyXG4gIH1cclxuXHJcbiAgc2xpY2UoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyID0gdGhpcy5jaGlsZENvdW50KTogRnJhZ21lbnQge1xyXG4gICAgcmV0dXJuIEZyYWdtZW50LmZyb20odGhpcy5jaGlsZHJlbi5zbGljZShmcm9tLCB0bykpXHJcbiAgfVxyXG5cclxuICBhcHBlbmQob3RoZXI6IEZyYWdtZW50KTogRnJhZ21lbnQge1xyXG4gICAgaWYgKG90aGVyLmNoaWxkQ291bnQgPT09IDApIHJldHVybiB0aGlzXHJcbiAgICBpZiAodGhpcy5jaGlsZENvdW50ID09PSAwKSByZXR1cm4gb3RoZXJcclxuICAgIHJldHVybiBGcmFnbWVudC5mcm9tKFsuLi50aGlzLmNoaWxkcmVuLCAuLi5vdGhlci5jaGlsZHJlbl0pXHJcbiAgfVxyXG5cclxuICBlcShvdGhlcjogRnJhZ21lbnQpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzID09PSBvdGhlcikgcmV0dXJuIHRydWVcclxuICAgIGlmICh0aGlzLmNoaWxkQ291bnQgIT09IG90aGVyLmNoaWxkQ291bnQpIHJldHVybiBmYWxzZVxyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW4uZXZlcnkoKGNoaWxkLCBpKSA9PiBjaGlsZC5lcShvdGhlci5jaGlsZHJlbltpXSkpXHJcbiAgfVxyXG5cclxuICB0b0pTT04oKTogdW5rbm93bltdIHtcclxuICAgIHJldHVybiB0aGlzLmNoaWxkcmVuLm1hcCgoY2hpbGQpID0+IGNoaWxkLnRvSlNPTigpKVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgdHlwZSBBdHRycywgYXR0cnNFcSwgZW1wdHlBdHRycyB9IGZyb20gJy4vYXR0cnMnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi9mcmFnbWVudCdcclxuaW1wb3J0IHsgdHlwZSBNYXJrLCB0eXBlIE1hcmtKU09OLCBtYXJrc0VxLCBub01hcmtzIH0gZnJvbSAnLi9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IE5vZGVUeXBlIH0gZnJvbSAnLi9zY2hlbWEnXHJcblxyXG4vKiogSlNPTiBzaGFwZSBvZiBhIHNlcmlhbGl6ZWQgbm9kZS4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBOb2RlSlNPTiB7XHJcbiAgcmVhZG9ubHkgdHlwZTogc3RyaW5nXHJcbiAgcmVhZG9ubHkgYXR0cnM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxyXG4gIHJlYWRvbmx5IGNvbnRlbnQ/OiByZWFkb25seSBOb2RlSlNPTltdXHJcbiAgcmVhZG9ubHkgbWFya3M/OiByZWFkb25seSBNYXJrSlNPTltdXHJcbiAgcmVhZG9ubHkgdGV4dD86IHN0cmluZ1xyXG59XHJcblxyXG4vKipcclxuICogQSBub2RlIGluIHRoZSBkb2N1bWVudCB0cmVlLiBJbW11dGFibGUuIEFsbCBcIm11dGF0b3JzXCIgcmV0dXJuIG5ldyBub2Rlcy5cclxuICogVGV4dCBsaXZlcyBpbiB0aGUge0BsaW5rIFRleHROb2RlfSBzdWJjbGFzcy5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3JOb2RlIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IHR5cGU6IE5vZGVUeXBlLFxyXG4gICAgcmVhZG9ubHkgYXR0cnM6IEF0dHJzID0gZW1wdHlBdHRycyxcclxuICAgIHJlYWRvbmx5IGNvbnRlbnQ6IEZyYWdtZW50ID0gRnJhZ21lbnQuZW1wdHksXHJcbiAgICByZWFkb25seSBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyxcclxuICApIHt9XHJcblxyXG4gIGdldCBpc1RleHQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcblxyXG4gIGdldCBpc0lubGluZSgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnR5cGUuaXNJbmxpbmVcclxuICB9XHJcblxyXG4gIGdldCBpc0Jsb2NrKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuICF0aGlzLnR5cGUuaXNJbmxpbmVcclxuICB9XHJcblxyXG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBub2RlIGhhcyBubyBlZGl0YWJsZSBjb250ZW50IG9mIGl0cyBvd24gKGltYWdlLCBociwgXHUyMDI2KS4gKi9cclxuICBnZXQgaXNBdG9tKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudHlwZS5pc0F0b21cclxuICB9XHJcblxyXG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBub2RlIGRpcmVjdGx5IGNvbnRhaW5zIGlubGluZSBjb250ZW50IChwYXJhZ3JhcGgsIGhlYWRpbmcsIFx1MjAyNikuICovXHJcbiAgZ2V0IGlzVGV4dGJsb2NrKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudHlwZS5pbmxpbmVDb250ZW50XHJcbiAgfVxyXG5cclxuICBnZXQgY2hpbGRDb3VudCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIHRoaXMuY29udGVudC5jaGlsZENvdW50XHJcbiAgfVxyXG5cclxuICBjaGlsZChpbmRleDogbnVtYmVyKTogRWRpdG9yTm9kZSB7XHJcbiAgICByZXR1cm4gdGhpcy5jb250ZW50LmNoaWxkKGluZGV4KVxyXG4gIH1cclxuXHJcbiAgZ2V0IHRleHRDb250ZW50KCk6IHN0cmluZyB7XHJcbiAgICBsZXQgdGV4dCA9ICcnXHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY29udGVudC5jaGlsZHJlbikge1xyXG4gICAgICB0ZXh0ICs9IGNoaWxkLmlzVGV4dCA/IChjaGlsZCBhcyBUZXh0Tm9kZSkudGV4dCA6IGNoaWxkLnRleHRDb250ZW50XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGV4dFxyXG4gIH1cclxuXHJcbiAgd2l0aENvbnRlbnQoY29udGVudDogRnJhZ21lbnQpOiBFZGl0b3JOb2RlIHtcclxuICAgIHJldHVybiBuZXcgRWRpdG9yTm9kZSh0aGlzLnR5cGUsIHRoaXMuYXR0cnMsIGNvbnRlbnQsIHRoaXMubWFya3MpXHJcbiAgfVxyXG5cclxuICB3aXRoQXR0cnMoYXR0cnM6IEF0dHJzKTogRWRpdG9yTm9kZSB7XHJcbiAgICByZXR1cm4gbmV3IEVkaXRvck5vZGUodGhpcy50eXBlLCBhdHRycywgdGhpcy5jb250ZW50LCB0aGlzLm1hcmtzKVxyXG4gIH1cclxuXHJcbiAgd2l0aE1hcmtzKG1hcmtzOiByZWFkb25seSBNYXJrW10pOiBFZGl0b3JOb2RlIHtcclxuICAgIHJldHVybiBuZXcgRWRpdG9yTm9kZSh0aGlzLnR5cGUsIHRoaXMuYXR0cnMsIHRoaXMuY29udGVudCwgbWFya3MpXHJcbiAgfVxyXG5cclxuICBlcShvdGhlcjogRWRpdG9yTm9kZSk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHRoaXMgPT09IG90aGVyKSByZXR1cm4gdHJ1ZVxyXG4gICAgcmV0dXJuIChcclxuICAgICAgdGhpcy50eXBlID09PSBvdGhlci50eXBlICYmXHJcbiAgICAgIGF0dHJzRXEodGhpcy5hdHRycywgb3RoZXIuYXR0cnMpICYmXHJcbiAgICAgIG1hcmtzRXEodGhpcy5tYXJrcywgb3RoZXIubWFya3MpICYmXHJcbiAgICAgIHRoaXMuY29udGVudC5lcShvdGhlci5jb250ZW50KVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgdG9KU09OKCk6IE5vZGVKU09OIHtcclxuICAgIGNvbnN0IGpzb246IHtcclxuICAgICAgdHlwZTogc3RyaW5nXHJcbiAgICAgIGF0dHJzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cclxuICAgICAgY29udGVudD86IE5vZGVKU09OW11cclxuICAgICAgbWFya3M/OiBNYXJrSlNPTltdXHJcbiAgICB9ID0geyB0eXBlOiB0aGlzLnR5cGUubmFtZSB9XHJcbiAgICBjb25zdCBhdHRycyA9IG5vbkRlZmF1bHRBdHRycyh0aGlzLnR5cGUuc3BlYy5hdHRycywgdGhpcy5hdHRycylcclxuICAgIGlmIChhdHRycykganNvbi5hdHRycyA9IGF0dHJzXHJcbiAgICBpZiAodGhpcy5jb250ZW50LmNoaWxkQ291bnQgPiAwKSBqc29uLmNvbnRlbnQgPSB0aGlzLmNvbnRlbnQuY2hpbGRyZW4ubWFwKChjKSA9PiBjLnRvSlNPTigpKVxyXG4gICAgaWYgKHRoaXMubWFya3MubGVuZ3RoID4gMCkganNvbi5tYXJrcyA9IHRoaXMubWFya3MubWFwKChtKSA9PiBtLnRvSlNPTigpKVxyXG4gICAgcmV0dXJuIGpzb25cclxuICB9XHJcbn1cclxuXHJcbi8qKiBBIHJ1biBvZiB0ZXh0IHdpdGggYSB1bmlmb3JtIG1hcmsgc2V0LiAqL1xyXG5leHBvcnQgY2xhc3MgVGV4dE5vZGUgZXh0ZW5kcyBFZGl0b3JOb2RlIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHR5cGU6IE5vZGVUeXBlLFxyXG4gICAgcmVhZG9ubHkgdGV4dDogc3RyaW5nLFxyXG4gICAgbWFya3M6IHJlYWRvbmx5IE1hcmtbXSA9IG5vTWFya3MsXHJcbiAgKSB7XHJcbiAgICBpZiAodGV4dC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdUZXh0Tm9kZSBtYXkgbm90IGJlIGVtcHR5JylcclxuICAgIHN1cGVyKHR5cGUsIGVtcHR5QXR0cnMsIEZyYWdtZW50LmVtcHR5LCBtYXJrcylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGdldCBpc1RleHQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZ2V0IHRleHRDb250ZW50KCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy50ZXh0XHJcbiAgfVxyXG5cclxuICB3aXRoVGV4dCh0ZXh0OiBzdHJpbmcpOiBUZXh0Tm9kZSB7XHJcbiAgICByZXR1cm4gbmV3IFRleHROb2RlKHRoaXMudHlwZSwgdGV4dCwgdGhpcy5tYXJrcylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHdpdGhNYXJrcyhtYXJrczogcmVhZG9ubHkgTWFya1tdKTogVGV4dE5vZGUge1xyXG4gICAgcmV0dXJuIG5ldyBUZXh0Tm9kZSh0aGlzLnR5cGUsIHRoaXMudGV4dCwgbWFya3MpXHJcbiAgfVxyXG5cclxuICBjdXQoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyID0gdGhpcy50ZXh0Lmxlbmd0aCk6IFRleHROb2RlIHtcclxuICAgIHJldHVybiB0aGlzLndpdGhUZXh0KHRoaXMudGV4dC5zbGljZShmcm9tLCB0bykpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBlcShvdGhlcjogRWRpdG9yTm9kZSk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHRoaXMgPT09IG90aGVyKSByZXR1cm4gdHJ1ZVxyXG4gICAgcmV0dXJuIChcclxuICAgICAgb3RoZXIuaXNUZXh0ICYmIChvdGhlciBhcyBUZXh0Tm9kZSkudGV4dCA9PT0gdGhpcy50ZXh0ICYmIG1hcmtzRXEodGhpcy5tYXJrcywgb3RoZXIubWFya3MpXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogTm9kZUpTT04ge1xyXG4gICAgY29uc3QganNvbjogeyB0eXBlOiBzdHJpbmc7IHRleHQ6IHN0cmluZzsgbWFya3M/OiBNYXJrSlNPTltdIH0gPSB7XHJcbiAgICAgIHR5cGU6IHRoaXMudHlwZS5uYW1lLFxyXG4gICAgICB0ZXh0OiB0aGlzLnRleHQsXHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tYXJrcy5sZW5ndGggPiAwKSBqc29uLm1hcmtzID0gdGhpcy5tYXJrcy5tYXAoKG0pID0+IG0udG9KU09OKCkpXHJcbiAgICByZXR1cm4ganNvblxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEF0dHJpYnV0ZXMgd29ydGggc2VyaWFsaXppbmc6IHZhbHVlcyBlcXVhbCB0byB0aGVpciBzY2hlbWEgZGVmYXVsdCBhcmVcclxuICogb21pdHRlZCwgc2luY2Uge0BsaW5rIGNvbXB1dGVBdHRyc30gcmVzdG9yZXMgdGhlbSBvbiBsb2FkLiBLZWVwcyBzdG9yZWRcclxuICogZG9jdW1lbnRzIGZyZWUgb2Ygbm9pc2UgbGlrZSAgb24gZXZlcnkgcGFyYWdyYXBoLlxyXG4gKi9cclxuZnVuY3Rpb24gbm9uRGVmYXVsdEF0dHJzKFxyXG4gIHNwZWNBdHRyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9Pj4gfCB1bmRlZmluZWQsXHJcbiAgYXR0cnM6IEF0dHJzLFxyXG4pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XHJcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9XHJcbiAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGF0dHJzKSkge1xyXG4gICAgY29uc3Qgc3BlYyA9IHNwZWNBdHRycz8uW25hbWVdXHJcbiAgICBpZiAoc3BlYyAmJiAnZGVmYXVsdCcgaW4gc3BlYyAmJiBzcGVjLmRlZmF1bHQgPT09IHZhbHVlKSBjb250aW51ZVxyXG4gICAgb3V0W25hbWVdID0gdmFsdWVcclxuICB9XHJcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG91dCkubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZFxyXG59XHJcbiIsICIvKipcclxuICogQ29udGVudCBleHByZXNzaW9ucyBkZXNjcmliZSB3aGF0IGNoaWxkcmVuIGEgbm9kZSBhbGxvd3MsIGUuZy4gYFwiYmxvY2srXCJgLFxyXG4gKiBgXCJpbmxpbmUqXCJgLCBgXCJsaXN0SXRlbStcImAsIG9yIHNlcXVlbmNlcyBsaWtlIGBcImhlYWRpbmcgYmxvY2sqXCJgLlxyXG4gKlxyXG4gKiBTdXBwb3J0ZWQgZ3JhbW1hciAoc2VlIEFEUi0wMDAyKTogd2hpdGVzcGFjZS1zZXBhcmF0ZWQgdGVybXMsIGVhY2ggYSBub2RlXHJcbiAqIG5hbWUgb3IgZ3JvdXAgbmFtZSB3aXRoIGFuIG9wdGlvbmFsIGA/YCwgYCpgIG9yIGArYCBxdWFudGlmaWVyLiBNYXRjaGluZyBpc1xyXG4gKiBncmVlZHkgYW5kIHNlcXVlbnRpYWwuXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIENvbnRlbnRUZXJtIHtcclxuICByZWFkb25seSBuYW1lczogUmVhZG9ubHlTZXQ8c3RyaW5nPlxyXG4gIHJlYWRvbmx5IG1pbjogbnVtYmVyXHJcbiAgcmVhZG9ubHkgbWF4OiBudW1iZXJcclxufVxyXG5cclxuY29uc3QgVEVSTV9QQVRURVJOID0gL14oW2EtekEtWl9dW1xcd10qKShbKyo/XSk/JC9cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvbnRlbnRFeHByKFxyXG4gIGV4cHI6IHN0cmluZyxcclxuICByZXNvbHZlTmFtZTogKG5hbWU6IHN0cmluZykgPT4gcmVhZG9ubHkgc3RyaW5nW10sXHJcbik6IHJlYWRvbmx5IENvbnRlbnRUZXJtW10ge1xyXG4gIGNvbnN0IHRyaW1tZWQgPSBleHByLnRyaW0oKVxyXG4gIGlmICh0cmltbWVkID09PSAnJykgcmV0dXJuIFtdXHJcbiAgcmV0dXJuIHRyaW1tZWQuc3BsaXQoL1xccysvKS5tYXAoKHRva2VuKSA9PiB7XHJcbiAgICBjb25zdCBtYXRjaCA9IFRFUk1fUEFUVEVSTi5leGVjKHRva2VuKVxyXG4gICAgaWYgKCFtYXRjaCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKGBJbnZhbGlkIGNvbnRlbnQgZXhwcmVzc2lvbiB0ZXJtIFwiJHt0b2tlbn1cIiBpbiBcIiR7ZXhwcn1cImApXHJcbiAgICBjb25zdCBbLCBuYW1lLCBxdWFudGlmaWVyXSA9IG1hdGNoXHJcbiAgICBjb25zdCBuYW1lcyA9IHJlc29sdmVOYW1lKG5hbWUgYXMgc3RyaW5nKVxyXG4gICAgaWYgKG5hbWVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgVW5rbm93biBub2RlIG9yIGdyb3VwIFwiJHtuYW1lfVwiIGluIGNvbnRlbnQgZXhwcmVzc2lvbiBcIiR7ZXhwcn1cImApXHJcbiAgICB9XHJcbiAgICBzd2l0Y2ggKHF1YW50aWZpZXIpIHtcclxuICAgICAgY2FzZSAnKyc6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDEsIG1heDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIH1cclxuICAgICAgY2FzZSAnKic6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDAsIG1heDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIH1cclxuICAgICAgY2FzZSAnPyc6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDAsIG1heDogMSB9XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDEsIG1heDogMSB9XHJcbiAgICB9XHJcbiAgfSlcclxufVxyXG5cclxuLyoqIEdyZWVkeSBzZXF1ZW50aWFsIG1hdGNoIG9mIGNoaWxkIHR5cGUgbmFtZXMgYWdhaW5zdCB0aGUgcGFyc2VkIHRlcm1zLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hlc0NvbnRlbnQoXHJcbiAgdGVybXM6IHJlYWRvbmx5IENvbnRlbnRUZXJtW10sXHJcbiAgY2hpbGROYW1lczogcmVhZG9ubHkgc3RyaW5nW10sXHJcbik6IGJvb2xlYW4ge1xyXG4gIGxldCBpID0gMFxyXG4gIGZvciAoY29uc3QgdGVybSBvZiB0ZXJtcykge1xyXG4gICAgbGV0IGNvdW50ID0gMFxyXG4gICAgd2hpbGUgKGkgPCBjaGlsZE5hbWVzLmxlbmd0aCAmJiBjb3VudCA8IHRlcm0ubWF4ICYmIHRlcm0ubmFtZXMuaGFzKGNoaWxkTmFtZXNbaV0pKSB7XHJcbiAgICAgIGkrK1xyXG4gICAgICBjb3VudCsrXHJcbiAgICB9XHJcbiAgICBpZiAoY291bnQgPCB0ZXJtLm1pbikgcmV0dXJuIGZhbHNlXHJcbiAgfVxyXG4gIHJldHVybiBpID09PSBjaGlsZE5hbWVzLmxlbmd0aFxyXG59XHJcbiIsICJpbXBvcnQgeyB0eXBlIEF0dHJzLCBjb21wdXRlQXR0cnMgfSBmcm9tICcuL2F0dHJzJ1xyXG5pbXBvcnQgeyB0eXBlIENvbnRlbnRUZXJtLCBtYXRjaGVzQ29udGVudCwgcGFyc2VDb250ZW50RXhwciB9IGZyb20gJy4vY29udGVudCdcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuL2ZyYWdtZW50J1xyXG5pbXBvcnQgeyBNYXJrLCBub01hcmtzIH0gZnJvbSAnLi9tYXJrJ1xyXG5pbXBvcnQgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4vbm9kZSdcclxuXHJcbi8qKiBEZWNsYXJhdGl2ZSBIVE1MIG91dHB1dCBmb3IgYSBub2RlIG9yIG1hcmssIGNvbnN1bWVkIGJ5IHRoZSBIVE1MIHNlcmlhbGl6ZXIuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgSFRNTFNwZWMge1xyXG4gIHJlYWRvbmx5IHRhZzogc3RyaW5nXHJcbiAgcmVhZG9ubHkgYXR0cnM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PlxyXG4gIC8qKiBWb2lkIGVsZW1lbnRzIChiciwgaHIsIGltZykgcmVuZGVyIHdpdGhvdXQgY2hpbGRyZW4gb3IgYSBjbG9zaW5nIHRhZy4gKi9cclxuICByZWFkb25seSBpc1ZvaWQ/OiBib29sZWFuXHJcbiAgLyoqIE9wdGlvbmFsIGlubmVyIHdyYXBwZXIgdGFnIChlLmcuIHRoZSBgY29kZWAgaW4gYHByZSA+IGNvZGVgKS4gKi9cclxuICByZWFkb25seSBjaGlsZFRhZz86IHN0cmluZ1xyXG4gIC8qKiBMaXRlcmFsIHRleHQgY29udGVudCBmb3IgYXRvbSBub2RlcyAoYSBiYWRnZSdzIGxhYmVsLCBhIGZvb3Rub3RlIG1hcmtlcikuICovXHJcbiAgcmVhZG9ubHkgdGV4dD86IHN0cmluZ1xyXG4gIC8qKlxyXG4gICAqIFRydXN0ZWQgbWFya3VwIHJlbmRlcmVkIGluc2lkZSBhbiBhdG9tIGluIHBsYWNlIG9mIGB0ZXh0YCwgYSBmb3JtdWxhJ3NcclxuICAgKiBNYXRoTUwsIGEgbGluayBjYXJkJ3MgdGl0bGUgYW5kIGRlc2NyaXB0aW9uLiBJdCBpcyBpbnNlcnRlZCB2ZXJiYXRpbSBieVxyXG4gICAqIGJvdGggdGhlIHNlcmlhbGl6ZXIgYW5kIHRoZSBET00gcmVuZGVyZXIsIHNvIHRoZSBzcGVjIGF1dGhvciBidWlsZHMgaXRcclxuICAgKiBhbmQgbXVzdCBlc2NhcGUgZXZlcnkgZHluYW1pYyB2YWx1ZSBpdCBjYXJyaWVzLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IGlubmVySFRNTD86IHN0cmluZ1xyXG59XHJcblxyXG4vKipcclxuICogQSBydWxlIGZvciBpbXBvcnRpbmcgSFRNTDogd2hpY2ggdGFnIG1hcHMgdG8gdGhpcyBub2RlL21hcmssIGFuZCBob3cgaXRzXHJcbiAqIGF0dHJpYnV0ZXMgdHJhbnNsYXRlLiBgZ2V0QXR0cnNgIHJldHVybmluZyBgZmFsc2VgIHJlamVjdHMgdGhlIG1hdGNoICh0aGVcclxuICogZWxlbWVudCBpcyB0aGVuIHRyZWF0ZWQgYXMgdW5rbm93bjoga2VwdCBjb250ZW50LCBkcm9wcGVkIGZvcm1hdHRpbmcpLlxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBQYXJzZVJ1bGUge1xyXG4gIC8qKiBMb3dlcmNhc2UgdGFnIG5hbWUgdG8gbWF0Y2ggKGUuZy4gYFwiaDJcImAsIGBcInN0cm9uZ1wiYCkuICovXHJcbiAgcmVhZG9ubHkgdGFnOiBzdHJpbmdcclxuICAvKiogQXR0cmlidXRlIHRoYXQgbXVzdCBhZGRpdGlvbmFsbHkgYmUgcHJlc2VudCBvbiB0aGUgZWxlbWVudC4gKi9cclxuICByZWFkb25seSBhdHRyaWJ1dGU/OiBzdHJpbmdcclxuICByZWFkb25seSBnZXRBdHRycz86IChlbGVtZW50OiBIVE1MRWxlbWVudCkgPT4gQXR0cnMgfCBudWxsIHwgZmFsc2VcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBOb2RlU3BlYyB7XHJcbiAgLyoqIENvbnRlbnQgZXhwcmVzc2lvbiwgZS5nLiBgXCJibG9jaytcImAgb3IgYFwiaW5saW5lKlwiYC4gT21pdCBmb3IgbGVhZiBub2Rlcy4gKi9cclxuICByZWFkb25seSBjb250ZW50Pzogc3RyaW5nXHJcbiAgLyoqIFNwYWNlLXNlcGFyYXRlZCBncm91cCBuYW1lcyB0aGlzIG5vZGUgYmVsb25ncyB0byAoZS5nLiBgXCJibG9ja1wiYCkuICovXHJcbiAgcmVhZG9ubHkgZ3JvdXA/OiBzdHJpbmdcclxuICByZWFkb25seSBpbmxpbmU/OiBib29sZWFuXHJcbiAgcmVhZG9ubHkgYXRvbT86IGJvb2xlYW5cclxuICByZWFkb25seSBhdHRycz86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHsgZGVmYXVsdD86IHVua25vd24gfT4+XHJcbiAgLyoqXHJcbiAgICogTWFya3MgYWxsb3dlZCBvbiBpbmxpbmUgY29udGVudDogYFwiX1wiYCBmb3IgYWxsIChkZWZhdWx0IGZvciB0ZXh0YmxvY2tzKSxcclxuICAgKiBgXCJcImAgZm9yIG5vbmUsIG9yIHNwYWNlLXNlcGFyYXRlZCBtYXJrIG5hbWVzLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IG1hcmtzPzogc3RyaW5nXHJcbiAgLyoqIFByZXNlcnZlIHdoaXRlc3BhY2UgdmVyYmF0aW0gd2hlbiBwYXJzaW5nIGludG8gdGhpcyBub2RlIChjb2RlIGJsb2NrcykuICovXHJcbiAgcmVhZG9ubHkgcHJlc2VydmVXaGl0ZXNwYWNlPzogYm9vbGVhblxyXG4gIHJlYWRvbmx5IHRvSFRNTD86IChub2RlOiBFZGl0b3JOb2RlKSA9PiBIVE1MU3BlY1xyXG4gIHJlYWRvbmx5IHBhcnNlSFRNTD86IHJlYWRvbmx5IFBhcnNlUnVsZVtdXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTWFya1NwZWMge1xyXG4gIHJlYWRvbmx5IGF0dHJzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9Pj5cclxuICAvKiogU3BhY2Utc2VwYXJhdGVkIG1hcmsgbmFtZXMgdGhpcyBtYXJrIGV4Y2x1ZGVzLCBvciBgXCJfXCJgIGZvciBhbGwuIEFsd2F5cyBleGNsdWRlcyBpdHNlbGYuICovXHJcbiAgcmVhZG9ubHkgZXhjbHVkZXM/OiBzdHJpbmdcclxuICByZWFkb25seSB0b0hUTUw/OiAobWFyazogTWFyaykgPT4gSFRNTFNwZWNcclxuICByZWFkb25seSBwYXJzZUhUTUw/OiByZWFkb25seSBQYXJzZVJ1bGVbXVxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNjaGVtYVNwZWMge1xyXG4gIHJlYWRvbmx5IG5vZGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBOb2RlU3BlYz4+XHJcbiAgcmVhZG9ubHkgbWFya3M/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBNYXJrU3BlYz4+XHJcbiAgLyoqIE5hbWUgb2YgdGhlIHRvcC1sZXZlbCBub2RlIHR5cGUuIERlZmF1bHRzIHRvIGBcImRvY1wiYC4gKi9cclxuICByZWFkb25seSB0b3BOb2RlPzogc3RyaW5nXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBOb2RlVHlwZSB7XHJcbiAgcHJpdmF0ZSBjb250ZW50VGVybXM6IHJlYWRvbmx5IENvbnRlbnRUZXJtW10gPSBbXVxyXG4gIHByaXZhdGUgYWxsb3dlZE1hcmtzOiAnYWxsJyB8ICdub25lJyB8IFJlYWRvbmx5U2V0PHN0cmluZz4gPSAnbm9uZSdcclxuICAvKiogV2hldGhlciB0aGlzIG5vZGUncyBjb250ZW50IGV4cHJlc3Npb24gYWRtaXRzIGlubGluZSBjaGlsZHJlbi4gKi9cclxuICBpbmxpbmVDb250ZW50ID0gZmFsc2VcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBuYW1lOiBzdHJpbmcsXHJcbiAgICByZWFkb25seSBzY2hlbWE6IFNjaGVtYSxcclxuICAgIHJlYWRvbmx5IHNwZWM6IE5vZGVTcGVjLFxyXG4gICkge31cclxuXHJcbiAgZ2V0IGlzVGV4dCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLm5hbWUgPT09ICd0ZXh0J1xyXG4gIH1cclxuXHJcbiAgZ2V0IGlzSW5saW5lKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuaXNUZXh0IHx8IHRoaXMuc3BlYy5pbmxpbmUgPT09IHRydWVcclxuICB9XHJcblxyXG4gIGdldCBpc0F0b20oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zcGVjLmF0b20gPT09IHRydWVcclxuICB9XHJcblxyXG4gIGdldCBncm91cHMoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIHRoaXMuc3BlYy5ncm91cCA/IHRoaXMuc3BlYy5ncm91cC5zcGxpdCgvXFxzKy8pIDogW11cclxuICB9XHJcblxyXG4gIC8qKiBAaW50ZXJuYWwgUmVzb2x2ZSBjb250ZW50IGV4cHJlc3Npb24gYW5kIG1hcmsgcnVsZXM7IGNhbGxlZCBvbmNlIGJ5IFNjaGVtYS4gKi9cclxuICByZXNvbHZlKHJlc29sdmVOYW1lOiAobmFtZTogc3RyaW5nKSA9PiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xyXG4gICAgdGhpcy5jb250ZW50VGVybXMgPSB0aGlzLnNwZWMuY29udGVudCA/IHBhcnNlQ29udGVudEV4cHIodGhpcy5zcGVjLmNvbnRlbnQsIHJlc29sdmVOYW1lKSA6IFtdXHJcbiAgICBjb25zdCBjaGlsZE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KClcclxuICAgIGZvciAoY29uc3QgdGVybSBvZiB0aGlzLmNvbnRlbnRUZXJtcykge1xyXG4gICAgICBmb3IgKGNvbnN0IG5hbWUgb2YgdGVybS5uYW1lcykgY2hpbGROYW1lcy5hZGQobmFtZSlcclxuICAgIH1cclxuICAgIGNvbnN0IGNoaWxkVHlwZXMgPSBbLi4uY2hpbGROYW1lc10ubWFwKChuYW1lKSA9PiB0aGlzLnNjaGVtYS5ub2RlVHlwZShuYW1lKSlcclxuICAgIGNvbnN0IGhhc0lubGluZSA9IGNoaWxkVHlwZXMuc29tZSgodHlwZSkgPT4gdHlwZS5pc0lubGluZSlcclxuICAgIGNvbnN0IGhhc0Jsb2NrID0gY2hpbGRUeXBlcy5zb21lKCh0eXBlKSA9PiAhdHlwZS5pc0lubGluZSlcclxuICAgIGlmIChoYXNJbmxpbmUgJiYgaGFzQmxvY2spIHtcclxuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYE5vZGUgXCIke3RoaXMubmFtZX1cIiBtaXhlcyBpbmxpbmUgYW5kIGJsb2NrIGNvbnRlbnRgKVxyXG4gICAgfVxyXG4gICAgdGhpcy5pbmxpbmVDb250ZW50ID0gaGFzSW5saW5lXHJcbiAgICBjb25zdCBtYXJrcyA9IHRoaXMuc3BlYy5tYXJrc1xyXG4gICAgaWYgKG1hcmtzID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5hbGxvd2VkTWFya3MgPSB0aGlzLmlubGluZUNvbnRlbnQgPyAnYWxsJyA6ICdub25lJ1xyXG4gICAgfSBlbHNlIGlmIChtYXJrcyA9PT0gJ18nKSB7XHJcbiAgICAgIHRoaXMuYWxsb3dlZE1hcmtzID0gJ2FsbCdcclxuICAgIH0gZWxzZSBpZiAobWFya3MudHJpbSgpID09PSAnJykge1xyXG4gICAgICB0aGlzLmFsbG93ZWRNYXJrcyA9ICdub25lJ1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5hbGxvd2VkTWFya3MgPSBuZXcgU2V0KG1hcmtzLnRyaW0oKS5zcGxpdCgvXFxzKy8pKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdmFsaWRDb250ZW50KGNvbnRlbnQ6IEZyYWdtZW50KTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gbWF0Y2hlc0NvbnRlbnQoXHJcbiAgICAgIHRoaXMuY29udGVudFRlcm1zLFxyXG4gICAgICBjb250ZW50LmNoaWxkcmVuLm1hcCgoY2hpbGQpID0+IGNoaWxkLnR5cGUubmFtZSksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBhbGxvd3NNYXJrVHlwZShtYXJrVHlwZTogTWFya1R5cGUpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzLmFsbG93ZWRNYXJrcyA9PT0gJ2FsbCcpIHJldHVybiB0cnVlXHJcbiAgICBpZiAodGhpcy5hbGxvd2VkTWFya3MgPT09ICdub25lJykgcmV0dXJuIGZhbHNlXHJcbiAgICByZXR1cm4gdGhpcy5hbGxvd2VkTWFya3MuaGFzKG1hcmtUeXBlLm5hbWUpXHJcbiAgfVxyXG5cclxuICAvKiogVHJ1ZSB3aGVuIHRoaXMgdHlwZSBjYW4gaG9sZCBhbiBlbXB0eSBmcmFnbWVudCBhcyBjb250ZW50LiAqL1xyXG4gIGdldCBhbGxvd3NFbXB0eUNvbnRlbnQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gbWF0Y2hlc0NvbnRlbnQodGhpcy5jb250ZW50VGVybXMsIFtdKVxyXG4gIH1cclxuXHJcbiAgY3JlYXRlKFxyXG4gICAgYXR0cnM/OiBBdHRycyxcclxuICAgIGNvbnRlbnQ6IEZyYWdtZW50ID0gRnJhZ21lbnQuZW1wdHksXHJcbiAgICBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyxcclxuICApOiBFZGl0b3JOb2RlIHtcclxuICAgIGlmICh0aGlzLmlzVGV4dCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1VzZSBzY2hlbWEudGV4dCgpIHRvIGNyZWF0ZSB0ZXh0IG5vZGVzJylcclxuICAgIHJldHVybiBuZXcgRWRpdG9yTm9kZShcclxuICAgICAgdGhpcyxcclxuICAgICAgY29tcHV0ZUF0dHJzKHRoaXMuc3BlYy5hdHRycywgYXR0cnMsIGBub2RlIFwiJHt0aGlzLm5hbWV9XCJgKSxcclxuICAgICAgY29udGVudCxcclxuICAgICAgbWFya3MsXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICAvKiogTGlrZSB7QGxpbmsgY3JlYXRlfSBidXQgdmFsaWRhdGVzIHRoZSBjb250ZW50IGFnYWluc3QgdGhpcyB0eXBlJ3MgZXhwcmVzc2lvbi4gKi9cclxuICBjcmVhdGVDaGVja2VkKFxyXG4gICAgYXR0cnM/OiBBdHRycyxcclxuICAgIGNvbnRlbnQ6IEZyYWdtZW50ID0gRnJhZ21lbnQuZW1wdHksXHJcbiAgICBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyxcclxuICApOiBFZGl0b3JOb2RlIHtcclxuICAgIGlmICghdGhpcy52YWxpZENvbnRlbnQoY29udGVudCkpIHtcclxuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYEludmFsaWQgY29udGVudCBmb3Igbm9kZSB0eXBlIFwiJHt0aGlzLm5hbWV9XCJgKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlKGF0dHJzLCBjb250ZW50LCBtYXJrcylcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXJrVHlwZSB7XHJcbiAgcHJpdmF0ZSBleGNsdWRlZDogJ2FsbCcgfCBSZWFkb25seVNldDxzdHJpbmc+XHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxyXG4gICAgcmVhZG9ubHkgcmFuazogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgc3BlYzogTWFya1NwZWMsXHJcbiAgKSB7XHJcbiAgICBjb25zdCBleGNsdWRlcyA9IHNwZWMuZXhjbHVkZXNcclxuICAgIGlmIChleGNsdWRlcyA9PT0gJ18nKSB7XHJcbiAgICAgIHRoaXMuZXhjbHVkZWQgPSAnYWxsJ1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3QgbmFtZXMgPSBleGNsdWRlcyA/IGV4Y2x1ZGVzLnRyaW0oKS5zcGxpdCgvXFxzKy8pLmZpbHRlcihCb29sZWFuKSA6IFtdXHJcbiAgICAgIHRoaXMuZXhjbHVkZWQgPSBuZXcgU2V0KG5hbWVzKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXRoZXIgYWRkaW5nIHRoaXMgbWFyayBzaG91bGQgZGlzcGxhY2UgbWFya3Mgb2YgYG90aGVyYCdzIHR5cGUuICovXHJcbiAgZXhjbHVkZXMob3RoZXI6IE1hcmtUeXBlKTogYm9vbGVhbiB7XHJcbiAgICBpZiAob3RoZXIgPT09IHRoaXMpIHJldHVybiB0cnVlXHJcbiAgICBpZiAodGhpcy5leGNsdWRlZCA9PT0gJ2FsbCcpIHJldHVybiB0cnVlXHJcbiAgICByZXR1cm4gdGhpcy5leGNsdWRlZC5oYXMob3RoZXIubmFtZSlcclxuICB9XHJcblxyXG4gIGNyZWF0ZShhdHRycz86IEF0dHJzKTogTWFyayB7XHJcbiAgICByZXR1cm4gbmV3IE1hcmsodGhpcywgY29tcHV0ZUF0dHJzKHRoaXMuc3BlYy5hdHRycywgYXR0cnMsIGBtYXJrIFwiJHt0aGlzLm5hbWV9XCJgKSlcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgc2V0IG9mIG5vZGUgYW5kIG1hcmsgdHlwZXMgYSBkb2N1bWVudCBtYXkgY29udGFpbiwgcGx1cyBmYWN0b3J5IGhlbHBlcnMuXHJcbiAqIFJlcXVpcmVzIGEgYHRleHRgIG5vZGUgdHlwZSBhbmQgYSB0b3AtbGV2ZWwgdHlwZSAoZGVmYXVsdCBgXCJkb2NcImApLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFNjaGVtYSB7XHJcbiAgcmVhZG9ubHkgbm9kZXM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIE5vZGVUeXBlPj5cclxuICByZWFkb25seSBtYXJrczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgTWFya1R5cGU+PlxyXG4gIHJlYWRvbmx5IHRvcFR5cGU6IE5vZGVUeXBlXHJcbiAgcmVhZG9ubHkgdGV4dFR5cGU6IE5vZGVUeXBlXHJcblxyXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHNwZWM6IFNjaGVtYVNwZWMpIHtcclxuICAgIGNvbnN0IG5vZGVzOiBSZWNvcmQ8c3RyaW5nLCBOb2RlVHlwZT4gPSB7fVxyXG4gICAgZm9yIChjb25zdCBbbmFtZSwgbm9kZVNwZWNdIG9mIE9iamVjdC5lbnRyaWVzKHNwZWMubm9kZXMpKSB7XHJcbiAgICAgIG5vZGVzW25hbWVdID0gbmV3IE5vZGVUeXBlKG5hbWUsIHRoaXMsIG5vZGVTcGVjKVxyXG4gICAgfVxyXG4gICAgY29uc3QgbWFya3M6IFJlY29yZDxzdHJpbmcsIE1hcmtUeXBlPiA9IHt9XHJcbiAgICBsZXQgcmFuayA9IDBcclxuICAgIGZvciAoY29uc3QgW25hbWUsIG1hcmtTcGVjXSBvZiBPYmplY3QuZW50cmllcyhzcGVjLm1hcmtzID8/IHt9KSkge1xyXG4gICAgICBtYXJrc1tuYW1lXSA9IG5ldyBNYXJrVHlwZShuYW1lLCByYW5rKyssIG1hcmtTcGVjKVxyXG4gICAgfVxyXG4gICAgdGhpcy5ub2RlcyA9IG5vZGVzXHJcbiAgICB0aGlzLm1hcmtzID0gbWFya3NcclxuXHJcbiAgICBjb25zdCB0b3BOYW1lID0gc3BlYy50b3BOb2RlID8/ICdkb2MnXHJcbiAgICBjb25zdCB0b3AgPSBub2Rlc1t0b3BOYW1lXVxyXG4gICAgaWYgKCF0b3ApIHRocm93IG5ldyBSYW5nZUVycm9yKGBTY2hlbWEgaXMgbWlzc2luZyBpdHMgdG9wIG5vZGUgdHlwZSBcIiR7dG9wTmFtZX1cImApXHJcbiAgICBjb25zdCB0ZXh0ID0gbm9kZXMudGV4dFxyXG4gICAgaWYgKCF0ZXh0KSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignU2NoZW1hIGlzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIFwidGV4dFwiIG5vZGUgdHlwZScpXHJcbiAgICB0aGlzLnRvcFR5cGUgPSB0b3BcclxuICAgIHRoaXMudGV4dFR5cGUgPSB0ZXh0XHJcblxyXG4gICAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpXHJcbiAgICBmb3IgKGNvbnN0IHR5cGUgb2YgT2JqZWN0LnZhbHVlcyhub2RlcykpIHtcclxuICAgICAgZm9yIChjb25zdCBncm91cCBvZiB0eXBlLmdyb3Vwcykge1xyXG4gICAgICAgIGNvbnN0IG1lbWJlcnMgPSBncm91cHMuZ2V0KGdyb3VwKSA/PyBbXVxyXG4gICAgICAgIG1lbWJlcnMucHVzaCh0eXBlLm5hbWUpXHJcbiAgICAgICAgZ3JvdXBzLnNldChncm91cCwgbWVtYmVycylcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgY29uc3QgcmVzb2x2ZU5hbWUgPSAobmFtZTogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10gPT4ge1xyXG4gICAgICBpZiAobm9kZXNbbmFtZV0pIHJldHVybiBbbmFtZV1cclxuICAgICAgcmV0dXJuIGdyb3Vwcy5nZXQobmFtZSkgPz8gW11cclxuICAgIH1cclxuICAgIGZvciAoY29uc3QgdHlwZSBvZiBPYmplY3QudmFsdWVzKG5vZGVzKSkgdHlwZS5yZXNvbHZlKHJlc29sdmVOYW1lKVxyXG4gIH1cclxuXHJcbiAgbm9kZVR5cGUobmFtZTogc3RyaW5nKTogTm9kZVR5cGUge1xyXG4gICAgY29uc3QgdHlwZSA9IHRoaXMubm9kZXNbbmFtZV1cclxuICAgIGlmICghdHlwZSkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYFVua25vd24gbm9kZSB0eXBlIFwiJHtuYW1lfVwiYClcclxuICAgIHJldHVybiB0eXBlXHJcbiAgfVxyXG5cclxuICBtYXJrVHlwZShuYW1lOiBzdHJpbmcpOiBNYXJrVHlwZSB7XHJcbiAgICBjb25zdCB0eXBlID0gdGhpcy5tYXJrc1tuYW1lXVxyXG4gICAgaWYgKCF0eXBlKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgVW5rbm93biBtYXJrIHR5cGUgXCIke25hbWV9XCJgKVxyXG4gICAgcmV0dXJuIHR5cGVcclxuICB9XHJcblxyXG4gIG5vZGUoXHJcbiAgICBuYW1lOiBzdHJpbmcsXHJcbiAgICBhdHRycz86IEF0dHJzLFxyXG4gICAgY29udGVudD86IEZyYWdtZW50IHwgcmVhZG9ubHkgRWRpdG9yTm9kZVtdLFxyXG4gICAgbWFya3M/OiByZWFkb25seSBNYXJrW10sXHJcbiAgKTogRWRpdG9yTm9kZSB7XHJcbiAgICBjb25zdCBmcmFnbWVudCA9IGNvbnRlbnQgaW5zdGFuY2VvZiBGcmFnbWVudCA/IGNvbnRlbnQgOiBGcmFnbWVudC5mcm9tKGNvbnRlbnQgPz8gW10pXHJcbiAgICByZXR1cm4gdGhpcy5ub2RlVHlwZShuYW1lKS5jcmVhdGUoYXR0cnMsIGZyYWdtZW50LCBtYXJrcylcclxuICB9XHJcblxyXG4gIHRleHQodGV4dDogc3RyaW5nLCBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyk6IFRleHROb2RlIHtcclxuICAgIHJldHVybiBuZXcgVGV4dE5vZGUodGhpcy50ZXh0VHlwZSwgdGV4dCwgbWFya3MpXHJcbiAgfVxyXG5cclxuICBtYXJrKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IE1hcmsge1xyXG4gICAgcmV0dXJuIHRoaXMubWFya1R5cGUobmFtZSkuY3JlYXRlKGF0dHJzKVxyXG4gIH1cclxuXHJcbiAgLyoqIEZpcnN0IG5vbi10ZXh0IG5vZGUgdHlwZSB3aXRoIGlubGluZSBjb250ZW50LCB1c2VkIGFzIHRoZSBkZWZhdWx0IGJsb2NrLiAqL1xyXG4gIGZpcnN0VGV4dGJsb2NrVHlwZSgpOiBOb2RlVHlwZSB7XHJcbiAgICBmb3IgKGNvbnN0IHR5cGUgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLm5vZGVzKSkge1xyXG4gICAgICBpZiAoIXR5cGUuaXNUZXh0ICYmIHR5cGUuaW5saW5lQ29udGVudCAmJiAhdHlwZS5pc0lubGluZSkgcmV0dXJuIHR5cGVcclxuICAgIH1cclxuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdTY2hlbWEgaGFzIG5vIHRleHRibG9jayBub2RlIHR5cGUnKVxyXG4gIH1cclxufVxyXG5cclxuLyoqIENvbnZlbmllbmNlIGZhY3RvcnkgbWF0Y2hpbmcgdGhlIGRvY3VtZW50ZWQgQVBJOiBgc2NoZW1hKHsgbm9kZXMsIG1hcmtzIH0pYC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNjaGVtYShzcGVjOiBTY2hlbWFTcGVjKTogU2NoZW1hIHtcclxuICByZXR1cm4gbmV3IFNjaGVtYShzcGVjKVxyXG59XHJcbiIsICJpbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4vZnJhZ21lbnQnXHJcbmltcG9ydCB7IHR5cGUgTWFyaywgbWFya3NFcSB9IGZyb20gJy4vbWFyaydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4vbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBNYXJrVHlwZSwgTm9kZVR5cGUgfSBmcm9tICcuL3NjaGVtYSdcclxuXHJcbi8qKlxyXG4gKiBJbmxpbmUgY29udGVudCBhZGRyZXNzaW5nOiBjaGFyYWN0ZXIgb2Zmc2V0cyB3aXRoaW4gYSB0ZXh0YmxvY2suIFRleHQgbm9kZXNcclxuICogY29udHJpYnV0ZSB0aGVpciBsZW5ndGg7IGlubGluZSBhdG9tcyAoaGFyZCBicmVhaywgZm9vdG5vdGUgbWFya2VyLCBcdTIwMjYpIGNvdW50IGFzIDEuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5saW5lU2l6ZShub2RlOiBFZGl0b3JOb2RlKTogbnVtYmVyIHtcclxuICByZXR1cm4gbm9kZS5pc1RleHQgPyAobm9kZSBhcyBUZXh0Tm9kZSkudGV4dC5sZW5ndGggOiAxXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpbmxpbmVMZW5ndGgoZnJhZzogRnJhZ21lbnQpOiBudW1iZXIge1xyXG4gIHJldHVybiBmcmFnLmNoaWxkcmVuLnJlZHVjZSgoc3VtLCBjaGlsZCkgPT4gc3VtICsgaW5saW5lU2l6ZShjaGlsZCksIDApXHJcbn1cclxuXHJcbi8qKiBMYXN0IGdyYXBoZW1lIGxlbmd0aCBvZiBhIHN0cmluZyAoc3Vycm9nYXRlL1pXSiBhd2FyZSB3aGVyZSBzdXBwb3J0ZWQpLiAqL1xyXG5mdW5jdGlvbiBsYXN0R3JhcGhlbWVMZW5ndGgodGV4dDogc3RyaW5nKTogbnVtYmVyIHtcclxuICBpZiAodGV4dC5sZW5ndGggPT09IDApIHJldHVybiAwXHJcbiAgaWYgKHR5cGVvZiBJbnRsICE9PSAndW5kZWZpbmVkJyAmJiAnU2VnbWVudGVyJyBpbiBJbnRsKSB7XHJcbiAgICBsZXQgbGFzdCA9ICcnXHJcbiAgICBmb3IgKGNvbnN0IHsgc2VnbWVudCB9IG9mIG5ldyBJbnRsLlNlZ21lbnRlcigpLnNlZ21lbnQodGV4dCkpIGxhc3QgPSBzZWdtZW50XHJcbiAgICByZXR1cm4gbGFzdC5sZW5ndGhcclxuICB9XHJcbiAgY29uc3QgY29kZVBvaW50ID0gdGV4dC5jb2RlUG9pbnRBdCh0ZXh0Lmxlbmd0aCAtIDIpXHJcbiAgcmV0dXJuIGNvZGVQb2ludCAhPT0gdW5kZWZpbmVkICYmIGNvZGVQb2ludCA+IDB4ZmZmZiA/IDIgOiAxXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpcnN0R3JhcGhlbWVMZW5ndGgodGV4dDogc3RyaW5nKTogbnVtYmVyIHtcclxuICBpZiAodGV4dC5sZW5ndGggPT09IDApIHJldHVybiAwXHJcbiAgaWYgKHR5cGVvZiBJbnRsICE9PSAndW5kZWZpbmVkJyAmJiAnU2VnbWVudGVyJyBpbiBJbnRsKSB7XHJcbiAgICBmb3IgKGNvbnN0IHsgc2VnbWVudCB9IG9mIG5ldyBJbnRsLlNlZ21lbnRlcigpLnNlZ21lbnQodGV4dCkpIHJldHVybiBzZWdtZW50Lmxlbmd0aFxyXG4gIH1cclxuICBjb25zdCBjb2RlUG9pbnQgPSB0ZXh0LmNvZGVQb2ludEF0KDApXHJcbiAgcmV0dXJuIGNvZGVQb2ludCAhPT0gdW5kZWZpbmVkICYmIGNvZGVQb2ludCA+IDB4ZmZmZiA/IDIgOiAxXHJcbn1cclxuXHJcbi8qKiBUaGUgb2Zmc2V0IG9uZSBkZWxldGlvbiB1bml0IChncmFwaGVtZSBvciBhdG9tKSBiZWZvcmUgYG9mZnNldGAsIG9yIC0xIGF0IHRoZSBzdGFydC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHByZXZpb3VzSW5saW5lQm91bmRhcnkoZnJhZzogRnJhZ21lbnQsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcclxuICBpZiAob2Zmc2V0IDw9IDApIHJldHVybiAtMVxyXG4gIGxldCBwb3MgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBmcmFnLmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBzaXplID0gaW5saW5lU2l6ZShjaGlsZClcclxuICAgIGNvbnN0IGVuZCA9IHBvcyArIHNpemVcclxuICAgIGlmIChvZmZzZXQgPiBwb3MgJiYgb2Zmc2V0IDw9IGVuZCkge1xyXG4gICAgICBpZiAoIWNoaWxkLmlzVGV4dCkgcmV0dXJuIHBvc1xyXG4gICAgICBjb25zdCBsb2NhbCA9IG9mZnNldCAtIHBvc1xyXG4gICAgICByZXR1cm4gb2Zmc2V0IC0gbGFzdEdyYXBoZW1lTGVuZ3RoKChjaGlsZCBhcyBUZXh0Tm9kZSkudGV4dC5zbGljZSgwLCBsb2NhbCkpXHJcbiAgICB9XHJcbiAgICBwb3MgPSBlbmRcclxuICB9XHJcbiAgcmV0dXJuIC0xXHJcbn1cclxuXHJcbi8qKiBUaGUgb2Zmc2V0IG9uZSBkZWxldGlvbiB1bml0IChncmFwaGVtZSBvciBhdG9tKSBhZnRlciBgb2Zmc2V0YCwgb3IgLTEgYXQgdGhlIGVuZC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG5leHRJbmxpbmVCb3VuZGFyeShmcmFnOiBGcmFnbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xyXG4gIGlmIChvZmZzZXQgPj0gaW5saW5lTGVuZ3RoKGZyYWcpKSByZXR1cm4gLTFcclxuICBsZXQgcG9zID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgZnJhZy5jaGlsZHJlbikge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBjb25zdCBlbmQgPSBwb3MgKyBzaXplXHJcbiAgICBpZiAob2Zmc2V0ID49IHBvcyAmJiBvZmZzZXQgPCBlbmQpIHtcclxuICAgICAgaWYgKCFjaGlsZC5pc1RleHQpIHJldHVybiBlbmRcclxuICAgICAgY29uc3QgbG9jYWwgPSBvZmZzZXQgLSBwb3NcclxuICAgICAgcmV0dXJuIG9mZnNldCArIGZpcnN0R3JhcGhlbWVMZW5ndGgoKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0LnNsaWNlKGxvY2FsKSlcclxuICAgIH1cclxuICAgIHBvcyA9IGVuZFxyXG4gIH1cclxuICByZXR1cm4gLTFcclxufVxyXG5cclxuLyoqIEN1dCB0aGUgaW5saW5lIGNvbnRlbnQgYmV0d2VlbiB0d28gY2hhcmFjdGVyIG9mZnNldHMuIEF0b21zIGFyZSBrZXB0IG9ubHkgd2hlbiBmdWxseSBpbnNpZGUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzbGljZUlubGluZShmcmFnOiBGcmFnbWVudCwgZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogRnJhZ21lbnQge1xyXG4gIGlmIChmcm9tID49IHRvKSByZXR1cm4gRnJhZ21lbnQuZW1wdHlcclxuICBjb25zdCBvdXQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgbGV0IHBvcyA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZyYWcuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IHNpemUgPSBpbmxpbmVTaXplKGNoaWxkKVxyXG4gICAgY29uc3Qgc3RhcnQgPSBwb3NcclxuICAgIGNvbnN0IGVuZCA9IHBvcyArIHNpemVcclxuICAgIHBvcyA9IGVuZFxyXG4gICAgaWYgKGVuZCA8PSBmcm9tKSBjb250aW51ZVxyXG4gICAgaWYgKHN0YXJ0ID49IHRvKSBicmVha1xyXG4gICAgaWYgKGNoaWxkLmlzVGV4dCkge1xyXG4gICAgICBjb25zdCBjdXRGcm9tID0gTWF0aC5tYXgoZnJvbSAtIHN0YXJ0LCAwKVxyXG4gICAgICBjb25zdCBjdXRUbyA9IE1hdGgubWluKHRvIC0gc3RhcnQsIHNpemUpXHJcbiAgICAgIG91dC5wdXNoKGN1dEZyb20gPT09IDAgJiYgY3V0VG8gPT09IHNpemUgPyBjaGlsZCA6IChjaGlsZCBhcyBUZXh0Tm9kZSkuY3V0KGN1dEZyb20sIGN1dFRvKSlcclxuICAgIH0gZWxzZSBpZiAoc3RhcnQgPj0gZnJvbSAmJiBlbmQgPD0gdG8pIHtcclxuICAgICAgb3V0LnB1c2goY2hpbGQpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBGcmFnbWVudC5mcm9tKG91dClcclxufVxyXG5cclxuLyoqIE1lcmdlIGFkamFjZW50IHRleHQgbm9kZXMgdGhhdCBzaGFyZSBhbiBpZGVudGljYWwgbWFyayBzZXQuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUlubGluZShmcmFnOiBGcmFnbWVudCk6IEZyYWdtZW50IHtcclxuICBjb25zdCBvdXQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBmcmFnLmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBsYXN0ID0gb3V0W291dC5sZW5ndGggLSAxXVxyXG4gICAgaWYgKGxhc3Q/LmlzVGV4dCAmJiBjaGlsZC5pc1RleHQgJiYgbWFya3NFcShsYXN0Lm1hcmtzLCBjaGlsZC5tYXJrcykpIHtcclxuICAgICAgY29uc3QgbGFzdFRleHQgPSBsYXN0IGFzIFRleHROb2RlXHJcbiAgICAgIG91dFtvdXQubGVuZ3RoIC0gMV0gPSBsYXN0VGV4dC53aXRoVGV4dChsYXN0VGV4dC50ZXh0ICsgKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgb3V0LnB1c2goY2hpbGQpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBvdXQubGVuZ3RoID09PSBmcmFnLmNoaWxkQ291bnQgPyBmcmFnIDogRnJhZ21lbnQuZnJvbShvdXQpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBZGFwdCBpbmxpbmUgY29udGVudCB0byB3aGF0IGEgYmxvY2sgd2lsbCBhY3R1YWxseSBob2xkLiBNYXJrcyB0aGUgYmxvY2tcclxuICogZm9yYmlkcyBhcmUgZHJvcHBlZCwgYW5kIGFuIGlubGluZSBub2RlIGl0IGNhbm5vdCBjb250YWluIGlzIHJlZHVjZWQgdG8gdGhlXHJcbiAqIHRleHQgaXQgc3RhbmRzIGZvci4gQSBoYXJkIGJyZWFrIGJlY29tZXMgYSBuZXdsaW5lLCB3aGljaCBpcyB0aGUgc2FtZSBsaW5lXHJcbiAqIGVuZGluZyB3cml0dGVuIGluIHRoZSBvbmx5IGZvcm0gYSBgdGV4dCpgIGJsb2NrIHN1Y2ggYXMgYSBjb2RlIGJsb2NrIGNhblxyXG4gKiBzdG9yZS4gV2l0aG91dCB0aGlzLCBwYXN0aW5nIGZvcm1hdHRlZCB0ZXh0IGludG8gYSBjb2RlIGJsb2NrIGJ1aWxkcyBhXHJcbiAqIGRvY3VtZW50IHRoZSBzY2hlbWEgd291bGQgcmVqZWN0LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvZXJjZUlubGluZUZvcih0eXBlOiBOb2RlVHlwZSwgbm9kZXM6IHJlYWRvbmx5IEVkaXRvck5vZGVbXSk6IEVkaXRvck5vZGVbXSB7XHJcbiAgY29uc3Qgb3V0OiBFZGl0b3JOb2RlW10gPSBbXVxyXG4gIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xyXG4gICAgaWYgKG5vZGUuaXNUZXh0KSB7XHJcbiAgICAgIGNvbnN0IGtlcHQgPSBub2RlLm1hcmtzLmZpbHRlcigobWFyaykgPT4gdHlwZS5hbGxvd3NNYXJrVHlwZShtYXJrLnR5cGUpKVxyXG4gICAgICBvdXQucHVzaChrZXB0Lmxlbmd0aCA9PT0gbm9kZS5tYXJrcy5sZW5ndGggPyBub2RlIDogbm9kZS53aXRoTWFya3Moa2VwdCkpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBpZiAodHlwZS52YWxpZENvbnRlbnQoRnJhZ21lbnQub2Yobm9kZSkpKSB7XHJcbiAgICAgIG91dC5wdXNoKG5vZGUpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBjb25zdCB0ZXh0ID0gbm9kZS50eXBlLm5hbWUgPT09ICdoYXJkQnJlYWsnID8gJ1xcbicgOiBub2RlLnRleHRDb250ZW50XHJcbiAgICBpZiAodGV4dC5sZW5ndGggPiAwKSBvdXQucHVzaChub2RlLnR5cGUuc2NoZW1hLnRleHQodGV4dCkpXHJcbiAgfVxyXG4gIHJldHVybiBtZXJnZUlubGluZShGcmFnbWVudC5mcm9tKG91dCkpLmNoaWxkcmVuIGFzIEVkaXRvck5vZGVbXVxyXG59XHJcblxyXG4vKipcclxuICogTWFwIGFuIG9mZnNldCBpbiBhIHRleHRibG9jaydzIHJlbmRlcmVkIHRleHQgYmFjayB0byBhbiBpbmxpbmUgb2Zmc2V0LiBUZXh0XHJcbiAqIGNvbnRyaWJ1dGVzIG9uZSBjaGFyYWN0ZXIgcGVyIHBvc2l0aW9uLCBidXQgYW4gaW5saW5lIGF0b20gY291bnRzIGFzIGFcclxuICogc2luZ2xlIHBvc2l0aW9uIHdoaWxlIHJlbmRlcmluZyBob3dldmVyIG1hbnkgY2hhcmFjdGVycyBpdCBsaWtlcywgbm9uZSBhdFxyXG4gKiBhbGwsIGZvciBhIGhhcmQgYnJlYWssIHNvIHRoZSB0d28gc2NhbGVzIGRyaWZ0IGFwYXJ0IHRoZSBtb21lbnQgYSBibG9ja1xyXG4gKiBob2xkcyBvbmUuIEFuIG9mZnNldCBsYW5kaW5nIGluc2lkZSBhbiBhdG9tIHJlc29sdmVzIHRvIGl0cyBuZWFyZXIgZWRnZSxcclxuICogc2luY2UgYW4gYXRvbSBoYXMgbm8gcG9zaXRpb25zIHdpdGhpbiBpdC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpbmxpbmVPZmZzZXRGcm9tVGV4dChmcmFnOiBGcmFnbWVudCwgdGV4dE9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcclxuICBsZXQgY2hhcnMgPSAwXHJcbiAgbGV0IGlubGluZSA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZyYWcuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IGNoaWxkQ2hhcnMgPSBjaGlsZC50ZXh0Q29udGVudC5sZW5ndGhcclxuICAgIGlmIChjaGFycyArIGNoaWxkQ2hhcnMgPj0gdGV4dE9mZnNldCkge1xyXG4gICAgICBpZiAoY2hpbGQuaXNUZXh0KSByZXR1cm4gaW5saW5lICsgKHRleHRPZmZzZXQgLSBjaGFycylcclxuICAgICAgcmV0dXJuIHRleHRPZmZzZXQgPD0gY2hhcnMgPyBpbmxpbmUgOiBpbmxpbmUgKyAxXHJcbiAgICB9XHJcbiAgICBjaGFycyArPSBjaGlsZENoYXJzXHJcbiAgICBpbmxpbmUgKz0gaW5saW5lU2l6ZShjaGlsZClcclxuICB9XHJcbiAgcmV0dXJuIGlubGluZVxyXG59XHJcblxyXG4vKiogUmVwbGFjZSB0aGUgaW5saW5lIHJhbmdlIFtmcm9tLCB0bykgd2l0aCB0aGUgZ2l2ZW4gaW5saW5lIGZyYWdtZW50LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcmVwbGFjZUlubGluZShcclxuICBmcmFnOiBGcmFnbWVudCxcclxuICBmcm9tOiBudW1iZXIsXHJcbiAgdG86IG51bWJlcixcclxuICBpbnNlcnQ6IEZyYWdtZW50LFxyXG4pOiBGcmFnbWVudCB7XHJcbiAgY29uc3QgYmVmb3JlID0gc2xpY2VJbmxpbmUoZnJhZywgMCwgZnJvbSlcclxuICBjb25zdCBhZnRlciA9IHNsaWNlSW5saW5lKGZyYWcsIHRvLCBpbmxpbmVMZW5ndGgoZnJhZykpXHJcbiAgcmV0dXJuIG1lcmdlSW5saW5lKGJlZm9yZS5hcHBlbmQoaW5zZXJ0KS5hcHBlbmQoYWZ0ZXIpKVxyXG59XHJcblxyXG4vKiogQWRkIG9yIHJlbW92ZSBhIG1hcmsgYWNyb3NzIHRoZSBpbmxpbmUgcmFuZ2UgW2Zyb20sIHRvKS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5SW5saW5lTWFyayhcclxuICBmcmFnOiBGcmFnbWVudCxcclxuICBmcm9tOiBudW1iZXIsXHJcbiAgdG86IG51bWJlcixcclxuICBtYXJrOiBNYXJrLFxyXG4gIGFkZDogYm9vbGVhbixcclxuKTogRnJhZ21lbnQge1xyXG4gIGNvbnN0IG91dDogRWRpdG9yTm9kZVtdID0gW11cclxuICBsZXQgcG9zID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgZnJhZy5jaGlsZHJlbikge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBjb25zdCBzdGFydCA9IHBvc1xyXG4gICAgY29uc3QgZW5kID0gcG9zICsgc2l6ZVxyXG4gICAgcG9zID0gZW5kXHJcbiAgICBpZiAoZW5kIDw9IGZyb20gfHwgc3RhcnQgPj0gdG8pIHtcclxuICAgICAgb3V0LnB1c2goY2hpbGQpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBjb25zdCBhcHBseSA9IChub2RlOiBFZGl0b3JOb2RlKTogRWRpdG9yTm9kZSA9PlxyXG4gICAgICBub2RlLndpdGhNYXJrcyhhZGQgPyBtYXJrLmFkZFRvU2V0KG5vZGUubWFya3MpIDogbWFyay5yZW1vdmVGcm9tU2V0KG5vZGUubWFya3MpKVxyXG4gICAgaWYgKCFjaGlsZC5pc1RleHQpIHtcclxuICAgICAgb3V0LnB1c2goc3RhcnQgPj0gZnJvbSAmJiBlbmQgPD0gdG8gPyBhcHBseShjaGlsZCkgOiBjaGlsZClcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGNvbnN0IHRleHQgPSBjaGlsZCBhcyBUZXh0Tm9kZVxyXG4gICAgY29uc3QgY3V0RnJvbSA9IE1hdGgubWF4KGZyb20gLSBzdGFydCwgMClcclxuICAgIGNvbnN0IGN1dFRvID0gTWF0aC5taW4odG8gLSBzdGFydCwgc2l6ZSlcclxuICAgIGlmIChjdXRGcm9tID4gMCkgb3V0LnB1c2godGV4dC5jdXQoMCwgY3V0RnJvbSkpXHJcbiAgICBvdXQucHVzaChhcHBseSh0ZXh0LmN1dChjdXRGcm9tLCBjdXRUbykpKVxyXG4gICAgaWYgKGN1dFRvIDwgc2l6ZSkgb3V0LnB1c2godGV4dC5jdXQoY3V0VG8sIHNpemUpKVxyXG4gIH1cclxuICByZXR1cm4gbWVyZ2VJbmxpbmUoRnJhZ21lbnQuZnJvbShvdXQpKVxyXG59XHJcblxyXG4vKiogVHJ1ZSB3aGVuIGV2ZXJ5IG1hcmthYmxlIG5vZGUgb3ZlcmxhcHBpbmcgW2Zyb20sIHRvKSBjYXJyaWVzIGEgbWFyayBvZiB0aGlzIHR5cGUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByYW5nZUhhc01hcmsoXHJcbiAgZnJhZzogRnJhZ21lbnQsXHJcbiAgZnJvbTogbnVtYmVyLFxyXG4gIHRvOiBudW1iZXIsXHJcbiAgbWFya1R5cGU6IE1hcmtUeXBlLFxyXG4pOiBib29sZWFuIHtcclxuICBsZXQgc2F3Q29udGVudCA9IGZhbHNlXHJcbiAgbGV0IHBvcyA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZyYWcuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IHNpemUgPSBpbmxpbmVTaXplKGNoaWxkKVxyXG4gICAgY29uc3Qgc3RhcnQgPSBwb3NcclxuICAgIGNvbnN0IGVuZCA9IHBvcyArIHNpemVcclxuICAgIHBvcyA9IGVuZFxyXG4gICAgaWYgKGVuZCA8PSBmcm9tIHx8IHN0YXJ0ID49IHRvKSBjb250aW51ZVxyXG4gICAgaWYgKCFjaGlsZC5pc1RleHQpIGNvbnRpbnVlXHJcbiAgICBzYXdDb250ZW50ID0gdHJ1ZVxyXG4gICAgaWYgKCFjaGlsZC5tYXJrcy5zb21lKChtYXJrKSA9PiBtYXJrLnR5cGUgPT09IG1hcmtUeXBlKSkgcmV0dXJuIGZhbHNlXHJcbiAgfVxyXG4gIHJldHVybiBzYXdDb250ZW50XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb250aWd1b3VzIHN1YnJhbmdlcyBvZiBbZnJvbSwgdG8pIHdoZXJlIGEgbWFyayBvZiB0aGlzIHR5cGUgaXMgcHJlc2VudCxcclxuICogd2l0aCB0aGUgZXhhY3QgbWFyayBpbnN0YW5jZSBwZXIgcmFuZ2UgKHJhbmdlcyBzcGxpdCB3aGVuIGF0dHJpYnV0ZXNcclxuICogY2hhbmdlKSwgdXNlZCB0byBidWlsZCBleGFjdGx5LWludmVydGlibGUgUmVtb3ZlTWFyayBzdGVwcy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByYW5nZXNXaXRoTWFyayhcclxuICBmcmFnOiBGcmFnbWVudCxcclxuICBmcm9tOiBudW1iZXIsXHJcbiAgdG86IG51bWJlcixcclxuICBtYXJrVHlwZTogTWFya1R5cGUsXHJcbik6IHJlYWRvbmx5IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyOyBtYXJrOiBNYXJrIH1bXSB7XHJcbiAgY29uc3QgcmFuZ2VzOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlcjsgbWFyazogTWFyayB9W10gPSBbXVxyXG4gIGxldCBwb3MgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBmcmFnLmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBzaXplID0gaW5saW5lU2l6ZShjaGlsZClcclxuICAgIGNvbnN0IHN0YXJ0ID0gcG9zXHJcbiAgICBjb25zdCBlbmQgPSBwb3MgKyBzaXplXHJcbiAgICBwb3MgPSBlbmRcclxuICAgIGlmIChlbmQgPD0gZnJvbSB8fCBzdGFydCA+PSB0bykgY29udGludWVcclxuICAgIGNvbnN0IG1hcmsgPSBjaGlsZC5tYXJrcy5maW5kKChjYW5kaWRhdGUpID0+IGNhbmRpZGF0ZS50eXBlID09PSBtYXJrVHlwZSlcclxuICAgIGlmICghbWFyaykgY29udGludWVcclxuICAgIGNvbnN0IG92ZXJsYXBGcm9tID0gTWF0aC5tYXgoc3RhcnQsIGZyb20pXHJcbiAgICBjb25zdCBvdmVybGFwVG8gPSBNYXRoLm1pbihlbmQsIHRvKVxyXG4gICAgY29uc3QgbGFzdCA9IHJhbmdlc1tyYW5nZXMubGVuZ3RoIC0gMV1cclxuICAgIGlmIChsYXN0ICYmIGxhc3QudG8gPT09IG92ZXJsYXBGcm9tICYmIGxhc3QubWFyay5lcShtYXJrKSkge1xyXG4gICAgICBsYXN0LnRvID0gb3ZlcmxhcFRvXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByYW5nZXMucHVzaCh7IGZyb206IG92ZXJsYXBGcm9tLCB0bzogb3ZlcmxhcFRvLCBtYXJrIH0pXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiByYW5nZXNcclxufVxyXG5cclxuLyoqIFRoZSBtYXJrIHNldCBhZGphY2VudCB0byBhbiBpbmxpbmUgb2Zmc2V0OiB3aGF0IHR5cGluZyB0aGVyZSBzaG91bGQgaW5oZXJpdC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG1hcmtzQXRJbmxpbmVPZmZzZXQoZnJhZzogRnJhZ21lbnQsIG9mZnNldDogbnVtYmVyKTogcmVhZG9ubHkgTWFya1tdIHtcclxuICBsZXQgcG9zID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgZnJhZy5jaGlsZHJlbikge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBjb25zdCBlbmQgPSBwb3MgKyBzaXplXHJcbiAgICAvLyBQcmVmZXIgdGhlIG5vZGUgZW5kaW5nIGF0IHRoZSBvZmZzZXQgKG1hcmtzIGNvbnRpbnVlIGZyb20gdGhlIGxlZnQpLlxyXG4gICAgaWYgKG9mZnNldCA+IHBvcyAmJiBvZmZzZXQgPD0gZW5kKSByZXR1cm4gY2hpbGQuaXNUZXh0ID8gY2hpbGQubWFya3MgOiBbXVxyXG4gICAgcG9zID0gZW5kXHJcbiAgfVxyXG4gIGNvbnN0IGZpcnN0ID0gZnJhZy5tYXliZUNoaWxkKDApXHJcbiAgcmV0dXJuIGZpcnN0Py5pc1RleHQgPyBmaXJzdC5tYXJrcyA6IFtdXHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4vbm9kZSdcclxuXHJcbi8qKiBBIHBhdGggYWRkcmVzc2VzIGEgbm9kZSBhcyBjaGlsZCBpbmRpY2VzIGZyb20gdGhlIGRvY3VtZW50IHJvb3QuICovXHJcbmV4cG9ydCB0eXBlIFBhdGggPSByZWFkb25seSBudW1iZXJbXVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBhdGhzRXF1YWwoYTogUGF0aCwgYjogUGF0aCk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiBhLmxlbmd0aCA9PT0gYi5sZW5ndGggJiYgYS5ldmVyeSgoaW5kZXgsIGkpID0+IGluZGV4ID09PSBiW2ldKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGF0aFN0YXJ0c1dpdGgocGF0aDogUGF0aCwgcHJlZml4OiBQYXRoKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIHByZWZpeC5sZW5ndGggPD0gcGF0aC5sZW5ndGggJiYgcHJlZml4LmV2ZXJ5KChpbmRleCwgaSkgPT4gaW5kZXggPT09IHBhdGhbaV0pXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJlbnRQYXRoT2YocGF0aDogUGF0aCk6IFBhdGgge1xyXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RoZSByb290IG5vZGUgaGFzIG5vIHBhcmVudCcpXHJcbiAgcmV0dXJuIHBhdGguc2xpY2UoMCwgLTEpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBsYXN0SW5kZXhPZlBhdGgocGF0aDogUGF0aCk6IG51bWJlciB7XHJcbiAgY29uc3QgaW5kZXggPSBwYXRoW3BhdGgubGVuZ3RoIC0gMV1cclxuICBpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RoZSByb290IG5vZGUgaGFzIG5vIGluZGV4JylcclxuICByZXR1cm4gaW5kZXhcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vZGVBdFBhdGgoZG9jOiBFZGl0b3JOb2RlLCBwYXRoOiBQYXRoKTogRWRpdG9yTm9kZSB8IG51bGwge1xyXG4gIGxldCBub2RlOiBFZGl0b3JOb2RlID0gZG9jXHJcbiAgZm9yIChjb25zdCBpbmRleCBvZiBwYXRoKSB7XHJcbiAgICBjb25zdCBjaGlsZCA9IG5vZGUuY29udGVudC5tYXliZUNoaWxkKGluZGV4KVxyXG4gICAgaWYgKCFjaGlsZCkgcmV0dXJuIG51bGxcclxuICAgIG5vZGUgPSBjaGlsZFxyXG4gIH1cclxuICByZXR1cm4gbm9kZVxyXG59XHJcblxyXG4vKipcclxuICogUmV0dXJuIGEgbmV3IGRvY3VtZW50IHdpdGggdGhlIG5vZGUgYXQgYHBhdGhgIHJlcGxhY2VkIGJ5IGBmbihub2RlKWAsXHJcbiAqIHJlYnVpbGRpbmcgdGhlIGFuY2VzdG9yIHNwaW5lIChzdHJ1Y3R1cmFsIHNoYXJpbmcgZXZlcnl3aGVyZSBlbHNlKS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVBdFBhdGgoXHJcbiAgZG9jOiBFZGl0b3JOb2RlLFxyXG4gIHBhdGg6IFBhdGgsXHJcbiAgZm46IChub2RlOiBFZGl0b3JOb2RlKSA9PiBFZGl0b3JOb2RlLFxyXG4pOiBFZGl0b3JOb2RlIHtcclxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHJldHVybiBmbihkb2MpXHJcbiAgY29uc3QgW2luZGV4LCAuLi5yZXN0XSA9IHBhdGggYXMgW251bWJlciwgLi4ubnVtYmVyW11dXHJcbiAgY29uc3QgY2hpbGQgPSBkb2MuY29udGVudC5tYXliZUNoaWxkKGluZGV4KVxyXG4gIGlmICghY2hpbGQpIHRocm93IG5ldyBSYW5nZUVycm9yKGBObyBub2RlIGF0IHBhdGggaW5kZXggJHtpbmRleH1gKVxyXG4gIHJldHVybiBkb2Mud2l0aENvbnRlbnQoZG9jLmNvbnRlbnQucmVwbGFjZUNoaWxkKGluZGV4LCB1cGRhdGVBdFBhdGgoY2hpbGQsIHJlc3QsIGZuKSkpXHJcbn1cclxuIiwgImltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4vaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuL25vZGUnXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCB9IGZyb20gJy4vdHJlZSdcclxuXHJcbi8qKlxyXG4gKiBBIHBvc2l0aW9uIGluIHRoZSBkb2N1bWVudDogYHBhdGhgIGFkZHJlc3NlcyB0aGUgY29udGFpbmluZyBub2RlLCBgb2Zmc2V0YFxyXG4gKiBpcyBhIGNoYXJhY3RlciBvZmZzZXQgd2l0aGluIGEgdGV4dGJsb2NrJ3MgaW5saW5lIGNvbnRlbnQsIG9yIGEgY2hpbGQgaW5kZXhcclxuICogd2l0aGluIGFuIGVsZW1lbnQgbm9kZS5cclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgUG9zaXRpb24ge1xyXG4gIHJlYWRvbmx5IHBhdGg6IFBhdGhcclxuICByZWFkb25seSBvZmZzZXQ6IG51bWJlclxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcG9zKHBhdGg6IFBhdGgsIG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24ge1xyXG4gIHJldHVybiB7IHBhdGgsIG9mZnNldCB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEb2N1bWVudC1vcmRlciBjb21wYXJpc29uLiBQb3NpdGlvbnMgY29tcGFyZSBieSB0aGVpciBmdWxsIHRyYWlsXHJcbiAqIChgWy4uLnBhdGgsIG9mZnNldF1gKSBsZXhpY29ncmFwaGljYWxseTsgYSBzaG9ydGVyIHByZWZpeCBzb3J0cyBmaXJzdC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlUG9zaXRpb25zKGE6IFBvc2l0aW9uLCBiOiBQb3NpdGlvbik6IC0xIHwgMCB8IDEge1xyXG4gIGNvbnN0IGFUcmFpbCA9IFsuLi5hLnBhdGgsIGEub2Zmc2V0XVxyXG4gIGNvbnN0IGJUcmFpbCA9IFsuLi5iLnBhdGgsIGIub2Zmc2V0XVxyXG4gIGNvbnN0IGxlbmd0aCA9IE1hdGgubWluKGFUcmFpbC5sZW5ndGgsIGJUcmFpbC5sZW5ndGgpXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3QgYXYgPSBhVHJhaWxbaV0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBidiA9IGJUcmFpbFtpXSBhcyBudW1iZXJcclxuICAgIGlmIChhdiAhPT0gYnYpIHJldHVybiBhdiA8IGJ2ID8gLTEgOiAxXHJcbiAgfVxyXG4gIGlmIChhVHJhaWwubGVuZ3RoID09PSBiVHJhaWwubGVuZ3RoKSByZXR1cm4gMFxyXG4gIHJldHVybiBhVHJhaWwubGVuZ3RoIDwgYlRyYWlsLmxlbmd0aCA/IC0xIDogMVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcG9zaXRpb25zRXF1YWwoYTogUG9zaXRpb24sIGI6IFBvc2l0aW9uKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIGEub2Zmc2V0ID09PSBiLm9mZnNldCAmJiBhLnBhdGgubGVuZ3RoID09PSBiLnBhdGgubGVuZ3RoICYmIGNvbXBhcmVQb3NpdGlvbnMoYSwgYikgPT09IDBcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1pblBvc2l0aW9uKGE6IFBvc2l0aW9uLCBiOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcclxuICByZXR1cm4gY29tcGFyZVBvc2l0aW9ucyhhLCBiKSA8PSAwID8gYSA6IGJcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1heFBvc2l0aW9uKGE6IFBvc2l0aW9uLCBiOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcclxuICByZXR1cm4gY29tcGFyZVBvc2l0aW9ucyhhLCBiKSA+PSAwID8gYSA6IGJcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBSZXNvbHZlZFBvc2l0aW9uIHtcclxuICAvKiogVGhlIG5vZGUgdGhlIHBvc2l0aW9uIGxpdmVzIGluLiAqL1xyXG4gIHJlYWRvbmx5IG5vZGU6IEVkaXRvck5vZGVcclxuICByZWFkb25seSBwYXJlbnQ6IEVkaXRvck5vZGUgfCBudWxsXHJcbiAgLyoqIFRoaXMgbm9kZSdzIGluZGV4IGluIGl0cyBwYXJlbnQuICovXHJcbiAgcmVhZG9ubHkgaW5kZXg6IG51bWJlciB8IG51bGxcclxufVxyXG5cclxuLyoqIFJlc29sdmUgYSBwb3NpdGlvbidzIGNvbnRhaW5pbmcgbm9kZS4gUmV0dXJucyBudWxsIHdoZW4gdGhlIHBhdGggaXMgaW52YWxpZC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQb3NpdGlvbihkb2M6IEVkaXRvck5vZGUsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFJlc29sdmVkUG9zaXRpb24gfCBudWxsIHtcclxuICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2MsIHBvc2l0aW9uLnBhdGgpXHJcbiAgaWYgKCFub2RlKSByZXR1cm4gbnVsbFxyXG4gIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHsgbm9kZSwgcGFyZW50OiBudWxsLCBpbmRleDogbnVsbCB9XHJcbiAgY29uc3QgcGFyZW50ID0gbm9kZUF0UGF0aChkb2MsIHBvc2l0aW9uLnBhdGguc2xpY2UoMCwgLTEpKVxyXG4gIGNvbnN0IGluZGV4ID0gcG9zaXRpb24ucGF0aFtwb3NpdGlvbi5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIHJldHVybiBwYXJlbnQgPyB7IG5vZGUsIHBhcmVudCwgaW5kZXggfSA6IG51bGxcclxufVxyXG5cclxuLyoqIENsYW1wIGEgcG9zaXRpb24gaW50byB0aGUgdmFsaWQgcmFuZ2UgZm9yIHRoZSBnaXZlbiBkb2N1bWVudC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wUG9zaXRpb24oZG9jOiBFZGl0b3JOb2RlLCBwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgY29uc3QgcGF0aDogbnVtYmVyW10gPSBbXVxyXG4gIGxldCBub2RlOiBFZGl0b3JOb2RlID0gZG9jXHJcbiAgZm9yIChjb25zdCByYXdJbmRleCBvZiBwb3NpdGlvbi5wYXRoKSB7XHJcbiAgICBpZiAobm9kZS5jaGlsZENvdW50ID09PSAwKSBicmVha1xyXG4gICAgY29uc3QgaW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyYXdJbmRleCwgbm9kZS5jaGlsZENvdW50IC0gMSkpXHJcbiAgICBwYXRoLnB1c2goaW5kZXgpXHJcbiAgICBub2RlID0gbm9kZS5jaGlsZChpbmRleClcclxuICB9XHJcbiAgY29uc3QgbWF4T2Zmc2V0ID0gbm9kZS5pc1RleHRibG9jayA/IGlubGluZUxlbmd0aChub2RlLmNvbnRlbnQpIDogbm9kZS5jaGlsZENvdW50XHJcbiAgY29uc3Qgb2Zmc2V0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocG9zaXRpb24ub2Zmc2V0LCBtYXhPZmZzZXQpKVxyXG4gIHJldHVybiB7IHBhdGgsIG9mZnNldCB9XHJcbn1cclxuIiwgImltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4vaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuL25vZGUnXHJcbmltcG9ydCB7IHR5cGUgUG9zaXRpb24sIGNvbXBhcmVQb3NpdGlvbnMsIHBvcyB9IGZyb20gJy4vcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgcGF0aHNFcXVhbCB9IGZyb20gJy4vdHJlZSdcclxuXHJcbi8qKiBBbGwgdGV4dGJsb2NrIG5vZGVzIGluIGRvY3VtZW50IG9yZGVyLCB3aXRoIHRoZWlyIHBhdGhzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdGV4dGJsb2Nrcyhkb2M6IEVkaXRvck5vZGUpOiByZWFkb25seSB7IHBhdGg6IFBhdGg7IG5vZGU6IEVkaXRvck5vZGUgfVtdIHtcclxuICBjb25zdCBmb3VuZDogeyBwYXRoOiBQYXRoOyBub2RlOiBFZGl0b3JOb2RlIH1bXSA9IFtdXHJcbiAgY29uc3Qgd2FsayA9IChub2RlOiBFZGl0b3JOb2RlLCBwYXRoOiBQYXRoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAobm9kZS5pc1RleHRibG9jaykge1xyXG4gICAgICBmb3VuZC5wdXNoKHsgcGF0aCwgbm9kZSB9KVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIG5vZGUuY29udGVudC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZCwgaW5kZXgpID0+IHtcclxuICAgICAgd2FsayhjaGlsZCwgWy4uLnBhdGgsIGluZGV4XSlcclxuICAgIH0pXHJcbiAgfVxyXG4gIHdhbGsoZG9jLCBbXSlcclxuICByZXR1cm4gZm91bmRcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpcnN0VGV4dGJsb2NrUGF0aChkb2M6IEVkaXRvck5vZGUpOiBQYXRoIHwgbnVsbCB7XHJcbiAgcmV0dXJuIHRleHRibG9ja3MoZG9jKVswXT8ucGF0aCA/PyBudWxsXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQmxvY2tSYW5nZSB7XHJcbiAgcmVhZG9ubHkgcGF0aDogUGF0aFxyXG4gIHJlYWRvbmx5IG5vZGU6IEVkaXRvck5vZGVcclxuICAvKiogSW5saW5lIHJhbmdlIHdpdGhpbiB0aGlzIGJsb2NrIGNvdmVyZWQgYnkgdGhlIHNlbGVjdGlvbi4gKi9cclxuICByZWFkb25seSBmcm9tOiBudW1iZXJcclxuICByZWFkb25seSB0bzogbnVtYmVyXHJcbn1cclxuXHJcbi8qKiBUZXh0YmxvY2tzIGludGVyc2VjdGluZyB0aGUgcG9zaXRpb24gcmFuZ2UgW2Zyb20sIHRvXSwgd2l0aCBwZXItYmxvY2sgaW5saW5lIHJhbmdlcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGJsb2Nrc0luUmFuZ2UoXHJcbiAgZG9jOiBFZGl0b3JOb2RlLFxyXG4gIGZyb206IFBvc2l0aW9uLFxyXG4gIHRvOiBQb3NpdGlvbixcclxuKTogcmVhZG9ubHkgQmxvY2tSYW5nZVtdIHtcclxuICBjb25zdCByYW5nZXM6IEJsb2NrUmFuZ2VbXSA9IFtdXHJcbiAgZm9yIChjb25zdCB7IHBhdGgsIG5vZGUgfSBvZiB0ZXh0YmxvY2tzKGRvYykpIHtcclxuICAgIGNvbnN0IGxlbmd0aCA9IGlubGluZUxlbmd0aChub2RlLmNvbnRlbnQpXHJcbiAgICBpZiAoY29tcGFyZVBvc2l0aW9ucyhwb3MocGF0aCwgbGVuZ3RoKSwgZnJvbSkgPCAwKSBjb250aW51ZVxyXG4gICAgaWYgKGNvbXBhcmVQb3NpdGlvbnMocG9zKHBhdGgsIDApLCB0bykgPiAwKSBicmVha1xyXG4gICAgcmFuZ2VzLnB1c2goe1xyXG4gICAgICBwYXRoLFxyXG4gICAgICBub2RlLFxyXG4gICAgICBmcm9tOiBwYXRoc0VxdWFsKHBhdGgsIGZyb20ucGF0aCkgPyBmcm9tLm9mZnNldCA6IDAsXHJcbiAgICAgIHRvOiBwYXRoc0VxdWFsKHBhdGgsIHRvLnBhdGgpID8gdG8ub2Zmc2V0IDogbGVuZ3RoLFxyXG4gICAgfSlcclxuICB9XHJcbiAgcmV0dXJuIHJhbmdlc1xyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEF0dHJzIH0gZnJvbSAnLi9hdHRycydcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuL2ZyYWdtZW50J1xyXG5pbXBvcnQgdHlwZSB7IE1hcmssIE1hcmtKU09OIH0gZnJvbSAnLi9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUsIE5vZGVKU09OIH0gZnJvbSAnLi9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFNjaGVtYSB9IGZyb20gJy4vc2NoZW1hJ1xyXG5cclxuLyoqIENhbm9uaWNhbCBKU09OIGRvY3VtZW50IHNoYXBlIGFjY2VwdGVkIGJ5IHtAbGluayBub2RlRnJvbUpTT059LiAqL1xyXG5leHBvcnQgdHlwZSBEb2NKU09OID0gTm9kZUpTT05cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBtYXJrRnJvbUpTT04oc2NoZW1hOiBTY2hlbWEsIGpzb246IE1hcmtKU09OKTogTWFyayB7XHJcbiAgcmV0dXJuIHNjaGVtYS5tYXJrVHlwZShqc29uLnR5cGUpLmNyZWF0ZShqc29uLmF0dHJzIGFzIEF0dHJzIHwgdW5kZWZpbmVkKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbm9kZUZyb21KU09OKHNjaGVtYTogU2NoZW1hLCBqc29uOiBOb2RlSlNPTik6IEVkaXRvck5vZGUge1xyXG4gIGNvbnN0IG1hcmtzID0gKGpzb24ubWFya3MgPz8gW10pLm1hcCgobWFyaykgPT4gbWFya0Zyb21KU09OKHNjaGVtYSwgbWFyaykpXHJcbiAgaWYgKGpzb24udHlwZSA9PT0gJ3RleHQnKSB7XHJcbiAgICBpZiAodHlwZW9mIGpzb24udGV4dCAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RleHQgbm9kZSBKU09OIGlzIG1pc3NpbmcgaXRzIFwidGV4dFwiIHByb3BlcnR5JylcclxuICAgIH1cclxuICAgIHJldHVybiBzY2hlbWEudGV4dChqc29uLnRleHQsIG1hcmtzKVxyXG4gIH1cclxuICBjb25zdCBjb250ZW50ID0gRnJhZ21lbnQuZnJvbSgoanNvbi5jb250ZW50ID8/IFtdKS5tYXAoKGNoaWxkKSA9PiBub2RlRnJvbUpTT04oc2NoZW1hLCBjaGlsZCkpKVxyXG4gIHJldHVybiBzY2hlbWEubm9kZVR5cGUoanNvbi50eXBlKS5jcmVhdGUoanNvbi5hdHRycyBhcyBBdHRycyB8IHVuZGVmaW5lZCwgY29udGVudCwgbWFya3MpXHJcbn1cclxuIiwgImltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi9mcmFnbWVudCdcclxuaW1wb3J0IHsgbWVyZ2VJbmxpbmUgfSBmcm9tICcuL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi9ub2RlJ1xyXG5cclxuLyoqXHJcbiAqIERldGVybWluaXN0aWNhbGx5IHJlcGFpciBhIGRvY3VtZW50IHNvIGl0IGNvbmZvcm1zIHRvIGl0cyBzY2hlbWEgd2hlcmVcclxuICogcG9zc2libGU6IGRyb3BzIGNoaWxkcmVuIGZyb20gbGVhZiBub2Rlcywgd3JhcHMgc3RyYXkgaW5saW5lIGNvbnRlbnQgaW4gdGhlXHJcbiAqIHNjaGVtYSdzIGRlZmF1bHQgdGV4dGJsb2NrLCBzdHJpcHMgZGlzYWxsb3dlZCBtYXJrcywgbWVyZ2VzIGFkamFjZW50IHRleHRcclxuICogbm9kZXMsIGFuZCBndWFyYW50ZWVzIGEgbm9uLWVtcHR5IHRvcCBub2RlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZURvYyhkb2M6IEVkaXRvck5vZGUpOiBFZGl0b3JOb2RlIHtcclxuICBjb25zdCBzY2hlbWEgPSBkb2MudHlwZS5zY2hlbWFcclxuICBsZXQgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5vZGUoZG9jKVxyXG4gIGlmIChub3JtYWxpemVkLmNoaWxkQ291bnQgPT09IDAgJiYgIW5vcm1hbGl6ZWQudHlwZS5hbGxvd3NFbXB0eUNvbnRlbnQpIHtcclxuICAgIG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkLndpdGhDb250ZW50KEZyYWdtZW50Lm9mKHNjaGVtYS5maXJzdFRleHRibG9ja1R5cGUoKS5jcmVhdGUoKSkpXHJcbiAgfVxyXG4gIHJldHVybiBub3JtYWxpemVkXHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5vcm1hbGl6ZU5vZGUobm9kZTogRWRpdG9yTm9kZSk6IEVkaXRvck5vZGUge1xyXG4gIGlmIChub2RlLmlzVGV4dCkgcmV0dXJuIG5vZGVcclxuICBpZiAoIW5vZGUudHlwZS5zcGVjLmNvbnRlbnQpIHtcclxuICAgIC8vIExlYWYgbm9kZTogY29udGVudCBpcyBuZXZlciBhbGxvd2VkLlxyXG4gICAgcmV0dXJuIG5vZGUuY2hpbGRDb3VudCA9PT0gMCA/IG5vZGUgOiBub2RlLndpdGhDb250ZW50KEZyYWdtZW50LmVtcHR5KVxyXG4gIH1cclxuXHJcbiAgbGV0IGNoaWxkcmVuID0gbm9kZS5jb250ZW50LmNoaWxkcmVuLm1hcCgoY2hpbGQpID0+XHJcbiAgICBzdHJpcERpc2FsbG93ZWRNYXJrcyhub3JtYWxpemVOb2RlKGNoaWxkKSwgbm9kZSksXHJcbiAgKVxyXG5cclxuICBpZiAobm9kZS5pc1RleHRibG9jaykge1xyXG4gICAgLy8gSW5saW5lIGNvbnRleHQ6IGZsYXR0ZW4gYW55IHN0cmF5IGJsb2NrIGNoaWxkcmVuIGludG8gdGhlaXIgaW5saW5lIGNvbnRlbnQuXHJcbiAgICBjaGlsZHJlbiA9IGNoaWxkcmVuLmZsYXRNYXAoKGNoaWxkKSA9PlxyXG4gICAgICBjaGlsZC5pc0lubGluZSA/IFtjaGlsZF0gOiBjaGlsZC5jb250ZW50LmNoaWxkcmVuLmZpbHRlcigoaW5uZXIpID0+IGlubmVyLmlzSW5saW5lKSxcclxuICAgIClcclxuICAgIHJldHVybiBub2RlLndpdGhDb250ZW50KG1lcmdlSW5saW5lKEZyYWdtZW50LmZyb20oY2hpbGRyZW4pKSlcclxuICB9XHJcblxyXG4gIC8vIEJsb2NrIGNvbnRleHQ6IHdyYXAgcnVucyBvZiBzdHJheSBpbmxpbmUgY2hpbGRyZW4gaW4gdGhlIGRlZmF1bHQgdGV4dGJsb2NrLlxyXG4gIGNvbnN0IHNjaGVtYSA9IG5vZGUudHlwZS5zY2hlbWFcclxuICBjb25zdCB3cmFwcGVkOiBFZGl0b3JOb2RlW10gPSBbXVxyXG4gIGxldCBpbmxpbmVSdW46IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgY29uc3QgZmx1c2hSdW4gPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAoaW5saW5lUnVuLmxlbmd0aCA+IDApIHtcclxuICAgICAgd3JhcHBlZC5wdXNoKFxyXG4gICAgICAgIHNjaGVtYS5maXJzdFRleHRibG9ja1R5cGUoKS5jcmVhdGUodW5kZWZpbmVkLCBtZXJnZUlubGluZShGcmFnbWVudC5mcm9tKGlubGluZVJ1bikpKSxcclxuICAgICAgKVxyXG4gICAgICBpbmxpbmVSdW4gPSBbXVxyXG4gICAgfVxyXG4gIH1cclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XHJcbiAgICBpZiAoY2hpbGQuaXNJbmxpbmUpIHtcclxuICAgICAgaW5saW5lUnVuLnB1c2goY2hpbGQpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBmbHVzaFJ1bigpXHJcbiAgICAgIHdyYXBwZWQucHVzaChjaGlsZClcclxuICAgIH1cclxuICB9XHJcbiAgZmx1c2hSdW4oKVxyXG4gIHJldHVybiBub2RlLndpdGhDb250ZW50KEZyYWdtZW50LmZyb20od3JhcHBlZCkpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0cmlwRGlzYWxsb3dlZE1hcmtzKGNoaWxkOiBFZGl0b3JOb2RlLCBwYXJlbnQ6IEVkaXRvck5vZGUpOiBFZGl0b3JOb2RlIHtcclxuICBpZiAoY2hpbGQubWFya3MubGVuZ3RoID09PSAwKSByZXR1cm4gY2hpbGRcclxuICBjb25zdCBhbGxvd2VkID0gY2hpbGQubWFya3MuZmlsdGVyKChtYXJrKSA9PiBwYXJlbnQudHlwZS5hbGxvd3NNYXJrVHlwZShtYXJrLnR5cGUpKVxyXG4gIHJldHVybiBhbGxvd2VkLmxlbmd0aCA9PT0gY2hpbGQubWFya3MubGVuZ3RoID8gY2hpbGQgOiBjaGlsZC53aXRoTWFya3MoYWxsb3dlZClcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBQb3NpdGlvbiB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5cclxuLyoqIE1hcHBpbmcgYmlhczogd2hlcmUgYSBwb3NpdGlvbiBhdCBhIGNoYW5nZSBib3VuZGFyeSBzaG91bGQgbGFuZC4gKi9cclxuZXhwb3J0IHR5cGUgQmlhcyA9IC0xIHwgMVxyXG5cclxuLyoqIE1hcHMgcG9zaXRpb25zIGZyb20gYmVmb3JlIGEgY2hhbmdlIHRvIGFmdGVyIGl0LiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFBvc2l0aW9uTWFwcGVyIHtcclxuICBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGJpYXM/OiBCaWFzKTogUG9zaXRpb25cclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTdGVwUmVzdWx0IHtcclxuICByZWFkb25seSBkb2M6IEVkaXRvck5vZGUgfCBudWxsXHJcbiAgcmVhZG9ubHkgZmFpbGVkOiBzdHJpbmcgfCBudWxsXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzdGVwT2soZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgcmV0dXJuIHsgZG9jLCBmYWlsZWQ6IG51bGwgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc3RlcEZhaWwocmVhc29uOiBzdHJpbmcpOiBTdGVwUmVzdWx0IHtcclxuICByZXR1cm4geyBkb2M6IG51bGwsIGZhaWxlZDogcmVhc29uIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEFuIGF0b21pYywgaW52ZXJ0aWJsZSBkb2N1bWVudCBjaGFuZ2UuIFN0ZXBzIGFyZSB0aGUgb25seSB3YXkgZG9jdW1lbnRzXHJcbiAqIGNoYW5nZTsgZXZlcnkgc3RlcCBrbm93cyBob3cgdG8gdW5kbyBpdHNlbGYgYW5kIGhvdyB0byByZW1hcCBwb3NpdGlvbnNcclxuICogdGhyb3VnaCBpdHNlbGYuXHJcbiAqL1xyXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU3RlcCBpbXBsZW1lbnRzIFBvc2l0aW9uTWFwcGVyIHtcclxuICAvKiogQXBwbHkgdG8gYSBkb2N1bWVudC4gTmV2ZXIgdGhyb3dzLCByZXR1cm5zIGEgZmFpbHVyZSByZXN1bHQgaW5zdGVhZC4gKi9cclxuICBhYnN0cmFjdCBhcHBseShkb2M6IEVkaXRvck5vZGUpOiBTdGVwUmVzdWx0XHJcblxyXG4gIC8qKiBQcm9kdWNlIHRoZSBzdGVwIHRoYXQgdW5kb2VzIHRoaXMgb25lLCBnaXZlbiB0aGUgZG9jdW1lbnQgaXQgYXBwbGllZCB0by4gKi9cclxuICBhYnN0cmFjdCBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcFxyXG5cclxuICAvKiogUmVtYXAgYSBwcmUtc3RlcCBwb3NpdGlvbiB0byBpdHMgcG9zdC1zdGVwIGVxdWl2YWxlbnQuICovXHJcbiAgYWJzdHJhY3QgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBiaWFzPzogQmlhcyk6IFBvc2l0aW9uXHJcblxyXG4gIGFic3RyYWN0IHRvSlNPTigpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEZyYWdtZW50IH0gZnJvbSAnLi4vLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IGlubGluZUxlbmd0aCwgcmVwbGFjZUlubGluZSwgc2xpY2VJbmxpbmUgfSBmcm9tICcuLi8uLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCBwYXRoc0VxdWFsLCB1cGRhdGVBdFBhdGggfSBmcm9tICcuLi8uLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyB0eXBlIEJpYXMsIFN0ZXAsIHR5cGUgU3RlcFJlc3VsdCwgc3RlcEZhaWwsIHN0ZXBPayB9IGZyb20gJy4uL3N0ZXAnXHJcblxyXG4vKipcclxuICogUmVwbGFjZSB0aGUgaW5saW5lIHJhbmdlIFtmcm9tLCB0bykgaW5zaWRlIHRoZSB0ZXh0YmxvY2sgYXQgYGJsb2NrUGF0aGBcclxuICogd2l0aCBhbiBpbmxpbmUgZnJhZ21lbnQuIENvdmVycyB0ZXh0IGluc2VydGlvbiAoZnJvbSA9PT0gdG8pLCBkZWxldGlvblxyXG4gKiAoZW1wdHkgZnJhZ21lbnQpIGFuZCByZXBsYWNlbWVudC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBSZXBsYWNlSW5saW5lU3RlcCBleHRlbmRzIFN0ZXAge1xyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcmVhZG9ubHkgYmxvY2tQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICAgIHJlYWRvbmx5IGluc2VydDogRnJhZ21lbnQsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAoZnJvbSA+IHRvIHx8IGZyb20gPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgSW52YWxpZCBpbmxpbmUgcmFuZ2UgWyR7ZnJvbX0sICR7dG99KWApXHJcbiAgfVxyXG5cclxuICBnZXQgaW5zZXJ0TGVuZ3RoKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gaW5saW5lTGVuZ3RoKHRoaXMuaW5zZXJ0KVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoZG9jLCB0aGlzLmJsb2NrUGF0aClcclxuICAgIGlmICghYmxvY2spIHJldHVybiBzdGVwRmFpbCgnUmVwbGFjZUlubGluZVN0ZXA6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBpZiAoIWJsb2NrLmlzVGV4dGJsb2NrKSByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VJbmxpbmVTdGVwOiB0YXJnZXQgaXMgbm90IGEgdGV4dGJsb2NrJylcclxuICAgIGlmICh0aGlzLnRvID4gaW5saW5lTGVuZ3RoKGJsb2NrLmNvbnRlbnQpKVxyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VJbmxpbmVTdGVwOiByYW5nZSBvdXQgb2YgYm91bmRzJylcclxuICAgIGlmICh0aGlzLmluc2VydC5jaGlsZHJlbi5zb21lKChjaGlsZCkgPT4gIWNoaWxkLmlzSW5saW5lKSkge1xyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VJbmxpbmVTdGVwOiBmcmFnbWVudCBjb250YWlucyBub24taW5saW5lIG5vZGVzJylcclxuICAgIH1cclxuICAgIHJldHVybiBzdGVwT2soXHJcbiAgICAgIHVwZGF0ZUF0UGF0aChkb2MsIHRoaXMuYmxvY2tQYXRoLCAobm9kZSkgPT5cclxuICAgICAgICBub2RlLndpdGhDb250ZW50KHJlcGxhY2VJbmxpbmUobm9kZS5jb250ZW50LCB0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMuaW5zZXJ0KSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcCB7XHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoZG9jQmVmb3JlLCB0aGlzLmJsb2NrUGF0aClcclxuICAgIGlmICghYmxvY2spIHRocm93IG5ldyBSYW5nZUVycm9yKCdSZXBsYWNlSW5saW5lU3RlcC5pbnZlcnQ6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBjb25zdCByZW1vdmVkID0gc2xpY2VJbmxpbmUoYmxvY2suY29udGVudCwgdGhpcy5mcm9tLCB0aGlzLnRvKVxyXG4gICAgcmV0dXJuIG5ldyBSZXBsYWNlSW5saW5lU3RlcCh0aGlzLmJsb2NrUGF0aCwgdGhpcy5mcm9tLCB0aGlzLmZyb20gKyB0aGlzLmluc2VydExlbmd0aCwgcmVtb3ZlZClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIG1hcFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgYmlhczogQmlhcyA9IDEpOiBQb3NpdGlvbiB7XHJcbiAgICBpZiAoIXBhdGhzRXF1YWwocG9zaXRpb24ucGF0aCwgdGhpcy5ibG9ja1BhdGgpKSByZXR1cm4gcG9zaXRpb25cclxuICAgIGNvbnN0IHsgb2Zmc2V0IH0gPSBwb3NpdGlvblxyXG4gICAgaWYgKG9mZnNldCA8IHRoaXMuZnJvbSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBjb25zdCBkZWx0YSA9IHRoaXMuaW5zZXJ0TGVuZ3RoIC0gKHRoaXMudG8gLSB0aGlzLmZyb20pXHJcbiAgICBpZiAob2Zmc2V0ID4gdGhpcy50bykgcmV0dXJuIHsgcGF0aDogcG9zaXRpb24ucGF0aCwgb2Zmc2V0OiBvZmZzZXQgKyBkZWx0YSB9XHJcbiAgICAvLyBJbnNpZGUgKG9yIGF0IHRoZSBlZGdlIG9mKSB0aGUgcmVwbGFjZWQgcmFuZ2UuXHJcbiAgICBjb25zdCBtYXBwZWQgPSBiaWFzIDwgMCA/IHRoaXMuZnJvbSA6IHRoaXMuZnJvbSArIHRoaXMuaW5zZXJ0TGVuZ3RoXHJcbiAgICByZXR1cm4geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IG1hcHBlZCB9XHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RlcFR5cGU6ICdyZXBsYWNlSW5saW5lJyxcclxuICAgICAgYmxvY2tQYXRoOiBbLi4udGhpcy5ibG9ja1BhdGhdLFxyXG4gICAgICBmcm9tOiB0aGlzLmZyb20sXHJcbiAgICAgIHRvOiB0aGlzLnRvLFxyXG4gICAgICBpbnNlcnQ6IHRoaXMuaW5zZXJ0LnRvSlNPTigpLFxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBGcmFnbWVudCB9IGZyb20gJy4uLy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi8uLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCwgcGF0aFN0YXJ0c1dpdGgsIHVwZGF0ZUF0UGF0aCB9IGZyb20gJy4uLy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IHR5cGUgQmlhcywgU3RlcCwgdHlwZSBTdGVwUmVzdWx0LCBzdGVwRmFpbCwgc3RlcE9rIH0gZnJvbSAnLi4vc3RlcCdcclxuXHJcbi8qKlxyXG4gKiBSZXBsYWNlIHRoZSBjaGlsZHJlbiBbZnJvbSwgdG8pIG9mIHRoZSBlbGVtZW50IG5vZGUgYXQgYHBhcmVudFBhdGhgIHdpdGggYVxyXG4gKiBmcmFnbWVudC4gQ292ZXJzIG5vZGUgaW5zZXJ0aW9uIChmcm9tID09PSB0bykgYW5kIHJlbW92YWwgKGVtcHR5IGZyYWdtZW50KS5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBSZXBsYWNlTm9kZXNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICAgIHJlYWRvbmx5IGluc2VydDogRnJhZ21lbnQsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAoZnJvbSA+IHRvIHx8IGZyb20gPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgSW52YWxpZCBjaGlsZCByYW5nZSBbJHtmcm9tfSwgJHt0b30pYClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGFwcGx5KGRvYzogRWRpdG9yTm9kZSk6IFN0ZXBSZXN1bHQge1xyXG4gICAgY29uc3QgcGFyZW50ID0gbm9kZUF0UGF0aChkb2MsIHRoaXMucGFyZW50UGF0aClcclxuICAgIGlmICghcGFyZW50KSByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VOb2Rlc1N0ZXA6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBpZiAocGFyZW50LmlzVGV4dGJsb2NrIHx8IHBhcmVudC5pc1RleHQpIHtcclxuICAgICAgcmV0dXJuIHN0ZXBGYWlsKCdSZXBsYWNlTm9kZXNTdGVwOiB0YXJnZXQgY2hpbGRyZW4gYXJlIGlubGluZTsgdXNlIFJlcGxhY2VJbmxpbmVTdGVwJylcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnRvID4gcGFyZW50LmNoaWxkQ291bnQpIHJldHVybiBzdGVwRmFpbCgnUmVwbGFjZU5vZGVzU3RlcDogcmFuZ2Ugb3V0IG9mIGJvdW5kcycpXHJcbiAgICByZXR1cm4gc3RlcE9rKFxyXG4gICAgICB1cGRhdGVBdFBhdGgoZG9jLCB0aGlzLnBhcmVudFBhdGgsIChub2RlKSA9PlxyXG4gICAgICAgIG5vZGUud2l0aENvbnRlbnQobm9kZS5jb250ZW50LnJlcGxhY2VSYW5nZSh0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMuaW5zZXJ0KSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcCB7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvY0JlZm9yZSwgdGhpcy5wYXJlbnRQYXRoKVxyXG4gICAgaWYgKCFwYXJlbnQpIHRocm93IG5ldyBSYW5nZUVycm9yKCdSZXBsYWNlTm9kZXNTdGVwLmludmVydDogbm8gbm9kZSBhdCBwYXRoJylcclxuICAgIGNvbnN0IHJlbW92ZWQgPSBwYXJlbnQuY29udGVudC5zbGljZSh0aGlzLmZyb20sIHRoaXMudG8pXHJcbiAgICByZXR1cm4gbmV3IFJlcGxhY2VOb2Rlc1N0ZXAoXHJcbiAgICAgIHRoaXMucGFyZW50UGF0aCxcclxuICAgICAgdGhpcy5mcm9tLFxyXG4gICAgICB0aGlzLmZyb20gKyB0aGlzLmluc2VydC5jaGlsZENvdW50LFxyXG4gICAgICByZW1vdmVkLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBiaWFzOiBCaWFzID0gMSk6IFBvc2l0aW9uIHtcclxuICAgIGlmICghcGF0aFN0YXJ0c1dpdGgocG9zaXRpb24ucGF0aCwgdGhpcy5wYXJlbnRQYXRoKSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBjb25zdCBkZWx0YSA9IHRoaXMuaW5zZXJ0LmNoaWxkQ291bnQgLSAodGhpcy50byAtIHRoaXMuZnJvbSlcclxuICAgIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gdGhpcy5wYXJlbnRQYXRoLmxlbmd0aCkge1xyXG4gICAgICAvLyBUaGUgb2Zmc2V0IGlzIGEgY2hpbGQgaW5kZXggaW4gdGhlIHBhcmVudCBpdHNlbGYuXHJcbiAgICAgIGNvbnN0IGluZGV4ID0gcG9zaXRpb24ub2Zmc2V0XHJcbiAgICAgIGlmIChpbmRleCA8IHRoaXMuZnJvbSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICAgIGlmIChpbmRleCA+PSB0aGlzLnRvKSByZXR1cm4geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IGluZGV4ICsgZGVsdGEgfVxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHBhdGg6IHBvc2l0aW9uLnBhdGgsXHJcbiAgICAgICAgb2Zmc2V0OiBiaWFzIDwgMCA/IHRoaXMuZnJvbSA6IHRoaXMuZnJvbSArIHRoaXMuaW5zZXJ0LmNoaWxkQ291bnQsXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IGNoaWxkSW5kZXggPSBwb3NpdGlvbi5wYXRoW3RoaXMucGFyZW50UGF0aC5sZW5ndGhdIGFzIG51bWJlclxyXG4gICAgaWYgKGNoaWxkSW5kZXggPCB0aGlzLmZyb20pIHJldHVybiBwb3NpdGlvblxyXG4gICAgaWYgKGNoaWxkSW5kZXggPj0gdGhpcy50bykge1xyXG4gICAgICBjb25zdCBwYXRoID0gWy4uLnBvc2l0aW9uLnBhdGhdXHJcbiAgICAgIHBhdGhbdGhpcy5wYXJlbnRQYXRoLmxlbmd0aF0gPSBjaGlsZEluZGV4ICsgZGVsdGFcclxuICAgICAgcmV0dXJuIHsgcGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgLy8gVGhlIHBvc2l0aW9uIGxpdmVkIGluc2lkZSBhIHJlcGxhY2VkIG5vZGUsIGRlZ3JhZGUgdG8gYSBwYXJlbnQgaW5kZXguXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBwYXRoOiB0aGlzLnBhcmVudFBhdGgsXHJcbiAgICAgIG9mZnNldDogYmlhcyA8IDAgPyB0aGlzLmZyb20gOiB0aGlzLmZyb20gKyB0aGlzLmluc2VydC5jaGlsZENvdW50LFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0ZXBUeXBlOiAncmVwbGFjZU5vZGVzJyxcclxuICAgICAgcGFyZW50UGF0aDogWy4uLnRoaXMucGFyZW50UGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIGluc2VydDogdGhpcy5pbnNlcnQudG9KU09OKCksXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKiogQ29udmVuaWVuY2U6IHJlcGxhY2UgdGhlIHNpbmdsZSBub2RlIGF0IGBwYXRoYCB3aXRoIGEgZnJhZ21lbnQuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByZXBsYWNlTm9kZUF0KHBhdGg6IFBhdGgsIGluc2VydDogRnJhZ21lbnQpOiBSZXBsYWNlTm9kZXNTdGVwIHtcclxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3QgcmVwbGFjZSB0aGUgcm9vdCBub2RlJylcclxuICBjb25zdCBpbmRleCA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICByZXR1cm4gbmV3IFJlcGxhY2VOb2Rlc1N0ZXAocGF0aC5zbGljZSgwLCAtMSksIGluZGV4LCBpbmRleCArIDEsIGluc2VydClcclxufVxyXG4iLCAiaW1wb3J0IHsgYXBwbHlJbmxpbmVNYXJrLCBpbmxpbmVMZW5ndGggfSBmcm9tICcuLi8uLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgTWFyayB9IGZyb20gJy4uLy4uL21vZGVsL21hcmsnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCB1cGRhdGVBdFBhdGggfSBmcm9tICcuLi8uLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBTdGVwLCB0eXBlIFN0ZXBSZXN1bHQsIHN0ZXBGYWlsLCBzdGVwT2sgfSBmcm9tICcuLi9zdGVwJ1xyXG5cclxuYWJzdHJhY3QgY2xhc3MgTWFya1N0ZXAgZXh0ZW5kcyBTdGVwIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IGJsb2NrUGF0aDogUGF0aCxcclxuICAgIHJlYWRvbmx5IGZyb206IG51bWJlcixcclxuICAgIHJlYWRvbmx5IHRvOiBudW1iZXIsXHJcbiAgICByZWFkb25seSBtYXJrOiBNYXJrLFxyXG4gICkge1xyXG4gICAgc3VwZXIoKVxyXG4gICAgaWYgKGZyb20gPiB0byB8fCBmcm9tIDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYEludmFsaWQgbWFyayByYW5nZSBbJHtmcm9tfSwgJHt0b30pYClcclxuICB9XHJcblxyXG4gIHByb3RlY3RlZCBhcHBseU1hcmsoZG9jOiBFZGl0b3JOb2RlLCBhZGQ6IGJvb2xlYW4sIG5hbWU6IHN0cmluZyk6IFN0ZXBSZXN1bHQge1xyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5ibG9ja1BhdGgpXHJcbiAgICBpZiAoIWJsb2NrKSByZXR1cm4gc3RlcEZhaWwoYCR7bmFtZX06IG5vIG5vZGUgYXQgcGF0aGApXHJcbiAgICBpZiAoIWJsb2NrLmlzVGV4dGJsb2NrKSByZXR1cm4gc3RlcEZhaWwoYCR7bmFtZX06IHRhcmdldCBpcyBub3QgYSB0ZXh0YmxvY2tgKVxyXG4gICAgaWYgKHRoaXMudG8gPiBpbmxpbmVMZW5ndGgoYmxvY2suY29udGVudCkpIHJldHVybiBzdGVwRmFpbChgJHtuYW1lfTogcmFuZ2Ugb3V0IG9mIGJvdW5kc2ApXHJcbiAgICBpZiAoIWJsb2NrLnR5cGUuYWxsb3dzTWFya1R5cGUodGhpcy5tYXJrLnR5cGUpKSB7XHJcbiAgICAgIHJldHVybiBzdGVwRmFpbChgJHtuYW1lfTogbWFyayBcIiR7dGhpcy5tYXJrLnR5cGUubmFtZX1cIiBub3QgYWxsb3dlZCBoZXJlYClcclxuICAgIH1cclxuICAgIHJldHVybiBzdGVwT2soXHJcbiAgICAgIHVwZGF0ZUF0UGF0aChkb2MsIHRoaXMuYmxvY2tQYXRoLCAobm9kZSkgPT5cclxuICAgICAgICBub2RlLndpdGhDb250ZW50KGFwcGx5SW5saW5lTWFyayhub2RlLmNvbnRlbnQsIHRoaXMuZnJvbSwgdGhpcy50bywgdGhpcy5tYXJrLCBhZGQpKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICB9XHJcblxyXG4gIC8qKiBNYXJrIHN0ZXBzIG5ldmVyIG1vdmUgY29udGVudC4gKi9cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgICByZXR1cm4gcG9zaXRpb25cclxuICB9XHJcbn1cclxuXHJcbi8qKiBBZGQgYSBtYXJrIGFjcm9zcyBhbiBpbmxpbmUgcmFuZ2UuICovXHJcbmV4cG9ydCBjbGFzcyBBZGRNYXJrU3RlcCBleHRlbmRzIE1hcmtTdGVwIHtcclxuICBvdmVycmlkZSBhcHBseShkb2M6IEVkaXRvck5vZGUpOiBTdGVwUmVzdWx0IHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5TWFyayhkb2MsIHRydWUsICdBZGRNYXJrU3RlcCcpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoKTogU3RlcCB7XHJcbiAgICByZXR1cm4gbmV3IFJlbW92ZU1hcmtTdGVwKHRoaXMuYmxvY2tQYXRoLCB0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMubWFyaylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHRvSlNPTigpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGVwVHlwZTogJ2FkZE1hcmsnLFxyXG4gICAgICBibG9ja1BhdGg6IFsuLi50aGlzLmJsb2NrUGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIG1hcms6IHRoaXMubWFyay50b0pTT04oKSxcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW1vdmUgYSBtYXJrIGFjcm9zcyBhbiBpbmxpbmUgcmFuZ2UuIEZvciBleGFjdCBpbnZlcnRpYmlsaXR5LCBlbWl0IHRoZXNlXHJcbiAqIG9ubHkgb3ZlciByYW5nZXMgd2hlcmUgdGhlIG1hcmsgaXMgYWN0dWFsbHkgcHJlc2VudCAoc2VlIGByYW5nZXNXaXRoTWFya2ApLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFJlbW92ZU1hcmtTdGVwIGV4dGVuZHMgTWFya1N0ZXAge1xyXG4gIG92ZXJyaWRlIGFwcGx5KGRvYzogRWRpdG9yTm9kZSk6IFN0ZXBSZXN1bHQge1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHlNYXJrKGRvYywgZmFsc2UsICdSZW1vdmVNYXJrU3RlcCcpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoKTogU3RlcCB7XHJcbiAgICByZXR1cm4gbmV3IEFkZE1hcmtTdGVwKHRoaXMuYmxvY2tQYXRoLCB0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMubWFyaylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHRvSlNPTigpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGVwVHlwZTogJ3JlbW92ZU1hcmsnLFxyXG4gICAgICBibG9ja1BhdGg6IFsuLi50aGlzLmJsb2NrUGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIG1hcms6IHRoaXMubWFyay50b0pTT04oKSxcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgQXR0cnMgfSBmcm9tICcuLi8uLi9tb2RlbC9hdHRycydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgeyB0eXBlIFBhdGgsIG5vZGVBdFBhdGgsIHVwZGF0ZUF0UGF0aCB9IGZyb20gJy4uLy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IFN0ZXAsIHR5cGUgU3RlcFJlc3VsdCwgc3RlcEZhaWwsIHN0ZXBPayB9IGZyb20gJy4uL3N0ZXAnXHJcblxyXG4vKiogUmVwbGFjZSB0aGUgYXR0cmlidXRlcyBvZiB0aGUgbm9kZSBhdCBgcGF0aGAuICovXHJcbmV4cG9ydCBjbGFzcyBTZXROb2RlQXR0cnNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgYXR0cnM6IEF0dHJzLFxyXG4gICkge1xyXG4gICAgc3VwZXIoKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2MsIHRoaXMucGF0aClcclxuICAgIGlmICghbm9kZSkgcmV0dXJuIHN0ZXBGYWlsKCdTZXROb2RlQXR0cnNTdGVwOiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgaWYgKG5vZGUuaXNUZXh0KSByZXR1cm4gc3RlcEZhaWwoJ1NldE5vZGVBdHRyc1N0ZXA6IHRleHQgbm9kZXMgaGF2ZSBubyBhdHRyaWJ1dGVzJylcclxuICAgIHJldHVybiBzdGVwT2sodXBkYXRlQXRQYXRoKGRvYywgdGhpcy5wYXRoLCAodGFyZ2V0KSA9PiB0YXJnZXQud2l0aEF0dHJzKHRoaXMuYXR0cnMpKSlcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGludmVydChkb2NCZWZvcmU6IEVkaXRvck5vZGUpOiBTdGVwIHtcclxuICAgIGNvbnN0IG5vZGUgPSBub2RlQXRQYXRoKGRvY0JlZm9yZSwgdGhpcy5wYXRoKVxyXG4gICAgaWYgKCFub2RlKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignU2V0Tm9kZUF0dHJzU3RlcC5pbnZlcnQ6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICByZXR1cm4gbmV3IFNldE5vZGVBdHRyc1N0ZXAodGhpcy5wYXRoLCBub2RlLmF0dHJzKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvc2l0aW9uXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHsgc3RlcFR5cGU6ICdzZXROb2RlQXR0cnMnLCBwYXRoOiBbLi4udGhpcy5wYXRoXSwgYXR0cnM6IHsgLi4udGhpcy5hdHRycyB9IH1cclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgQXR0cnMgfSBmcm9tICcuLi8uLi9tb2RlbC9hdHRycydcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi8uLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgaW5saW5lTGVuZ3RoLCBtZXJnZUlubGluZSwgc2xpY2VJbmxpbmUgfSBmcm9tICcuLi8uLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCBwYXRoU3RhcnRzV2l0aCwgcGF0aHNFcXVhbCwgdXBkYXRlQXRQYXRoIH0gZnJvbSAnLi4vLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHsgdHlwZSBCaWFzLCBTdGVwLCB0eXBlIFN0ZXBSZXN1bHQsIHN0ZXBGYWlsLCBzdGVwT2sgfSBmcm9tICcuLi9zdGVwJ1xyXG5cclxuZnVuY3Rpb24gc2libGluZ1NoaWZ0KFxyXG4gIHBvc2l0aW9uOiBQb3NpdGlvbixcclxuICBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gIGZyb21JbmRleDogbnVtYmVyLFxyXG4gIGRlbHRhOiBudW1iZXIsXHJcbik6IFBvc2l0aW9uIHwgbnVsbCB7XHJcbiAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCBwYXJlbnRQYXRoKSkgcmV0dXJuIG51bGxcclxuICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHBhcmVudFBhdGgubGVuZ3RoKSB7XHJcbiAgICByZXR1cm4gcG9zaXRpb24ub2Zmc2V0ID4gZnJvbUluZGV4XHJcbiAgICAgID8geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IHBvc2l0aW9uLm9mZnNldCArIGRlbHRhIH1cclxuICAgICAgOiBwb3NpdGlvblxyXG4gIH1cclxuICBjb25zdCBpbmRleCA9IHBvc2l0aW9uLnBhdGhbcGFyZW50UGF0aC5sZW5ndGhdIGFzIG51bWJlclxyXG4gIGlmIChpbmRleCA8PSBmcm9tSW5kZXgpIHJldHVybiBwb3NpdGlvblxyXG4gIGNvbnN0IHBhdGggPSBbLi4ucG9zaXRpb24ucGF0aF1cclxuICBwYXRoW3BhcmVudFBhdGgubGVuZ3RoXSA9IGluZGV4ICsgZGVsdGFcclxuICByZXR1cm4geyBwYXRoLCBvZmZzZXQ6IHBvc2l0aW9uLm9mZnNldCB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTcGxpdCB0aGUgdGV4dGJsb2NrIGF0IGBwYXRoYCBhdCBpbmxpbmUgb2Zmc2V0IGBvZmZzZXRgLiBUaGUgc2Vjb25kIGhhbGZcclxuICogYmVjb21lcyB0aGUgbmV4dCBzaWJsaW5nLCBvZiB0eXBlIGBhZnRlclR5cGVgIChkZWZhdWx0cyB0byB0aGUgc2FtZSB0eXBlXHJcbiAqIGFuZCBhdHRyaWJ1dGVzKS5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBTcGxpdE5vZGVTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgb2Zmc2V0OiBudW1iZXIsXHJcbiAgICByZWFkb25seSBhZnRlclR5cGU/OiBzdHJpbmcsXHJcbiAgICByZWFkb25seSBhZnRlckF0dHJzPzogQXR0cnMsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3Qgc3BsaXQgdGhlIHJvb3Qgbm9kZScpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBhcHBseShkb2M6IEVkaXRvck5vZGUpOiBTdGVwUmVzdWx0IHtcclxuICAgIGNvbnN0IG5vZGUgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5wYXRoKVxyXG4gICAgaWYgKCFub2RlKSByZXR1cm4gc3RlcEZhaWwoJ1NwbGl0Tm9kZVN0ZXA6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBpZiAoIW5vZGUuaXNUZXh0YmxvY2spIHJldHVybiBzdGVwRmFpbCgnU3BsaXROb2RlU3RlcDogb25seSB0ZXh0YmxvY2tzIGNhbiBiZSBzcGxpdCcpXHJcbiAgICBjb25zdCBsZW5ndGggPSBpbmxpbmVMZW5ndGgobm9kZS5jb250ZW50KVxyXG4gICAgaWYgKHRoaXMub2Zmc2V0ID4gbGVuZ3RoKSByZXR1cm4gc3RlcEZhaWwoJ1NwbGl0Tm9kZVN0ZXA6IG9mZnNldCBvdXQgb2YgYm91bmRzJylcclxuICAgIGNvbnN0IGJlZm9yZSA9IHNsaWNlSW5saW5lKG5vZGUuY29udGVudCwgMCwgdGhpcy5vZmZzZXQpXHJcbiAgICBjb25zdCBhZnRlciA9IHNsaWNlSW5saW5lKG5vZGUuY29udGVudCwgdGhpcy5vZmZzZXQsIGxlbmd0aClcclxuICAgIGNvbnN0IHNjaGVtYSA9IG5vZGUudHlwZS5zY2hlbWFcclxuICAgIGNvbnN0IHNlY29uZFR5cGUgPSB0aGlzLmFmdGVyVHlwZSA/IHNjaGVtYS5ub2RlVHlwZSh0aGlzLmFmdGVyVHlwZSkgOiBub2RlLnR5cGVcclxuICAgIGNvbnN0IHNlY29uZEF0dHJzID0gdGhpcy5hZnRlclR5cGUgPyB0aGlzLmFmdGVyQXR0cnMgOiAodGhpcy5hZnRlckF0dHJzID8/IG5vZGUuYXR0cnMpXHJcbiAgICBjb25zdCBzZWNvbmQgPSBzZWNvbmRUeXBlLmNyZWF0ZShzZWNvbmRBdHRycywgYWZ0ZXIpXHJcbiAgICBjb25zdCBmaXJzdCA9IG5vZGUud2l0aENvbnRlbnQoYmVmb3JlKVxyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IHRoaXMucGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gdGhpcy5wYXRoW3RoaXMucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIHJldHVybiBzdGVwT2soXHJcbiAgICAgIHVwZGF0ZUF0UGF0aChkb2MsIHBhcmVudFBhdGgsIChwYXJlbnQpID0+XHJcbiAgICAgICAgcGFyZW50LndpdGhDb250ZW50KFxyXG4gICAgICAgICAgcGFyZW50LmNvbnRlbnQucmVwbGFjZVJhbmdlKGluZGV4LCBpbmRleCArIDEsIEZyYWdtZW50Lm9mKGZpcnN0LCBzZWNvbmQpKSxcclxuICAgICAgICApLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgaW52ZXJ0KCk6IFN0ZXAge1xyXG4gICAgcmV0dXJuIG5ldyBKb2luTm9kZXNTdGVwKHRoaXMucGF0aCwgdGhpcy5vZmZzZXQpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGJpYXM6IEJpYXMgPSAxKTogUG9zaXRpb24ge1xyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IHRoaXMucGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gdGhpcy5wYXRoW3RoaXMucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGlmIChwYXRoc0VxdWFsKHBvc2l0aW9uLnBhdGgsIHRoaXMucGF0aCkpIHtcclxuICAgICAgaWYgKHBvc2l0aW9uLm9mZnNldCA8IHRoaXMub2Zmc2V0KSByZXR1cm4gcG9zaXRpb25cclxuICAgICAgaWYgKHBvc2l0aW9uLm9mZnNldCA9PT0gdGhpcy5vZmZzZXQgJiYgYmlhcyA8IDApIHJldHVybiBwb3NpdGlvblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHBhdGg6IFsuLi5wYXJlbnRQYXRoLCBpbmRleCArIDFdLFxyXG4gICAgICAgIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0IC0gdGhpcy5vZmZzZXQsXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBzaWJsaW5nU2hpZnQocG9zaXRpb24sIHBhcmVudFBhdGgsIGluZGV4LCAxKSA/PyBwb3NpdGlvblxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0ZXBUeXBlOiAnc3BsaXROb2RlJyxcclxuICAgICAgcGF0aDogWy4uLnRoaXMucGF0aF0sXHJcbiAgICAgIG9mZnNldDogdGhpcy5vZmZzZXQsXHJcbiAgICAgIC4uLih0aGlzLmFmdGVyVHlwZSA/IHsgYWZ0ZXJUeXBlOiB0aGlzLmFmdGVyVHlwZSB9IDoge30pLFxyXG4gICAgICAuLi4odGhpcy5hZnRlckF0dHJzID8geyBhZnRlckF0dHJzOiB7IC4uLnRoaXMuYWZ0ZXJBdHRycyB9IH0gOiB7fSksXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogSm9pbiB0aGUgdGV4dGJsb2NrIGF0IGBwYXRoYCB3aXRoIGl0cyBuZXh0IHNpYmxpbmcsIGFic29yYmluZyB0aGUgc2libGluZydzXHJcbiAqIGlubGluZSBjb250ZW50LiBgam9pbk9mZnNldGAgbXVzdCBlcXVhbCB0aGUgZmlyc3QgYmxvY2sncyBpbmxpbmUgbGVuZ3RoLlxyXG4gKiBJdCBtYWtlcyBwb3NpdGlvbiBtYXBwaW5nIGRvY3VtZW50LWluZGVwZW5kZW50LlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIEpvaW5Ob2Rlc1N0ZXAgZXh0ZW5kcyBTdGVwIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IHBhdGg6IFBhdGgsXHJcbiAgICByZWFkb25seSBqb2luT2Zmc2V0OiBudW1iZXIsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3Qgam9pbiB0aGUgcm9vdCBub2RlJylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGFwcGx5KGRvYzogRWRpdG9yTm9kZSk6IFN0ZXBSZXN1bHQge1xyXG4gICAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCB0aGlzLnBhdGgpXHJcbiAgICBpZiAoIW5vZGUpIHJldHVybiBzdGVwRmFpbCgnSm9pbk5vZGVzU3RlcDogbm8gbm9kZSBhdCBwYXRoJylcclxuICAgIGlmICghbm9kZS5pc1RleHRibG9jaykgcmV0dXJuIHN0ZXBGYWlsKCdKb2luTm9kZXNTdGVwOiBvbmx5IHRleHRibG9ja3MgY2FuIGJlIGpvaW5lZCcpXHJcbiAgICBpZiAoaW5saW5lTGVuZ3RoKG5vZGUuY29udGVudCkgIT09IHRoaXMuam9pbk9mZnNldCkge1xyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ0pvaW5Ob2Rlc1N0ZXA6IGpvaW5PZmZzZXQgZG9lcyBub3QgbWF0Y2ggdGhlIGJsb2NrIGxlbmd0aCcpXHJcbiAgICB9XHJcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gdGhpcy5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgY29uc3QgaW5kZXggPSB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgY29uc3QgcGFyZW50ID0gbm9kZUF0UGF0aChkb2MsIHBhcmVudFBhdGgpXHJcbiAgICBjb25zdCBuZXh0ID0gcGFyZW50Py5jb250ZW50Lm1heWJlQ2hpbGQoaW5kZXggKyAxKVxyXG4gICAgaWYgKCFuZXh0KSByZXR1cm4gc3RlcEZhaWwoJ0pvaW5Ob2Rlc1N0ZXA6IG5vIG5leHQgc2libGluZyB0byBqb2luIHdpdGgnKVxyXG4gICAgaWYgKCFuZXh0LmlzVGV4dGJsb2NrKSByZXR1cm4gc3RlcEZhaWwoJ0pvaW5Ob2Rlc1N0ZXA6IG5leHQgc2libGluZyBpcyBub3QgYSB0ZXh0YmxvY2snKVxyXG4gICAgY29uc3Qgam9pbmVkID0gbm9kZS53aXRoQ29udGVudChtZXJnZUlubGluZShub2RlLmNvbnRlbnQuYXBwZW5kKG5leHQuY29udGVudCkpKVxyXG4gICAgcmV0dXJuIHN0ZXBPayhcclxuICAgICAgdXBkYXRlQXRQYXRoKGRvYywgcGFyZW50UGF0aCwgKHRhcmdldCkgPT5cclxuICAgICAgICB0YXJnZXQud2l0aENvbnRlbnQodGFyZ2V0LmNvbnRlbnQucmVwbGFjZVJhbmdlKGluZGV4LCBpbmRleCArIDIsIEZyYWdtZW50Lm9mKGpvaW5lZCkpKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGludmVydChkb2NCZWZvcmU6IEVkaXRvck5vZGUpOiBTdGVwIHtcclxuICAgIGNvbnN0IHBhcmVudFBhdGggPSB0aGlzLnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBjb25zdCBpbmRleCA9IHRoaXMucGF0aFt0aGlzLnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvY0JlZm9yZSwgcGFyZW50UGF0aClcclxuICAgIGNvbnN0IG5leHQgPSBwYXJlbnQ/LmNvbnRlbnQubWF5YmVDaGlsZChpbmRleCArIDEpXHJcbiAgICBpZiAoIW5leHQpIHRocm93IG5ldyBSYW5nZUVycm9yKCdKb2luTm9kZXNTdGVwLmludmVydDogbm8gbmV4dCBzaWJsaW5nJylcclxuICAgIHJldHVybiBuZXcgU3BsaXROb2RlU3RlcCh0aGlzLnBhdGgsIHRoaXMuam9pbk9mZnNldCwgbmV4dC50eXBlLm5hbWUsIG5leHQuYXR0cnMpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gdGhpcy5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgY29uc3QgaW5kZXggPSB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgY29uc3QgbmV4dFBhdGggPSBbLi4ucGFyZW50UGF0aCwgaW5kZXggKyAxXVxyXG4gICAgaWYgKHBhdGhzRXF1YWwocG9zaXRpb24ucGF0aCwgbmV4dFBhdGgpKSB7XHJcbiAgICAgIHJldHVybiB7IHBhdGg6IHRoaXMucGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgKyB0aGlzLmpvaW5PZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCBwYXJlbnRQYXRoKSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHBhcmVudFBhdGgubGVuZ3RoKSB7XHJcbiAgICAgIC8vIEEgY2hpbGQgaW5kZXggYXQgb3IgcGFzdCB0aGUgcmVtb3ZlZCBzaWJsaW5nIHNoaWZ0cyBsZWZ0IGJ5IG9uZS5cclxuICAgICAgcmV0dXJuIHBvc2l0aW9uLm9mZnNldCA+PSBpbmRleCArIDJcclxuICAgICAgICA/IHsgcGF0aDogcG9zaXRpb24ucGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgLSAxIH1cclxuICAgICAgICA6IHBvc2l0aW9uXHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGlsZEluZGV4ID0gcG9zaXRpb24ucGF0aFtwYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBpZiAoY2hpbGRJbmRleCA+PSBpbmRleCArIDIpIHtcclxuICAgICAgY29uc3QgcGF0aCA9IFsuLi5wb3NpdGlvbi5wYXRoXVxyXG4gICAgICBwYXRoW3BhcmVudFBhdGgubGVuZ3RoXSA9IGNoaWxkSW5kZXggLSAxXHJcbiAgICAgIHJldHVybiB7IHBhdGgsIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0IH1cclxuICAgIH1cclxuICAgIHJldHVybiBwb3NpdGlvblxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7IHN0ZXBUeXBlOiAnam9pbk5vZGVzJywgcGF0aDogWy4uLnRoaXMucGF0aF0sIGpvaW5PZmZzZXQ6IHRoaXMuam9pbk9mZnNldCB9XHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4uLy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi8uLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCwgcGF0aFN0YXJ0c1dpdGgsIHVwZGF0ZUF0UGF0aCB9IGZyb20gJy4uLy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IFN0ZXAsIHR5cGUgU3RlcFJlc3VsdCwgc3RlcEZhaWwsIHN0ZXBPayB9IGZyb20gJy4uL3N0ZXAnXHJcblxyXG4vKipcclxuICogTW92ZSBvbmUgY2hpbGQgb2YgYW4gZWxlbWVudCBub2RlIHRvIGFub3RoZXIgaW5kZXggYW1vbmcgaXRzIHNpYmxpbmdzLlxyXG4gKlxyXG4gKiBDb21wb3NpbmcgYSBtb3ZlIG91dCBvZiBhIHJlbW92ZSBhbmQgYW4gaW5zZXJ0IHByb2R1Y2VzIHRoZSBzYW1lIGRvY3VtZW50LFxyXG4gKiBidXQgbm90IHRoZSBzYW1lICpwb3NpdGlvbnMqOiBldmVyeSBwb3NpdGlvbiBpbnNpZGUgdGhlIG1vdmVkIG5vZGUgaXNcclxuICogbWFwcGVkIHRocm91Z2ggYSByZXBsYWNlbWVudCB0aGF0IG5vIGxvbmdlciBjb250YWlucyBpdCwgYW5kIGNvbGxhcHNlcyB0b1xyXG4gKiB0aGUgcGFyZW50LiBUaGF0IGlzIHdoeSBhIGNhcmV0IGhhcyB0byBiZSByZXN0b3JlZCBieSBoYW5kIGFmdGVyIGFcclxuICogcmVidWlsZC10aGUtd2hvbGUtdGFibGUgbW92ZS4gSGVyZSB0aGUgc3VidHJlZSBrZWVwcyBpdHMgaWRlbnRpdHksIHNvIGFcclxuICogc2VsZWN0aW9uLCBhIGRlY29yYXRpb24gb3IgYSBwZW5kaW5nIHVwbG9hZCBwbGFjZWhvbGRlciBpbnNpZGUgdGhlIG1vdmVkXHJcbiAqIG5vZGUgdHJhdmVscyB3aXRoIGl0IGFuZCBuZWVkcyBubyByZXBhaXIuXHJcbiAqXHJcbiAqIEl0IGlzIGFsc28gb25lIHVuZG8gc3RlcCByYXRoZXIgdGhhbiB0d28sIGFuZCBpbnZlcnRzIHRvIGEgcGxhaW4gbW92ZSBiYWNrLlxyXG4gKlxyXG4gKiBgdG9gIGlzIHRoZSBpbmRleCB0aGUgbm9kZSBlbmRzIHVwIGF0LCB0aGUgd2F5IGBBcnJheS5wcm90b3R5cGUuc3BsaWNlYFxyXG4gKiBjb3VudHM6IHJlbW92ZWQgZmlyc3QsIHRoZW4gaW5zZXJ0ZWQuIE1vdmluZyBjaGlsZCAwIHRvIGluZGV4IDIgb2ZcclxuICogYFthLCBiLCBjXWAgZ2l2ZXMgYFtiLCBjLCBhXWAuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTW92ZU5vZGVTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChmcm9tIDwgMCB8fCB0byA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKGBJbnZhbGlkIG1vdmUgJHtmcm9tfSBcdTIxOTIgJHt0b31gKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoKVxyXG4gICAgaWYgKCFwYXJlbnQpIHJldHVybiBzdGVwRmFpbCgnTW92ZU5vZGVTdGVwOiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgaWYgKHBhcmVudC5pc1RleHRibG9jayB8fCBwYXJlbnQuaXNUZXh0KSB7XHJcbiAgICAgIHJldHVybiBzdGVwRmFpbCgnTW92ZU5vZGVTdGVwOiBjaGlsZHJlbiBhcmUgaW5saW5lOyB1c2UgUmVwbGFjZUlubGluZVN0ZXAnKVxyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuZnJvbSA+PSBwYXJlbnQuY2hpbGRDb3VudCB8fCB0aGlzLnRvID49IHBhcmVudC5jaGlsZENvdW50KSB7XHJcbiAgICAgIHJldHVybiBzdGVwRmFpbCgnTW92ZU5vZGVTdGVwOiBpbmRleCBvdXQgb2YgYm91bmRzJylcclxuICAgIH1cclxuICAgIGlmICh0aGlzLmZyb20gPT09IHRoaXMudG8pIHJldHVybiBzdGVwT2soZG9jKVxyXG4gICAgcmV0dXJuIHN0ZXBPayhcclxuICAgICAgdXBkYXRlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoLCAobm9kZSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gWy4uLm5vZGUuY29udGVudC5jaGlsZHJlbl1cclxuICAgICAgICBjb25zdCBbbW92ZWRdID0gY2hpbGRyZW4uc3BsaWNlKHRoaXMuZnJvbSwgMSlcclxuICAgICAgICBpZiAoIW1vdmVkKSByZXR1cm4gbm9kZVxyXG4gICAgICAgIGNoaWxkcmVuLnNwbGljZSh0aGlzLnRvLCAwLCBtb3ZlZClcclxuICAgICAgICByZXR1cm4gbm9kZS53aXRoQ29udGVudChGcmFnbWVudC5mcm9tKGNoaWxkcmVuKSlcclxuICAgICAgfSksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBNb3ZpbmcgYmFjayBpcyBqdXN0IHRoZSBtb3ZlIHdpdGggaXRzIGVuZHMgc3dhcHBlZCwgdW5kZXIgc3BsaWNlXHJcbiAgICogc2VtYW50aWNzIHRoYXQgcmVzdG9yZXMgdGhlIG9yaWdpbmFsIG9yZGVyIGZvciBldmVyeSBlbGVtZW50LCBub3Qgb25seVxyXG4gICAqIHRoZSBvbmUgdGhhdCBtb3ZlZC5cclxuICAgKi9cclxuICBvdmVycmlkZSBpbnZlcnQoKTogU3RlcCB7XHJcbiAgICByZXR1cm4gbmV3IE1vdmVOb2RlU3RlcCh0aGlzLnBhcmVudFBhdGgsIHRoaXMudG8sIHRoaXMuZnJvbSlcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIG1hcFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcclxuICAgIGlmICh0aGlzLmZyb20gPT09IHRoaXMudG8pIHJldHVybiBwb3NpdGlvblxyXG4gICAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCB0aGlzLnBhcmVudFBhdGgpKSByZXR1cm4gcG9zaXRpb25cclxuXHJcbiAgICAvLyBBIHBvc2l0aW9uIGF0IHRoZSBwYXJlbnQncyBvd24gbGV2ZWwgYWRkcmVzc2VzIGEgZ2FwIGJldHdlZW4gY2hpbGRyZW4uXHJcbiAgICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHRoaXMucGFyZW50UGF0aC5sZW5ndGgpIHtcclxuICAgICAgcmV0dXJuIHsgcGF0aDogcG9zaXRpb24ucGF0aCwgb2Zmc2V0OiB0aGlzLm1hcEdhcChwb3NpdGlvbi5vZmZzZXQpIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpbmRleCA9IHBvc2l0aW9uLnBhdGhbdGhpcy5wYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBtYXBwZWQgPSB0aGlzLm1hcEluZGV4KGluZGV4KVxyXG4gICAgaWYgKG1hcHBlZCA9PT0gaW5kZXgpIHJldHVybiBwb3NpdGlvblxyXG4gICAgY29uc3QgcGF0aCA9IFsuLi5wb3NpdGlvbi5wYXRoXVxyXG4gICAgcGF0aFt0aGlzLnBhcmVudFBhdGgubGVuZ3RoXSA9IG1hcHBlZFxyXG4gICAgcmV0dXJuIHsgcGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXJlIHRoZSBjaGlsZCB0aGF0IHdhcyBhdCBgaW5kZXhgIGVuZHMgdXAuICovXHJcbiAgcHJpdmF0ZSBtYXBJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmIChpbmRleCA9PT0gdGhpcy5mcm9tKSByZXR1cm4gdGhpcy50b1xyXG4gICAgaWYgKHRoaXMuZnJvbSA8IHRoaXMudG8pIHJldHVybiBpbmRleCA+IHRoaXMuZnJvbSAmJiBpbmRleCA8PSB0aGlzLnRvID8gaW5kZXggLSAxIDogaW5kZXhcclxuICAgIHJldHVybiBpbmRleCA+PSB0aGlzLnRvICYmIGluZGV4IDwgdGhpcy5mcm9tID8gaW5kZXggKyAxIDogaW5kZXhcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFdoZXJlIGEgZ2FwIGJldHdlZW4gY2hpbGRyZW4gZW5kcyB1cC5cclxuICAgKlxyXG4gICAqIEEgZ2FwIGlzIG5vdCBhIGNoaWxkLCBzbyBpdCBjYW5ub3QgdHJhdmVsIHdpdGggdGhlIG1vdmVkIG5vZGU7IGl0IHN0YXlzXHJcbiAgICogd2hlcmUgaXQgaXMgaW4gdGhlIHNlcXVlbmNlIGFuZCBzaGlmdHMgb25seSBiZWNhdXNlIGl0cyBuZWlnaGJvdXJzIGRpZC5cclxuICAgKiBHYXBzIG91dHNpZGUgdGhlIHNwYW4gdGhlIG1vdmUgdG91Y2hlZCBhcmUgdW50b3VjaGVkLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgbWFwR2FwKG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLmZyb20gPCB0aGlzLnRvKSByZXR1cm4gb2Zmc2V0ID4gdGhpcy5mcm9tICYmIG9mZnNldCA8PSB0aGlzLnRvID8gb2Zmc2V0IC0gMSA6IG9mZnNldFxyXG4gICAgcmV0dXJuIG9mZnNldCA+PSB0aGlzLnRvICYmIG9mZnNldCA8PSB0aGlzLmZyb20gPyBvZmZzZXQgKyAxIDogb2Zmc2V0XHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RlcFR5cGU6ICdtb3ZlTm9kZScsXHJcbiAgICAgIHBhcmVudFBhdGg6IFsuLi50aGlzLnBhcmVudFBhdGhdLFxyXG4gICAgICBmcm9tOiB0aGlzLmZyb20sXHJcbiAgICAgIHRvOiB0aGlzLnRvLFxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqIE1vdmUgdGhlIG5vZGUgYXQgYHBhdGhgIHRvIGB0b2AgYW1vbmcgaXRzIHNpYmxpbmdzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbW92ZU5vZGVUbyhwYXRoOiBQYXRoLCB0bzogbnVtYmVyKTogTW92ZU5vZGVTdGVwIHtcclxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3QgbW92ZSB0aGUgcm9vdCBub2RlJylcclxuICBjb25zdCBpbmRleCA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICByZXR1cm4gbmV3IE1vdmVOb2RlU3RlcChwYXRoLnNsaWNlKDAsIC0xKSwgaW5kZXgsIHRvKVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEF0dHJzIH0gZnJvbSAnLi4vLi4vbW9kZWwvYXR0cnMnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCBwYXRoU3RhcnRzV2l0aCwgdXBkYXRlQXRQYXRoIH0gZnJvbSAnLi4vLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHsgU3RlcCwgdHlwZSBTdGVwUmVzdWx0LCBzdGVwRmFpbCwgc3RlcE9rIH0gZnJvbSAnLi4vc3RlcCdcclxuXHJcbi8qKlxyXG4gKiBXcmFwIHRoZSBjaGlsZHJlbiBbZnJvbSwgdG8pIG9mIHRoZSBub2RlIGF0IGBwYXJlbnRQYXRoYCBpbiBhIG5ldyBub2RlIG9mXHJcbiAqIHR5cGUgYHdyYXBwZXJUeXBlYCwgcGxhY2VkIGF0IGluZGV4IGBmcm9tYC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBXcmFwTm9kZXNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICAgIHJlYWRvbmx5IHdyYXBwZXJUeXBlOiBzdHJpbmcsXHJcbiAgICByZWFkb25seSB3cmFwcGVyQXR0cnM/OiBBdHRycyxcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChmcm9tID49IHRvIHx8IGZyb20gPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgSW52YWxpZCB3cmFwIHJhbmdlIFske2Zyb219LCAke3RvfSlgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoKVxyXG4gICAgaWYgKCFwYXJlbnQpIHJldHVybiBzdGVwRmFpbCgnV3JhcE5vZGVzU3RlcDogbm8gbm9kZSBhdCBwYXRoJylcclxuICAgIGlmIChwYXJlbnQuaXNUZXh0YmxvY2sgfHwgcGFyZW50LmlzVGV4dClcclxuICAgICAgcmV0dXJuIHN0ZXBGYWlsKCdXcmFwTm9kZXNTdGVwOiBjYW5ub3Qgd3JhcCBpbmxpbmUgY29udGVudCcpXHJcbiAgICBpZiAodGhpcy50byA+IHBhcmVudC5jaGlsZENvdW50KSByZXR1cm4gc3RlcEZhaWwoJ1dyYXBOb2Rlc1N0ZXA6IHJhbmdlIG91dCBvZiBib3VuZHMnKVxyXG4gICAgY29uc3Qgc2NoZW1hID0gcGFyZW50LnR5cGUuc2NoZW1hXHJcbiAgICBjb25zdCB3cmFwcGVyID0gc2NoZW1hXHJcbiAgICAgIC5ub2RlVHlwZSh0aGlzLndyYXBwZXJUeXBlKVxyXG4gICAgICAuY3JlYXRlKHRoaXMud3JhcHBlckF0dHJzLCBwYXJlbnQuY29udGVudC5zbGljZSh0aGlzLmZyb20sIHRoaXMudG8pKVxyXG4gICAgcmV0dXJuIHN0ZXBPayhcclxuICAgICAgdXBkYXRlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoLCAobm9kZSkgPT5cclxuICAgICAgICBub2RlLndpdGhDb250ZW50KG5vZGUuY29udGVudC5yZXBsYWNlUmFuZ2UodGhpcy5mcm9tLCB0aGlzLnRvLCBGcmFnbWVudC5vZih3cmFwcGVyKSkpLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgaW52ZXJ0KCk6IFN0ZXAge1xyXG4gICAgcmV0dXJuIG5ldyBMaWZ0Tm9kZXNTdGVwKFsuLi50aGlzLnBhcmVudFBhdGgsIHRoaXMuZnJvbV0sIHRoaXMudG8gLSB0aGlzLmZyb20pXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgICBpZiAoIXBhdGhTdGFydHNXaXRoKHBvc2l0aW9uLnBhdGgsIHRoaXMucGFyZW50UGF0aCkpIHJldHVybiBwb3NpdGlvblxyXG4gICAgY29uc3QgcmVtb3ZlZCA9IHRoaXMudG8gLSB0aGlzLmZyb21cclxuICAgIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gdGhpcy5wYXJlbnRQYXRoLmxlbmd0aCkge1xyXG4gICAgICBjb25zdCBpbmRleCA9IHBvc2l0aW9uLm9mZnNldFxyXG4gICAgICBpZiAoaW5kZXggPD0gdGhpcy5mcm9tKSByZXR1cm4gcG9zaXRpb25cclxuICAgICAgaWYgKGluZGV4ID49IHRoaXMudG8pIHJldHVybiB7IHBhdGg6IHBvc2l0aW9uLnBhdGgsIG9mZnNldDogaW5kZXggLSByZW1vdmVkICsgMSB9XHJcbiAgICAgIC8vIEJldHdlZW4gd3JhcHBlZCBjaGlsZHJlbjogbGFuZCBpbnNpZGUgdGhlIHdyYXBwZXIuXHJcbiAgICAgIHJldHVybiB7IHBhdGg6IFsuLi50aGlzLnBhcmVudFBhdGgsIHRoaXMuZnJvbV0sIG9mZnNldDogaW5kZXggLSB0aGlzLmZyb20gfVxyXG4gICAgfVxyXG4gICAgY29uc3QgY2hpbGRJbmRleCA9IHBvc2l0aW9uLnBhdGhbdGhpcy5wYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCByZXN0ID0gcG9zaXRpb24ucGF0aC5zbGljZSh0aGlzLnBhcmVudFBhdGgubGVuZ3RoICsgMSlcclxuICAgIGlmIChjaGlsZEluZGV4IDwgdGhpcy5mcm9tKSByZXR1cm4gcG9zaXRpb25cclxuICAgIGlmIChjaGlsZEluZGV4ID49IHRoaXMudG8pIHtcclxuICAgICAgY29uc3QgcGF0aCA9IFsuLi5wb3NpdGlvbi5wYXRoXVxyXG4gICAgICBwYXRoW3RoaXMucGFyZW50UGF0aC5sZW5ndGhdID0gY2hpbGRJbmRleCAtIHJlbW92ZWQgKyAxXHJcbiAgICAgIHJldHVybiB7IHBhdGgsIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0IH1cclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHBhdGg6IFsuLi50aGlzLnBhcmVudFBhdGgsIHRoaXMuZnJvbSwgY2hpbGRJbmRleCAtIHRoaXMuZnJvbSwgLi4ucmVzdF0sXHJcbiAgICAgIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0LFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0ZXBUeXBlOiAnd3JhcE5vZGVzJyxcclxuICAgICAgcGFyZW50UGF0aDogWy4uLnRoaXMucGFyZW50UGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIHdyYXBwZXJUeXBlOiB0aGlzLndyYXBwZXJUeXBlLFxyXG4gICAgICAuLi4odGhpcy53cmFwcGVyQXR0cnMgPyB7IHdyYXBwZXJBdHRyczogeyAuLi50aGlzLndyYXBwZXJBdHRycyB9IH0gOiB7fSksXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUmVwbGFjZSB0aGUgbm9kZSBhdCBgcGF0aGAgd2l0aCBpdHMgb3duIGNoaWxkcmVuIChyZW1vdmUgb25lIHdyYXBwZXJcclxuICogbGV2ZWwpLiBgbGlmdGVkQ291bnRgIG11c3QgZXF1YWwgdGhlIG5vZGUncyBjaGlsZCBjb3VudC4gSXQgbWFrZXMgcG9zaXRpb25cclxuICogbWFwcGluZyBkb2N1bWVudC1pbmRlcGVuZGVudC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBMaWZ0Tm9kZXNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgbGlmdGVkQ291bnQ6IG51bWJlcixcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0Nhbm5vdCBsaWZ0IHRoZSByb290IG5vZGUnKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2MsIHRoaXMucGF0aClcclxuICAgIGlmICghbm9kZSkgcmV0dXJuIHN0ZXBGYWlsKCdMaWZ0Tm9kZXNTdGVwOiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgaWYgKG5vZGUuaXNUZXh0YmxvY2sgfHwgbm9kZS5pc1RleHQpXHJcbiAgICAgIHJldHVybiBzdGVwRmFpbCgnTGlmdE5vZGVzU3RlcDogY2Fubm90IGxpZnQgaW5saW5lIGNvbnRlbnQnKVxyXG4gICAgaWYgKG5vZGUuY2hpbGRDb3VudCAhPT0gdGhpcy5saWZ0ZWRDb3VudCkge1xyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ0xpZnROb2Rlc1N0ZXA6IGxpZnRlZENvdW50IGRvZXMgbm90IG1hdGNoIHRoZSBub2RlJylcclxuICAgIH1cclxuICAgIGNvbnN0IHBhcmVudFBhdGggPSB0aGlzLnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBjb25zdCBpbmRleCA9IHRoaXMucGF0aFt0aGlzLnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICByZXR1cm4gc3RlcE9rKFxyXG4gICAgICB1cGRhdGVBdFBhdGgoZG9jLCBwYXJlbnRQYXRoLCAocGFyZW50KSA9PlxyXG4gICAgICAgIHBhcmVudC53aXRoQ29udGVudChwYXJlbnQuY29udGVudC5yZXBsYWNlUmFuZ2UoaW5kZXgsIGluZGV4ICsgMSwgbm9kZS5jb250ZW50KSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcCB7XHJcbiAgICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2NCZWZvcmUsIHRoaXMucGF0aClcclxuICAgIGlmICghbm9kZSkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0xpZnROb2Rlc1N0ZXAuaW52ZXJ0OiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgY29uc3QgaW5kZXggPSB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgcmV0dXJuIG5ldyBXcmFwTm9kZXNTdGVwKFxyXG4gICAgICB0aGlzLnBhdGguc2xpY2UoMCwgLTEpLFxyXG4gICAgICBpbmRleCxcclxuICAgICAgaW5kZXggKyBub2RlLmNoaWxkQ291bnQsXHJcbiAgICAgIG5vZGUudHlwZS5uYW1lLFxyXG4gICAgICBub2RlLmF0dHJzLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IHRoaXMucGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gdGhpcy5wYXRoW3RoaXMucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGlmIChwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCB0aGlzLnBhdGgpKSB7XHJcbiAgICAgIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gdGhpcy5wYXRoLmxlbmd0aCkge1xyXG4gICAgICAgIC8vIEEgY2hpbGQgaW5kZXggaW5zaWRlIHRoZSBsaWZ0ZWQgd3JhcHBlciBtYXBzIHRvIHRoZSBwYXJlbnQgbGV2ZWwuXHJcbiAgICAgICAgcmV0dXJuIHsgcGF0aDogcGFyZW50UGF0aCwgb2Zmc2V0OiBpbmRleCArIHBvc2l0aW9uLm9mZnNldCB9XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgY2hpbGRJbmRleCA9IHBvc2l0aW9uLnBhdGhbdGhpcy5wYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICAgIGNvbnN0IHJlc3QgPSBwb3NpdGlvbi5wYXRoLnNsaWNlKHRoaXMucGF0aC5sZW5ndGggKyAxKVxyXG4gICAgICByZXR1cm4geyBwYXRoOiBbLi4ucGFyZW50UGF0aCwgaW5kZXggKyBjaGlsZEluZGV4LCAuLi5yZXN0XSwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCBwYXJlbnRQYXRoKSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBjb25zdCBkZWx0YSA9IHRoaXMubGlmdGVkQ291bnQgLSAxXHJcbiAgICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHBhcmVudFBhdGgubGVuZ3RoKSB7XHJcbiAgICAgIHJldHVybiBwb3NpdGlvbi5vZmZzZXQgPiBpbmRleFxyXG4gICAgICAgID8geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IHBvc2l0aW9uLm9mZnNldCArIGRlbHRhIH1cclxuICAgICAgICA6IHBvc2l0aW9uXHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGlsZEluZGV4ID0gcG9zaXRpb24ucGF0aFtwYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBpZiAoY2hpbGRJbmRleCA+IGluZGV4KSB7XHJcbiAgICAgIGNvbnN0IHBhdGggPSBbLi4ucG9zaXRpb24ucGF0aF1cclxuICAgICAgcGF0aFtwYXJlbnRQYXRoLmxlbmd0aF0gPSBjaGlsZEluZGV4ICsgZGVsdGFcclxuICAgICAgcmV0dXJuIHsgcGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBvc2l0aW9uXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHsgc3RlcFR5cGU6ICdsaWZ0Tm9kZXMnLCBwYXRoOiBbLi4udGhpcy5wYXRoXSwgbGlmdGVkQ291bnQ6IHRoaXMubGlmdGVkQ291bnQgfVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBNYXJrIH0gZnJvbSAnLi4vbW9kZWwvbWFyaydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBQb3NpdGlvbiB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvclN0YXRlIH0gZnJvbSAnLi9lZGl0b3Itc3RhdGUnXHJcbmltcG9ydCB0eXBlIHsgU2VsZWN0aW9uIH0gZnJvbSAnLi9zZWxlY3Rpb24nXHJcbmltcG9ydCB0eXBlIHsgQmlhcywgUG9zaXRpb25NYXBwZXIsIFN0ZXAgfSBmcm9tICcuL3N0ZXAnXHJcblxyXG4vKipcclxuICogQW4gb3JkZXJlZCBsaXN0IG9mIHN0ZXBzIGFwcGxpZWQgdG8gYSBkb2N1bWVudCwgcGx1cyBzZWxlY3Rpb24sIHN0b3JlZFxyXG4gKiBtYXJrcyBhbmQgbWV0YWRhdGEuIEJ1aWxkIG9uZSB2aWEgYHN0YXRlLnRyYCwgdGhlbiBkaXNwYXRjaCBpdC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBUcmFuc2FjdGlvbiBpbXBsZW1lbnRzIFBvc2l0aW9uTWFwcGVyIHtcclxuICByZWFkb25seSBzdGVwczogU3RlcFtdID0gW11cclxuICAvKiogVGhlIGRvY3VtZW50IGJlZm9yZSBlYWNoIHN0ZXAsIHBhcmFsbGVsIHRvIHtAbGluayBzdGVwc30uICovXHJcbiAgcmVhZG9ubHkgZG9jczogRWRpdG9yTm9kZVtdID0gW11cclxuICAvKiogQ3JlYXRpb24gdGltZSwgdXNlZCBieSB0aGUgdW5kbyBoaXN0b3J5IGZvciBncm91cGluZy4gKi9cclxuICByZWFkb25seSB0aW1lOiBudW1iZXIgPSBEYXRlLm5vdygpXHJcblxyXG4gIHByaXZhdGUgY3VycmVudERvYzogRWRpdG9yTm9kZVxyXG4gIHByaXZhdGUgcmVhZG9ubHkgYmFzZVNlbGVjdGlvbjogU2VsZWN0aW9uXHJcbiAgcHJpdmF0ZSBleHBsaWNpdFNlbGVjdGlvbjogeyBzZWxlY3Rpb246IFNlbGVjdGlvbjsgYXRTdGVwOiBudW1iZXIgfSB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSBzdG9yZWQ6IHJlYWRvbmx5IE1hcmtbXSB8IG51bGxcclxuICBwcml2YXRlIG1ldGFkYXRhOiBNYXA8c3RyaW5nLCB1bmtub3duPiB8IG51bGwgPSBudWxsXHJcblxyXG4gIGNvbnN0cnVjdG9yKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xyXG4gICAgdGhpcy5jdXJyZW50RG9jID0gc3RhdGUuZG9jXHJcbiAgICB0aGlzLmJhc2VTZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIHRoaXMuc3RvcmVkID0gc3RhdGUuc3RvcmVkTWFya3NcclxuICB9XHJcblxyXG4gIGdldCBkb2MoKTogRWRpdG9yTm9kZSB7XHJcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50RG9jXHJcbiAgfVxyXG5cclxuICBnZXQgZG9jQ2hhbmdlZCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnN0ZXBzLmxlbmd0aCA+IDBcclxuICB9XHJcblxyXG4gIC8qKiBBcHBseSBhIHN0ZXA7IHJldHVybnMgZmFsc2UgKGxlYXZpbmcgdGhlIHRyYW5zYWN0aW9uIHVudG91Y2hlZCkgb24gZmFpbHVyZS4gKi9cclxuICBtYXliZVN0ZXAoc3RlcDogU3RlcCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudHJ5U3RlcChzdGVwKSA9PT0gbnVsbFxyXG4gIH1cclxuXHJcbiAgLyoqIEFwcGx5IGEgc3RlcDsgdGhyb3dzIG9uIGZhaWx1cmUuICovXHJcbiAgc3RlcChzdGVwOiBTdGVwKTogdGhpcyB7XHJcbiAgICBjb25zdCBmYWlsZWQgPSB0aGlzLnRyeVN0ZXAoc3RlcClcclxuICAgIGlmIChmYWlsZWQgIT09IG51bGwpIHRocm93IG5ldyBSYW5nZUVycm9yKGBTdGVwIGZhaWxlZDogJHtmYWlsZWR9YClcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHRyeVN0ZXAoc3RlcDogU3RlcCk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgY29uc3QgcmVzdWx0ID0gc3RlcC5hcHBseSh0aGlzLmN1cnJlbnREb2MpXHJcbiAgICBpZiAocmVzdWx0LmZhaWxlZCAhPT0gbnVsbCB8fCByZXN1bHQuZG9jID09PSBudWxsKSB7XHJcbiAgICAgIHJldHVybiByZXN1bHQuZmFpbGVkID8/ICd1bmtub3duIHN0ZXAgZmFpbHVyZSdcclxuICAgIH1cclxuICAgIHRoaXMuZG9jcy5wdXNoKHRoaXMuY3VycmVudERvYylcclxuICAgIHRoaXMuc3RlcHMucHVzaChzdGVwKVxyXG4gICAgdGhpcy5jdXJyZW50RG9jID0gcmVzdWx0LmRvY1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIC8qKiBNYXAgYSBwb3NpdGlvbiBmcm9tIGJlZm9yZSB0aGlzIHRyYW5zYWN0aW9uIHRvIGFmdGVyIGl0LiAqL1xyXG4gIG1hcFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgYmlhcz86IEJpYXMpOiBQb3NpdGlvbiB7XHJcbiAgICByZXR1cm4gdGhpcy5tYXBUaHJvdWdoKHBvc2l0aW9uLCAwLCBiaWFzKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBtYXBUaHJvdWdoKHBvc2l0aW9uOiBQb3NpdGlvbiwgZnJvbVN0ZXA6IG51bWJlciwgYmlhcz86IEJpYXMpOiBQb3NpdGlvbiB7XHJcbiAgICBsZXQgbWFwcGVkID0gcG9zaXRpb25cclxuICAgIGZvciAobGV0IGkgPSBmcm9tU3RlcDsgaSA8IHRoaXMuc3RlcHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgbWFwcGVkID0gKHRoaXMuc3RlcHNbaV0gYXMgU3RlcCkubWFwUG9zaXRpb24obWFwcGVkLCBiaWFzKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG1hcHBlZFxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGhlIHNlbGVjdGlvbiBhZnRlciB0aGlzIHRyYW5zYWN0aW9uOiB0aGUgZXhwbGljaXRseSBzZXQgb25lIChyZW1hcHBlZFxyXG4gICAqIHRocm91Z2ggYW55IGxhdGVyIHN0ZXBzKSwgb3IgdGhlIGlucHV0IHNlbGVjdGlvbiBtYXBwZWQgdGhyb3VnaCBhbGwgc3RlcHMuXHJcbiAgICovXHJcbiAgZ2V0IHNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xyXG4gICAgaWYgKHRoaXMuZXhwbGljaXRTZWxlY3Rpb24pIHtcclxuICAgICAgY29uc3QgeyBzZWxlY3Rpb24sIGF0U3RlcCB9ID0gdGhpcy5leHBsaWNpdFNlbGVjdGlvblxyXG4gICAgICByZXR1cm4gc2VsZWN0aW9uLm1hcCh0aGlzLmN1cnJlbnREb2MsIHtcclxuICAgICAgICBtYXBQb3NpdGlvbjogKHBvc2l0aW9uLCBiaWFzKSA9PiB0aGlzLm1hcFRocm91Z2gocG9zaXRpb24sIGF0U3RlcCwgYmlhcyksXHJcbiAgICAgIH0pXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5iYXNlU2VsZWN0aW9uLm1hcCh0aGlzLmN1cnJlbnREb2MsIHRoaXMpXHJcbiAgfVxyXG5cclxuICBzZXRTZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB0aGlzIHtcclxuICAgIHRoaXMuZXhwbGljaXRTZWxlY3Rpb24gPSB7IHNlbGVjdGlvbiwgYXRTdGVwOiB0aGlzLnN0ZXBzLmxlbmd0aCB9XHJcbiAgICB0aGlzLnN0b3JlZCA9IG51bGxcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBnZXQgc3RvcmVkTWFya3MoKTogcmVhZG9ubHkgTWFya1tdIHwgbnVsbCB7XHJcbiAgICByZXR1cm4gdGhpcy5zdG9yZWRcclxuICB9XHJcblxyXG4gIHNldFN0b3JlZE1hcmtzKG1hcmtzOiByZWFkb25seSBNYXJrW10gfCBudWxsKTogdGhpcyB7XHJcbiAgICB0aGlzLnN0b3JlZCA9IG1hcmtzXHJcbiAgICByZXR1cm4gdGhpc1xyXG4gIH1cclxuXHJcbiAgc2V0TWV0YShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB0aGlzIHtcclxuICAgIHRoaXMubWV0YWRhdGEgPz89IG5ldyBNYXAoKVxyXG4gICAgdGhpcy5tZXRhZGF0YS5zZXQoa2V5LCB2YWx1ZSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBnZXRNZXRhKGtleTogc3RyaW5nKTogdW5rbm93biB7XHJcbiAgICByZXR1cm4gdGhpcy5tZXRhZGF0YT8uZ2V0KGtleSlcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEV2ZXJ5IG1ldGFkYXRhIGtleSBzZXQgb24gdGhpcyB0cmFuc2FjdGlvbiwgaW4gdGhlIG9yZGVyIGl0IHdhcyBzZXQuXHJcbiAgICpcclxuICAgKiBGb3IgdGhlIG9uZSBjYWxsZXIgdGhhdCBoYXMgdG8gaGFuZCBhIHRyYW5zYWN0aW9uJ3Mgd2hvbGUgcHJvdmVuYW5jZSBvbjpcclxuICAgKiBhIGRpc3BhdGNoIHRyYW5zZm9ybSB0aGF0IHJlcGxhY2VzIGEgdHJhbnNhY3Rpb24gd2l0aCBhIGRpZmZlcmVudCBvbmVcclxuICAgKiAoc3VnZ2VzdGlvbiBtb2RlIHJld3JpdGluZyBhbiBlZGl0LCBzYXkpIGRyb3BzIGV2ZXJ5IGtleSB0aGUgb3JpZ2luYWxcclxuICAgKiBjYXJyaWVkIHVubGVzcyBpdCBjb3BpZXMgdGhlbSwgYW5kIHRoZSBrZXlzIGl0IGRvZXMgbm90IGtub3cgYWJvdXQgYXJlXHJcbiAgICogZXhhY3RseSB0aGUgb25lcyBpdCBjYW5ub3QgYWZmb3JkIHRvIGd1ZXNzIGF0LiBBIHJlcGxheSBndWFyZCBzaWxlbnRseVxyXG4gICAqIGxvc3QgaXMgYW4gZWRpdGluZyBsb29wLlxyXG4gICAqL1xyXG4gIG1ldGFLZXlzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcclxuICAgIHJldHVybiB0aGlzLm1ldGFkYXRhID8gWy4uLnRoaXMubWV0YWRhdGEua2V5cygpXSA6IFtdXHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgeyBmaXJzdFRleHRibG9ja1BhdGgsIHRleHRibG9ja3MgfSBmcm9tICcuLi9tb2RlbC9ibG9ja3MnXHJcbmltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHtcclxuICB0eXBlIFBvc2l0aW9uLFxyXG4gIGNsYW1wUG9zaXRpb24sXHJcbiAgY29tcGFyZVBvc2l0aW9ucyxcclxuICBtYXhQb3NpdGlvbixcclxuICBtaW5Qb3NpdGlvbixcclxuICBwb3MsXHJcbiAgcG9zaXRpb25zRXF1YWwsXHJcbn0gZnJvbSAnLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCwgcGF0aHNFcXVhbCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb25NYXBwZXIgfSBmcm9tICcuL3N0ZXAnXHJcblxyXG4vKiogSlNPTiBzaGFwZSBvZiBhIHNlcmlhbGl6ZWQgc2VsZWN0aW9uLiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbkpTT04ge1xyXG4gIHJlYWRvbmx5IHR5cGU6IHN0cmluZ1xyXG4gIHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd25cclxufVxyXG5cclxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFNlbGVjdGlvbiB7XHJcbiAgYWJzdHJhY3QgZ2V0IGZyb20oKTogUG9zaXRpb25cclxuICBhYnN0cmFjdCBnZXQgdG8oKTogUG9zaXRpb25cclxuXHJcbiAgZ2V0IGVtcHR5KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHBvc2l0aW9uc0VxdWFsKHRoaXMuZnJvbSwgdGhpcy50bylcclxuICB9XHJcblxyXG4gIGFic3RyYWN0IG1hcChkb2M6IEVkaXRvck5vZGUsIG1hcHBlcjogUG9zaXRpb25NYXBwZXIpOiBTZWxlY3Rpb25cclxuICBhYnN0cmFjdCBlcShvdGhlcjogU2VsZWN0aW9uKTogYm9vbGVhblxyXG4gIGFic3RyYWN0IHRvSlNPTigpOiBTZWxlY3Rpb25KU09OXHJcbn1cclxuXHJcbi8qKiBBIGN1cnNvciBvciB0ZXh0IHJhbmdlIGJldHdlZW4gdHdvIGlubGluZSBwb3NpdGlvbnMuICovXHJcbmV4cG9ydCBjbGFzcyBUZXh0U2VsZWN0aW9uIGV4dGVuZHMgU2VsZWN0aW9uIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IGFuY2hvcjogUG9zaXRpb24sXHJcbiAgICByZWFkb25seSBoZWFkOiBQb3NpdGlvbiA9IGFuY2hvcixcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGdldCBmcm9tKCk6IFBvc2l0aW9uIHtcclxuICAgIHJldHVybiBtaW5Qb3NpdGlvbih0aGlzLmFuY2hvciwgdGhpcy5oZWFkKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZ2V0IHRvKCk6IFBvc2l0aW9uIHtcclxuICAgIHJldHVybiBtYXhQb3NpdGlvbih0aGlzLmFuY2hvciwgdGhpcy5oZWFkKVxyXG4gIH1cclxuXHJcbiAgZ2V0IGlzQ3Vyc29yKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHBvc2l0aW9uc0VxdWFsKHRoaXMuYW5jaG9yLCB0aGlzLmhlYWQpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXAoZG9jOiBFZGl0b3JOb2RlLCBtYXBwZXI6IFBvc2l0aW9uTWFwcGVyKTogU2VsZWN0aW9uIHtcclxuICAgIGNvbnN0IGFuY2hvciA9IGNsYW1wUG9zaXRpb24oZG9jLCBtYXBwZXIubWFwUG9zaXRpb24odGhpcy5hbmNob3IsIC0xKSlcclxuICAgIGNvbnN0IGhlYWQgPSBjbGFtcFBvc2l0aW9uKGRvYywgbWFwcGVyLm1hcFBvc2l0aW9uKHRoaXMuaGVhZCwgLTEpKVxyXG4gICAgcmV0dXJuIG5ldyBUZXh0U2VsZWN0aW9uKGFuY2hvciwgaGVhZClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGVxKG90aGVyOiBTZWxlY3Rpb24pOiBib29sZWFuIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIG90aGVyIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbiAmJlxyXG4gICAgICBwb3NpdGlvbnNFcXVhbChvdGhlci5hbmNob3IsIHRoaXMuYW5jaG9yKSAmJlxyXG4gICAgICBwb3NpdGlvbnNFcXVhbChvdGhlci5oZWFkLCB0aGlzLmhlYWQpXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogU2VsZWN0aW9uSlNPTiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0eXBlOiAndGV4dCcsXHJcbiAgICAgIGFuY2hvcjogeyBwYXRoOiBbLi4udGhpcy5hbmNob3IucGF0aF0sIG9mZnNldDogdGhpcy5hbmNob3Iub2Zmc2V0IH0sXHJcbiAgICAgIGhlYWQ6IHsgcGF0aDogWy4uLnRoaXMuaGVhZC5wYXRoXSwgb2Zmc2V0OiB0aGlzLmhlYWQub2Zmc2V0IH0sXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKiogQ3Vyc29yIGF0IHRoZSBzdGFydCBvZiB0aGUgZG9jdW1lbnQncyBmaXJzdCB0ZXh0YmxvY2suICovXHJcbiAgc3RhdGljIGF0U3RhcnQoZG9jOiBFZGl0b3JOb2RlKTogVGV4dFNlbGVjdGlvbiB7XHJcbiAgICBjb25zdCBwYXRoID0gZmlyc3RUZXh0YmxvY2tQYXRoKGRvYylcclxuICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCA/PyBbXSwgMCkpXHJcbiAgfVxyXG5cclxuICAvKiogQ3Vyc29yIGF0IHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50J3MgbGFzdCB0ZXh0YmxvY2suICovXHJcbiAgc3RhdGljIGF0RW5kKGRvYzogRWRpdG9yTm9kZSk6IFRleHRTZWxlY3Rpb24ge1xyXG4gICAgY29uc3QgYmxvY2tzID0gdGV4dGJsb2Nrcyhkb2MpXHJcbiAgICBjb25zdCBsYXN0ID0gYmxvY2tzW2Jsb2Nrcy5sZW5ndGggLSAxXVxyXG4gICAgaWYgKCFsYXN0KSByZXR1cm4gbmV3IFRleHRTZWxlY3Rpb24ocG9zKFtdLCAwKSlcclxuICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihwb3MobGFzdC5wYXRoLCBpbmxpbmVMZW5ndGgobGFzdC5ub2RlLmNvbnRlbnQpKSlcclxuICB9XHJcbn1cclxuXHJcbi8qKiBBIHNpbmdsZSBub24tdGV4dCBub2RlIHNlbGVjdGVkIGFzIGEgd2hvbGUgKGltYWdlLCBociwgXHUyMDI2KS4gKi9cclxuZXhwb3J0IGNsYXNzIE5vZGVTZWxlY3Rpb24gZXh0ZW5kcyBTZWxlY3Rpb24ge1xyXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBhdGg6IFBhdGgpIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0Nhbm5vdCBub2RlLXNlbGVjdCB0aGUgcm9vdCcpXHJcbiAgfVxyXG5cclxuICBnZXQgcGFyZW50UGF0aCgpOiBQYXRoIHtcclxuICAgIHJldHVybiB0aGlzLnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgfVxyXG5cclxuICBnZXQgaW5kZXgoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZ2V0IGZyb20oKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvcyh0aGlzLnBhcmVudFBhdGgsIHRoaXMuaW5kZXgpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBnZXQgdG8oKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvcyh0aGlzLnBhcmVudFBhdGgsIHRoaXMuaW5kZXggKyAxKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwKGRvYzogRWRpdG9yTm9kZSwgbWFwcGVyOiBQb3NpdGlvbk1hcHBlcik6IFNlbGVjdGlvbiB7XHJcbiAgICBjb25zdCBtYXBwZWQgPSBjbGFtcFBvc2l0aW9uKGRvYywgbWFwcGVyLm1hcFBvc2l0aW9uKHRoaXMuZnJvbSwgLTEpKVxyXG4gICAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBbLi4ubWFwcGVkLnBhdGgsIG1hcHBlZC5vZmZzZXRdKVxyXG4gICAgaWYgKG5vZGUgJiYgIW5vZGUuaXNUZXh0KSByZXR1cm4gbmV3IE5vZGVTZWxlY3Rpb24oWy4uLm1hcHBlZC5wYXRoLCBtYXBwZWQub2Zmc2V0XSlcclxuICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihtYXBwZWQpLm1hcChkb2MsIGlkZW50aXR5TWFwcGVyKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZXEob3RoZXI6IFNlbGVjdGlvbik6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgTm9kZVNlbGVjdGlvbiAmJiBwYXRoc0VxdWFsKG90aGVyLnBhdGgsIHRoaXMucGF0aClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHRvSlNPTigpOiBTZWxlY3Rpb25KU09OIHtcclxuICAgIHJldHVybiB7IHR5cGU6ICdub2RlJywgcGF0aDogWy4uLnRoaXMucGF0aF0gfVxyXG4gIH1cclxufVxyXG5cclxuLyoqIFRoZSB3aG9sZSBkb2N1bWVudCBzZWxlY3RlZC4gKi9cclxuZXhwb3J0IGNsYXNzIEFsbFNlbGVjdGlvbiBleHRlbmRzIFNlbGVjdGlvbiB7XHJcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkb2M6IEVkaXRvck5vZGUpIHtcclxuICAgIHN1cGVyKClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGdldCBmcm9tKCk6IFBvc2l0aW9uIHtcclxuICAgIHJldHVybiBwb3MoW10sIDApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBnZXQgdG8oKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvcyhbXSwgdGhpcy5kb2MuY2hpbGRDb3VudClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIG1hcChkb2M6IEVkaXRvck5vZGUpOiBTZWxlY3Rpb24ge1xyXG4gICAgcmV0dXJuIG5ldyBBbGxTZWxlY3Rpb24oZG9jKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZXEob3RoZXI6IFNlbGVjdGlvbik6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgQWxsU2VsZWN0aW9uXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogU2VsZWN0aW9uSlNPTiB7XHJcbiAgICByZXR1cm4geyB0eXBlOiAnYWxsJyB9XHJcbiAgfVxyXG59XHJcblxyXG5jb25zdCBpZGVudGl0eU1hcHBlcjogUG9zaXRpb25NYXBwZXIgPSB7XHJcbiAgbWFwUG9zaXRpb246IChwb3NpdGlvbikgPT4gcG9zaXRpb24sXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgbmVhcmVzdCB2YWxpZCB0ZXh0IHNlbGVjdGlvbiBhdCBvciBhZnRlciBhIChwb3NzaWJseSBzdGFsZSkgcG9zaXRpb24sXHJcbiAqIHVzZWQgdG8gcmVwYWlyIHNlbGVjdGlvbnMgYWZ0ZXIgYXJiaXRyYXJ5IGRvY3VtZW50IGNoYW5nZXMuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2VsZWN0aW9uTmVhcihkb2M6IEVkaXRvck5vZGUsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFRleHRTZWxlY3Rpb24ge1xyXG4gIGNvbnN0IGNsYW1wZWQgPSBjbGFtcFBvc2l0aW9uKGRvYywgcG9zaXRpb24pXHJcbiAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBjbGFtcGVkLnBhdGgpXHJcbiAgaWYgKG5vZGU/LmlzVGV4dGJsb2NrKSByZXR1cm4gbmV3IFRleHRTZWxlY3Rpb24oY2xhbXBlZClcclxuICBmb3IgKGNvbnN0IHsgcGF0aCwgbm9kZTogYmxvY2sgfSBvZiB0ZXh0YmxvY2tzKGRvYykpIHtcclxuICAgIGlmIChjb21wYXJlUG9zaXRpb25zKHBvcyhwYXRoLCBpbmxpbmVMZW5ndGgoYmxvY2suY29udGVudCkpLCBjbGFtcGVkKSA+PSAwKSB7XHJcbiAgICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCwgMCkpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBUZXh0U2VsZWN0aW9uLmF0RW5kKGRvYylcclxufVxyXG4iLCAiaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgdHlwZSBEb2NKU09OLCBub2RlRnJvbUpTT04gfSBmcm9tICcuLi9tb2RlbC9qc29uJ1xyXG5pbXBvcnQgdHlwZSB7IE1hcmsgfSBmcm9tICcuLi9tb2RlbC9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBub3JtYWxpemVEb2MgfSBmcm9tICcuLi9tb2RlbC9ub3JtYWxpemUnXHJcbmltcG9ydCB7IGNsYW1wUG9zaXRpb24gfSBmcm9tICcuLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHR5cGUgeyBTY2hlbWEgfSBmcm9tICcuLi9tb2RlbC9zY2hlbWEnXHJcbmltcG9ydCB7IG5vZGVBdFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQge1xyXG4gIEFsbFNlbGVjdGlvbixcclxuICBOb2RlU2VsZWN0aW9uLFxyXG4gIHR5cGUgU2VsZWN0aW9uLFxyXG4gIFRleHRTZWxlY3Rpb24sXHJcbiAgc2VsZWN0aW9uTmVhcixcclxufSBmcm9tICcuL3NlbGVjdGlvbidcclxuaW1wb3J0IHsgVHJhbnNhY3Rpb24gfSBmcm9tICcuL3RyYW5zYWN0aW9uJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JTdGF0ZUNvbmZpZyB7XHJcbiAgcmVhZG9ubHkgc2NoZW1hOiBTY2hlbWFcclxuICAvKiogSW5pdGlhbCBkb2N1bWVudC4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGBjb250ZW50YC4gKi9cclxuICByZWFkb25seSBkb2M/OiBFZGl0b3JOb2RlXHJcbiAgLyoqIEluaXRpYWwgZG9jdW1lbnQgYXMgY2Fub25pY2FsIEpTT04uICovXHJcbiAgcmVhZG9ubHkgY29udGVudD86IERvY0pTT05cclxuICByZWFkb25seSBzZWxlY3Rpb24/OiBTZWxlY3Rpb25cclxufVxyXG5cclxuLyoqXHJcbiAqIEltbXV0YWJsZSBlZGl0b3Igc3RhdGU6IHRoZSBkb2N1bWVudCwgc2VsZWN0aW9uIGFuZCBzdG9yZWQgbWFya3MuIFRoZSBET01cclxuICogaXMgbmV2ZXIgdGhlIHNvdXJjZSBvZiB0cnV0aCwgdGhpcyBpcy5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3JTdGF0ZSB7XHJcbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IHNjaGVtYTogU2NoZW1hLFxyXG4gICAgcmVhZG9ubHkgZG9jOiBFZGl0b3JOb2RlLFxyXG4gICAgcmVhZG9ubHkgc2VsZWN0aW9uOiBTZWxlY3Rpb24sXHJcbiAgICByZWFkb25seSBzdG9yZWRNYXJrczogcmVhZG9ubHkgTWFya1tdIHwgbnVsbCxcclxuICApIHt9XHJcblxyXG4gIHN0YXRpYyBjcmVhdGUoY29uZmlnOiBFZGl0b3JTdGF0ZUNvbmZpZyk6IEVkaXRvclN0YXRlIHtcclxuICAgIGNvbnN0IHsgc2NoZW1hIH0gPSBjb25maWdcclxuICAgIGNvbnN0IGluaXRpYWwgPVxyXG4gICAgICBjb25maWcuZG9jID8/XHJcbiAgICAgIChjb25maWcuY29udGVudFxyXG4gICAgICAgID8gbm9kZUZyb21KU09OKHNjaGVtYSwgY29uZmlnLmNvbnRlbnQpXHJcbiAgICAgICAgOiBzY2hlbWEudG9wVHlwZS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5vZihzY2hlbWEuZmlyc3RUZXh0YmxvY2tUeXBlKCkuY3JlYXRlKCkpKSlcclxuICAgIGNvbnN0IGRvYyA9IG5vcm1hbGl6ZURvYyhpbml0aWFsKVxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gY29uZmlnLnNlbGVjdGlvblxyXG4gICAgICA/IHZhbGlkYXRlU2VsZWN0aW9uKGRvYywgY29uZmlnLnNlbGVjdGlvbilcclxuICAgICAgOiBUZXh0U2VsZWN0aW9uLmF0U3RhcnQoZG9jKVxyXG4gICAgcmV0dXJuIG5ldyBFZGl0b3JTdGF0ZShzY2hlbWEsIGRvYywgc2VsZWN0aW9uLCBudWxsKVxyXG4gIH1cclxuXHJcbiAgLyoqIFN0YXJ0IGJ1aWxkaW5nIGEgdHJhbnNhY3Rpb24gZnJvbSB0aGlzIHN0YXRlLiAqL1xyXG4gIGdldCB0cigpOiBUcmFuc2FjdGlvbiB7XHJcbiAgICByZXR1cm4gbmV3IFRyYW5zYWN0aW9uKHRoaXMpXHJcbiAgfVxyXG5cclxuICBhcHBseSh0cjogVHJhbnNhY3Rpb24pOiBFZGl0b3JTdGF0ZSB7XHJcbiAgICByZXR1cm4gbmV3IEVkaXRvclN0YXRlKFxyXG4gICAgICB0aGlzLnNjaGVtYSxcclxuICAgICAgdHIuZG9jLFxyXG4gICAgICB2YWxpZGF0ZVNlbGVjdGlvbih0ci5kb2MsIHRyLnNlbGVjdGlvbiksXHJcbiAgICAgIHRyLnN0b3JlZE1hcmtzLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgdG9KU09OKCk6IHsgZG9jOiBEb2NKU09OOyBzZWxlY3Rpb246IHVua25vd24gfSB7XHJcbiAgICByZXR1cm4geyBkb2M6IHRoaXMuZG9jLnRvSlNPTigpLCBzZWxlY3Rpb246IHRoaXMuc2VsZWN0aW9uLnRvSlNPTigpIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKiBSZXBhaXIgYSBzZWxlY3Rpb24gc28gaXQgaXMgdmFsaWQgZm9yIHRoZSBnaXZlbiBkb2N1bWVudC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU2VsZWN0aW9uKGRvYzogRWRpdG9yTm9kZSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiBTZWxlY3Rpb24ge1xyXG4gIGlmIChzZWxlY3Rpb24gaW5zdGFuY2VvZiBBbGxTZWxlY3Rpb24pIHJldHVybiBuZXcgQWxsU2VsZWN0aW9uKGRvYylcclxuICBpZiAoc2VsZWN0aW9uIGluc3RhbmNlb2YgTm9kZVNlbGVjdGlvbikge1xyXG4gICAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBzZWxlY3Rpb24ucGF0aClcclxuICAgIHJldHVybiBub2RlICYmICFub2RlLmlzVGV4dCA/IHNlbGVjdGlvbiA6IHNlbGVjdGlvbk5lYXIoZG9jLCBzZWxlY3Rpb24uZnJvbSlcclxuICB9XHJcbiAgaWYgKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgIGNvbnN0IGFuY2hvciA9IGNsYW1wUG9zaXRpb24oZG9jLCBzZWxlY3Rpb24uYW5jaG9yKVxyXG4gICAgY29uc3QgaGVhZCA9IGNsYW1wUG9zaXRpb24oZG9jLCBzZWxlY3Rpb24uaGVhZClcclxuICAgIGNvbnN0IGFuY2hvck5vZGUgPSBub2RlQXRQYXRoKGRvYywgYW5jaG9yLnBhdGgpXHJcbiAgICBjb25zdCBoZWFkTm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBoZWFkLnBhdGgpXHJcbiAgICBpZiAoYW5jaG9yTm9kZT8uaXNUZXh0YmxvY2sgJiYgaGVhZE5vZGU/LmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihhbmNob3IsIGhlYWQpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gc2VsZWN0aW9uTmVhcihkb2MsIGFuY2hvcilcclxuICB9XHJcbiAgcmV0dXJuIHNlbGVjdGlvbk5lYXIoZG9jLCBzZWxlY3Rpb24uZnJvbSlcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBIVE1MU3BlYywgTWFya1NwZWMsIE5vZGVTcGVjIH0gZnJvbSAnLi4vbW9kZWwvc2NoZW1hJ1xyXG5cclxuY29uc3QgU0FGRV9QUk9UT0NPTFMgPSAvXig/Omh0dHBzP3xtYWlsdG98dGVsfGZ0cCk6L2lcclxuXHJcbi8qKiBBbGxvdyBvbmx5IHNhZmUgVVJMIHByb3RvY29scyAoYW5kIHJlbGF0aXZlIFVSTHMpIGluIHNlcmlhbGl6ZWQgbGlua3MuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzYWZlSHJlZihocmVmOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiBocmVmICE9PSAnc3RyaW5nJyB8fCBocmVmLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICBjb25zdCB0cmltbWVkID0gaHJlZi50cmltKClcclxuICAvLyBSZWplY3QgY29udHJvbCBjaGFyYWN0ZXJzIHRoYXQgY2FuIHNtdWdnbGUgXCJqYXZhXFx0c2NyaXB0OlwiIHN0eWxlIFVSTHMuXHJcbiAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0NvbnRyb2xDaGFyYWN0ZXJzSW5SZWdleDogcmVqZWN0aW5nIHRoZW0gaXMgdGhlIHBvaW50XHJcbiAgaWYgKC9bXFx1MDAwMC1cXHUwMDFmXFx1MDA3Zi1cXHUwMDlmXS8udGVzdCh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICBpZiAoL15bYS16XVthLXowLTkrLi1dKjovaS50ZXN0KHRyaW1tZWQpICYmICFTQUZFX1BST1RPQ09MUy50ZXN0KHRyaW1tZWQpKSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiB0cmltbWVkXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbWFnZSBzb3VyY2VzIGFsbG93IGV2ZXJ5dGhpbmcge0BsaW5rIHNhZmVIcmVmfSBkb2VzLCBwbHVzIHRoZSB0d28gc2NoZW1lc1xyXG4gKiB0aGF0IG9ubHkgZXZlciB5aWVsZCBpbmVydCBieXRlczogYGRhdGE6aW1hZ2UvKmAgYW5kIGBibG9iOmAuIEJvdGggYXJlXHJcbiAqIHByb2R1Y2VkIGJ5IHRoZSBidW5kbGVkIHN0b3JhZ2UgYWRhcHRlcnMsIGFuZCBuZWl0aGVyIGNhbiBleGVjdXRlLCB1bmxpa2VcclxuICogYSBgZGF0YTp0ZXh0L2h0bWxgIGhyZWYsIHdoaWNoIGlzIHdoeSBsaW5rcyBrZWVwIHRoZSBzdHJpY3RlciBydWxlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNhZmVJbWFnZVNyYyhzcmM6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcclxuICBpZiAodHlwZW9mIHNyYyAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHNyYy50cmltKClcclxuICBpZiAodHJpbW1lZC5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0NvbnRyb2xDaGFyYWN0ZXJzSW5SZWdleDogcmVqZWN0aW5nIHRoZW0gaXMgdGhlIHBvaW50XHJcbiAgaWYgKC9bXFx1MDAwMC1cXHUwMDFmXFx1MDA3Zi1cXHUwMDlmXS8udGVzdCh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICBpZiAoU0FGRV9JTUFHRV9TQ0hFTUVTLnRlc3QodHJpbW1lZCkpIHJldHVybiB0cmltbWVkXHJcbiAgcmV0dXJuIHNhZmVIcmVmKHRyaW1tZWQpXHJcbn1cclxuXHJcbi8qKiBgZGF0YTpgIHJlc3RyaWN0ZWQgdG8gaW1hZ2UgbWVkaWEgdHlwZXMsIHNvIG5vIG1hcmt1cCBjYW4gcmlkZSBhbG9uZy4gKi9cclxuY29uc3QgU0FGRV9JTUFHRV9TQ0hFTUVTID0gL14oPzpkYXRhOmltYWdlXFwvW2EtejAtOS4rLV0rWzssXXxibG9iOikvaVxyXG5cclxuY29uc3QgQ1NTX1VOU0FGRSA9IC9bPD5cIicoKTt7fV18dXJsXFwofGV4cHJlc3Npb258amF2YXNjcmlwdDp8QGltcG9ydC9pXHJcblxyXG4vKipcclxuICogQWxsb3cgb25seSBzaW1wbGUsIHNlbGYtY29udGFpbmVkIENTUyB2YWx1ZXMgaW4gc3R5bGUgYXR0cmlidXRlcy4gQW55dGhpbmdcclxuICogdGhhdCBjb3VsZCBvcGVuIGEgbmV3IGRlY2xhcmF0aW9uLCBjYWxsIHVybCgpIG9yIHNtdWdnbGUgc2NyaXB0IGlzXHJcbiAqIHJlamVjdGVkIG91dHJpZ2h0IHJhdGhlciB0aGFuIGVzY2FwZWQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2FmZUNTU1ZhbHVlKHZhbHVlOiB1bmtub3duLCBtYXhMZW5ndGggPSAxMjApOiBzdHJpbmcgfCBudWxsIHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGxcclxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpXHJcbiAgaWYgKHRyaW1tZWQubGVuZ3RoID09PSAwIHx8IHRyaW1tZWQubGVuZ3RoID4gbWF4TGVuZ3RoKSByZXR1cm4gbnVsbFxyXG4gIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IHJlamVjdGluZyB0aGVtIGlzIHRoZSBwb2ludFxyXG4gIGlmICgvW1xcdTAwMDAtXFx1MDAxZlxcdTAwN2YtXFx1MDA5Zl0vLnRlc3QodHJpbW1lZCkpIHJldHVybiBudWxsXHJcbiAgaWYgKENTU19VTlNBRkUudGVzdCh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICByZXR1cm4gdHJpbW1lZFxyXG59XHJcblxyXG4vKipcclxuICogQSBmb250IHN0YWNrLiBRdW90ZWQgZmFtaWx5IG5hbWVzIGFyZSBhbGxvd2VkLCB1bmxpa2Ugb3RoZXIgQ1NTIHZhbHVlcyxcclxuICogYnV0IG9ubHkgYXMgYmFsYW5jZWQgcXVvdGVzIGFyb3VuZCBwbGFpbiB3b3JkcywgbmV2ZXIgYXMgYSB3YXkgdG8gY2xvc2VcclxuICogdGhlIGRlY2xhcmF0aW9uIGFuZCBzdGFydCBhbm90aGVyLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNhZmVGb250RmFtaWx5KHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKVxyXG4gIGlmICh0cmltbWVkLmxlbmd0aCA9PT0gMCB8fCB0cmltbWVkLmxlbmd0aCA+IDIwMCkgcmV0dXJuIG51bGxcclxuICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQ29udHJvbENoYXJhY3RlcnNJblJlZ2V4OiByZWplY3RpbmcgdGhlbSBpcyB0aGUgcG9pbnRcclxuICBpZiAoL1tcXHUwMDAwLVxcdTAwMWZcXHUwMDdmLVxcdTAwOWZdLy50ZXN0KHRyaW1tZWQpKSByZXR1cm4gbnVsbFxyXG4gIGlmICgvWzw+KCk7e31dfHVybFxcKHxleHByZXNzaW9ufGphdmFzY3JpcHQ6fEBpbXBvcnQvaS50ZXN0KHRyaW1tZWQpKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGZhbWlsaWVzID0gdHJpbW1lZC5zcGxpdCgnLCcpLm1hcCgoZmFtaWx5KSA9PiBmYW1pbHkudHJpbSgpKVxyXG4gIGlmIChmYW1pbGllcy5sZW5ndGggPT09IDAgfHwgZmFtaWxpZXMubGVuZ3RoID4gMTIpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIGZhbWlsaWVzLmV2ZXJ5KChmYW1pbHkpID0+IEZPTlRfRkFNSUxZLnRlc3QoZmFtaWx5KSkgPyBmYW1pbGllcy5qb2luKCcsICcpIDogbnVsbFxyXG59XHJcblxyXG5jb25zdCBGT05UX0ZBTUlMWSA9IC9eKFwiW1xcdyBcXC1dK1wifCdbXFx3IFxcLV0rJ3xbXFx3LV0rKSQvXHJcblxyXG4vKipcclxuICogTmFtZWQsIGhleCwgcmdiKCkgYW5kIGhzbCgpIGNvbG9ycyBvbmx5LiBWYWxpZGF0ZWQgYWdhaW5zdCBhbiBleHBsaWNpdFxyXG4gKiBncmFtbWFyIHJhdGhlciB0aGFuIHRoZSBnZW5lcmFsIENTUyBzYW5pdGl6ZXIsIHdoaWNoIGZvcmJpZHMgdGhlXHJcbiAqIHBhcmVudGhlc2VzIHRoZXNlIGZ1bmN0aW9uYWwgbm90YXRpb25zIG5lZWQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2FmZUNvbG9yKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKVxyXG4gIGlmICh0cmltbWVkLmxlbmd0aCA9PT0gMCB8fCB0cmltbWVkLmxlbmd0aCA+IDY0KSByZXR1cm4gbnVsbFxyXG4gIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IHJlamVjdGluZyB0aGVtIGlzIHRoZSBwb2ludFxyXG4gIGlmICgvW1xcdTAwMDAtXFx1MDAxZlxcdTAwN2YtXFx1MDA5Zl0vLnRlc3QodHJpbW1lZCkpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIENPTE9SLnRlc3QodHJpbW1lZCkgPyB0cmltbWVkIDogbnVsbFxyXG59XHJcblxyXG5jb25zdCBDT0xPUiA9XHJcbiAgL14oI1swLTlhLWZdezMsOH18W2Etel0rfHJnYmE/XFwoICpcXGR7MSwzfSU/ICooLHwgKSAqXFxkezEsM30lPyAqKCx8ICkgKlxcZHsxLDN9JT8gKigoLHxcXC8pICpbXFxkLl0rJT8gKik/XFwpfGhzbGE/XFwoICpbXFxkLl0rKGRlZ3xyYWR8dHVybik/ICooLHwgKSAqW1xcZC5dKyU/ICooLHwgKSAqW1xcZC5dKyU/ICooKCx8XFwvKSAqW1xcZC5dKyU/ICopP1xcKSkkL2lcclxuXHJcbi8qKiBBIENTUyBsZW5ndGggd2l0aCBhbiBleHBsaWNpdCB1bml0LCBvciBhIGJhcmUgbnVtYmVyIHRyZWF0ZWQgYXMgcHguICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzYWZlTGVuZ3RoKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgY29uc3QgY3NzID0gc2FmZUNTU1ZhbHVlKHZhbHVlLCAzMilcclxuICBpZiAoIWNzcykgcmV0dXJuIG51bGxcclxuICBpZiAoL15cXGQrKFxcLlxcZCspPyQvLnRlc3QoY3NzKSkgcmV0dXJuIGAke2Nzc31weGBcclxuICByZXR1cm4gL15cXGQrKFxcLlxcZCspPyhweHxwdHxlbXxyZW18JXx2d3x2aHxjaCkkL2kudGVzdChjc3MpID8gY3NzIDogbnVsbFxyXG59XHJcblxyXG4vKiogQWxpZ25tZW50LCBpbmRlbnQgYW5kIHZlcnRpY2FsLXJoeXRobSBhdHRycyBzaGFyZWQgYnkgdGV4dGJsb2Nrcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGJsb2NrTGF5b3V0QXR0cnMoKTogUmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9PiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGFsaWduOiB7IGRlZmF1bHQ6IG51bGwgfSxcclxuICAgIGluZGVudDogeyBkZWZhdWx0OiAwIH0sXHJcbiAgICBsaW5lSGVpZ2h0OiB7IGRlZmF1bHQ6IG51bGwgfSxcclxuICAgIHNwYWNlQmVmb3JlOiB7IGRlZmF1bHQ6IG51bGwgfSxcclxuICAgIHNwYWNlQWZ0ZXI6IHsgZGVmYXVsdDogbnVsbCB9LFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIExpbmUgaGVpZ2h0IGFjY2VwdHMgYSBiYXJlIG11bHRpcGxpZXIgKGAxLjVgKSBhcyB3ZWxsIGFzIGEgbGVuZ3RoLCBzbyBpdFxyXG4gKiBjYW5ub3QgZ28gdGhyb3VnaCB7QGxpbmsgc2FmZUxlbmd0aH0uIFRoYXQgaGVscGVyIHJld3JpdGVzIGEgdW5pdGxlc3NcclxuICogbnVtYmVyIGFzIHB4LCB3aGljaCBpcyBleGFjdGx5IHRoZSB3cm9uZyByZWFkaW5nIGhlcmUuIFVuaXRsZXNzIHZhbHVlcyBwYXNzXHJcbiAqIHRocm91Z2ggdGhlIGdlbmVyYWwgQ1NTIHNhbml0aXplciBhbmQgYXJlIHRoZW4gcmFuZ2UtY2hlY2tlZDsgYW55dGhpbmcgd2l0aFxyXG4gKiBhIHVuaXQgZmFsbHMgYmFjayB0byB7QGxpbmsgc2FmZUxlbmd0aH0uXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2FmZUxpbmVIZWlnaHQodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcclxuICBjb25zdCByYXcgPSB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInID8gU3RyaW5nKHZhbHVlKSA6IHZhbHVlXHJcbiAgY29uc3QgY3NzID0gc2FmZUNTU1ZhbHVlKHJhdywgMzIpXHJcbiAgaWYgKCFjc3MpIHJldHVybiBudWxsXHJcbiAgaWYgKC9eXFxkKyhcXC5cXGQrKT8kLy50ZXN0KGNzcykpIHJldHVybiBOdW1iZXIucGFyc2VGbG9hdChjc3MpIDw9IDEwID8gY3NzIDogbnVsbFxyXG4gIHJldHVybiBzYWZlTGVuZ3RoKGNzcylcclxufVxyXG5cclxuY29uc3QgQUxJR05NRU5UUyA9IG5ldyBTZXQoWydsZWZ0JywgJ2NlbnRlcicsICdyaWdodCcsICdqdXN0aWZ5J10pXHJcblxyXG4vKiogTWF4aW11bSBpbmRlbnQgc3RlcHM7IGVhY2ggc3RlcCBpcyBvbmUgMi41cmVtIG1hcmdpbi4gKi9cclxuZXhwb3J0IGNvbnN0IE1BWF9JTkRFTlQgPSA4XHJcblxyXG4vKipcclxuICogQW4gZWxlbWVudCBpZCBzYWZlIHRvIGVtaXQ6IGEgbGV0dGVyLCB0aGVuIHVwIHRvIDEyNyBsZXR0ZXJzLCBkaWdpdHMsIGAtYCxcclxuICogYF9gLCBgOmAgb3IgYC5gLiBJZHMgdGhlIGtpdCBnZW5lcmF0ZXMgZm9yIGl0cyBvd24gbmF2aWdhdGlvbiAoYHR2eC1cdTIwMjZgKVxyXG4gKiBhcmUgcmVqZWN0ZWQgc28gdGhleSBjYW4gbmV2ZXIgbGVhayBmcm9tIHRoZSByZW5kZXJlZCBET00gaW50byBhIGRvY3VtZW50LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNhZmVFbGVtZW50SWQodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGxcclxuICBpZiAoIS9eW0EtWmEtel1bXFx3Oi4tXXswLDEyN30kLy50ZXN0KHZhbHVlKSB8fCB2YWx1ZS5zdGFydHNXaXRoKCd0dngtJykpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIHZhbHVlXHJcbn1cclxuXHJcbi8qKiBSZW5kZXIgYWxpZ24vaW5kZW50L2xpbmUtaGVpZ2h0L3NwYWNpbmcgYXMgYSBzYW5pdGl6ZWQgc3R5bGUgYXR0cmlidXRlLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gYmxvY2tMYXlvdXRIVE1MKG5vZGU6IEVkaXRvck5vZGUpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcclxuICBjb25zdCBkZWNsYXJhdGlvbnM6IHN0cmluZ1tdID0gW11cclxuICBjb25zdCBhbGlnbiA9IHR5cGVvZiBub2RlLmF0dHJzLmFsaWduID09PSAnc3RyaW5nJyA/IG5vZGUuYXR0cnMuYWxpZ24gOiBudWxsXHJcbiAgaWYgKGFsaWduICYmIEFMSUdOTUVOVFMuaGFzKGFsaWduKSkgZGVjbGFyYXRpb25zLnB1c2goYHRleHQtYWxpZ246ICR7YWxpZ259YClcclxuICBjb25zdCBpbmRlbnQgPSB0eXBlb2Ygbm9kZS5hdHRycy5pbmRlbnQgPT09ICdudW1iZXInID8gbm9kZS5hdHRycy5pbmRlbnQgOiAwXHJcbiAgY29uc3Qgc3RlcHMgPSBNYXRoLm1pbihNQVhfSU5ERU5ULCBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKGluZGVudCkpKVxyXG4gIGlmIChzdGVwcyA+IDApIGRlY2xhcmF0aW9ucy5wdXNoKGBtYXJnaW4tbGVmdDogJHtzdGVwcyAqIDIuNX1yZW1gKVxyXG4gIGNvbnN0IGxpbmVIZWlnaHQgPSBzYWZlTGluZUhlaWdodChub2RlLmF0dHJzLmxpbmVIZWlnaHQpXHJcbiAgaWYgKGxpbmVIZWlnaHQpIGRlY2xhcmF0aW9ucy5wdXNoKGBsaW5lLWhlaWdodDogJHtsaW5lSGVpZ2h0fWApXHJcbiAgY29uc3QgYmVmb3JlID0gc2FmZUxlbmd0aChub2RlLmF0dHJzLnNwYWNlQmVmb3JlKVxyXG4gIGlmIChiZWZvcmUpIGRlY2xhcmF0aW9ucy5wdXNoKGBtYXJnaW4tdG9wOiAke2JlZm9yZX1gKVxyXG4gIGNvbnN0IGFmdGVyID0gc2FmZUxlbmd0aChub2RlLmF0dHJzLnNwYWNlQWZ0ZXIpXHJcbiAgaWYgKGFmdGVyKSBkZWNsYXJhdGlvbnMucHVzaChgbWFyZ2luLWJvdHRvbTogJHthZnRlcn1gKVxyXG4gIHJldHVybiBkZWNsYXJhdGlvbnMubGVuZ3RoID4gMCA/IHsgc3R5bGU6IGRlY2xhcmF0aW9ucy5qb2luKCc7ICcpIH0gOiB7fVxyXG59XHJcblxyXG4vKiogUmVhZCBhbGlnbi9pbmRlbnQvbGluZS1oZWlnaHQvc3BhY2luZyBiYWNrIGZyb20gaW1wb3J0ZWQgSFRNTC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQmxvY2tMYXlvdXQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgY29uc3QgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge31cclxuICBjb25zdCBhbGlnbiA9IGVsZW1lbnQuc3R5bGUudGV4dEFsaWduIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhbGlnbicpXHJcbiAgaWYgKGFsaWduICYmIEFMSUdOTUVOVFMuaGFzKGFsaWduKSkgYXR0cnMuYWxpZ24gPSBhbGlnblxyXG4gIGNvbnN0IG1hcmdpbiA9IE51bWJlci5wYXJzZUZsb2F0KGVsZW1lbnQuc3R5bGUubWFyZ2luTGVmdClcclxuICBpZiAoTnVtYmVyLmlzRmluaXRlKG1hcmdpbikgJiYgbWFyZ2luID4gMCkge1xyXG4gICAgYXR0cnMuaW5kZW50ID0gTWF0aC5taW4oTUFYX0lOREVOVCwgTWF0aC5yb3VuZChtYXJnaW4gLyAyLjUpKVxyXG4gIH1cclxuICBjb25zdCBsaW5lSGVpZ2h0ID0gc2FmZUxpbmVIZWlnaHQoZWxlbWVudC5zdHlsZS5saW5lSGVpZ2h0KVxyXG4gIGlmIChsaW5lSGVpZ2h0KSBhdHRycy5saW5lSGVpZ2h0ID0gbGluZUhlaWdodFxyXG4gIGNvbnN0IGJlZm9yZSA9IHNhZmVMZW5ndGgoZWxlbWVudC5zdHlsZS5tYXJnaW5Ub3ApXHJcbiAgaWYgKGJlZm9yZSkgYXR0cnMuc3BhY2VCZWZvcmUgPSBiZWZvcmVcclxuICBjb25zdCBhZnRlciA9IHNhZmVMZW5ndGgoZWxlbWVudC5zdHlsZS5tYXJnaW5Cb3R0b20pXHJcbiAgaWYgKGFmdGVyKSBhdHRycy5zcGFjZUFmdGVyID0gYWZ0ZXJcclxuICByZXR1cm4gYXR0cnNcclxufVxyXG5cclxuLyoqXHJcbiAqIGBsaXN0LXN0eWxlLXR5cGVgIHZhbHVlcyBlYWNoIGxpc3Qga2luZCBhY2NlcHRzLiBBbnl0aGluZyBvdXRzaWRlIHRoZXNlXHJcbiAqIHNldHMgaXMgZHJvcHBlZCByYXRoZXIgdGhhbiBlc2NhcGVkOiB0aGUgdmFsdWUgbGFuZHMgaW4gYSBgc3R5bGVgXHJcbiAqIGF0dHJpYnV0ZSwgc28gYW4gYWxsb3dsaXN0IGlzIHRoZSBvbmx5IHRydXN0d29ydGh5IGZpbHRlci5cclxuICovXHJcbmV4cG9ydCBjb25zdCBCVUxMRVRfTElTVF9TVFlMRVM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFsnZGlzYycsICdjaXJjbGUnLCAnc3F1YXJlJ10pXHJcblxyXG5leHBvcnQgY29uc3QgT1JERVJFRF9MSVNUX1NUWUxFUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW1xyXG4gICdkZWNpbWFsJyxcclxuICAnbG93ZXItYWxwaGEnLFxyXG4gICd1cHBlci1hbHBoYScsXHJcbiAgJ2xvd2VyLXJvbWFuJyxcclxuICAndXBwZXItcm9tYW4nLFxyXG5dKVxyXG5cclxuLyoqIEV2ZXJ5IG1hcmtlciB2YWx1ZSBhbnkgbGlzdCB0eXBlIGFsbG93cywgZm9yIGNvbW1hbmQtbGV2ZWwgdmFsaWRhdGlvbi4gKi9cclxuZXhwb3J0IGNvbnN0IExJU1RfU1RZTEVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXHJcbiAgLi4uQlVMTEVUX0xJU1RfU1RZTEVTLFxyXG4gIC4uLk9SREVSRURfTElTVF9TVFlMRVMsXHJcbl0pXHJcblxyXG4vKiogTWFya2VyIHZhbHVlcyBsZWdhbCBvbiBvbmUgbGlzdCB0eXBlOyB1bmtub3duIHR5cGVzIGFsbG93IG5vbmUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBsaXN0U3R5bGVzRm9yKGxpc3RUeXBlTmFtZTogc3RyaW5nKTogUmVhZG9ubHlTZXQ8c3RyaW5nPiB7XHJcbiAgaWYgKGxpc3RUeXBlTmFtZSA9PT0gJ2J1bGxldExpc3QnKSByZXR1cm4gQlVMTEVUX0xJU1RfU1RZTEVTXHJcbiAgaWYgKGxpc3RUeXBlTmFtZSA9PT0gJ29yZGVyZWRMaXN0JykgcmV0dXJuIE9SREVSRURfTElTVF9TVFlMRVNcclxuICByZXR1cm4gRU1QVFlfU1RZTEVTXHJcbn1cclxuXHJcbmNvbnN0IEVNUFRZX1NUWUxFUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKVxyXG5cclxuLyoqIFJlbmRlciBhIHZhbGlkYXRlZCBgbGlzdFN0eWxlYCBhdHRyIGFzIGEgc3R5bGUgYXR0cmlidXRlLCBvciBub3RoaW5nLiAqL1xyXG5mdW5jdGlvbiBsaXN0U3R5bGVIVE1MKG5vZGU6IEVkaXRvck5vZGUsIGFsbG93ZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcclxuICBjb25zdCBzdHlsZSA9IG5vZGUuYXR0cnMubGlzdFN0eWxlXHJcbiAgaWYgKHR5cGVvZiBzdHlsZSAhPT0gJ3N0cmluZycgfHwgIWFsbG93ZWQuaGFzKHN0eWxlKSkgcmV0dXJuIHt9XHJcbiAgcmV0dXJuIHsgc3R5bGU6IGBsaXN0LXN0eWxlLXR5cGU6ICR7c3R5bGV9YCB9XHJcbn1cclxuXHJcbi8qKiBSZWFkIGEgYGxpc3Qtc3R5bGUtdHlwZWAgYmFjayBmcm9tIGltcG9ydGVkIEhUTUwsIGlmIGl0IGlzIGFsbG93ZWQuICovXHJcbmZ1bmN0aW9uIHBhcnNlTGlzdFN0eWxlKFxyXG4gIGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxyXG4gIGFsbG93ZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4sXHJcbik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICBjb25zdCBzdHlsZSA9IGVsZW1lbnQuc3R5bGUubGlzdFN0eWxlVHlwZVxyXG4gIHJldHVybiBhbGxvd2VkLmhhcyhzdHlsZSkgPyB7IGxpc3RTdHlsZTogc3R5bGUgfSA6IHt9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgYDxpbnB1dCB0eXBlPWNoZWNrYm94PmAgYSB0YXNrIGl0ZW0gY2FycmllcyBpbiBwYXN0ZWQgbWFya2Rvd24sIGxvb2tlZFxyXG4gKiB1cCBhbW9uZyB0aGUgZWxlbWVudCdzIG93biBjaGlsZHJlbiAob3Igb25lIHdyYXBwZXIgcGFyYWdyYXBoIGRlZXApLiBUaGVcclxuICogc2VhcmNoIGlzIGRlbGliZXJhdGVseSBub3QgYSBkZXNjZW5kYW50IG9uZTogYSBwbGFpbiBgPGxpPmAgaG9sZGluZyBhXHJcbiAqIG5lc3RlZCBjaGVja2JveCBsaXN0IG11c3Qgc3RheSBhIHBsYWluIGl0ZW0sIGFuZCBpdHMgbGlzdCBhIGJ1bGxldCBsaXN0LlxyXG4gKiBXcml0dGVuIGFzIGFuIGV4cGxpY2l0IHdhbGsgcmF0aGVyIHRoYW4gYSBgOnNjb3BlID5gIHNlbGVjdG9yLCB3aGljaCBub3RcclxuICogZXZlcnkgRE9NIGltcGxlbWVudGF0aW9uIHRoZSBwYXJzZXIgcnVucyBhZ2FpbnN0IHN1cHBvcnRzLlxyXG4gKi9cclxuZnVuY3Rpb24gb3duQ2hlY2tib3goZWxlbWVudDogRWxlbWVudCk6IEVsZW1lbnQgfCBudWxsIHtcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGVsZW1lbnQuY2hpbGRyZW4pIHtcclxuICAgIGlmIChpc0NoZWNrYm94KGNoaWxkKSkgcmV0dXJuIGNoaWxkXHJcbiAgICBpZiAoY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpICE9PSAncCcpIGNvbnRpbnVlXHJcbiAgICBmb3IgKGNvbnN0IGlubmVyIG9mIGNoaWxkLmNoaWxkcmVuKSB7XHJcbiAgICAgIGlmIChpc0NoZWNrYm94KGlubmVyKSkgcmV0dXJuIGlubmVyXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQ2hlY2tib3goZWxlbWVudDogRWxlbWVudCk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiAoXHJcbiAgICBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2lucHV0JyAmJlxyXG4gICAgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd0eXBlJykgPz8gJycpLnRvTG93ZXJDYXNlKCkgPT09ICdjaGVja2JveCdcclxuICApXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIGNvZGUgZmVuY2UncyBsYW5ndWFnZSBuYW1lLiBSZWFsIG5hbWVzIGFyZSBzaG9ydCBhbmQgbWFkZSBvZiBsZXR0ZXJzLFxyXG4gKiBkaWdpdHMgYW5kIGEgbGl0dGxlIHB1bmN0dWF0aW9uIChgYysrYCwgYGMjYCwgYG9iamVjdGl2ZS1jYCksIHNvIGFueXRoaW5nXHJcbiAqIGVsc2UsIGluY2x1ZGluZyB3aGF0ZXZlciBhIGhvc3RpbGUgZG9jdW1lbnQgcHV0IGluIHRoZSBhdHRyaWJ1dGUsIGlzXHJcbiAqIGRyb3BwZWQgcmF0aGVyIHRoYW4gd3JpdHRlbiBiYWNrIG91dC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzYWZlTGFuZ3VhZ2VOYW1lKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpXHJcbiAgcmV0dXJuIC9eW2EtejAtOV1bYS16MC05KyMuXy1dezAsMzF9JC8udGVzdCh0cmltbWVkKSA/IHRyaW1tZWQgOiBudWxsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgbGFuZ3VhZ2Ugb2YgYSBgPHByZT5gLCBmcm9tIG91ciBvd24gYXR0cmlidXRlIG9yIGZyb20gdGhlXHJcbiAqIGBsYW5ndWFnZS0qYCAvIGBsYW5nLSpgIGNsYXNzIGV2ZXJ5IG90aGVyIHJlbmRlcmVyIG1hcmtzIGNvZGUgd2l0aCwgd2hpY2hcclxuICogaXMgd2hhdCBhcnJpdmVzIHdoZW4gYSBibG9jayBpcyBwYXN0ZWQgZnJvbSBhIGRvY3Mgc2l0ZSBvciBhIHJlcG9zaXRvcnkuXHJcbiAqL1xyXG5mdW5jdGlvbiBsYW5ndWFnZU9mKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgY29uc3QgZGVjbGFyZWQgPSBzYWZlTGFuZ3VhZ2VOYW1lKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWxhbmd1YWdlJykpXHJcbiAgaWYgKGRlY2xhcmVkKSByZXR1cm4gZGVjbGFyZWRcclxuICBjb25zdCBjb2RlID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdjb2RlJylcclxuICBmb3IgKGNvbnN0IGhvc3Qgb2YgW2VsZW1lbnQsIGNvZGVdKSB7XHJcbiAgICBmb3IgKGNvbnN0IG5hbWUgb2YgaG9zdD8uY2xhc3NMaXN0ID8/IFtdKSB7XHJcbiAgICAgIGNvbnN0IG1hdGNoID0gL14oPzpsYW5ndWFnZXxsYW5nKS0oLispJC8uZXhlYyhuYW1lKVxyXG4gICAgICBjb25zdCBsYW5ndWFnZSA9IG1hdGNoID8gc2FmZUxhbmd1YWdlTmFtZShtYXRjaFsxXSkgOiBudWxsXHJcbiAgICAgIGlmIChsYW5ndWFnZSkgcmV0dXJuIGxhbmd1YWdlXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbi8qKiBUaGUgYnVpbHQtaW4gbm9kZSBzZXQ6IGRvYywgcGFyYWdyYXBoLCBoZWFkaW5ncywgcXVvdGUsIGNvZGUsIGxpc3RzLCBcdTIwMjYgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHROb2RlcygpOiBSZWNvcmQ8c3RyaW5nLCBOb2RlU3BlYz4ge1xyXG4gIHJldHVybiB7XHJcbiAgICBkb2M6IHsgY29udGVudDogJ2Jsb2NrKycgfSxcclxuICAgIHBhcmFncmFwaDoge1xyXG4gICAgICBjb250ZW50OiAnaW5saW5lKicsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICBhdHRyczogYmxvY2tMYXlvdXRBdHRycygpLFxyXG4gICAgICB0b0hUTUw6IChub2RlKSA9PiAoeyB0YWc6ICdwJywgYXR0cnM6IGJsb2NrTGF5b3V0SFRNTChub2RlKSB9KSxcclxuICAgICAgcGFyc2VIVE1MOiBbeyB0YWc6ICdwJywgZ2V0QXR0cnM6IHBhcnNlQmxvY2tMYXlvdXQgfV0sXHJcbiAgICB9LFxyXG4gICAgaGVhZGluZzoge1xyXG4gICAgICBjb250ZW50OiAnaW5saW5lKicsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICAvLyBgaWRgIG1ha2VzIGEgaGVhZGluZyBhIGxpbmsgdGFyZ2V0IHdpdGhpbiB0aGUgZG9jdW1lbnQ7IGl0IGlzIG51bGxcclxuICAgICAgLy8gdW50aWwgc29tZXRoaW5nICh0aGUgbGluayBkaWFsb2csIGFuIGltcG9ydCkgbmVlZHMgb25lLlxyXG4gICAgICBhdHRyczogeyBsZXZlbDogeyBkZWZhdWx0OiAxIH0sIGlkOiB7IGRlZmF1bHQ6IG51bGwgfSwgLi4uYmxvY2tMYXlvdXRBdHRycygpIH0sXHJcbiAgICAgIHRvSFRNTDogKG5vZGUpID0+IHtcclxuICAgICAgICBjb25zdCBhdHRycyA9IGJsb2NrTGF5b3V0SFRNTChub2RlKVxyXG4gICAgICAgIGNvbnN0IGlkID0gc2FmZUVsZW1lbnRJZChub2RlLmF0dHJzLmlkKVxyXG4gICAgICAgIHJldHVybiB7IHRhZzogYGgke2NsYW1wTGV2ZWwobm9kZS5hdHRycy5sZXZlbCl9YCwgYXR0cnM6IGlkID8geyAuLi5hdHRycywgaWQgfSA6IGF0dHJzIH1cclxuICAgICAgfSxcclxuICAgICAgcGFyc2VIVE1MOiBbMSwgMiwgMywgNCwgNSwgNl0ubWFwKChsZXZlbCkgPT4gKHtcclxuICAgICAgICB0YWc6IGBoJHtsZXZlbH1gLFxyXG4gICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4gKHtcclxuICAgICAgICAgIGxldmVsLFxyXG4gICAgICAgICAgaWQ6IHNhZmVFbGVtZW50SWQoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJykpLFxyXG4gICAgICAgICAgLi4ucGFyc2VCbG9ja0xheW91dChlbGVtZW50KSxcclxuICAgICAgICB9KSxcclxuICAgICAgfSkpLFxyXG4gICAgfSxcclxuICAgIGJsb2NrcXVvdGU6IHtcclxuICAgICAgY29udGVudDogJ2Jsb2NrKycsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ2Jsb2NrcXVvdGUnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ2Jsb2NrcXVvdGUnIH1dLFxyXG4gICAgfSxcclxuICAgIGNvZGVCbG9jazoge1xyXG4gICAgICBjb250ZW50OiAndGV4dConLFxyXG4gICAgICBncm91cDogJ2Jsb2NrJyxcclxuICAgICAgbWFya3M6ICcnLFxyXG4gICAgICBhdHRyczogeyBsYW5ndWFnZTogeyBkZWZhdWx0OiBudWxsIH0gfSxcclxuICAgICAgcHJlc2VydmVXaGl0ZXNwYWNlOiB0cnVlLFxyXG4gICAgICB0b0hUTUw6IChub2RlKSA9PiB7XHJcbiAgICAgICAgY29uc3QgbGFuZ3VhZ2UgPSBzYWZlTGFuZ3VhZ2VOYW1lKG5vZGUuYXR0cnMubGFuZ3VhZ2UpXHJcbiAgICAgICAgY29uc3QgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fVxyXG4gICAgICAgIGlmIChsYW5ndWFnZSkgYXR0cnNbJ2RhdGEtbGFuZ3VhZ2UnXSA9IGxhbmd1YWdlXHJcbiAgICAgICAgcmV0dXJuIHsgdGFnOiAncHJlJywgYXR0cnMsIGNoaWxkVGFnOiAnY29kZScgfVxyXG4gICAgICB9LFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3ByZScsIGdldEF0dHJzOiAoZWxlbWVudCkgPT4gKHsgbGFuZ3VhZ2U6IGxhbmd1YWdlT2YoZWxlbWVudCkgfSkgfV0sXHJcbiAgICB9LFxyXG4gICAgaG9yaXpvbnRhbFJ1bGU6IHtcclxuICAgICAgZ3JvdXA6ICdibG9jaycsXHJcbiAgICAgIGF0b206IHRydWUsXHJcbiAgICAgIHRvSFRNTDogKCkgPT4gKHsgdGFnOiAnaHInLCBpc1ZvaWQ6IHRydWUgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAnaHInIH1dLFxyXG4gICAgfSxcclxuICAgIGhhcmRCcmVhazoge1xyXG4gICAgICBpbmxpbmU6IHRydWUsXHJcbiAgICAgIGF0b206IHRydWUsXHJcbiAgICAgIGdyb3VwOiAnaW5saW5lJyxcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdicicsIGlzVm9pZDogdHJ1ZSB9KSxcclxuICAgICAgcGFyc2VIVE1MOiBbeyB0YWc6ICdicicgfV0sXHJcbiAgICB9LFxyXG4gICAgdGFza0xpc3Q6IHtcclxuICAgICAgY29udGVudDogJ3Rhc2tJdGVtKycsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ3VsJywgYXR0cnM6IHsgJ2RhdGEtdHlwZSc6ICd0YXNrTGlzdCcgfSB9KSxcclxuICAgICAgLy8gUmVnaXN0ZXJlZCBiZWZvcmUgYnVsbGV0TGlzdCBzbyBib3RoIHJ1bGVzIGJlbG93IGFyZSBjb25zdWx0ZWQgZmlyc3RcclxuICAgICAgLy8gKFJ1bGVTZXQgdHJpZXMgYXR0cmlidXRlLWNvbnN0cmFpbmVkIHJ1bGVzIGFoZWFkIG9mIGJhcmUgb25lcywgYW5kXHJcbiAgICAgIC8vIG90aGVyd2lzZSBrZWVwcyByZWdpc3RyYXRpb24gb3JkZXIpLlxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICd1bCcsXHJcbiAgICAgICAgICBhdHRyaWJ1dGU6ICdkYXRhLXR5cGUnLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdHlwZScpID09PSAndGFza0xpc3QnID8ge30gOiBmYWxzZSksXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvLyBBIGJhcmUgYDx1bD5gIHdob3NlIGl0ZW1zIGNhcnJ5IGNoZWNrYm94ZXMsIEdpdEh1Yi1mbGF2b3VyZWRcclxuICAgICAgICAvLyBtYXJrZG93biwgYW5kIG1vc3QgbWFya2Rvd24gcmVuZGVyZXJzLiBUaGUgaXRlbXMgdGhlbXNlbHZlcyBwYXJzZVxyXG4gICAgICAgIC8vIGFzIGB0YXNrSXRlbWAsIHdoaWNoIG9ubHkgYSBgdGFza0xpc3RgIG1heSBjb250YWluLCBzbyB0aGlzIHJ1bGUgaXNcclxuICAgICAgICAvLyB3aGF0IGtlZXBzIHRoZSBwYXN0ZWQgbGlzdCBzY2hlbWEtdmFsaWQuXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdGFnOiAndWwnLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PlxyXG4gICAgICAgICAgICBbLi4uZWxlbWVudC5jaGlsZHJlbl0uc29tZShcclxuICAgICAgICAgICAgICAoY2hpbGQpID0+IGNoaWxkLnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2xpJyAmJiBvd25DaGVja2JveChjaGlsZCksXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICA/IHt9XHJcbiAgICAgICAgICAgICAgOiBmYWxzZSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIHRhc2tJdGVtOiB7XHJcbiAgICAgIGNvbnRlbnQ6ICdibG9jaysnLFxyXG4gICAgICBhdHRyczogeyBjaGVja2VkOiB7IGRlZmF1bHQ6IGZhbHNlIH0gfSxcclxuICAgICAgdG9IVE1MOiAobm9kZSkgPT4gKHtcclxuICAgICAgICB0YWc6ICdsaScsXHJcbiAgICAgICAgYXR0cnM6IHtcclxuICAgICAgICAgICdkYXRhLXR5cGUnOiAndGFza0l0ZW0nLFxyXG4gICAgICAgICAgJ2RhdGEtY2hlY2tlZCc6IG5vZGUuYXR0cnMuY2hlY2tlZCA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZScsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ2xpJyxcclxuICAgICAgICAgIGF0dHJpYnV0ZTogJ2RhdGEtY2hlY2tlZCcsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+ICh7IGNoZWNrZWQ6IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWNoZWNrZWQnKSA9PT0gJ3RydWUnIH0pLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy8gR2l0SHViLWZsYXZvdXJlZCBtYXJrZG93biBhbmQgb3RoZXIgZWRpdG9ycyBwYXN0ZSBhIGJhcmUgYDxsaT5gXHJcbiAgICAgICAgLy8gaG9sZGluZyBhbiBgPGlucHV0IHR5cGU9Y2hlY2tib3g+YC4gVGhlIHBhcnNlciBkcm9wcyB0aGUgaW5wdXRcclxuICAgICAgICAvLyBpdHNlbGYgKGl0IGlzIG9uIHRoZSBkYW5nZXJvdXMtdGFncyBsaXN0KSwgc28gdGhlIHN0YXRlIGhhcyB0byBiZVxyXG4gICAgICAgIC8vIHJlYWQgaGVyZSwgYmVmb3JlIHRoZSBlbGVtZW50J3MgY2hpbGRyZW4gYXJlIHdhbGtlZC4gTWF0Y2hpbmcgb25cclxuICAgICAgICAvLyB0aGUgaW5wdXQgaXMgYWxzbyB3aGF0IGRpc3Rpbmd1aXNoZXMgc3VjaCBhbiBgPGxpPmAgZnJvbSBhIHBsYWluXHJcbiAgICAgICAgLy8gb25lLCB3aGljaCBtdXN0IHN0YXkgYSBgbGlzdEl0ZW1gLlxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ2xpJyxcclxuICAgICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBib3ggPSBvd25DaGVja2JveChlbGVtZW50KVxyXG4gICAgICAgICAgICByZXR1cm4gYm94ID8geyBjaGVja2VkOiBib3guaGFzQXR0cmlidXRlKCdjaGVja2VkJykgfSA6IGZhbHNlXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gICAgYnVsbGV0TGlzdDoge1xyXG4gICAgICBjb250ZW50OiAnbGlzdEl0ZW0rJyxcclxuICAgICAgZ3JvdXA6ICdibG9jaycsXHJcbiAgICAgIGF0dHJzOiB7IGxpc3RTdHlsZTogeyBkZWZhdWx0OiBudWxsIH0gfSxcclxuICAgICAgdG9IVE1MOiAobm9kZSkgPT4gKHsgdGFnOiAndWwnLCBhdHRyczogbGlzdFN0eWxlSFRNTChub2RlLCBCVUxMRVRfTElTVF9TVFlMRVMpIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7IHRhZzogJ3VsJywgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiBwYXJzZUxpc3RTdHlsZShlbGVtZW50LCBCVUxMRVRfTElTVF9TVFlMRVMpIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gICAgb3JkZXJlZExpc3Q6IHtcclxuICAgICAgY29udGVudDogJ2xpc3RJdGVtKycsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICBhdHRyczogeyBzdGFydDogeyBkZWZhdWx0OiAxIH0sIGxpc3RTdHlsZTogeyBkZWZhdWx0OiBudWxsIH0gfSxcclxuICAgICAgdG9IVE1MOiAobm9kZSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gbGlzdFN0eWxlSFRNTChub2RlLCBPUkRFUkVEX0xJU1RfU1RZTEVTKVxyXG4gICAgICAgIGlmIChub2RlLmF0dHJzLnN0YXJ0ICE9PSAxKSBhdHRycy5zdGFydCA9IFN0cmluZyhub2RlLmF0dHJzLnN0YXJ0KVxyXG4gICAgICAgIHJldHVybiB7IHRhZzogJ29sJywgYXR0cnMgfVxyXG4gICAgICB9LFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICdvbCcsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBOdW1iZXIucGFyc2VJbnQoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3N0YXJ0JykgPz8gJzEnLCAxMClcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICBzdGFydDogTnVtYmVyLmlzTmFOKHN0YXJ0KSA/IDEgOiBzdGFydCxcclxuICAgICAgICAgICAgICAuLi5wYXJzZUxpc3RTdHlsZShlbGVtZW50LCBPUkRFUkVEX0xJU1RfU1RZTEVTKSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIGxpc3RJdGVtOiB7XHJcbiAgICAgIGNvbnRlbnQ6ICdibG9jaysnLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ2xpJyB9KSxcclxuICAgICAgcGFyc2VIVE1MOiBbeyB0YWc6ICdsaScgfV0sXHJcbiAgICB9LFxyXG4gICAgdGV4dDogeyBncm91cDogJ2lubGluZScgfSxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBUaGUgYnVpbHQtaW4gbWFyayBzZXQ6IGJvbGQsIGl0YWxpYywgdW5kZXJsaW5lLCBzdHJpa2UsIGNvZGUsIGxpbmssIFx1MjAyNiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdE1hcmtzKCk6IFJlY29yZDxzdHJpbmcsIE1hcmtTcGVjPiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGJvbGQ6IHtcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdzdHJvbmcnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3N0cm9uZycgfSwgeyB0YWc6ICdiJyB9XSxcclxuICAgIH0sXHJcbiAgICBpdGFsaWM6IHtcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdlbScgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAnZW0nIH0sIHsgdGFnOiAnaScgfV0sXHJcbiAgICB9LFxyXG4gICAgdW5kZXJsaW5lOiB7XHJcbiAgICAgIHRvSFRNTDogKCkgPT4gKHsgdGFnOiAndScgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAndScgfV0sXHJcbiAgICB9LFxyXG4gICAgc3RyaWtldGhyb3VnaDoge1xyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ3MnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3MnIH0sIHsgdGFnOiAnc3RyaWtlJyB9LCB7IHRhZzogJ2RlbCcgfV0sXHJcbiAgICB9LFxyXG4gICAgY29kZToge1xyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ2NvZGUnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ2NvZGUnIH1dLFxyXG4gICAgfSxcclxuICAgIGxpbms6IHtcclxuICAgICAgYXR0cnM6IHsgaHJlZjoge30sIHRpdGxlOiB7IGRlZmF1bHQ6IG51bGwgfSwgdGFyZ2V0OiB7IGRlZmF1bHQ6IG51bGwgfSB9LFxyXG4gICAgICB0b0hUTUw6IChtYXJrKSA9PiB7XHJcbiAgICAgICAgY29uc3QgaHJlZiA9IHNhZmVIcmVmKG1hcmsuYXR0cnMuaHJlZilcclxuICAgICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IGhyZWYgPyB7IGhyZWYgfSA6IHt9XHJcbiAgICAgICAgaWYgKHR5cGVvZiBtYXJrLmF0dHJzLnRpdGxlID09PSAnc3RyaW5nJykgYXR0cnMudGl0bGUgPSBtYXJrLmF0dHJzLnRpdGxlXHJcbiAgICAgICAgLy8gQSBgdGFyZ2V0PV9ibGFua2AgbGluayB3aXRob3V0IHRoaXMgcmVsIGxldHMgdGhlIG9wZW5lZCBwYWdlIHJlYWNoXHJcbiAgICAgICAgLy8gYmFjayB0aHJvdWdoIGB3aW5kb3cub3BlbmVyYCBhbmQgcmV0YXJnZXQgdGhpcyBvbmUgKHJldmVyc2VcclxuICAgICAgICAvLyB0YWJuYWJiaW5nKSwgc28gdGhlIHR3byBhcmUgZW1pdHRlZCB0b2dldGhlciwgYWx3YXlzLlxyXG4gICAgICAgIGlmIChtYXJrLmF0dHJzLnRhcmdldCA9PT0gJ19ibGFuaycpIHtcclxuICAgICAgICAgIGF0dHJzLnRhcmdldCA9ICdfYmxhbmsnXHJcbiAgICAgICAgICBhdHRycy5yZWwgPSAnbm9vcGVuZXIgbm9yZWZlcnJlcidcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHsgdGFnOiAnYScsIGF0dHJzIH1cclxuICAgICAgfSxcclxuICAgICAgcGFyc2VIVE1MOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdGFnOiAnYScsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaHJlZiA9IHNhZmVIcmVmKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdocmVmJykpXHJcbiAgICAgICAgICAgIGlmICghaHJlZikgcmV0dXJuIGZhbHNlIC8vIHVuc2FmZSBvciBtaXNzaW5nIGxpbms6IGtlZXAgdGV4dCwgZHJvcCBtYXJrXHJcbiAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJylcclxuICAgICAgICAgICAgLy8gT25seSBgX2JsYW5rYCBpcyBtb2RlbGxlZDsgYW55IG90aGVyIHRhcmdldCBpcyBkcm9wcGVkIHJhdGhlclxyXG4gICAgICAgICAgICAvLyB0aGFuIHRydXN0ZWQsIHNpbmNlIGl0IGNhbiBuYW1lIGFuIGFyYml0cmFyeSBmcmFtZS5cclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RhcmdldCcpID09PSAnX2JsYW5rJyA/ICdfYmxhbmsnIDogbnVsbFxyXG4gICAgICAgICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IGhyZWYgfVxyXG4gICAgICAgICAgICBpZiAodGl0bGUpIGF0dHJzLnRpdGxlID0gdGl0bGVcclxuICAgICAgICAgICAgaWYgKHRhcmdldCkgYXR0cnMudGFyZ2V0ID0gdGFyZ2V0XHJcbiAgICAgICAgICAgIHJldHVybiBhdHRyc1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIGhpZ2hsaWdodDoge1xyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ21hcmsnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ21hcmsnIH1dLFxyXG4gICAgfSxcclxuICAgIHN1YnNjcmlwdDoge1xyXG4gICAgICBleGNsdWRlczogJ3N1cGVyc2NyaXB0JyxcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdzdWInIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3N1YicgfV0sXHJcbiAgICB9LFxyXG4gICAgc3VwZXJzY3JpcHQ6IHtcclxuICAgICAgZXhjbHVkZXM6ICdzdWJzY3JpcHQnLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ3N1cCcgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAnc3VwJyB9XSxcclxuICAgIH0sXHJcbiAgICBmb250RmFtaWx5OiB7XHJcbiAgICAgIGF0dHJzOiB7IGZhbWlseToge30gfSxcclxuICAgICAgdG9IVE1MOiAobWFyaykgPT4gc3R5bGVTcGFuKCdmb250LWZhbWlseScsIHNhZmVGb250RmFtaWx5KG1hcmsuYXR0cnMuZmFtaWx5KSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ3NwYW4nLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZhbWlseSA9IHNhZmVGb250RmFtaWx5KGVsZW1lbnQuc3R5bGUuZm9udEZhbWlseSlcclxuICAgICAgICAgICAgcmV0dXJuIGZhbWlseSA/IHsgZmFtaWx5IH0gOiBmYWxzZVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ2ZvbnQnLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZhbWlseSA9IHNhZmVGb250RmFtaWx5KGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdmYWNlJykpXHJcbiAgICAgICAgICAgIHJldHVybiBmYW1pbHkgPyB7IGZhbWlseSB9IDogZmFsc2VcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0sXHJcbiAgICBmb250U2l6ZToge1xyXG4gICAgICBhdHRyczogeyBzaXplOiB7fSB9LFxyXG4gICAgICB0b0hUTUw6IChtYXJrKSA9PiBzdHlsZVNwYW4oJ2ZvbnQtc2l6ZScsIHNhZmVMZW5ndGgobWFyay5hdHRycy5zaXplKSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ3NwYW4nLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNpemUgPSBzYWZlTGVuZ3RoKGVsZW1lbnQuc3R5bGUuZm9udFNpemUpXHJcbiAgICAgICAgICAgIHJldHVybiBzaXplID8geyBzaXplIH0gOiBmYWxzZVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIHRleHRDb2xvcjoge1xyXG4gICAgICBhdHRyczogeyBjb2xvcjoge30gfSxcclxuICAgICAgdG9IVE1MOiAobWFyaykgPT4gc3R5bGVTcGFuKCdjb2xvcicsIHNhZmVDb2xvcihtYXJrLmF0dHJzLmNvbG9yKSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ3NwYW4nLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gc2FmZUNvbG9yKGVsZW1lbnQuc3R5bGUuY29sb3IpXHJcbiAgICAgICAgICAgIHJldHVybiBjb2xvciA/IHsgY29sb3IgfSA6IGZhbHNlXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gICAgYmFja2dyb3VuZENvbG9yOiB7XHJcbiAgICAgIGF0dHJzOiB7IGNvbG9yOiB7fSB9LFxyXG4gICAgICB0b0hUTUw6IChtYXJrKSA9PiBzdHlsZVNwYW4oJ2JhY2tncm91bmQtY29sb3InLCBzYWZlQ29sb3IobWFyay5hdHRycy5jb2xvcikpLFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICdzcGFuJyxcclxuICAgICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IHNhZmVDb2xvcihlbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvcilcclxuICAgICAgICAgICAgcmV0dXJuIGNvbG9yID8geyBjb2xvciB9IDogZmFsc2VcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0sXHJcbiAgICBzbWFsbENhcHM6IHtcclxuICAgICAgdG9IVE1MOiAoKSA9PiBzdHlsZVNwYW4oJ2ZvbnQtdmFyaWFudC1jYXBzJywgJ3NtYWxsLWNhcHMnKSxcclxuICAgICAgcGFyc2VIVE1MOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdGFnOiAnc3BhbicsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgLy8gYGZvbnQtdmFyaWFudC1jYXBzYCBpcyB0aGUgbW9kZXJuIHByb3BlcnR5OyBoYXBweS1kb20gYW5kIG9sZGVyXHJcbiAgICAgICAgICAgIC8vIHBhc3RlZCBtYXJrdXAgb25seSBldmVyIHBvcHVsYXRlIHRoZSBgZm9udC12YXJpYW50YCBzaG9ydGhhbmQsXHJcbiAgICAgICAgICAgIC8vIHNvIGFjY2VwdCBzbWFsbC1jYXBzIGZyb20gZWl0aGVyIG9uZS5cclxuICAgICAgICAgICAgY29uc3QgY2FwcyA9IGVsZW1lbnQuc3R5bGUuZm9udFZhcmlhbnRDYXBzIHx8IGVsZW1lbnQuc3R5bGUuZm9udFZhcmlhbnQgfHwgJydcclxuICAgICAgICAgICAgcmV0dXJuIGNhcHMudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09ICdzbWFsbC1jYXBzJyA/IHt9IDogZmFsc2VcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0sXHJcbiAgICBsZXR0ZXJTcGFjaW5nOiB7XHJcbiAgICAgIGF0dHJzOiB7IHNwYWNpbmc6IHt9IH0sXHJcbiAgICAgIHRvSFRNTDogKG1hcmspID0+IHN0eWxlU3BhbignbGV0dGVyLXNwYWNpbmcnLCBzYWZlTGVuZ3RoKG1hcmsuYXR0cnMuc3BhY2luZykpLFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICdzcGFuJyxcclxuICAgICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzcGFjaW5nID0gc2FmZUxlbmd0aChlbGVtZW50LnN0eWxlLmxldHRlclNwYWNpbmcpXHJcbiAgICAgICAgICAgIHJldHVybiBzcGFjaW5nID8geyBzcGFjaW5nIH0gOiBmYWxzZVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBBIHNwYW4gY2Fycnlpbmcgb25lIHNhbml0aXplZCBkZWNsYXJhdGlvbjsgdW5zYWZlIHZhbHVlcyByZW5kZXIgYmFyZS4gKi9cclxuZnVuY3Rpb24gc3R5bGVTcGFuKHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCBudWxsKTogSFRNTFNwZWMge1xyXG4gIHJldHVybiB2YWx1ZSA/IHsgdGFnOiAnc3BhbicsIGF0dHJzOiB7IHN0eWxlOiBgJHtwcm9wZXJ0eX06ICR7dmFsdWV9YCB9IH0gOiB7IHRhZzogJ3NwYW4nIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2xhbXBMZXZlbChsZXZlbDogdW5rbm93bik6IG51bWJlciB7XHJcbiAgY29uc3QgdmFsdWUgPSB0eXBlb2YgbGV2ZWwgPT09ICdudW1iZXInID8gTWF0aC5yb3VuZChsZXZlbCkgOiAxXHJcbiAgcmV0dXJuIE1hdGgubWluKDYsIE1hdGgubWF4KDEsIHZhbHVlKSlcclxufVxyXG4iLCAiaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgaW5saW5lTGVuZ3RoIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IG5vZGVBdFBhdGgsIHBhdGhzRXF1YWwgfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBSZXBsYWNlSW5saW5lU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lJ1xyXG5pbXBvcnQgeyBSZXBsYWNlTm9kZXNTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1ub2RlcydcclxuaW1wb3J0IHsgSm9pbk5vZGVzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3NwbGl0LWpvaW4nXHJcbmltcG9ydCB0eXBlIHsgVHJhbnNhY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS90cmFuc2FjdGlvbidcclxuXHJcbi8qKlxyXG4gKiBEZWxldGUgdGhlIGNvbnRlbnQgYmV0d2VlbiB0d28gaW5saW5lIHBvc2l0aW9ucywgam9pbmluZyB0aGUgYm91bmRhcnlcclxuICogYmxvY2tzIHdoZW4gdGhleSBhcmUgZGlyZWN0IHNpYmxpbmdzLiBgZnJvbWAgcmVtYWlucyBhIHZhbGlkIHBvc2l0aW9uIGluXHJcbiAqIHRoZSByZXN1bHRpbmcgZG9jdW1lbnQgKHRoZSBjYWxsZXIgY2FuIHBsYWNlIHRoZSBjdXJzb3IgdGhlcmUpLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZVJhbmdlKHRyOiBUcmFuc2FjdGlvbiwgZnJvbTogUG9zaXRpb24sIHRvOiBQb3NpdGlvbik6IHZvaWQge1xyXG4gIGlmIChwYXRoc0VxdWFsKGZyb20ucGF0aCwgdG8ucGF0aCkpIHtcclxuICAgIGlmIChmcm9tLm9mZnNldCA8IHRvLm9mZnNldCkge1xyXG4gICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChmcm9tLnBhdGgsIGZyb20ub2Zmc2V0LCB0by5vZmZzZXQsIEZyYWdtZW50LmVtcHR5KSlcclxuICAgIH1cclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgZmlyc3RCbG9jayA9IG5vZGVBdFBhdGgodHIuZG9jLCBmcm9tLnBhdGgpXHJcbiAgY29uc3QgbGFzdEJsb2NrID0gbm9kZUF0UGF0aCh0ci5kb2MsIHRvLnBhdGgpXHJcbiAgaWYgKCFmaXJzdEJsb2NrPy5pc1RleHRibG9jayB8fCAhbGFzdEJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuXHJcblxyXG4gIC8vIFRyaW0gdGhlIHRhaWwgb2YgdGhlIGZpcnN0IGJsb2NrIGFuZCB0aGUgaGVhZCBvZiB0aGUgbGFzdCBibG9jay5cclxuICBjb25zdCBmaXJzdExlbmd0aCA9IGlubGluZUxlbmd0aChmaXJzdEJsb2NrLmNvbnRlbnQpXHJcbiAgaWYgKGZyb20ub2Zmc2V0IDwgZmlyc3RMZW5ndGgpIHtcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKGZyb20ucGF0aCwgZnJvbS5vZmZzZXQsIGZpcnN0TGVuZ3RoLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgfVxyXG4gIGlmICh0by5vZmZzZXQgPiAwKSB7XHJcbiAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcCh0by5wYXRoLCAwLCB0by5vZmZzZXQsIEZyYWdtZW50LmVtcHR5KSlcclxuICB9XHJcblxyXG4gIC8vIFJlbW92ZSB3aG9sZSBub2RlcyBzdHJpY3RseSBiZXR3ZWVuIHRoZSB0d28gYm91bmRhcnkgYnJhbmNoZXMuXHJcbiAgbGV0IGRpdmVyZ2VuY2UgPSAwXHJcbiAgd2hpbGUgKGZyb20ucGF0aFtkaXZlcmdlbmNlXSA9PT0gdG8ucGF0aFtkaXZlcmdlbmNlXSkgZGl2ZXJnZW5jZSsrXHJcbiAgY29uc3QgY29tbW9uUGF0aCA9IGZyb20ucGF0aC5zbGljZSgwLCBkaXZlcmdlbmNlKVxyXG4gIGNvbnN0IGZpcnN0SW5kZXggPSBmcm9tLnBhdGhbZGl2ZXJnZW5jZV0gYXMgbnVtYmVyXHJcbiAgY29uc3QgbGFzdEluZGV4ID0gdG8ucGF0aFtkaXZlcmdlbmNlXSBhcyBudW1iZXJcclxuICBpZiAobGFzdEluZGV4ID4gZmlyc3RJbmRleCArIDEpIHtcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAoY29tbW9uUGF0aCwgZmlyc3RJbmRleCArIDEsIGxhc3RJbmRleCwgRnJhZ21lbnQuZW1wdHkpKVxyXG4gIH1cclxuXHJcbiAgLy8gSm9pbiB0aGUgYm91bmRhcnkgYmxvY2tzIHdoZW4gdGhleSBhcmUgZGlyZWN0IHNpYmxpbmdzLlxyXG4gIGNvbnN0IGRpcmVjdFNpYmxpbmdzID0gZnJvbS5wYXRoLmxlbmd0aCA9PT0gZGl2ZXJnZW5jZSArIDEgJiYgdG8ucGF0aC5sZW5ndGggPT09IGRpdmVyZ2VuY2UgKyAxXHJcbiAgaWYgKGRpcmVjdFNpYmxpbmdzKSB7XHJcbiAgICB0ci5zdGVwKG5ldyBKb2luTm9kZXNTdGVwKGZyb20ucGF0aCwgZnJvbS5vZmZzZXQpKVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBBdHRycyB9IGZyb20gJy4uL21vZGVsL2F0dHJzJ1xyXG5pbXBvcnQgeyBhdHRyc0VxIH0gZnJvbSAnLi4vbW9kZWwvYXR0cnMnXHJcbmltcG9ydCB7IGJsb2Nrc0luUmFuZ2UgfSBmcm9tICcuLi9tb2RlbC9ibG9ja3MnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7XHJcbiAgY29lcmNlSW5saW5lRm9yLFxyXG4gIGlubGluZUxlbmd0aCxcclxuICBtYXJrc0F0SW5saW5lT2Zmc2V0LFxyXG4gIG5leHRJbmxpbmVCb3VuZGFyeSxcclxuICBwcmV2aW91c0lubGluZUJvdW5kYXJ5LFxyXG4gIHJhbmdlSGFzTWFyayxcclxuICByYW5nZXNXaXRoTWFyayxcclxuICBzbGljZUlubGluZSxcclxufSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgTWFyayB9IGZyb20gJy4uL21vZGVsL21hcmsnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSwgVGV4dE5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBwb3MgfSBmcm9tICcuLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgbm9kZUF0UGF0aCwgcGF0aHNFcXVhbCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IE1BWF9JTkRFTlQsIGJsb2NrTGF5b3V0QXR0cnMgfSBmcm9tICcuLi9zY2hlbWEvYmFzaWMnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yU3RhdGUgfSBmcm9tICcuLi9zdGF0ZS9lZGl0b3Itc3RhdGUnXHJcbmltcG9ydCB7IEFsbFNlbGVjdGlvbiwgTm9kZVNlbGVjdGlvbiwgVGV4dFNlbGVjdGlvbiwgc2VsZWN0aW9uTmVhciB9IGZyb20gJy4uL3N0YXRlL3NlbGVjdGlvbidcclxuaW1wb3J0IHsgU2V0Tm9kZUF0dHJzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL2F0dHJzLXN0ZXAnXHJcbmltcG9ydCB7IEFkZE1hcmtTdGVwLCBSZW1vdmVNYXJrU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL21hcmstc3RlcHMnXHJcbmltcG9ydCB7IFJlcGxhY2VJbmxpbmVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1pbmxpbmUnXHJcbmltcG9ydCB7IFJlcGxhY2VOb2Rlc1N0ZXAsIHJlcGxhY2VOb2RlQXQgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9yZXBsYWNlLW5vZGVzJ1xyXG5pbXBvcnQgeyBKb2luTm9kZXNTdGVwLCBTcGxpdE5vZGVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvc3BsaXQtam9pbidcclxuaW1wb3J0IHsgTGlmdE5vZGVzU3RlcCwgV3JhcE5vZGVzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3dyYXAtbGlmdCdcclxuaW1wb3J0IHR5cGUgeyBUcmFuc2FjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3RyYW5zYWN0aW9uJ1xyXG5pbXBvcnQgeyBkZWxldGVSYW5nZSB9IGZyb20gJy4vaGVscGVycydcclxuXHJcbi8qKlxyXG4gKiBBIGNvbW1hbmQgaW5zcGVjdHMgYSBzdGF0ZSBhbmQgcHJvZHVjZXMgdGhlIHRyYW5zYWN0aW9uIHJlYWxpemluZyBpdCwgb3JcclxuICogbnVsbCB3aGVuIGl0IGRvZXMgbm90IGFwcGx5LiBQdXJlLCBkaXNwYXRjaGluZyBpcyB0aGUgY2FsbGVyJ3Mgam9iLlxyXG4gKi9cclxuZXhwb3J0IHR5cGUgQ29tbWFuZCA9IChzdGF0ZTogRWRpdG9yU3RhdGUpID0+IFRyYW5zYWN0aW9uIHwgbnVsbFxyXG5cclxuLyoqIFRyeSBjb21tYW5kcyBpbiBvcmRlcjsgdGhlIGZpcnN0IG9uZSB0aGF0IGFwcGxpZXMgd2lucy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNoYWluQ29tbWFuZHMoLi4uY29tbWFuZHM6IHJlYWRvbmx5IENvbW1hbmRbXSk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kcykge1xyXG4gICAgICBjb25zdCB0ciA9IGNvbW1hbmQoc3RhdGUpXHJcbiAgICAgIGlmICh0cikgcmV0dXJuIHRyXHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIEluc2VydCB0ZXh0IGF0IHRoZSBzZWxlY3Rpb24sIHJlcGxhY2luZyBpdCwgaW5oZXJpdGluZyBhZGphY2VudCBtYXJrcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGluc2VydFRleHQodGV4dDogc3RyaW5nKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgaWYgKHRleHQubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGlmICghc2VsZWN0aW9uLmVtcHR5KSBkZWxldGVSYW5nZSh0ciwgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICAgIGNvbnN0IHBvaW50ID0gc2VsZWN0aW9uLmZyb21cclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aCh0ci5kb2MsIHBvaW50LnBhdGgpXHJcbiAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IGluaGVyaXRlZCA9IHN0YXRlLnN0b3JlZE1hcmtzID8/IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgcG9pbnQub2Zmc2V0KVxyXG4gICAgY29uc3QgbWFya3MgPSBpbmhlcml0ZWQuZmlsdGVyKChtYXJrKSA9PiBibG9jay50eXBlLmFsbG93c01hcmtUeXBlKG1hcmsudHlwZSkpXHJcbiAgICB0ci5zdGVwKFxyXG4gICAgICBuZXcgUmVwbGFjZUlubGluZVN0ZXAoXHJcbiAgICAgICAgcG9pbnQucGF0aCxcclxuICAgICAgICBwb2ludC5vZmZzZXQsXHJcbiAgICAgICAgcG9pbnQub2Zmc2V0LFxyXG4gICAgICAgIEZyYWdtZW50Lm9mKHN0YXRlLnNjaGVtYS50ZXh0KHRleHQsIG1hcmtzKSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCArIHRleHQubGVuZ3RoKSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbn1cclxuXHJcbi8qKiBEZWxldGUgdGhlIHNlbGVjdGVkIGNvbnRlbnQuICovXHJcbmV4cG9ydCBjb25zdCBkZWxldGVTZWxlY3Rpb246IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoc2VsZWN0aW9uLmVtcHR5KSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICBpZiAoc2VsZWN0aW9uIGluc3RhbmNlb2YgQWxsU2VsZWN0aW9uKSB7XHJcbiAgICBjb25zdCBwYXJhZ3JhcGggPSBzdGF0ZS5zY2hlbWEuZmlyc3RUZXh0YmxvY2tUeXBlKCkuY3JlYXRlKClcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAoW10sIDAsIHN0YXRlLmRvYy5jaGlsZENvdW50LCBGcmFnbWVudC5vZihwYXJhZ3JhcGgpKSlcclxuICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoWzBdLCAwKSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbiAgaWYgKHNlbGVjdGlvbiBpbnN0YW5jZW9mIE5vZGVTZWxlY3Rpb24pIHtcclxuICAgIHRyLnN0ZXAoXHJcbiAgICAgIG5ldyBSZXBsYWNlTm9kZXNTdGVwKFxyXG4gICAgICAgIHNlbGVjdGlvbi5wYXJlbnRQYXRoLFxyXG4gICAgICAgIHNlbGVjdGlvbi5pbmRleCxcclxuICAgICAgICBzZWxlY3Rpb24uaW5kZXggKyAxLFxyXG4gICAgICAgIEZyYWdtZW50LmVtcHR5LFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gICAgdHIuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbk5lYXIodHIuZG9jLCBzZWxlY3Rpb24uZnJvbSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbiAgZGVsZXRlUmFuZ2UodHIsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHNlbGVjdGlvbi5mcm9tKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIFRvZ2dsZSBhIG1hcmsgb24gdGhlIHNlbGVjdGlvbiwgb3Igb24gdGhlIHN0b3JlZCBtYXJrcyBhdCBhIGN1cnNvci4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZU1hcmsobmFtZTogc3RyaW5nLCBhdHRycz86IEF0dHJzKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrVHlwZShuYW1lKVxyXG4gICAgY29uc3QgbWFyayA9IHR5cGUuY3JlYXRlKGF0dHJzKVxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcblxyXG4gICAgaWYgKHNlbGVjdGlvbi5lbXB0eSAmJiBzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSB7XHJcbiAgICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5oZWFkLnBhdGgpXHJcbiAgICAgIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrIHx8ICFibG9jay50eXBlLmFsbG93c01hcmtUeXBlKHR5cGUpKSByZXR1cm4gbnVsbFxyXG4gICAgICBjb25zdCBjdXJyZW50ID0gc3RhdGUuc3RvcmVkTWFya3MgPz8gbWFya3NBdElubGluZU9mZnNldChibG9jay5jb250ZW50LCBzZWxlY3Rpb24uaGVhZC5vZmZzZXQpXHJcbiAgICAgIGNvbnN0IGFjdGl2ZSA9IGN1cnJlbnQuc29tZSgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUudHlwZSA9PT0gdHlwZSlcclxuICAgICAgY29uc3QgbmV4dCA9IGFjdGl2ZVxyXG4gICAgICAgID8gY3VycmVudC5maWx0ZXIoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLnR5cGUgIT09IHR5cGUpXHJcbiAgICAgICAgOiBtYXJrLmFkZFRvU2V0KGN1cnJlbnQpXHJcbiAgICAgIHJldHVybiBzdGF0ZS50ci5zZXRTdG9yZWRNYXJrcyhuZXh0KVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGJsb2NrcyA9IGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKS5maWx0ZXIoXHJcbiAgICAgIChibG9jaykgPT4gYmxvY2suZnJvbSA8IGJsb2NrLnRvICYmIGJsb2NrLm5vZGUudHlwZS5hbGxvd3NNYXJrVHlwZSh0eXBlKSxcclxuICAgIClcclxuICAgIGlmIChibG9ja3MubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYWN0aXZlID0gYmxvY2tzLmV2ZXJ5KChibG9jaykgPT5cclxuICAgICAgcmFuZ2VIYXNNYXJrKGJsb2NrLm5vZGUuY29udGVudCwgYmxvY2suZnJvbSwgYmxvY2sudG8sIHR5cGUpLFxyXG4gICAgKVxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3MpIHtcclxuICAgICAgaWYgKGFjdGl2ZSkge1xyXG4gICAgICAgIGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzV2l0aE1hcmsoYmxvY2subm9kZS5jb250ZW50LCBibG9jay5mcm9tLCBibG9jay50bywgdHlwZSkpIHtcclxuICAgICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdHIuc3RlcChuZXcgQWRkTWFya1N0ZXAoYmxvY2sucGF0aCwgYmxvY2suZnJvbSwgYmxvY2sudG8sIG1hcmspKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIENoYW5nZSBldmVyeSB0ZXh0YmxvY2sgdG91Y2hlZCBieSB0aGUgc2VsZWN0aW9uIHRvIHRoZSBnaXZlbiB0eXBlLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0QmxvY2tUeXBlKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubm9kZVR5cGUobmFtZSlcclxuICAgIGlmICghdHlwZS5pbmxpbmVDb250ZW50KSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlXHJcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKSkge1xyXG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IHR5cGUuY3JlYXRlKGF0dHJzLCBibG9jay5ub2RlLmNvbnRlbnQpXHJcbiAgICAgIGlmIChibG9jay5ub2RlLnR5cGUgPT09IHR5cGUgJiYgYXR0cnNFcShibG9jay5ub2RlLmF0dHJzLCByZXBsYWNlbWVudC5hdHRycykpIGNvbnRpbnVlXHJcbiAgICAgIHRyLnN0ZXAocmVwbGFjZU5vZGVBdChibG9jay5wYXRoLCBGcmFnbWVudC5vZihyZXBsYWNlbWVudCkpKVxyXG4gICAgICBjaGFuZ2VkID0gdHJ1ZVxyXG4gICAgfVxyXG4gICAgaWYgKCFjaGFuZ2VkKSByZXR1cm4gbnVsbFxyXG4gICAgLy8gTm9kZSByZXBsYWNlbWVudCBkZWdyYWRlcyBpbnRlcmlvciBwb3NpdGlvbnM7IHRoZSBzaGFwZSBpcyB1bmNoYW5nZWQsXHJcbiAgICAvLyBzbyB0aGUgb3JpZ2luYWwgc2VsZWN0aW9uIGlzIHN0aWxsIHZhbGlkLCByZXN0YXRlIGl0IGV4cGxpY2l0bHkuXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQXBwbHkgYSBtYXJrIHdpdGggc3BlY2lmaWMgYXR0cmlidXRlcywgcmVwbGFjaW5nIGFueSBleGlzdGluZyBtYXJrIG9mIHRoZVxyXG4gKiBzYW1lIHR5cGUgaW4gdGhlIHJhbmdlLiBVbmxpa2Uge0BsaW5rIHRvZ2dsZU1hcmt9IHRoaXMgaXMgaWRlbXBvdGVudCxcclxuICogcGlja2luZyB0aGUgc2FtZSBmb250IHNpemUgdHdpY2Uga2VlcHMgaXQgc2V0LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNldE1hcmsobmFtZTogc3RyaW5nLCBhdHRyczogQXR0cnMpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm1hcmtUeXBlKG5hbWUpXHJcbiAgICBjb25zdCBtYXJrID0gdHlwZS5jcmVhdGUoYXR0cnMpXHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuXHJcbiAgICBpZiAoc2VsZWN0aW9uLmVtcHR5ICYmIHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgc2VsZWN0aW9uLmhlYWQucGF0aClcclxuICAgICAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2sgfHwgIWJsb2NrLnR5cGUuYWxsb3dzTWFya1R5cGUodHlwZSkpIHJldHVybiBudWxsXHJcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZS5zdG9yZWRNYXJrcyA/PyBtYXJrc0F0SW5saW5lT2Zmc2V0KGJsb2NrLmNvbnRlbnQsIHNlbGVjdGlvbi5oZWFkLm9mZnNldClcclxuICAgICAgcmV0dXJuIHN0YXRlLnRyLnNldFN0b3JlZE1hcmtzKG1hcmsuYWRkVG9TZXQoY3VycmVudCkpXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYmxvY2tzID0gYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pLmZpbHRlcihcclxuICAgICAgKGJsb2NrKSA9PiBibG9jay5mcm9tIDwgYmxvY2sudG8gJiYgYmxvY2subm9kZS50eXBlLmFsbG93c01hcmtUeXBlKHR5cGUpLFxyXG4gICAgKVxyXG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrcykge1xyXG4gICAgICAvLyBDbGVhciB0aGUgb2xkIHZhbHVlIGZpcnN0IHNvIGF0dHJpYnV0ZXMgcmVwbGFjZSByYXRoZXIgdGhhbiBzdGFjay5cclxuICAgICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKSkge1xyXG4gICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgfVxyXG4gICAgICB0ci5zdGVwKG5ldyBBZGRNYXJrU3RlcChibG9jay5wYXRoLCBibG9jay5mcm9tLCBibG9jay50bywgbWFyaykpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIFJlbW92ZSBldmVyeSBtYXJrIG9mIGEgdHlwZSBmcm9tIHRoZSBzZWxlY3Rpb24gKG9yIHRoZSBzdG9yZWQgbWFya3MpLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdW5zZXRNYXJrKG5hbWU6IHN0cmluZyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubWFya1R5cGUobmFtZSlcclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG5cclxuICAgIGlmIChzZWxlY3Rpb24uZW1wdHkgJiYgc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikge1xyXG4gICAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBzZWxlY3Rpb24uaGVhZC5wYXRoKVxyXG4gICAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAgICAgY29uc3QgY3VycmVudCA9IHN0YXRlLnN0b3JlZE1hcmtzID8/IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgc2VsZWN0aW9uLmhlYWQub2Zmc2V0KVxyXG4gICAgICBjb25zdCBuZXh0ID0gY3VycmVudC5maWx0ZXIoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLnR5cGUgIT09IHR5cGUpXHJcbiAgICAgIHJldHVybiBuZXh0Lmxlbmd0aCA9PT0gY3VycmVudC5sZW5ndGggPyBudWxsIDogc3RhdGUudHIuc2V0U3RvcmVkTWFya3MobmV4dClcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKSkge1xyXG4gICAgICBpZiAoYmxvY2suZnJvbSA+PSBibG9jay50bykgY29udGludWVcclxuICAgICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKSkge1xyXG4gICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRyLmRvY0NoYW5nZWQgPyB0ciA6IG51bGxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBTdHJpcCBldmVyeSBtYXJrIGZyb20gdGhlIHNlbGVjdGlvbiAoXCJjbGVhciBmb3JtYXR0aW5nXCIpLiAqL1xyXG5leHBvcnQgY29uc3QgY2xlYXJGb3JtYXR0aW5nOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICBpZiAoYmxvY2suZnJvbSA+PSBibG9jay50bykgY29udGludWVcclxuICAgIGZvciAoY29uc3QgdHlwZSBvZiBPYmplY3QudmFsdWVzKHN0YXRlLnNjaGVtYS5tYXJrcykpIHtcclxuICAgICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKSkge1xyXG4gICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG59XHJcblxyXG4vKipcclxuICogUmVzZXQgdGhlIHBhcmFncmFwaC1sZXZlbCBsYXlvdXQ6IGFsaWdubWVudCwgaW5kZW50LCBsaW5lIGhlaWdodCBhbmRcclxuICogc3BhY2luZywgb24gZXZlcnkgYmxvY2sgaW4gdGhlIHNlbGVjdGlvbiwgbGVhdmluZyB0aGUgdGV4dCBhbmQgaXRzIG1hcmtzXHJcbiAqIGFsb25lLiBUaGUgY291bnRlcnBhcnQgb2Yge0BsaW5rIGNsZWFyRm9ybWF0dGluZ30sIHdoaWNoIHN0cmlwcyBtYXJrcyBvbmx5LlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNsZWFyQmxvY2tGb3JtYXR0aW5nOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGNvbnN0IGRlZmF1bHRzID0gYmxvY2tMYXlvdXRBdHRycygpXHJcbiAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3NJblJhbmdlKHN0YXRlLmRvYywgc3RhdGUuc2VsZWN0aW9uLmZyb20sIHN0YXRlLnNlbGVjdGlvbi50bykpIHtcclxuICAgIGNvbnN0IGF0dHJzID0gYmxvY2subm9kZS5hdHRyc1xyXG4gICAgY29uc3QgbmV4dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLmF0dHJzIH1cclxuICAgIGZvciAoY29uc3QgW25hbWUsIHNwZWNdIG9mIE9iamVjdC5lbnRyaWVzKGRlZmF1bHRzKSkge1xyXG4gICAgICBpZiAobmFtZSBpbiBuZXh0KSBuZXh0W25hbWVdID0gc3BlYy5kZWZhdWx0ID8/IG51bGxcclxuICAgIH1cclxuICAgIGlmIChhdHRyc0VxKGF0dHJzLCBuZXh0KSkgY29udGludWVcclxuICAgIHRyLnN0ZXAobmV3IFNldE5vZGVBdHRyc1N0ZXAoYmxvY2sucGF0aCwgbmV4dCkpXHJcbiAgfVxyXG4gIHJldHVybiB0ci5kb2NDaGFuZ2VkID8gdHIgOiBudWxsXHJcbn1cclxuXHJcbi8qKiBTdHJpcCBtYXJrcyBhbmQgcmVzZXQgYmxvY2sgbGF5b3V0IGluIG9uZSB1bmRvYWJsZSBzdGVwLiAqL1xyXG5leHBvcnQgY29uc3QgY2xlYXJBbGxGb3JtYXR0aW5nOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgbWFya3MgPSBjbGVhckZvcm1hdHRpbmcoc3RhdGUpXHJcbiAgY29uc3QgbGF5b3V0ID0gY2xlYXJCbG9ja0Zvcm1hdHRpbmcobWFya3MgPyBzdGF0ZS5hcHBseShtYXJrcykgOiBzdGF0ZSlcclxuICBpZiAoIW1hcmtzKSByZXR1cm4gbGF5b3V0XHJcbiAgaWYgKCFsYXlvdXQpIHJldHVybiBtYXJrc1xyXG4gIC8vIFJlbW92aW5nIG1hcmtzIGxlYXZlcyBldmVyeSBibG9jayB3aGVyZSBpdCB3YXMsIHNvIHRoZSBsYXlvdXQgc3RlcHNcclxuICAvLyBhcHBseSB1bmNoYW5nZWQgb24gdG9wIG9mIHRoZSBtYXJrIHN0ZXBzLlxyXG4gIGZvciAoY29uc3Qgc3RlcCBvZiBsYXlvdXQuc3RlcHMpIG1hcmtzLnN0ZXAoc3RlcClcclxuICByZXR1cm4gbWFya3NcclxufVxyXG5cclxuLyoqXHJcbiAqIE1lcmdlIGF0dHJpYnV0ZXMgaW50byBldmVyeSBibG9jayB0b3VjaGVkIGJ5IHRoZSBzZWxlY3Rpb24sIGtlZXBpbmcgZWFjaFxyXG4gKiBibG9jaydzIG93biB0eXBlIChhbGlnbm1lbnQgYW5kIGluZGVudCBhcHBseSB0byBoZWFkaW5ncyBhbmQgcGFyYWdyYXBoc1xyXG4gKiBhbGlrZSkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0QmxvY2tBdHRycyhhdHRyczogQXR0cnMpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICAgIGNvbnN0IG5leHQgPSB7IC4uLmJsb2NrLm5vZGUuYXR0cnMsIC4uLmF0dHJzIH1cclxuICAgICAgaWYgKGF0dHJzRXEoYmxvY2subm9kZS5hdHRycywgbmV4dCkpIGNvbnRpbnVlXHJcbiAgICAgIHRyLnN0ZXAobmV3IFNldE5vZGVBdHRyc1N0ZXAoYmxvY2sucGF0aCwgbmV4dCkpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIFNldCB0ZXh0IGFsaWdubWVudCBvbiB0aGUgc2VsZWN0ZWQgYmxvY2tzOyBgbnVsbGAgY2xlYXJzIGl0LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0VGV4dEFsaWduKGFsaWduOiAnbGVmdCcgfCAnY2VudGVyJyB8ICdyaWdodCcgfCAnanVzdGlmeScgfCBudWxsKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIHNldEJsb2NrQXR0cnMoeyBhbGlnbiB9KVxyXG59XHJcblxyXG4vKiogU3RlcCB0aGUgc2VsZWN0ZWQgYmxvY2tzJyBpbmRlbnQgYnkgYGRlbHRhYCwgY2xhbXBlZCB0byB0aGUgc2NoZW1hIHJhbmdlLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5kZW50QmxvY2tzKGRlbHRhOiBudW1iZXIpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0eXBlb2YgYmxvY2subm9kZS5hdHRycy5pbmRlbnQgPT09ICdudW1iZXInID8gYmxvY2subm9kZS5hdHRycy5pbmRlbnQgOiAwXHJcbiAgICAgIGNvbnN0IG5leHQgPSBNYXRoLm1pbihNQVhfSU5ERU5ULCBNYXRoLm1heCgwLCBjdXJyZW50ICsgZGVsdGEpKVxyXG4gICAgICBpZiAobmV4dCA9PT0gY3VycmVudCkgY29udGludWVcclxuICAgICAgdHIuc3RlcChuZXcgU2V0Tm9kZUF0dHJzU3RlcChibG9jay5wYXRoLCB7IC4uLmJsb2NrLm5vZGUuYXR0cnMsIGluZGVudDogbmV4dCB9KSlcclxuICAgIH1cclxuICAgIHJldHVybiB0ci5kb2NDaGFuZ2VkID8gdHIgOiBudWxsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogU2V0IHRoZSBsaW5lIGhlaWdodCBvbiB0aGUgc2VsZWN0ZWQgYmxvY2tzOyBgbnVsbGAgY2xlYXJzIGl0LiBBIGJhcmUgbnVtYmVyXHJcbiAqIGlzIGEgbXVsdGlwbGllciBvZiB0aGUgZm9udCBzaXplLCB3aGljaCBpcyB3aHkgaXQgaXMgc3RvcmVkIGFzLWlzIHJhdGhlclxyXG4gKiB0aGFuIG5vcm1hbGl6ZWQgdG8gYSBsZW5ndGguXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0TGluZUhlaWdodCh2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgbnVsbCk6IENvbW1hbmQge1xyXG4gIHJldHVybiBzZXRCbG9ja0F0dHJzKHsgbGluZUhlaWdodDogdmFsdWUgPT09IG51bGwgPyBudWxsIDogU3RyaW5nKHZhbHVlKSB9KVxyXG59XHJcblxyXG4vKipcclxuICogU2V0IHRoZSBzcGFjZSBhYm92ZSBhbmQvb3IgYmVsb3cgdGhlIHNlbGVjdGVkIGJsb2Nrcy4gT25seSB0aGUga2V5cyBwcmVzZW50XHJcbiAqIGluIGBvcHRzYCBhcmUgdG91Y2hlZCwgc28gc3BhY2luZyBiZWZvcmUgYW5kIGFmdGVyIGNhbiBiZSBzZXQgaW5kZXBlbmRlbnRseS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRQYXJhZ3JhcGhTcGFjaW5nKG9wdHM6IHtcclxuICBiZWZvcmU/OiBzdHJpbmcgfCBudWxsXHJcbiAgYWZ0ZXI/OiBzdHJpbmcgfCBudWxsXHJcbn0pOiBDb21tYW5kIHtcclxuICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fVxyXG4gIGlmICgnYmVmb3JlJyBpbiBvcHRzKSBhdHRycy5zcGFjZUJlZm9yZSA9IG9wdHMuYmVmb3JlID8/IG51bGxcclxuICBpZiAoJ2FmdGVyJyBpbiBvcHRzKSBhdHRycy5zcGFjZUFmdGVyID0gb3B0cy5hZnRlciA/PyBudWxsXHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4gKE9iamVjdC5rZXlzKGF0dHJzKS5sZW5ndGggPT09IDAgPyBudWxsIDogc2V0QmxvY2tBdHRycyhhdHRycykoc3RhdGUpKVxyXG59XHJcblxyXG4vKiogQXBwbHkgbGV0dGVyIHNwYWNpbmcgdG8gdGhlIHNlbGVjdGlvbjsgYG51bGxgIHJlbW92ZXMgdGhlIG1hcmsuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRMZXR0ZXJTcGFjaW5nKHNwYWNpbmc6IHN0cmluZyB8IG51bGwpOiBDb21tYW5kIHtcclxuICByZXR1cm4gc3BhY2luZyA9PT0gbnVsbCA/IHVuc2V0TWFyaygnbGV0dGVyU3BhY2luZycpIDogc2V0TWFyaygnbGV0dGVyU3BhY2luZycsIHsgc3BhY2luZyB9KVxyXG59XHJcblxyXG4vKiogVG9nZ2xlIHNtYWxsIGNhcHMgb24gdGhlIHNlbGVjdGlvbi4gKi9cclxuZXhwb3J0IGNvbnN0IHRvZ2dsZVNtYWxsQ2FwczogQ29tbWFuZCA9IHRvZ2dsZU1hcmsoJ3NtYWxsQ2FwcycpXHJcblxyXG4vKiogSG93IHtAbGluayBjb252ZXJ0Q2FzZX0gcmV3cml0ZXMgdGhlIHNlbGVjdGVkIHRleHQuICovXHJcbmV4cG9ydCB0eXBlIENhc2VNb2RlID0gJ3VwcGVyJyB8ICdsb3dlcicgfCAndGl0bGUnXHJcblxyXG5jb25zdCBXT1JEX0NIQVJBQ1RFUiA9IC9bXFxwe0x9XFxwe059J10vdVxyXG5cclxuLyoqXHJcbiAqIFJld3JpdGUgdGhlIGNhc2Ugb2YgdGhlIHNlbGVjdGVkIHRleHQuIEVhY2ggdGV4dCBub2RlIGlzIHJlcGxhY2VkIHdpdGggYVxyXG4gKiBzYW1lLWxlbmd0aCBub2RlIGJ1aWx0IGJ5IHtAbGluayBUZXh0Tm9kZS53aXRoVGV4dH0sIHNvIGV2ZXJ5IG5vZGUga2VlcHNcclxuICogZXhhY3RseSB0aGUgbWFya3MgaXQgaGFkLiBBIGJvbGQgcnVuIHN0YXlzIGJvbGQuIFRpdGxlIGNhc2UgdGhyZWFkcyBhXHJcbiAqIFwibWlkLXdvcmRcIiBmbGFnIGFjcm9zcyBub2RlIGFuZCBibG9jayBib3VuZGFyaWVzIHNvIGEgd29yZCBzcGxpdCBieSBhIG1hcmtcclxuICogYm91bmRhcnkgaXMgbm90IGNhcGl0YWxpemVkIHR3aWNlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRDYXNlKG1vZGU6IENhc2VNb2RlKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBpZiAoc2VsZWN0aW9uLmVtcHR5KSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYmxvY2tzID0gYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pLmZpbHRlcihcclxuICAgICAgKGJsb2NrKSA9PiBibG9jay5mcm9tIDwgYmxvY2sudG8sXHJcbiAgICApXHJcbiAgICBpZiAoYmxvY2tzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAvLyBDYXJyaWVkIGFjcm9zcyB0aGUgdGV4dCBub2RlcyB3aXRoaW4gYSBibG9jazogd2FzIHRoZSBwcmV2aW91c1xyXG4gICAgLy8gY2hhcmFjdGVyIHBhcnQgb2YgYSB3b3JkPyBPbmx5IG1lYW5pbmdmdWwgZm9yIHRpdGxlIGNhc2UuIEl0IHJlc2V0cyBhdFxyXG4gICAgLy8gZXZlcnkgYmxvY2ssIHNpbmNlIGEgYmxvY2sgYm91bmRhcnkgYWx3YXlzIGVuZHMgYSB3b3JkLlxyXG4gICAgbGV0IGluV29yZCA9IGZhbHNlXHJcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlXHJcbiAgICAvLyBDYXNlIG1hcHBpbmcgaXMgYWxtb3N0IGFsd2F5cyBsZW5ndGgtcHJlc2VydmluZywgYnV0IG5vdCB1bml2ZXJzYWxseVxyXG4gICAgLy8gKEdlcm1hbiBcIlx1MDBERlwiIHVwcGVyY2FzZXMgdG8gXCJTU1wiKS4gVHJhY2sgdGhlIGRyaWZ0IHNvIHRoZSBzZWxlY3Rpb24gaXNcclxuICAgIC8vIG9ubHkgcmVzdGF0ZWQgdmVyYmF0aW0gd2hlbiBpdCByZWFsbHkgaXMgc3RpbGwgdmFsaWQuXHJcbiAgICBsZXQgbGVuZ3RoRGVsdGEgPSAwXHJcblxyXG4gICAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3MpIHtcclxuICAgICAgY29uc3Qgc2xpY2UgPSBzbGljZUlubGluZShibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvKVxyXG4gICAgICBjb25zdCBvdXQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgICAgIGxldCBibG9ja0NoYW5nZWQgPSBmYWxzZVxyXG4gICAgICBpbldvcmQgPSBmYWxzZVxyXG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHNsaWNlLmNoaWxkcmVuKSB7XHJcbiAgICAgICAgaWYgKCFjaGlsZC5pc1RleHQpIHtcclxuICAgICAgICAgIG91dC5wdXNoKGNoaWxkKVxyXG4gICAgICAgICAgaW5Xb3JkID0gZmFsc2VcclxuICAgICAgICAgIGNvbnRpbnVlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IG5vZGUgPSBjaGlsZCBhcyBUZXh0Tm9kZVxyXG4gICAgICAgIGNvbnN0IG5leHQgPSBjb252ZXJ0VGV4dChub2RlLnRleHQsIG1vZGUsIGluV29yZClcclxuICAgICAgICBpbldvcmQgPSBuZXh0LmluV29yZFxyXG4gICAgICAgIGlmIChuZXh0LnRleHQgIT09IG5vZGUudGV4dCkgYmxvY2tDaGFuZ2VkID0gdHJ1ZVxyXG4gICAgICAgIG91dC5wdXNoKG5vZGUud2l0aFRleHQobmV4dC50ZXh0KSlcclxuICAgICAgICBsZW5ndGhEZWx0YSArPSBuZXh0LnRleHQubGVuZ3RoIC0gbm9kZS50ZXh0Lmxlbmd0aFxyXG4gICAgICB9XHJcbiAgICAgIGlmICghYmxvY2tDaGFuZ2VkKSBjb250aW51ZVxyXG4gICAgICBjaGFuZ2VkID0gdHJ1ZVxyXG4gICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChibG9jay5wYXRoLCBibG9jay5mcm9tLCBibG9jay50bywgRnJhZ21lbnQuZnJvbShvdXQpKSlcclxuICAgIH1cclxuICAgIGlmICghY2hhbmdlZCkgcmV0dXJuIG51bGxcclxuICAgIC8vIExlbmd0aC1mb3ItbGVuZ3RoIGluIHRoZSBjb21tb24gY2FzZSwgc28gdGhlIG9yaWdpbmFsIHJhbmdlIHN0aWxsIHNwYW5zXHJcbiAgICAvLyBleGFjdGx5IHRoZSB0ZXh0IHRoZSB1c2VyIGhhZCBzZWxlY3RlZC4gV2hlbiBhIGNhc2UgbWFwcGluZyBkaWQgY2hhbmdlXHJcbiAgICAvLyB0aGUgbGVuZ3RoLCBsZXQgdGhlIHN0ZXBzIG1hcCB0aGUgc2VsZWN0aW9uIGluc3RlYWQgb2YgZm9yY2luZyBhIHJhbmdlXHJcbiAgICAvLyB0aGF0IG5vIGxvbmdlciBleGlzdHMuXHJcbiAgICBpZiAobGVuZ3RoRGVsdGEgPT09IDApIHRyLnNldFNlbGVjdGlvbihzZWxlY3Rpb24pXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbn1cclxuXHJcbi8qKiBDYXNlLWNvbnZlcnQgb25lIHJ1biwgcmVwb3J0aW5nIHdoZXRoZXIgaXQgZW5kZWQgbWlkLXdvcmQuICovXHJcbmZ1bmN0aW9uIGNvbnZlcnRUZXh0KFxyXG4gIHRleHQ6IHN0cmluZyxcclxuICBtb2RlOiBDYXNlTW9kZSxcclxuICBzdGFydHNJbldvcmQ6IGJvb2xlYW4sXHJcbik6IHsgdGV4dDogc3RyaW5nOyBpbldvcmQ6IGJvb2xlYW4gfSB7XHJcbiAgaWYgKG1vZGUgPT09ICd1cHBlcicpIHJldHVybiB7IHRleHQ6IHRleHQudG9VcHBlckNhc2UoKSwgaW5Xb3JkOiBmYWxzZSB9XHJcbiAgaWYgKG1vZGUgPT09ICdsb3dlcicpIHJldHVybiB7IHRleHQ6IHRleHQudG9Mb3dlckNhc2UoKSwgaW5Xb3JkOiBmYWxzZSB9XHJcbiAgbGV0IGluV29yZCA9IHN0YXJ0c0luV29yZFxyXG4gIGxldCBvdXQgPSAnJ1xyXG4gIGZvciAoY29uc3QgY2hhcmFjdGVyIG9mIHRleHQpIHtcclxuICAgIGNvbnN0IGlzV29yZCA9IFdPUkRfQ0hBUkFDVEVSLnRlc3QoY2hhcmFjdGVyKVxyXG4gICAgb3V0ICs9IGlzV29yZCAmJiAhaW5Xb3JkID8gY2hhcmFjdGVyLnRvVXBwZXJDYXNlKCkgOiBjaGFyYWN0ZXIudG9Mb3dlckNhc2UoKVxyXG4gICAgaW5Xb3JkID0gaXNXb3JkXHJcbiAgfVxyXG4gIHJldHVybiB7IHRleHQ6IG91dCwgaW5Xb3JkIH1cclxufVxyXG5cclxuLyoqIFNwbGl0IHRoZSBjdXJyZW50IHRleHRibG9jayBhdCB0aGUgY3Vyc29yIChFbnRlcikuICovXHJcbi8qKlxyXG4gKiBFbnRlciBpbnNpZGUgYSBibG9jayB0aGF0IHByZXNlcnZlcyB3aGl0ZXNwYWNlLCBhIGNvZGUgYmxvY2ssIGluc2VydHMgYVxyXG4gKiBuZXdsaW5lIHJhdGhlciB0aGFuIHNwbGl0dGluZyBpdDsgaG9sZGluZyBtdWx0aS1saW5lIHRleHQgaXMgdGhlIHdob2xlXHJcbiAqIHBvaW50IG9mIHN1Y2ggYSBibG9jay4gVHdvIHRyYWlsaW5nIG5ld2xpbmVzIGVzY2FwZSBpdCBpbnN0ZWFkLCBzbyB0aGVcclxuICogdXNlciBpcyBuZXZlciB0cmFwcGVkOiB0aGUgYmxhbmsgbGluZSBpcyBkcm9wcGVkIGFuZCBhIHBhcmFncmFwaCBmb2xsb3dzLlxyXG4gKi9cclxuLyoqIFR3byBzcGFjZXM6IG5hcnJvdyBlbm91Z2ggdGhhdCBkZWVwbHkgbmVzdGVkIGNvZGUgc3RpbGwgZml0cyBhIGNvbHVtbi4gKi9cclxuY29uc3QgQ09ERV9JTkRFTlQgPSAnICAnXHJcblxyXG4vKiogQnJhY2tldHMgdGhlIGVkaXRvciBjbG9zZXMgZm9yIHlvdSwgYW5kIHdoYXQgY2xvc2VzIHRoZW0uICovXHJcbmNvbnN0IENPREVfQlJBQ0tFVFM6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoW1xyXG4gIFsnKCcsICcpJ10sXHJcbiAgWydbJywgJ10nXSxcclxuICBbJ3snLCAnfSddLFxyXG5dKVxyXG5jb25zdCBDT0RFX1FVT1RFUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoWydcIicsIFwiJ1wiLCAnYCddKVxyXG4vKiogRXZlcnkgY2hhcmFjdGVyIHRoYXQgb3BlbnMgYSBwYWlyLCBtYXBwZWQgdG8gaXRzIGNsb3Nlci4gKi9cclxuY29uc3QgQ09ERV9QQUlSUzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcChbXHJcbiAgLi4uQ09ERV9CUkFDS0VUUyxcclxuICAuLi5bLi4uQ09ERV9RVU9URVNdLm1hcCgocXVvdGUpOiBbc3RyaW5nLCBzdHJpbmddID0+IFtxdW90ZSwgcXVvdGVdKSxcclxuXSlcclxuY29uc3QgQ09ERV9DTE9TRVJTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChDT0RFX1BBSVJTLnZhbHVlcygpKVxyXG4vKipcclxuICogQSBwYWlyIG9ubHkgY2xvc2VzIGl0c2VsZiBiZWZvcmUgb25lIG9mIHRoZXNlLCBvciBhdCB0aGUgZW5kIG9mIGEgbGluZTogaW5cclxuICogdGhlIG1pZGRsZSBvZiBhIHdvcmQgdGhlIHVzZXIgaXMgZWRpdGluZyBleGlzdGluZyBjb2RlLCBub3Qgb3BlbmluZyBhIGdyb3VwLlxyXG4gKi9cclxuY29uc3QgQ0xPU0VfQkVGT1JFOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXHJcbiAgJzsnLFxyXG4gICc6JyxcclxuICAnLicsXHJcbiAgJywnLFxyXG4gICc9JyxcclxuICAnKScsXHJcbiAgJ10nLFxyXG4gICd9JyxcclxuICAnPicsXHJcbiAgJyAnLFxyXG4gICdcXHQnLFxyXG4gICdcXG4nLFxyXG5dKVxyXG5jb25zdCBDT0RFX1dPUkQgPSAvW1xccHtMfVxccHtOfV8kXS91XHJcblxyXG4vKiogVGhlIHdoaXRlc3BhY2UgYSBsaW5lIGJlZ2lucyB3aXRoLCBpbiBmdWxsLiAqL1xyXG5mdW5jdGlvbiBsaW5lSW5kZW50YXRpb24odGV4dDogc3RyaW5nLCBsaW5lU3RhcnQ6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgbGV0IGVuZCA9IGxpbmVTdGFydFxyXG4gIHdoaWxlIChlbmQgPCB0ZXh0Lmxlbmd0aCAmJiAodGV4dFtlbmRdID09PSAnICcgfHwgdGV4dFtlbmRdID09PSAnXFx0JykpIGVuZCsrXHJcbiAgcmV0dXJuIHRleHQuc2xpY2UobGluZVN0YXJ0LCBlbmQpXHJcbn1cclxuXHJcbi8qKiBUaGUgcHJlZm9ybWF0dGVkIHRleHRibG9jayBob2xkaW5nIGEgc2luZ2xlLWJsb2NrIHNlbGVjdGlvbiwgb3IgbnVsbC4gKi9cclxuZnVuY3Rpb24gcHJlZm9ybWF0dGVkQXQoc3RhdGU6IEVkaXRvclN0YXRlKTogRWRpdG9yTm9kZSB8IG51bGwge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2sgfHwgIWJsb2NrLnR5cGUuc3BlYy5wcmVzZXJ2ZVdoaXRlc3BhY2UpIHJldHVybiBudWxsXHJcbiAgLy8gQSBzZWxlY3Rpb24gc3Bhbm5pbmcgdHdvIGJsb2NrcyBpcyBub3QgYW4gaW5kZW50IGdlc3R1cmUuXHJcbiAgaWYgKCFwYXRoc0VxdWFsKHNlbGVjdGlvbi5mcm9tLnBhdGgsIHNlbGVjdGlvbi50by5wYXRoKSkgcmV0dXJuIG51bGxcclxuICByZXR1cm4gYmxvY2tcclxufVxyXG5cclxuLyoqIEluc2VydCBsaXRlcmFsIHRleHQgYXQgYW4gb2Zmc2V0IGluc2lkZSBvbmUgdGV4dGJsb2NrLiAqL1xyXG5mdW5jdGlvbiBpbnNlcnRBdChcclxuICB0cjogVHJhbnNhY3Rpb24sXHJcbiAgc3RhdGU6IEVkaXRvclN0YXRlLFxyXG4gIHBhdGg6IHJlYWRvbmx5IG51bWJlcltdLFxyXG4gIG9mZnNldDogbnVtYmVyLFxyXG4gIHRleHQ6IHN0cmluZyxcclxuKTogdm9pZCB7XHJcbiAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAocGF0aCwgb2Zmc2V0LCBvZmZzZXQsIEZyYWdtZW50LmZyb20oW3N0YXRlLnNjaGVtYS50ZXh0KHRleHQpXSkpKVxyXG59XHJcblxyXG4vKiogT2Zmc2V0cyBvZiBldmVyeSBsaW5lIHN0YXJ0IHdpdGhpbiBgW2Zyb20sIHRvXWAuICovXHJcbmZ1bmN0aW9uIGxpbmVTdGFydHModGV4dDogc3RyaW5nLCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiBudW1iZXJbXSB7XHJcbiAgY29uc3Qgc3RhcnRzID0gW2Zyb21dXHJcbiAgZm9yIChsZXQgaW5kZXggPSBmcm9tOyBpbmRleCA8IHRvOyBpbmRleCsrKSB7XHJcbiAgICBpZiAodGV4dFtpbmRleF0gPT09ICdcXG4nKSBzdGFydHMucHVzaChpbmRleCArIDEpXHJcbiAgfVxyXG4gIHJldHVybiBzdGFydHNcclxufVxyXG5cclxuLyoqIEhvdyBtdWNoIGluZGVudCBhIGxpbmUgYmVnaW5zIHdpdGgsIGNhcHBlZCBhdCBvbmUgbGV2ZWwuICovXHJcbmZ1bmN0aW9uIGxlYWRpbmdJbmRlbnQodGV4dDogc3RyaW5nLCBzdGFydDogbnVtYmVyKTogbnVtYmVyIHtcclxuICBpZiAodGV4dFtzdGFydF0gPT09ICdcXHQnKSByZXR1cm4gMVxyXG4gIGxldCBzcGFjZXMgPSAwXHJcbiAgd2hpbGUgKHNwYWNlcyA8IENPREVfSU5ERU5ULmxlbmd0aCAmJiB0ZXh0W3N0YXJ0ICsgc3BhY2VzXSA9PT0gJyAnKSBzcGFjZXMrK1xyXG4gIHJldHVybiBzcGFjZXNcclxufVxyXG5cclxuLyoqXHJcbiAqIFRhYiBpbnNpZGUgYSBjb2RlIGJsb2NrOiBpbnNlcnQgYW4gaW5kZW50LCBvciBpbmRlbnQgZXZlcnkgbGluZSB0aGVcclxuICogc2VsZWN0aW9uIHRvdWNoZXMuXHJcbiAqXHJcbiAqIERlY2xpbmVzIG91dHNpZGUgYSBwcmVmb3JtYXR0ZWQgYmxvY2ssIHNvIFRhYiBrZWVwcyBpdHMgbGlzdCBiZWhhdmlvdXIgYW5kXHJcbiAqIGl0cyBmb2N1cy1tb3ZlbWVudCBmYWxsYmFjayBldmVyeXdoZXJlIGVsc2UuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaW5kZW50SW5QcmVmb3JtYXR0ZWQ6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBibG9jayA9IHByZWZvcm1hdHRlZEF0KHN0YXRlKVxyXG4gIGlmICghYmxvY2spIHJldHVybiBudWxsXHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uIGFzIFRleHRTZWxlY3Rpb25cclxuICBjb25zdCB0ZXh0ID0gYmxvY2sudGV4dENvbnRlbnRcclxuICBjb25zdCBwYXRoID0gc2VsZWN0aW9uLmZyb20ucGF0aFxyXG5cclxuICAvLyBBIGNhcmV0LCBvciBhIHNlbGVjdGlvbiBpbnNpZGUgb25lIGxpbmU6IHBsYWluIGluc2VydGlvbi5cclxuICBpZiAoIXRleHQuc2xpY2Uoc2VsZWN0aW9uLmZyb20ub2Zmc2V0LCBzZWxlY3Rpb24udG8ub2Zmc2V0KS5pbmNsdWRlcygnXFxuJykpIHtcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGlmICghc2VsZWN0aW9uLmVtcHR5KSBkZWxldGVSYW5nZSh0ciwgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICAgIGNvbnN0IGF0ID0gdHIubWFwUG9zaXRpb24oc2VsZWN0aW9uLmZyb20sIC0xKVxyXG4gICAgaW5zZXJ0QXQodHIsIHN0YXRlLCBhdC5wYXRoLCBhdC5vZmZzZXQsIENPREVfSU5ERU5UKVxyXG4gICAgcmV0dXJuIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoYXQucGF0aCwgYXQub2Zmc2V0ICsgQ09ERV9JTkRFTlQubGVuZ3RoKSkpXHJcbiAgfVxyXG5cclxuICAvLyBNdWx0aS1saW5lOiBpbmRlbnQgZWFjaCBsaW5lLCBiYWNrIHRvIGZyb250IHNvIGVhcmxpZXIgb2Zmc2V0cyBzdGF5IHZhbGlkLlxyXG4gIGNvbnN0IGZpcnN0TGluZSA9IHRleHQubGFzdEluZGV4T2YoJ1xcbicsIHNlbGVjdGlvbi5mcm9tLm9mZnNldCAtIDEpICsgMVxyXG4gIGNvbnN0IGxhc3RCcmVhayA9IHRleHQuaW5kZXhPZignXFxuJywgc2VsZWN0aW9uLnRvLm9mZnNldClcclxuICBjb25zdCBzdGFydHMgPSBsaW5lU3RhcnRzKHRleHQsIGZpcnN0TGluZSwgbGFzdEJyZWFrID09PSAtMSA/IHRleHQubGVuZ3RoIDogbGFzdEJyZWFrKVxyXG5cclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgZm9yIChjb25zdCBzdGFydCBvZiBbLi4uc3RhcnRzXS5yZXZlcnNlKCkpIGluc2VydEF0KHRyLCBzdGF0ZSwgcGF0aCwgc3RhcnQsIENPREVfSU5ERU5UKVxyXG5cclxuICByZXR1cm4gdHIuc2V0U2VsZWN0aW9uKFxyXG4gICAgbmV3IFRleHRTZWxlY3Rpb24oXHJcbiAgICAgIHBvcyhwYXRoLCBzZWxlY3Rpb24uZnJvbS5vZmZzZXQgKyBDT0RFX0lOREVOVC5sZW5ndGgpLFxyXG4gICAgICBwb3MocGF0aCwgc2VsZWN0aW9uLnRvLm9mZnNldCArIENPREVfSU5ERU5ULmxlbmd0aCAqIHN0YXJ0cy5sZW5ndGgpLFxyXG4gICAgKSxcclxuICApXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTaGlmdC1UYWIgaW5zaWRlIGEgY29kZSBibG9jazogcmVtb3ZlIG9uZSBpbmRlbnQgbGV2ZWwgZnJvbSBldmVyeSBsaW5lIHRoZVxyXG4gKiBzZWxlY3Rpb24gdG91Y2hlcy4gTGluZXMgd2l0aCBubyBsZWFkaW5nIHdoaXRlc3BhY2UgYXJlIGxlZnQgYWxvbmUgcmF0aGVyXHJcbiAqIHRoYW4gZWF0aW5nIGludG8gdGhlaXIgdGV4dCwgYW5kIGEgc2VsZWN0aW9uIHdpdGggbm90aGluZyB0byBvdXRkZW50XHJcbiAqIGRlY2xpbmVzIHNvIHRoZSBiaW5kaW5nIGNhbiBmYWxsIHRocm91Z2guXHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgb3V0ZGVudEluUHJlZm9ybWF0dGVkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgYmxvY2sgPSBwcmVmb3JtYXR0ZWRBdChzdGF0ZSlcclxuICBpZiAoIWJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvbiBhcyBUZXh0U2VsZWN0aW9uXHJcbiAgY29uc3QgdGV4dCA9IGJsb2NrLnRleHRDb250ZW50XHJcbiAgY29uc3QgcGF0aCA9IHNlbGVjdGlvbi5mcm9tLnBhdGhcclxuXHJcbiAgY29uc3QgZmlyc3RMaW5lID0gdGV4dC5sYXN0SW5kZXhPZignXFxuJywgc2VsZWN0aW9uLmZyb20ub2Zmc2V0IC0gMSkgKyAxXHJcbiAgY29uc3QgbGFzdEJyZWFrID0gdGV4dC5pbmRleE9mKCdcXG4nLCBzZWxlY3Rpb24udG8ub2Zmc2V0KVxyXG4gIGNvbnN0IHN0YXJ0cyA9IGxpbmVTdGFydHModGV4dCwgZmlyc3RMaW5lLCBsYXN0QnJlYWsgPT09IC0xID8gdGV4dC5sZW5ndGggOiBsYXN0QnJlYWspXHJcblxyXG4gIC8vIE1lYXN1cmVkIGJlZm9yZSBhbnl0aGluZyBpcyByZW1vdmVkLCBzbyB0aGUgb2Zmc2V0cyBhbGwgcmVmZXIgdG8gb25lIHRleHQuXHJcbiAgY29uc3QgY3V0cyA9IHN0YXJ0c1xyXG4gICAgLm1hcCgoc3RhcnQpID0+ICh7IHN0YXJ0LCBsZW5ndGg6IGxlYWRpbmdJbmRlbnQodGV4dCwgc3RhcnQpIH0pKVxyXG4gICAgLmZpbHRlcigoY3V0KSA9PiBjdXQubGVuZ3RoID4gMClcclxuICBpZiAoY3V0cy5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcblxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICBmb3IgKGNvbnN0IGN1dCBvZiBbLi4uY3V0c10ucmV2ZXJzZSgpKSB7XHJcbiAgICBkZWxldGVSYW5nZSh0ciwgcG9zKHBhdGgsIGN1dC5zdGFydCksIHBvcyhwYXRoLCBjdXQuc3RhcnQgKyBjdXQubGVuZ3RoKSlcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlbW92ZWRCZWZvcmUgPSBjdXRzXHJcbiAgICAuZmlsdGVyKChjdXQpID0+IGN1dC5zdGFydCA8IHNlbGVjdGlvbi5mcm9tLm9mZnNldClcclxuICAgIC5yZWR1Y2UoKHRvdGFsLCBjdXQpID0+IHRvdGFsICsgY3V0Lmxlbmd0aCwgMClcclxuICBjb25zdCByZW1vdmVkVG90YWwgPSBjdXRzLnJlZHVjZSgodG90YWwsIGN1dCkgPT4gdG90YWwgKyBjdXQubGVuZ3RoLCAwKVxyXG4gIGNvbnN0IGZyb20gPSBNYXRoLm1heChmaXJzdExpbmUsIHNlbGVjdGlvbi5mcm9tLm9mZnNldCAtIHJlbW92ZWRCZWZvcmUpXHJcbiAgY29uc3QgdG8gPSBNYXRoLm1heChmcm9tLCBzZWxlY3Rpb24udG8ub2Zmc2V0IC0gcmVtb3ZlZFRvdGFsKVxyXG4gIHJldHVybiB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBhdGgsIGZyb20pLCBwb3MocGF0aCwgdG8pKSlcclxufVxyXG5cclxuLyoqXHJcbiAqIFdoZXJlIHRoZSBsYXN0IG5ld2xpbmUgdGhpcyBjb21tYW5kIGluc2VydGVkIGxlZnQgdGhlIGNhcmV0LlxyXG4gKlxyXG4gKiBEZWxpYmVyYXRlbHkgbW9kdWxlIHN0YXRlIHJhdGhlciB0aGFuIGVkaXRvciBzdGF0ZTogaXQgaXMgYSB0cmFuc2llbnRcclxuICoga2V5Ym9hcmQgZ2VzdHVyZSwgYW5kIG5laXRoZXIgdGhlIGRvY3VtZW50IG5vciB0aGUgaGlzdG9yeSBzaG91bGQgZXZlclxyXG4gKiBzZWUgaXQuIEEgY2FyZXQgdGhhdCBtb3ZlcyBmb3IgYW55IG90aGVyIHJlYXNvbiBzdHJhbmRzIHRoZSBtYXJrZXIsXHJcbiAqIHdoaWNoIGlzIGV4YWN0bHkgcmlnaHQuIFRoZSBnZXN0dXJlIGhhcyBiZWVuIGludGVycnVwdGVkLlxyXG4gKi9cclxubGV0IGxhc3ROZXdsaW5lOiB7IHBhdGg6IHJlYWRvbmx5IG51bWJlcltdOyBvZmZzZXQ6IG51bWJlciB9IHwgbnVsbCA9IG51bGxcclxuXHJcbmV4cG9ydCBjb25zdCBzcGxpdEJsb2NrSW5QcmVmb3JtYXR0ZWQ6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrIHx8ICFibG9jay50eXBlLnNwZWMucHJlc2VydmVXaGl0ZXNwYWNlKSByZXR1cm4gbnVsbFxyXG5cclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIGRlbGV0ZVJhbmdlKHRyLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKVxyXG5cclxuICBjb25zdCBwb2ludCA9IHRyLm1hcFBvc2l0aW9uKHNlbGVjdGlvbi5mcm9tLCAtMSlcclxuICBjb25zdCBjdXJyZW50ID0gbm9kZUF0UGF0aCh0ci5kb2MsIHBvaW50LnBhdGgpXHJcbiAgaWYgKCFjdXJyZW50KSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHRleHQgPSBjdXJyZW50LnRleHRDb250ZW50XHJcbiAgY29uc3QgYXRFbmQgPSBwb2ludC5vZmZzZXQgPT09IGlubGluZUxlbmd0aChjdXJyZW50LmNvbnRlbnQpXHJcblxyXG4gIC8vIEVudGVyIGF0IHRoZSBlbmQgb2YgYSBibGFuayBsaW5lIHRoZSB1c2VyIGp1c3QgY3JlYXRlZCBsZWF2ZXMgdGhlIGJsb2NrLlxyXG4gIC8vXHJcbiAgLy8gVGhlIGRvY3VtZW50IGNhbm5vdCB0ZWxsIFwiYXJyaXZlZCBvbiBhIGJsYW5rIGxpbmVcIiBmcm9tIFwibWFkZSB0aGlzIGJsYW5rXHJcbiAgLy8gbGluZVwiLCBib3RoIGFyZSBhIG5ld2xpbmUgYmVmb3JlIHRoZSBjYXJldCwgYnV0IG9ubHkgdGhlIHNlY29uZCBpcyBhXHJcbiAgLy8gcmVxdWVzdCB0byBsZWF2ZS4gU28gdGhlIGdlc3R1cmUgaXMgdHdvICpjb25zZWN1dGl2ZSogRW50ZXJzLCB0cmFja2VkIGJ5XHJcbiAgLy8gd2hlcmUgdGhlIGxhc3Qgb25lIHB1dCB0aGUgY2FyZXQuIEJsYW5rIG1lYW5zIG5vdGhpbmcgYnV0IGluZGVudGF0aW9uOlxyXG4gIC8vIHRoZSBhdXRvLWluZGVudCBiZWxvdyBsZWF2ZXMgc3BhY2VzIG9uIGEgbGluZSBub2JvZHkgaGFzIHR5cGVkIG9uLlxyXG4gIGNvbnN0IGxpbmVTdGFydCA9IHRleHQubGFzdEluZGV4T2YoJ1xcbicsIHBvaW50Lm9mZnNldCAtIDEpICsgMVxyXG4gIGNvbnN0IG9uQmxhbmtMaW5lID0gbGluZVN0YXJ0ID4gMCAmJiAvXlsgXFx0XSokLy50ZXN0KHRleHQuc2xpY2UobGluZVN0YXJ0LCBwb2ludC5vZmZzZXQpKVxyXG4gIGNvbnN0IGNvbnNlY3V0aXZlID1cclxuICAgIGxhc3ROZXdsaW5lICE9PSBudWxsICYmXHJcbiAgICBsYXN0TmV3bGluZS5vZmZzZXQgPT09IHBvaW50Lm9mZnNldCAmJlxyXG4gICAgcGF0aHNFcXVhbChsYXN0TmV3bGluZS5wYXRoLCBwb2ludC5wYXRoKVxyXG5cclxuICBpZiAoYXRFbmQgJiYgb25CbGFua0xpbmUgJiYgY29uc2VjdXRpdmUpIHtcclxuICAgIGNvbnN0IHBhcmFncmFwaCA9IHN0YXRlLnNjaGVtYS5ub2Rlcy5wYXJhZ3JhcGhcclxuICAgIGlmIChwYXJhZ3JhcGgpIHtcclxuICAgICAgLy8gRHJvcCB0aGUgbmV3bGluZSB0aGF0IG9wZW5lZCB0aGUgYmxhbmsgbGluZSwgaW5kZW50YXRpb24gYW5kIGFsbCwgc29cclxuICAgICAgLy8gZXNjYXBpbmcgbGVhdmVzIHRoZSBjb2RlIGV4YWN0bHkgYXMgaXQgd2FzLlxyXG4gICAgICBkZWxldGVSYW5nZSh0ciwgcG9zKHBvaW50LnBhdGgsIGxpbmVTdGFydCAtIDEpLCBwb2ludClcclxuICAgICAgY29uc3QgZW5kID0gdHIubWFwUG9zaXRpb24ocG9pbnQsIC0xKVxyXG4gICAgICB0ci5zdGVwKG5ldyBTcGxpdE5vZGVTdGVwKGVuZC5wYXRoLCBlbmQub2Zmc2V0LCBwYXJhZ3JhcGgubmFtZSkpXHJcbiAgICAgIGNvbnN0IHBhcmVudFBhdGggPSBlbmQucGF0aC5zbGljZSgwLCAtMSlcclxuICAgICAgY29uc3QgaW5kZXggPSBlbmQucGF0aFtlbmQucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhbLi4ucGFyZW50UGF0aCwgaW5kZXggKyAxXSwgMCkpKVxyXG4gICAgICBsYXN0TmV3bGluZSA9IG51bGxcclxuICAgICAgcmV0dXJuIHRyXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBUaGUgbmV3IGxpbmUga2VlcHMgdGhlIGN1cnJlbnQgbGluZSdzIGluZGVudGF0aW9uLCB0aGUgd2F5IGEgY29kZSBlZGl0b3JcclxuICAvLyBkb2VzLiBBZnRlciBhbiBvcGVuaW5nIGJyYWNrZXQgaXQgZ29lcyBvbmUgbGV2ZWwgZGVlcGVyOyBhbmQgd2l0aCB0aGVcclxuICAvLyBjYXJldCBiZXR3ZWVuIGEgYnJhY2tldCBhbmQgaXRzIGNsb3NlciwgdGhlIGNsb3NlciBtb3ZlcyB0byBhIGxpbmUgb2YgaXRzXHJcbiAgLy8gb3duIGJlbG93LCBzbyBge3x9YCBvcGVucyBpbnRvIGEgYmxvY2sgd2l0aCB0aGUgY2FyZXQgaW5zaWRlIGl0LlxyXG4gIGNvbnN0IGluZGVudCA9IGxpbmVJbmRlbnRhdGlvbih0ZXh0LCBsaW5lU3RhcnQpXHJcbiAgY29uc3QgYmVmb3JlID0gdGV4dFtwb2ludC5vZmZzZXQgLSAxXVxyXG4gIGNvbnN0IGNsb3NlciA9IGJlZm9yZSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogQ09ERV9CUkFDS0VUUy5nZXQoYmVmb3JlKVxyXG4gIGNvbnN0IGRlZXBlciA9IGNsb3NlciAhPT0gdW5kZWZpbmVkXHJcbiAgY29uc3Qgb3BlbnNCbG9jayA9IGRlZXBlciAmJiB0ZXh0W3BvaW50Lm9mZnNldF0gPT09IGNsb3NlclxyXG4gIGNvbnN0IGluc2VydGVkID0gYFxcbiR7aW5kZW50fSR7ZGVlcGVyID8gQ09ERV9JTkRFTlQgOiAnJ31gXHJcbiAgY29uc3QgdHJhaWxpbmcgPSBvcGVuc0Jsb2NrID8gYFxcbiR7aW5kZW50fWAgOiAnJ1xyXG4gIHRyLnN0ZXAoXHJcbiAgICBuZXcgUmVwbGFjZUlubGluZVN0ZXAoXHJcbiAgICAgIHBvaW50LnBhdGgsXHJcbiAgICAgIHBvaW50Lm9mZnNldCxcclxuICAgICAgcG9pbnQub2Zmc2V0LFxyXG4gICAgICBGcmFnbWVudC5mcm9tKFtzdGF0ZS5zY2hlbWEudGV4dChpbnNlcnRlZCArIHRyYWlsaW5nKV0pLFxyXG4gICAgKSxcclxuICApXHJcbiAgY29uc3QgY2FyZXQgPSBwb2ludC5vZmZzZXQgKyBpbnNlcnRlZC5sZW5ndGhcclxuICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBvaW50LnBhdGgsIGNhcmV0KSkpXHJcbiAgLy8gUmVtZW1iZXIgd2hlcmUgdGhpcyBuZXdsaW5lIGxlZnQgdGhlIGNhcmV0LCBzbyBhbiBpbW1lZGlhdGVseSBmb2xsb3dpbmdcclxuICAvLyBFbnRlciBpcyByZWNvZ25pc2VkIGFzIHRoZSBzZWNvbmQgaGFsZiBvZiB0aGUgZXNjYXBlIGdlc3R1cmUuXHJcbiAgbGFzdE5ld2xpbmUgPSB7IHBhdGg6IHBvaW50LnBhdGgsIG9mZnNldDogY2FyZXQgfVxyXG4gIHJldHVybiB0clxyXG59XHJcblxyXG4vKipcclxuICogTW9kLUVudGVyIGluc2lkZSBhIGNvZGUgYmxvY2s6IHN0YXJ0IGEgcGFyYWdyYXBoIGFmdGVyIGl0IGFuZCBtb3ZlIHRoZVxyXG4gKiBjYXJldCB0aGVyZS4gVGhlIHR3by1FbnRlciBnZXN0dXJlIG9ubHkgd29ya3MgZnJvbSBhIGJsYW5rIGxhc3QgbGluZTsgdGhpc1xyXG4gKiBsZWF2ZXMgZnJvbSBhbnl3aGVyZSBpbiB0aGUgYmxvY2ssIHdpdGhvdXQgaHVudGluZyBmb3IgaXRzIGVuZC5cclxuICovXHJcbmV4cG9ydCBjb25zdCBleGl0UHJlZm9ybWF0dGVkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgYmxvY2sgPSBwcmVmb3JtYXR0ZWRBdChzdGF0ZSlcclxuICBpZiAoIWJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHBhcmFncmFwaCA9IHN0YXRlLnNjaGVtYS5ub2Rlcy5wYXJhZ3JhcGhcclxuICBpZiAoIXBhcmFncmFwaCkgcmV0dXJuIG51bGxcclxuICBjb25zdCBwYXRoID0gKHN0YXRlLnNlbGVjdGlvbiBhcyBUZXh0U2VsZWN0aW9uKS5mcm9tLnBhdGhcclxuICBjb25zdCBwYXJlbnRQYXRoID0gcGF0aC5zbGljZSgwLCAtMSlcclxuICBjb25zdCBpbmRleCA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgdHIuc3RlcChuZXcgUmVwbGFjZU5vZGVzU3RlcChwYXJlbnRQYXRoLCBpbmRleCArIDEsIGluZGV4ICsgMSwgRnJhZ21lbnQub2YocGFyYWdyYXBoLmNyZWF0ZSgpKSkpXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhbLi4ucGFyZW50UGF0aCwgaW5kZXggKyAxXSwgMCkpKVxyXG4gIGxhc3ROZXdsaW5lID0gbnVsbFxyXG4gIHJldHVybiB0clxyXG59XHJcblxyXG4vKipcclxuICogU2hpZnQtRW50ZXIgaW5zaWRlIGEgY29kZSBibG9jazogYSBwbGFpbiBuZXdsaW5lLCB3aXRoIG5vbmUgb2YgdGhlXHJcbiAqIGluZGVudGF0aW9uIEVudGVyIGFkZHMuIEEgaGFyZCBicmVhayBpcyBub3QgYWxsb3dlZCBpbiBhIGNvZGUgYmxvY2ssIHNvXHJcbiAqIHdpdGhvdXQgdGhpcyB0aGUga2V5IGRpZCBub3RoaW5nIHRoZXJlLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGluc2VydE5ld2xpbmVJblByZWZvcm1hdHRlZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGlmICghcHJlZm9ybWF0dGVkQXQoc3RhdGUpKSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiBpbnNlcnRUZXh0KCdcXG4nKShzdGF0ZSlcclxufVxyXG5cclxuLyoqXHJcbiAqIFR5cGluZyBpbnNpZGUgYSBjb2RlIGJsb2NrLCB3aXRoIGEgY29kZSBlZGl0b3IncyBicmFja2V0IGFuZCBxdW90ZVxyXG4gKiBiZWhhdmlvdXI6IGFuIG9wZW5pbmcgYnJhY2tldCBicmluZ3MgaXRzIGNsb3NlciBhbG9uZyBhbmQgbGVhdmVzIHRoZSBjYXJldFxyXG4gKiBiZXR3ZWVuIHRoZSB0d287IHR5cGluZyBhIGNsb3NlciB0aGF0IGlzIGFscmVhZHkgdGhlcmUgc3RlcHMgcGFzdCBpdDsgYW5kXHJcbiAqIGEgYnJhY2tldCBvciBxdW90ZSB0eXBlZCBvdmVyIGEgc2VsZWN0aW9uIHdyYXBzIGl0LiBEZWNsaW5lcyB3aGVuZXZlciBub25lXHJcbiAqIG9mIHRoYXQgYXBwbGllcywgc28gb3JkaW5hcnkgaW5zZXJ0aW9uIHJ1bnMuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdHlwZUluUHJlZm9ybWF0dGVkKHRleHQ6IHN0cmluZyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IGJsb2NrID0gcHJlZm9ybWF0dGVkQXQoc3RhdGUpXHJcbiAgICBpZiAoIWJsb2NrIHx8IHRleHQubGVuZ3RoICE9PSAxKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uIGFzIFRleHRTZWxlY3Rpb25cclxuICAgIGNvbnN0IHNvdXJjZSA9IGJsb2NrLnRleHRDb250ZW50XHJcbiAgICBjb25zdCBwYXRoID0gc2VsZWN0aW9uLmZyb20ucGF0aFxyXG4gICAgY29uc3QgY2xvc2VyID0gQ09ERV9QQUlSUy5nZXQodGV4dClcclxuXHJcbiAgICBpZiAoIXNlbGVjdGlvbi5lbXB0eSkge1xyXG4gICAgICBpZiAoY2xvc2VyID09PSB1bmRlZmluZWQpIHJldHVybiBudWxsXHJcbiAgICAgIGNvbnN0IGlubmVyID0gc291cmNlLnNsaWNlKHNlbGVjdGlvbi5mcm9tLm9mZnNldCwgc2VsZWN0aW9uLnRvLm9mZnNldClcclxuICAgICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgICB0ci5zdGVwKFxyXG4gICAgICAgIG5ldyBSZXBsYWNlSW5saW5lU3RlcChcclxuICAgICAgICAgIHBhdGgsXHJcbiAgICAgICAgICBzZWxlY3Rpb24uZnJvbS5vZmZzZXQsXHJcbiAgICAgICAgICBzZWxlY3Rpb24udG8ub2Zmc2V0LFxyXG4gICAgICAgICAgRnJhZ21lbnQuZnJvbShbc3RhdGUuc2NoZW1hLnRleHQoYCR7dGV4dH0ke2lubmVyfSR7Y2xvc2VyfWApXSksXHJcbiAgICAgICAgKSxcclxuICAgICAgKVxyXG4gICAgICAvLyBUaGUgdGV4dCBzdGF5cyBzZWxlY3RlZCBpbnNpZGUgdGhlIHBhaXIsIHNvIGFub3RoZXIgYnJhY2tldCBuZXN0cy5cclxuICAgICAgcmV0dXJuIHRyLnNldFNlbGVjdGlvbihcclxuICAgICAgICBuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCwgc2VsZWN0aW9uLmZyb20ub2Zmc2V0ICsgMSksIHBvcyhwYXRoLCBzZWxlY3Rpb24udG8ub2Zmc2V0ICsgMSkpLFxyXG4gICAgICApXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb2Zmc2V0ID0gc2VsZWN0aW9uLmZyb20ub2Zmc2V0XHJcbiAgICBjb25zdCBiZWZvcmUgPSBzb3VyY2Vbb2Zmc2V0IC0gMV1cclxuICAgIGNvbnN0IGFmdGVyID0gc291cmNlW29mZnNldF1cclxuXHJcbiAgICAvLyBUaGUgY2xvc2VyIGlzIGFscmVhZHkgdGhlcmU6IHR5cGljYWxseSBiZWNhdXNlIHRoaXMgZWRpdG9yIHB1dCBpdFxyXG4gICAgLy8gdGhlcmUsIHNvIHR5cGluZyBpdCBzdGVwcyBvdmVyIGl0IHJhdGhlciB0aGFuIGRvdWJsaW5nIGl0LlxyXG4gICAgaWYgKENPREVfQ0xPU0VSUy5oYXModGV4dCkgJiYgYWZ0ZXIgPT09IHRleHQpIHtcclxuICAgICAgcmV0dXJuIHN0YXRlLnRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCwgb2Zmc2V0ICsgMSkpKVxyXG4gICAgfVxyXG4gICAgaWYgKGNsb3NlciA9PT0gdW5kZWZpbmVkKSByZXR1cm4gbnVsbFxyXG4gICAgaWYgKGFmdGVyICE9PSB1bmRlZmluZWQgJiYgIUNMT1NFX0JFRk9SRS5oYXMoYWZ0ZXIpKSByZXR1cm4gbnVsbFxyXG4gICAgLy8gQSBxdW90ZSBhZnRlciBhIHdvcmQgaXMgYW4gYXBvc3Ryb3BoZSBvciBhIGNsb3NpbmcgcXVvdGUsIG5vdCBhblxyXG4gICAgLy8gb3BlbmluZyBvbmU6IGBkb24nYCBtdXN0IG5vdCBiZWNvbWUgYGRvbicnYC5cclxuICAgIGlmIChcclxuICAgICAgQ09ERV9RVU9URVMuaGFzKHRleHQpICYmXHJcbiAgICAgIGJlZm9yZSAhPT0gdW5kZWZpbmVkICYmXHJcbiAgICAgIChDT0RFX1dPUkQudGVzdChiZWZvcmUpIHx8IGJlZm9yZSA9PT0gdGV4dClcclxuICAgICkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIHRyLnN0ZXAoXHJcbiAgICAgIG5ldyBSZXBsYWNlSW5saW5lU3RlcChcclxuICAgICAgICBwYXRoLFxyXG4gICAgICAgIG9mZnNldCxcclxuICAgICAgICBvZmZzZXQsXHJcbiAgICAgICAgRnJhZ21lbnQuZnJvbShbc3RhdGUuc2NoZW1hLnRleHQodGV4dCArIGNsb3NlcildKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICAgIHJldHVybiB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBhdGgsIG9mZnNldCArIDEpKSlcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBCYWNrc3BhY2UgaW5zaWRlIGEgY29kZSBibG9jazogYmV0d2VlbiB0aGUgdHdvIGhhbHZlcyBvZiBhbiBlbXB0eSBwYWlyIGl0XHJcbiAqIHJlbW92ZXMgYm90aCwgYW5kIGluc2lkZSBhIGxpbmUncyBsZWFkaW5nIHdoaXRlc3BhY2UgaXQgc3RlcHMgYmFjayB0byB0aGVcclxuICogcHJldmlvdXMgaW5kZW50IHN0b3AgcmF0aGVyIHRoYW4gb25lIHNwYWNlLiBEZWNsaW5lcyBvdGhlcndpc2UsIHNvIHRoZVxyXG4gKiBvcmRpbmFyeSBkZWxldGUgcnVucy5cclxuICovXHJcbmV4cG9ydCBjb25zdCBkZWxldGVCYWNrd2FyZEluUHJlZm9ybWF0dGVkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgYmxvY2sgPSBwcmVmb3JtYXR0ZWRBdChzdGF0ZSlcclxuICBpZiAoIWJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvbiBhcyBUZXh0U2VsZWN0aW9uXHJcbiAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBudWxsXHJcbiAgY29uc3Qgc291cmNlID0gYmxvY2sudGV4dENvbnRlbnRcclxuICBjb25zdCBwYXRoID0gc2VsZWN0aW9uLmZyb20ucGF0aFxyXG4gIGNvbnN0IG9mZnNldCA9IHNlbGVjdGlvbi5mcm9tLm9mZnNldFxyXG4gIGNvbnN0IGJlZm9yZSA9IHNvdXJjZVtvZmZzZXQgLSAxXVxyXG4gIGlmIChiZWZvcmUgPT09IHVuZGVmaW5lZCkgcmV0dXJuIG51bGxcclxuXHJcbiAgY29uc3QgY2xvc2VyID0gQ09ERV9QQUlSUy5nZXQoYmVmb3JlKVxyXG4gIGlmIChjbG9zZXIgIT09IHVuZGVmaW5lZCAmJiBzb3VyY2Vbb2Zmc2V0XSA9PT0gY2xvc2VyKSB7XHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChwYXRoLCBvZmZzZXQgLSAxLCBvZmZzZXQgKyAxLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgICByZXR1cm4gdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhwYXRoLCBvZmZzZXQgLSAxKSkpXHJcbiAgfVxyXG5cclxuICBjb25zdCBsaW5lU3RhcnQgPSBzb3VyY2UubGFzdEluZGV4T2YoJ1xcbicsIG9mZnNldCAtIDEpICsgMVxyXG4gIGNvbnN0IGxlYWRpbmcgPSBzb3VyY2Uuc2xpY2UobGluZVN0YXJ0LCBvZmZzZXQpXHJcbiAgaWYgKGxlYWRpbmcubGVuZ3RoID4gMSAmJiAvXiArJC8udGVzdChsZWFkaW5nKSkge1xyXG4gICAgY29uc3QgcmVtb3ZlID0gKChsZWFkaW5nLmxlbmd0aCAtIDEpICUgQ09ERV9JTkRFTlQubGVuZ3RoKSArIDFcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKHBhdGgsIG9mZnNldCAtIHJlbW92ZSwgb2Zmc2V0LCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgICByZXR1cm4gdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhwYXRoLCBvZmZzZXQgLSByZW1vdmUpKSlcclxuICB9XHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHNwbGl0QmxvY2s6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIGRlbGV0ZVJhbmdlKHRyLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKVxyXG4gIGNvbnN0IHBvaW50ID0gc2VsZWN0aW9uLmZyb21cclxuICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgodHIuZG9jLCBwb2ludC5wYXRoKVxyXG4gIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIC8vIEVudGVyIGF0IHRoZSBlbmQgb2YgYSBub24tcGFyYWdyYXBoIGJsb2NrIHN0YXJ0cyBhIGZyZXNoIHBhcmFncmFwaC5cclxuICBjb25zdCBwYXJhZ3JhcGggPSBzdGF0ZS5zY2hlbWEubm9kZXMucGFyYWdyYXBoXHJcbiAgY29uc3QgYXRFbmQgPSBwb2ludC5vZmZzZXQgPT09IGlubGluZUxlbmd0aChibG9jay5jb250ZW50KVxyXG4gIGNvbnN0IGFmdGVyVHlwZSA9IGF0RW5kICYmIHBhcmFncmFwaCAmJiBibG9jay50eXBlICE9PSBwYXJhZ3JhcGggPyBwYXJhZ3JhcGgubmFtZSA6IHVuZGVmaW5lZFxyXG4gIHRyLnN0ZXAobmV3IFNwbGl0Tm9kZVN0ZXAocG9pbnQucGF0aCwgcG9pbnQub2Zmc2V0LCBhZnRlclR5cGUpKVxyXG4gIGNvbnN0IHBhcmVudFBhdGggPSBwb2ludC5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IGluZGV4ID0gcG9pbnQucGF0aFtwb2ludC5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoWy4uLnBhcmVudFBhdGgsIGluZGV4ICsgMV0sIDApKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqXHJcbiAqIEluc2VydCBwYXJzZWQgY29udGVudCAocGFzdGUpOiBpbmxpbmUgY29udGVudCBtZXJnZXMgaW50byB0aGUgY3VycmVudFxyXG4gKiBibG9jazsgYmxvY2sgY29udGVudCBpcyBzcGxpY2VkIGluIGFmdGVyIHNwbGl0dGluZyBhdCB0aGUgY3Vyc29yLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGluc2VydENvbnRlbnQobm9kZXM6IHJlYWRvbmx5IEVkaXRvck5vZGVbXSk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGlmIChub2Rlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIGRlbGV0ZVJhbmdlKHRyLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKVxyXG4gICAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uZnJvbVxyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHRyLmRvYywgcG9pbnQucGF0aClcclxuICAgIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIGNvbnN0IGFsbElubGluZSA9IG5vZGVzLmV2ZXJ5KChub2RlKSA9PiBub2RlLmlzSW5saW5lKVxyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IHBvaW50LnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBjb25zdCBpbmRleCA9IHBvaW50LnBhdGhbcG9pbnQucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGNvbnN0IGJsb2NrRW1wdHkgPSBpbmxpbmVMZW5ndGgoYmxvY2suY29udGVudCkgPT09IDBcclxuXHJcbiAgICBpZiAoIWFsbElubGluZSAmJiBibG9ja0VtcHR5KSB7XHJcbiAgICAgIC8vIFBhc3RpbmcgYmxvY2tzIGludG8gYW4gZW1wdHkgYmxvY2sgcmVwbGFjZXMgaXQgd2hvbGVzYWxlLlxyXG4gICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlTm9kZXNTdGVwKHBhcmVudFBhdGgsIGluZGV4LCBpbmRleCArIDEsIEZyYWdtZW50LmZyb20obm9kZXMpKSlcclxuICAgICAgdHIuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbkFmdGVyQmxvY2tzKHBhcmVudFBhdGgsIGluZGV4IC0gMSwgbm9kZXMpKVxyXG4gICAgICByZXR1cm4gdHJcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzaW5nbGUgPSBub2Rlcy5sZW5ndGggPT09IDEgPyBub2Rlc1swXSA6IG51bGxcclxuICAgIGlmIChhbGxJbmxpbmUgfHwgc2luZ2xlPy5pc1RleHRibG9jaykge1xyXG4gICAgICBjb25zdCBzb3VyY2UgPSBhbGxJbmxpbmUgPyBub2RlcyA6IChzaW5nbGUgYXMgRWRpdG9yTm9kZSkuY29udGVudC5jaGlsZHJlblxyXG4gICAgICAvLyBUaGUgcGF5bG9hZCBjYW1lIGZyb20gc29tZXdoZXJlIGVsc2UgKGFub3RoZXIgYmxvY2ssIGFub3RoZXJcclxuICAgICAgLy8gZG9jdW1lbnQsIHRoZSBjbGlwYm9hcmQpIHNvIGl0IG1heSBjYXJyeSBtYXJrcyBhbmQgaW5saW5lIG5vZGVzIHRoaXNcclxuICAgICAgLy8gYmxvY2sgZG9lcyBub3QgdGFrZS4gUmVkdWNlIGl0IHRvIHdoYXQgZml0cyByYXRoZXIgdGhhbiBidWlsZGluZyBhXHJcbiAgICAgIC8vIGRvY3VtZW50IHRoZSBzY2hlbWEgd291bGQgcmVqZWN0LlxyXG4gICAgICBjb25zdCBpbmxpbmUgPSBGcmFnbWVudC5mcm9tKGNvZXJjZUlubGluZUZvcihibG9jay50eXBlLCBzb3VyY2UpKVxyXG4gICAgICBpZiAoaW5saW5lLmNoaWxkQ291bnQgPT09IDApIHJldHVybiBudWxsXHJcbiAgICAgIGNvbnN0IGxlbmd0aCA9IGlubGluZUxlbmd0aChpbmxpbmUpXHJcbiAgICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCwgcG9pbnQub2Zmc2V0LCBpbmxpbmUpKVxyXG4gICAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCArIGxlbmd0aCkpKVxyXG4gICAgICByZXR1cm4gdHJcclxuICAgIH1cclxuXHJcbiAgICAvLyBNdWx0aS1ibG9jayBwYXlsb2FkOiBzcGxpdCB0aGUgY3VycmVudCBibG9jayBhbmQgc3BsaWNlIGJldHdlZW4gaGFsdmVzLlxyXG4gICAgdHIuc3RlcChuZXcgU3BsaXROb2RlU3RlcChwb2ludC5wYXRoLCBwb2ludC5vZmZzZXQpKVxyXG4gICAgdHIuc3RlcChuZXcgUmVwbGFjZU5vZGVzU3RlcChwYXJlbnRQYXRoLCBpbmRleCArIDEsIGluZGV4ICsgMSwgRnJhZ21lbnQuZnJvbShub2RlcykpKVxyXG4gICAgdHIuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbkFmdGVyQmxvY2tzKHBhcmVudFBhdGgsIGluZGV4LCBub2RlcykpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbn1cclxuXHJcbi8qKiBDdXJzb3IgYXQgdGhlIGVuZCBvZiB0aGUgbGFzdCBvZiBgbm9kZXNgLCBpbnNlcnRlZCBzdGFydGluZyBhdCBgaW5kZXggKyAxYC4gKi9cclxuZnVuY3Rpb24gc2VsZWN0aW9uQWZ0ZXJCbG9ja3MoXHJcbiAgcGFyZW50UGF0aDogcmVhZG9ubHkgbnVtYmVyW10sXHJcbiAgaW5kZXg6IG51bWJlcixcclxuICBub2RlczogcmVhZG9ubHkgRWRpdG9yTm9kZVtdLFxyXG4pOiBUZXh0U2VsZWN0aW9uIHtcclxuICBjb25zdCBsYXN0Tm9kZSA9IG5vZGVzW25vZGVzLmxlbmd0aCAtIDFdIGFzIEVkaXRvck5vZGVcclxuICBjb25zdCBsYXN0UGF0aCA9IFsuLi5wYXJlbnRQYXRoLCBpbmRleCArIG5vZGVzLmxlbmd0aF1cclxuICByZXR1cm4gbmV3IFRleHRTZWxlY3Rpb24oXHJcbiAgICBsYXN0Tm9kZS5pc1RleHRibG9ja1xyXG4gICAgICA/IHBvcyhsYXN0UGF0aCwgaW5saW5lTGVuZ3RoKGxhc3ROb2RlLmNvbnRlbnQpKVxyXG4gICAgICA6IHBvcyhwYXJlbnRQYXRoLCBpbmRleCArIG5vZGVzLmxlbmd0aCArIDEpLFxyXG4gIClcclxufVxyXG5cclxuLyoqIEJhY2tzcGFjZTogZGVsZXRlIHRoZSBzZWxlY3Rpb24sIG9uZSB1bml0IGJhY2ssIG9yIGpvaW4gd2l0aCB0aGUgcHJldmlvdXMgYmxvY2suICovXHJcbmV4cG9ydCBjb25zdCBkZWxldGVDaGFyQmFja3dhcmQ6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoIXNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIGRlbGV0ZVNlbGVjdGlvbihzdGF0ZSlcclxuICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBwb2ludCA9IHNlbGVjdGlvbi5oZWFkXHJcbiAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcG9pbnQucGF0aClcclxuICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICBjb25zdCBib3VuZGFyeSA9IHByZXZpb3VzSW5saW5lQm91bmRhcnkoYmxvY2suY29udGVudCwgcG9pbnQub2Zmc2V0KVxyXG4gIGlmIChib3VuZGFyeSA8IDApIHJldHVybiBqb2luQmFja3dhcmQoc3RhdGUpXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKHBvaW50LnBhdGgsIGJvdW5kYXJ5LCBwb2ludC5vZmZzZXQsIEZyYWdtZW50LmVtcHR5KSlcclxuICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBvaW50LnBhdGgsIGJvdW5kYXJ5KSkpXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKiBEZWxldGU6IHJlbW92ZSB0aGUgc2VsZWN0aW9uLCBvbmUgdW5pdCBmb3J3YXJkLCBvciBqb2luIHdpdGggdGhlIG5leHQgYmxvY2suICovXHJcbmV4cG9ydCBjb25zdCBkZWxldGVDaGFyRm9yd2FyZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghc2VsZWN0aW9uLmVtcHR5KSByZXR1cm4gZGVsZXRlU2VsZWN0aW9uKHN0YXRlKVxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHBvaW50ID0gc2VsZWN0aW9uLmhlYWRcclxuICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBwb2ludC5wYXRoKVxyXG4gIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGJvdW5kYXJ5ID0gbmV4dElubGluZUJvdW5kYXJ5KGJsb2NrLmNvbnRlbnQsIHBvaW50Lm9mZnNldClcclxuICBpZiAoYm91bmRhcnkgPCAwKSByZXR1cm4gam9pbkZvcndhcmQoc3RhdGUpXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCwgYm91bmRhcnksIEZyYWdtZW50LmVtcHR5KSlcclxuICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9pbnQpKVxyXG4gIHJldHVybiB0clxyXG59XHJcblxyXG4vKiogRGVsZXRlIGF0IHRoZSBlbmQgb2YgYSBibG9jazogam9pbiB0aGUgbmV4dCBzaWJsaW5nIGludG8gdGhpcyBvbmUuICovXHJcbmV4cG9ydCBjb25zdCBqb2luRm9yd2FyZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHx8ICFzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBudWxsXHJcbiAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uaGVhZFxyXG4gIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBvaW50LnBhdGgpXHJcbiAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2sgfHwgcG9pbnQub2Zmc2V0ICE9PSBpbmxpbmVMZW5ndGgoYmxvY2suY29udGVudCkpIHJldHVybiBudWxsXHJcbiAgaWYgKHBvaW50LnBhdGgubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGluZGV4ID0gcG9pbnQucGF0aFtwb2ludC5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIGNvbnN0IHBhcmVudFBhdGggPSBwb2ludC5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IG5leHQgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgWy4uLnBhcmVudFBhdGgsIGluZGV4ICsgMV0pXHJcbiAgaWYgKCFuZXh0KSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICBpZiAoIW5leHQuaXNUZXh0YmxvY2spIHtcclxuICAgIGlmICghbmV4dC5pc0F0b20pIHJldHVybiBudWxsXHJcbiAgICB0ci5zdGVwKG5ldyBSZXBsYWNlTm9kZXNTdGVwKHBhcmVudFBhdGgsIGluZGV4ICsgMSwgaW5kZXggKyAyLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbiAgdHIuc3RlcChuZXcgSm9pbk5vZGVzU3RlcChwb2ludC5wYXRoLCBwb2ludC5vZmZzZXQpKVxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb2ludCkpXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKiBCYWNrc3BhY2UgYXQgdGhlIHN0YXJ0IG9mIGEgYmxvY2s6IGpvaW4gd2l0aCB0aGUgcHJldmlvdXMgc2libGluZy4gKi9cclxuZXhwb3J0IGNvbnN0IGpvaW5CYWNrd2FyZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHx8ICFzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBudWxsXHJcbiAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uaGVhZFxyXG4gIGlmIChwb2ludC5vZmZzZXQgIT09IDAgfHwgcG9pbnQucGF0aC5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgY29uc3QgaW5kZXggPSBwb2ludC5wYXRoW3BvaW50LnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgaWYgKGluZGV4ID09PSAwKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHBhcmVudFBhdGggPSBwb2ludC5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IHByZXZpb3VzUGF0aCA9IFsuLi5wYXJlbnRQYXRoLCBpbmRleCAtIDFdXHJcbiAgY29uc3QgcHJldmlvdXMgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcHJldmlvdXNQYXRoKVxyXG4gIGlmICghcHJldmlvdXMpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGlmICghcHJldmlvdXMuaXNUZXh0YmxvY2spIHtcclxuICAgIC8vIEJhY2tzcGFjZSBpbnRvIGFuIGF0b20gYmxvY2sgKGhyKTogZGVsZXRlIGl0LlxyXG4gICAgaWYgKCFwcmV2aW91cy5pc0F0b20pIHJldHVybiBudWxsXHJcbiAgICB0ci5zdGVwKG5ldyBSZXBsYWNlTm9kZXNTdGVwKHBhcmVudFBhdGgsIGluZGV4IC0gMSwgaW5kZXgsIEZyYWdtZW50LmVtcHR5KSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxuICBjb25zdCBqb2luT2Zmc2V0ID0gaW5saW5lTGVuZ3RoKHByZXZpb3VzLmNvbnRlbnQpXHJcbiAgdHIuc3RlcChuZXcgSm9pbk5vZGVzU3RlcChwcmV2aW91c1BhdGgsIGpvaW5PZmZzZXQpKVxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocHJldmlvdXNQYXRoLCBqb2luT2Zmc2V0KSkpXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKiBJbnNlcnQgYW4gaW5saW5lIGF0b20gbm9kZSAoaGFyZCBicmVhaywgXHUyMDI2KSBhdCB0aGUgc2VsZWN0aW9uLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0SW5saW5lTm9kZShuYW1lOiBzdHJpbmcsIGF0dHJzPzogQXR0cnMpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm5vZGVUeXBlKG5hbWUpXHJcbiAgICBpZiAoIXR5cGUuaXNJbmxpbmUgfHwgIXR5cGUuaXNBdG9tKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGlmICghc2VsZWN0aW9uLmVtcHR5KSBkZWxldGVSYW5nZSh0ciwgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICAgIGNvbnN0IHBvaW50ID0gc2VsZWN0aW9uLmZyb21cclxuICAgIHRyLnN0ZXAoXHJcbiAgICAgIG5ldyBSZXBsYWNlSW5saW5lU3RlcChcclxuICAgICAgICBwb2ludC5wYXRoLFxyXG4gICAgICAgIHBvaW50Lm9mZnNldCxcclxuICAgICAgICBwb2ludC5vZmZzZXQsXHJcbiAgICAgICAgRnJhZ21lbnQub2YodHlwZS5jcmVhdGUoYXR0cnMpKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocG9pbnQucGF0aCwgcG9pbnQub2Zmc2V0ICsgMSkpKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG4vKiogSW5zZXJ0IGEgYmxvY2sgbm9kZSAoaG9yaXpvbnRhbCBydWxlLCBcdTIwMjYpIGFmdGVyIHRoZSBjdXJyZW50IGJsb2NrLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0QmxvY2tBZnRlcihuYW1lOiBzdHJpbmcsIGF0dHJzPzogQXR0cnMpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm5vZGVUeXBlKG5hbWUpXHJcbiAgICBpZiAodHlwZS5pc0lubGluZSB8fCB0eXBlLmlubGluZUNvbnRlbnQpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGNvbnN0IGJsb2NrUGF0aCA9IHNlbGVjdGlvbi50by5wYXRoXHJcbiAgICBpZiAoYmxvY2tQYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHBhcmVudFBhdGggPSBibG9ja1BhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBjb25zdCBpbmRleCA9IGJsb2NrUGF0aFtibG9ja1BhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICB0ci5zdGVwKG5ldyBSZXBsYWNlTm9kZXNTdGVwKHBhcmVudFBhdGgsIGluZGV4ICsgMSwgaW5kZXggKyAxLCBGcmFnbWVudC5vZih0eXBlLmNyZWF0ZShhdHRycykpKSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxufVxyXG5cclxuLyoqIFdyYXAgdGhlIHNlbGVjdGVkIGJsb2NrcyBpbiBhIG5vZGUgb2YgdGhlIGdpdmVuIHR5cGUgKGJsb2NrcXVvdGUsIFx1MjAyNikuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB3cmFwSW4obmFtZTogc3RyaW5nLCBhdHRycz86IEF0dHJzKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBjb25zdCBibG9ja3MgPSBibG9ja3NJblJhbmdlKHN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICAgIGNvbnN0IGZpcnN0ID0gYmxvY2tzWzBdXHJcbiAgICBjb25zdCBsYXN0ID0gYmxvY2tzW2Jsb2Nrcy5sZW5ndGggLSAxXVxyXG4gICAgaWYgKCFmaXJzdCB8fCAhbGFzdCkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHBhcmVudFBhdGggPSBmaXJzdC5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgaWYgKCFwYXRoc0VxdWFsKHBhcmVudFBhdGgsIGxhc3QucGF0aC5zbGljZSgwLCAtMSkpKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgZnJvbSA9IGZpcnN0LnBhdGhbZmlyc3QucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGNvbnN0IHRvID0gKGxhc3QucGF0aFtsYXN0LnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyKSArIDFcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIHRyLnN0ZXAobmV3IFdyYXBOb2Rlc1N0ZXAocGFyZW50UGF0aCwgZnJvbSwgdG8sIG5hbWUsIGF0dHJzKSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxufVxyXG5cclxuLyoqIFJlbW92ZSB0aGUgd3JhcHBlciBhcm91bmQgdGhlIGJsb2NrIGF0IHRoZSBzZWxlY3Rpb24gKHVuLWJsb2NrcXVvdGUsIFx1MjAyNikuICovXHJcbmV4cG9ydCBjb25zdCBsaWZ0OiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgY29uc3QgYmxvY2tQYXRoID0gc2VsZWN0aW9uLmZyb20ucGF0aFxyXG4gIGlmIChibG9ja1BhdGgubGVuZ3RoIDwgMikgcmV0dXJuIG51bGxcclxuICBjb25zdCB3cmFwcGVyUGF0aCA9IGJsb2NrUGF0aC5zbGljZSgwLCAtMSlcclxuICBjb25zdCB3cmFwcGVyID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHdyYXBwZXJQYXRoKVxyXG4gIGlmICghd3JhcHBlciB8fCB3cmFwcGVyLmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICB0ci5zdGVwKG5ldyBMaWZ0Tm9kZXNTdGVwKHdyYXBwZXJQYXRoLCB3cmFwcGVyLmNoaWxkQ291bnQpKVxyXG4gIHJldHVybiB0clxyXG59XHJcblxyXG4vKiogU2VsZWN0IHRoZSB3aG9sZSBkb2N1bWVudC4gKi9cclxuZXhwb3J0IGNvbnN0IHNlbGVjdEFsbDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIHJldHVybiBzdGF0ZS50ci5zZXRTZWxlY3Rpb24obmV3IEFsbFNlbGVjdGlvbihzdGF0ZS5kb2MpKVxyXG59XHJcblxyXG4vKiogU3RvcmVkLW1hcmsgYXdhcmUgYWN0aXZlLW1hcmsgdGVzdCwgc2hhcmVkIGJ5IHRvb2xiYXJzIGFuZCB0b2dnbGVNYXJrLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaXNNYXJrQWN0aXZlKHN0YXRlOiBFZGl0b3JTdGF0ZSwgbmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrc1tuYW1lXVxyXG4gIGlmICghdHlwZSkgcmV0dXJuIGZhbHNlXHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKHNlbGVjdGlvbi5lbXB0eSAmJiBzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSB7XHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBzZWxlY3Rpb24uaGVhZC5wYXRoKVxyXG4gICAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2spIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3QgY3VycmVudCA9IHN0YXRlLnN0b3JlZE1hcmtzID8/IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgc2VsZWN0aW9uLmhlYWQub2Zmc2V0KVxyXG4gICAgcmV0dXJuIGN1cnJlbnQuc29tZSgobWFyazogTWFyaykgPT4gbWFyay50eXBlID09PSB0eXBlKVxyXG4gIH1cclxuICBjb25zdCBibG9ja3MgPSBibG9ja3NJblJhbmdlKHN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bykuZmlsdGVyKFxyXG4gICAgKGJsb2NrKSA9PiBibG9jay5mcm9tIDwgYmxvY2sudG8sXHJcbiAgKVxyXG4gIHJldHVybiAoXHJcbiAgICBibG9ja3MubGVuZ3RoID4gMCAmJlxyXG4gICAgYmxvY2tzLmV2ZXJ5KChibG9jaykgPT4gcmFuZ2VIYXNNYXJrKGJsb2NrLm5vZGUuY29udGVudCwgYmxvY2suZnJvbSwgYmxvY2sudG8sIHR5cGUpKVxyXG4gIClcclxufVxyXG4iLCAiaW1wb3J0IHsgYXR0cnNFcSB9IGZyb20gJy4uL21vZGVsL2F0dHJzJ1xyXG5pbXBvcnQgeyBibG9ja3NJblJhbmdlIH0gZnJvbSAnLi4vbW9kZWwvYmxvY2tzJ1xyXG5pbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgeyBpbmxpbmVMZW5ndGggfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IHR5cGUgUG9zaXRpb24sIHBvcyB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgeyB0eXBlIFBhdGgsIG5vZGVBdFBhdGgsIHBhdGhzRXF1YWwgfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBsaXN0U3R5bGVzRm9yIH0gZnJvbSAnLi4vc2NoZW1hL2Jhc2ljJ1xyXG5pbXBvcnQgeyBUZXh0U2VsZWN0aW9uIH0gZnJvbSAnLi4vc3RhdGUvc2VsZWN0aW9uJ1xyXG5pbXBvcnQgeyBTZXROb2RlQXR0cnNTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvYXR0cnMtc3RlcCdcclxuaW1wb3J0IHsgUmVwbGFjZU5vZGVzU3RlcCwgcmVwbGFjZU5vZGVBdCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2Utbm9kZXMnXHJcbmltcG9ydCB7IFNwbGl0Tm9kZVN0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9zcGxpdC1qb2luJ1xyXG5pbXBvcnQgdHlwZSB7IENvbW1hbmQgfSBmcm9tICcuL2NvbW1hbmRzJ1xyXG5pbXBvcnQgeyBkZWxldGVSYW5nZSB9IGZyb20gJy4vaGVscGVycydcclxuXHJcbi8qKlxyXG4gKiBUaGUgaXRlbSB0eXBlcyBhIGxpc3QgY2FuIGhvbGQuIFRhc2sgbGlzdHMgYXJlIG9yZGluYXJ5IGxpc3RzIHdpdGggYVxyXG4gKiBkaWZmZXJlbnQgaXRlbSB0eXBlLCBzbyBldmVyeSBsaXN0IGNvbW1hbmQgd29ya3Mgb24gYm90aCBieSBsb29raW5nIHRoZVxyXG4gKiBpdGVtIHR5cGUgdXAgaGVyZSByYXRoZXIgdGhhbiBoYXJkLWNvZGluZyBgbGlzdEl0ZW1gLlxyXG4gKi9cclxuY29uc3QgSVRFTV9UWVBFUzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPSB7XHJcbiAgYnVsbGV0TGlzdDogJ2xpc3RJdGVtJyxcclxuICBvcmRlcmVkTGlzdDogJ2xpc3RJdGVtJyxcclxuICB0YXNrTGlzdDogJ3Rhc2tJdGVtJyxcclxufVxyXG5cclxuY29uc3QgSVRFTV9UWVBFX05BTUVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChPYmplY3QudmFsdWVzKElURU1fVFlQRVMpKVxyXG5cclxuLyoqXHJcbiAqIFdoZXRoZXIgYSBub2RlIHR5cGUgbmFtZXMgYSBsaXN0IGl0ZW06IGBsaXN0SXRlbWAgb3IgYHRhc2tJdGVtYC4gQW55dGhpbmdcclxuICogZGVjaWRpbmcgXCJhbSBJIGluc2lkZSBhIGxpc3Q/XCIgbXVzdCBhc2sgdGhpcyByYXRoZXIgdGhhbiBjb21wYXJlIGFnYWluc3RcclxuICogYGxpc3RJdGVtYCwgb3IgdGFzayBsaXN0cyBxdWlldGx5IHRha2UgdGhlIHdyb25nIGJyYW5jaC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0xpc3RJdGVtVHlwZU5hbWUodHlwZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiB0eXBlTmFtZSAhPT0gdW5kZWZpbmVkICYmIElURU1fVFlQRV9OQU1FUy5oYXModHlwZU5hbWUpXHJcbn1cclxuXHJcbi8qKiBJdGVtIHR5cGUgYSBsaXN0IHR5cGUgaG9sZHM7IGBsaXN0SXRlbWAgZm9yIGFueXRoaW5nIHVucmVnaXN0ZXJlZC4gKi9cclxuZnVuY3Rpb24gaXRlbVR5cGVOYW1lRm9yKGxpc3RUeXBlTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gSVRFTV9UWVBFU1tsaXN0VHlwZU5hbWVdID8/ICdsaXN0SXRlbSdcclxufVxyXG5cclxuaW50ZXJmYWNlIExpc3RDb250ZXh0IHtcclxuICByZWFkb25seSBsaXN0UGF0aDogUGF0aFxyXG4gIHJlYWRvbmx5IGxpc3Q6IEVkaXRvck5vZGVcclxuICByZWFkb25seSBpdGVtUGF0aDogUGF0aFxyXG4gIHJlYWRvbmx5IGl0ZW06IEVkaXRvck5vZGVcclxuICByZWFkb25seSBpdGVtSW5kZXg6IG51bWJlclxyXG59XHJcblxyXG4vKiogUmVzb2x2ZSB0aGUgbGlzdCBpdGVtIGFuZCBsaXN0IGNvbnRhaW5pbmcgdGhlIHRleHRibG9jayBhdCBgYmxvY2tQYXRoYC4gKi9cclxuZnVuY3Rpb24gbGlzdENvbnRleHRBdChkb2M6IEVkaXRvck5vZGUsIGJsb2NrUGF0aDogUGF0aCk6IExpc3RDb250ZXh0IHwgbnVsbCB7XHJcbiAgaWYgKGJsb2NrUGF0aC5sZW5ndGggPCAzKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGl0ZW1QYXRoID0gYmxvY2tQYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IGl0ZW0gPSBub2RlQXRQYXRoKGRvYywgaXRlbVBhdGgpXHJcbiAgaWYgKCFpdGVtIHx8ICFJVEVNX1RZUEVfTkFNRVMuaGFzKGl0ZW0udHlwZS5uYW1lKSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBsaXN0UGF0aCA9IGl0ZW1QYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IGxpc3QgPSBub2RlQXRQYXRoKGRvYywgbGlzdFBhdGgpXHJcbiAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiB7IGxpc3RQYXRoLCBsaXN0LCBpdGVtUGF0aCwgaXRlbSwgaXRlbUluZGV4OiBpdGVtUGF0aFtpdGVtUGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXIgfVxyXG59XHJcblxyXG4vKipcclxuICogVG9nZ2xlIHRoZSBibG9ja3MgaW4gdGhlIHNlbGVjdGlvbiBpbnRvL291dCBvZiBhIGxpc3Qgb2YgdGhlIGdpdmVuIHR5cGUuXHJcbiAqIEluc2lkZSBhIHNhbWUtdHlwZSBsaXN0OiB1bndyYXAuIEluc2lkZSBhbm90aGVyIGxpc3QgdHlwZTogcmV0eXBlIHRoZSBsaXN0LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZUxpc3QobGlzdFR5cGVOYW1lOiBzdHJpbmcpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm5vZGVUeXBlKGxpc3RUeXBlTmFtZSlcclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gICAgY29uc3QgYmxvY2tzID0gYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pXHJcbiAgICBjb25zdCBmaXJzdCA9IGJsb2Nrc1swXVxyXG4gICAgY29uc3QgbGFzdCA9IGJsb2Nrc1tibG9ja3MubGVuZ3RoIC0gMV1cclxuICAgIGlmICghZmlyc3QgfHwgIWxhc3QpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBjb25zdCBjb250ZXh0ID0gbGlzdENvbnRleHRBdChzdGF0ZS5kb2MsIGZpcnN0LnBhdGgpXHJcblxyXG4gICAgaWYgKGNvbnRleHQpIHtcclxuICAgICAgaWYgKGNvbnRleHQubGlzdC50eXBlID09PSB0eXBlKSB7XHJcbiAgICAgICAgLy8gVW53cmFwOiByZXBsYWNlIHRoZSB3aG9sZSBsaXN0IHdpdGggaXRzIGl0ZW1zJyBibG9ja3MuXHJcbiAgICAgICAgY29uc3QgZmxhdCA9IGNvbnRleHQubGlzdC5jb250ZW50LmNoaWxkcmVuLmZsYXRNYXAoKGl0ZW0pID0+IGl0ZW0uY29udGVudC5jaGlsZHJlbilcclxuICAgICAgICB0ci5zdGVwKHJlcGxhY2VOb2RlQXQoY29udGV4dC5saXN0UGF0aCwgRnJhZ21lbnQuZnJvbShmbGF0KSkpXHJcbiAgICAgICAgdHIuc2V0U2VsZWN0aW9uKG1hcE91dE9mTGlzdChzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvLCBjb250ZXh0KSlcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBSZXR5cGUgaW4gcGxhY2UuIEEgYnVsbGV0IFx1MjE5NCB0YXNrIHN3aXRjaCBhbHNvIGNoYW5nZXMgdGhlIGl0ZW0gdHlwZSxcclxuICAgICAgICAvLyBzbyByZWJ1aWxkIHRoZSBpdGVtcyByYXRoZXIgdGhhbiByZXVzaW5nIHRoZSBvbGQgZnJhZ21lbnQ7IHRoZVxyXG4gICAgICAgIC8vIGJsb2NrIGNvbnRlbnQgaW5zaWRlIGVhY2ggaXRlbSBpcyBzaGFyZWQgdW50b3VjaGVkLlxyXG4gICAgICAgIGNvbnN0IGl0ZW1UeXBlID0gc3RhdGUuc2NoZW1hLm5vZGVUeXBlKGl0ZW1UeXBlTmFtZUZvcihsaXN0VHlwZU5hbWUpKVxyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gY29udGV4dC5saXN0LmNvbnRlbnQuY2hpbGRyZW4ubWFwKChpdGVtKSA9PlxyXG4gICAgICAgICAgaXRlbS50eXBlID09PSBpdGVtVHlwZSA/IGl0ZW0gOiBpdGVtVHlwZS5jcmVhdGUodW5kZWZpbmVkLCBpdGVtLmNvbnRlbnQpLFxyXG4gICAgICAgIClcclxuICAgICAgICB0ci5zdGVwKFxyXG4gICAgICAgICAgcmVwbGFjZU5vZGVBdChcclxuICAgICAgICAgICAgY29udGV4dC5saXN0UGF0aCxcclxuICAgICAgICAgICAgRnJhZ21lbnQub2YodHlwZS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5mcm9tKGl0ZW1zKSkpLFxyXG4gICAgICAgICAgKSxcclxuICAgICAgICApXHJcbiAgICAgICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0clxyXG4gICAgfVxyXG5cclxuICAgIC8vIFdyYXA6IHRoZSBzZWxlY3RlZCBzaWJsaW5nIGJsb2NrcyBlYWNoIGJlY29tZSBhIGxpc3QgaXRlbS5cclxuICAgIGNvbnN0IHBhcmVudFBhdGggPSBmaXJzdC5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgaWYgKCFwYXRoc0VxdWFsKHBhcmVudFBhdGgsIGxhc3QucGF0aC5zbGljZSgwLCAtMSkpKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgcGFyZW50ID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBhcmVudFBhdGgpXHJcbiAgICBpZiAoIXBhcmVudCkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IGZyb21JbmRleCA9IGZpcnN0LnBhdGhbZmlyc3QucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGNvbnN0IHRvSW5kZXggPSAobGFzdC5wYXRoW2xhc3QucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXIpICsgMVxyXG4gICAgY29uc3QgaXRlbVR5cGUgPSBzdGF0ZS5zY2hlbWEubm9kZVR5cGUoaXRlbVR5cGVOYW1lRm9yKGxpc3RUeXBlTmFtZSkpXHJcbiAgICBjb25zdCBpdGVtcyA9IHBhcmVudC5jb250ZW50LmNoaWxkcmVuXHJcbiAgICAgIC5zbGljZShmcm9tSW5kZXgsIHRvSW5kZXgpXHJcbiAgICAgIC5tYXAoKGJsb2NrKSA9PiBpdGVtVHlwZS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5vZihibG9jaykpKVxyXG4gICAgdHIuc3RlcChcclxuICAgICAgbmV3IFJlcGxhY2VOb2Rlc1N0ZXAoXHJcbiAgICAgICAgcGFyZW50UGF0aCxcclxuICAgICAgICBmcm9tSW5kZXgsXHJcbiAgICAgICAgdG9JbmRleCxcclxuICAgICAgICBGcmFnbWVudC5vZih0eXBlLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50LmZyb20oaXRlbXMpKSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgICBjb25zdCBpbnRvTGlzdCA9IChwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiA9PiB7XHJcbiAgICAgIGNvbnN0IGluZGV4ID0gcG9zaXRpb24ucGF0aFtwb3NpdGlvbi5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgICBpZiAoXHJcbiAgICAgICAgIXBhdGhzRXF1YWwocG9zaXRpb24ucGF0aC5zbGljZSgwLCAtMSksIHBhcmVudFBhdGgpIHx8XHJcbiAgICAgICAgaW5kZXggPCBmcm9tSW5kZXggfHxcclxuICAgICAgICBpbmRleCA+PSB0b0luZGV4XHJcbiAgICAgICkge1xyXG4gICAgICAgIHJldHVybiBwb3NpdGlvblxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBwb3MoWy4uLnBhcmVudFBhdGgsIGZyb21JbmRleCwgaW5kZXggLSBmcm9tSW5kZXgsIDBdLCBwb3NpdGlvbi5vZmZzZXQpXHJcbiAgICB9XHJcbiAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24oaW50b0xpc3Qoc2VsZWN0aW9uLmZyb20pLCBpbnRvTGlzdChzZWxlY3Rpb24udG8pKSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbWFwT3V0T2ZMaXN0KGZyb206IFBvc2l0aW9uLCB0bzogUG9zaXRpb24sIGNvbnRleHQ6IExpc3RDb250ZXh0KTogVGV4dFNlbGVjdGlvbiB7XHJcbiAgY29uc3QgbWFwID0gKHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uID0+IHtcclxuICAgIC8vIFsuLi5saXN0UGF0aCwgaXRlbUluZGV4LCBibG9ja0luZGV4XSBcdTIxOTIgWy4uLmxpc3RQYXJlbnQsIGxpc3RJbmRleCArIGZsYXRJbmRleF1cclxuICAgIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCAhPT0gY29udGV4dC5saXN0UGF0aC5sZW5ndGggKyAyKSByZXR1cm4gcG9zaXRpb25cclxuICAgIGlmICghcGF0aHNFcXVhbChwb3NpdGlvbi5wYXRoLnNsaWNlKDAsIGNvbnRleHQubGlzdFBhdGgubGVuZ3RoKSwgY29udGV4dC5saXN0UGF0aCkpXHJcbiAgICAgIHJldHVybiBwb3NpdGlvblxyXG4gICAgY29uc3QgaXRlbUluZGV4ID0gcG9zaXRpb24ucGF0aFtjb250ZXh0Lmxpc3RQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBibG9ja0luZGV4ID0gcG9zaXRpb24ucGF0aFtjb250ZXh0Lmxpc3RQYXRoLmxlbmd0aCArIDFdIGFzIG51bWJlclxyXG4gICAgbGV0IGZsYXQgPSAwXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1JbmRleDsgaSsrKSBmbGF0ICs9IGNvbnRleHQubGlzdC5jb250ZW50LmNoaWxkKGkpLmNoaWxkQ291bnRcclxuICAgIGNvbnN0IGxpc3RJbmRleCA9IGNvbnRleHQubGlzdFBhdGhbY29udGV4dC5saXN0UGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIHJldHVybiBwb3MoWy4uLmNvbnRleHQubGlzdFBhdGguc2xpY2UoMCwgLTEpLCBsaXN0SW5kZXggKyBmbGF0ICsgYmxvY2tJbmRleF0sIHBvc2l0aW9uLm9mZnNldClcclxuICB9XHJcbiAgcmV0dXJuIG5ldyBUZXh0U2VsZWN0aW9uKG1hcChmcm9tKSwgbWFwKHRvKSlcclxufVxyXG5cclxuLyoqIEVudGVyIGluc2lkZSBhIGxpc3QgaXRlbTogc3BsaXQgaXQ7IG9uIGFuIGVtcHR5IGl0ZW0sIGxpZnQgb3V0IGluc3RlYWQuICovXHJcbmV4cG9ydCBjb25zdCBzcGxpdExpc3RJdGVtOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikpIHJldHVybiBudWxsXHJcbiAgY29uc3QgY29udGV4dCA9IGxpc3RDb250ZXh0QXQoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gIGlmICghY29udGV4dCkgcmV0dXJuIG51bGxcclxuXHJcbiAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uZnJvbVxyXG4gIGNvbnN0IGJsb2NrSW5kZXggPSBwb2ludC5wYXRoW3BvaW50LnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgY29uc3QgY3VycmVudEJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBvaW50LnBhdGgpXHJcbiAgaWYgKCFjdXJyZW50QmxvY2spIHJldHVybiBudWxsXHJcblxyXG4gIC8vIEVudGVyIG9uIGFuIGVtcHR5LCBzaW5nbGUtYmxvY2sgaXRlbSBleGl0cyB0aGUgbGlzdC5cclxuICBpZiAoXHJcbiAgICBzZWxlY3Rpb24uZW1wdHkgJiZcclxuICAgIGNvbnRleHQuaXRlbS5jaGlsZENvdW50ID09PSAxICYmXHJcbiAgICBpbmxpbmVMZW5ndGgoY3VycmVudEJsb2NrLmNvbnRlbnQpID09PSAwXHJcbiAgKSB7XHJcbiAgICByZXR1cm4gbGlmdExpc3RJdGVtKHN0YXRlKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGlmICghc2VsZWN0aW9uLmVtcHR5KSBkZWxldGVSYW5nZSh0ciwgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICB0ci5zdGVwKG5ldyBTcGxpdE5vZGVTdGVwKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCkpXHJcblxyXG4gIC8vIE1vdmUgdGhlIHNlY29uZCBoYWxmIChhbmQgYW55IGxhdGVyIGJsb2NrcyBvZiB0aGlzIGl0ZW0pIGludG8gYSBuZXcgaXRlbS5cclxuICBjb25zdCBpdGVtID0gbm9kZUF0UGF0aCh0ci5kb2MsIGNvbnRleHQuaXRlbVBhdGgpXHJcbiAgaWYgKCFpdGVtKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IG1vdmVkID0gaXRlbS5jb250ZW50LnNsaWNlKGJsb2NrSW5kZXggKyAxKVxyXG4gIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAoY29udGV4dC5pdGVtUGF0aCwgYmxvY2tJbmRleCArIDEsIGl0ZW0uY2hpbGRDb3VudCwgRnJhZ21lbnQuZW1wdHkpKVxyXG4gIC8vIFRoZSBuZXcgaXRlbSBpbmhlcml0cyB0aGUgb2xkIG9uZSdzIHR5cGUgYnV0IG5ldmVyIGl0cyBgY2hlY2tlZGAgc3RhdGU6XHJcbiAgLy8gc3BsaXR0aW5nIGEgZmluaXNoZWQgdGFzayB5aWVsZHMgYSBmcmVzaCwgdW5maW5pc2hlZCBvbmUuXHJcbiAgY29uc3QgaXRlbVR5cGUgPSBjb250ZXh0Lml0ZW0udHlwZVxyXG4gIGNvbnN0IG5ld0F0dHJzID0gJ2NoZWNrZWQnIGluIGNvbnRleHQuaXRlbS5hdHRycyA/IHsgY2hlY2tlZDogZmFsc2UgfSA6IHVuZGVmaW5lZFxyXG4gIHRyLnN0ZXAoXHJcbiAgICBuZXcgUmVwbGFjZU5vZGVzU3RlcChcclxuICAgICAgY29udGV4dC5saXN0UGF0aCxcclxuICAgICAgY29udGV4dC5pdGVtSW5kZXggKyAxLFxyXG4gICAgICBjb250ZXh0Lml0ZW1JbmRleCArIDEsXHJcbiAgICAgIEZyYWdtZW50Lm9mKGl0ZW1UeXBlLmNyZWF0ZShuZXdBdHRycywgbW92ZWQpKSxcclxuICAgICksXHJcbiAgKVxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoWy4uLmNvbnRleHQubGlzdFBhdGgsIGNvbnRleHQuaXRlbUluZGV4ICsgMSwgMF0sIDApKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIFRhYjogbmVzdCB0aGUgY3VycmVudCBpdGVtIHVuZGVyIGl0cyBwcmV2aW91cyBzaWJsaW5nLiAqL1xyXG5leHBvcnQgY29uc3Qgc2lua0xpc3RJdGVtOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgY29uc3QgY29udGV4dCA9IGxpc3RDb250ZXh0QXQoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gIGlmICghY29udGV4dCB8fCBjb250ZXh0Lml0ZW1JbmRleCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICBjb25zdCBwcmV2aW91cyA9IGNvbnRleHQubGlzdC5jb250ZW50LmNoaWxkKGNvbnRleHQuaXRlbUluZGV4IC0gMSlcclxuICBjb25zdCBsYXN0Q2hpbGQgPSBwcmV2aW91cy5jb250ZW50Lm1heWJlQ2hpbGQocHJldmlvdXMuY2hpbGRDb3VudCAtIDEpXHJcbiAgY29uc3QgcmVzdFBhdGggPSBzZWxlY3Rpb24uZnJvbS5wYXRoLnNsaWNlKGNvbnRleHQubGlzdFBhdGgubGVuZ3RoICsgMSlcclxuXHJcbiAgbGV0IHJlcGxhY2VtZW50OiBFZGl0b3JOb2RlXHJcbiAgbGV0IG5ld0Jsb2NrUGF0aDogUGF0aFxyXG4gIGlmIChsYXN0Q2hpbGQgJiYgbGFzdENoaWxkLnR5cGUgPT09IGNvbnRleHQubGlzdC50eXBlKSB7XHJcbiAgICAvLyBQcmV2aW91cyBpdGVtIGFscmVhZHkgZW5kcyBpbiBhIHNhbWUtdHlwZSBuZXN0ZWQgbGlzdDogYXBwZW5kIHRoZXJlLlxyXG4gICAgY29uc3QgbmVzdGVkID0gbGFzdENoaWxkLndpdGhDb250ZW50KGxhc3RDaGlsZC5jb250ZW50LmFwcGVuZChGcmFnbWVudC5vZihjb250ZXh0Lml0ZW0pKSlcclxuICAgIHJlcGxhY2VtZW50ID0gcHJldmlvdXMud2l0aENvbnRlbnQoXHJcbiAgICAgIHByZXZpb3VzLmNvbnRlbnQucmVwbGFjZUNoaWxkKHByZXZpb3VzLmNoaWxkQ291bnQgLSAxLCBuZXN0ZWQpLFxyXG4gICAgKVxyXG4gICAgbmV3QmxvY2tQYXRoID0gW1xyXG4gICAgICAuLi5jb250ZXh0Lmxpc3RQYXRoLFxyXG4gICAgICBjb250ZXh0Lml0ZW1JbmRleCAtIDEsXHJcbiAgICAgIHByZXZpb3VzLmNoaWxkQ291bnQgLSAxLFxyXG4gICAgICBsYXN0Q2hpbGQuY2hpbGRDb3VudCxcclxuICAgICAgLi4ucmVzdFBhdGgsXHJcbiAgICBdXHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IG5lc3RlZCA9IGNvbnRleHQubGlzdC50eXBlLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50Lm9mKGNvbnRleHQuaXRlbSkpXHJcbiAgICByZXBsYWNlbWVudCA9IHByZXZpb3VzLndpdGhDb250ZW50KHByZXZpb3VzLmNvbnRlbnQuYXBwZW5kKEZyYWdtZW50Lm9mKG5lc3RlZCkpKVxyXG4gICAgbmV3QmxvY2tQYXRoID0gWy4uLmNvbnRleHQubGlzdFBhdGgsIGNvbnRleHQuaXRlbUluZGV4IC0gMSwgcHJldmlvdXMuY2hpbGRDb3VudCwgMCwgLi4ucmVzdFBhdGhdXHJcbiAgfVxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICB0ci5zdGVwKFxyXG4gICAgbmV3IFJlcGxhY2VOb2Rlc1N0ZXAoXHJcbiAgICAgIGNvbnRleHQubGlzdFBhdGgsXHJcbiAgICAgIGNvbnRleHQuaXRlbUluZGV4IC0gMSxcclxuICAgICAgY29udGV4dC5pdGVtSW5kZXggKyAxLFxyXG4gICAgICBGcmFnbWVudC5vZihyZXBsYWNlbWVudCksXHJcbiAgICApLFxyXG4gIClcclxuICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKG5ld0Jsb2NrUGF0aCwgc2VsZWN0aW9uLmZyb20ub2Zmc2V0KSkpXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKiBTaGlmdC1UYWIgLyBFbnRlci1vbi1lbXB0eTogbGlmdCB0aGUgY3VycmVudCBpdGVtIG91dCBvZiBpdHMgbGlzdC4gKi9cclxuZXhwb3J0IGNvbnN0IGxpZnRMaXN0SXRlbTogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGNvbnN0IGNvbnRleHQgPSBsaXN0Q29udGV4dEF0KHN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20ucGF0aClcclxuICBpZiAoIWNvbnRleHQpIHJldHVybiBudWxsXHJcbiAgY29uc3QgaXRlbXMgPSBjb250ZXh0Lmxpc3QuY29udGVudC5jaGlsZHJlblxyXG4gIGNvbnN0IGJlZm9yZSA9IGl0ZW1zLnNsaWNlKDAsIGNvbnRleHQuaXRlbUluZGV4KVxyXG4gIGNvbnN0IGFmdGVyID0gaXRlbXMuc2xpY2UoY29udGV4dC5pdGVtSW5kZXggKyAxKVxyXG4gIGNvbnN0IGJsb2NrSW5kZXggPSAoc2VsZWN0aW9uLmZyb20ucGF0aFtjb250ZXh0Lmxpc3RQYXRoLmxlbmd0aCArIDFdIGFzIG51bWJlciB8IHVuZGVmaW5lZCkgPz8gMFxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuXHJcbiAgLy8gTmVzdGVkIGxpc3QgKHRoaXMgbGlzdCBsaXZlcyBpbnNpZGUgYW5vdGhlciBsaXN0IGl0ZW0pOiB0aGUgbGlmdGVkIGl0ZW1cclxuICAvLyBiZWNvbWVzIGEgc2libGluZyBvZiBpdHMgcGFyZW50IGl0ZW0gaW4gdGhlIG91dGVyIGxpc3QuXHJcbiAgY29uc3QgcGFyZW50SXRlbVBhdGggPSBjb250ZXh0Lmxpc3RQYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IHBhcmVudEl0ZW0gPSBwYXJlbnRJdGVtUGF0aC5sZW5ndGggPiAwID8gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBhcmVudEl0ZW1QYXRoKSA6IG51bGxcclxuICBpZiAocGFyZW50SXRlbSAmJiBpc0xpc3RJdGVtVHlwZU5hbWUocGFyZW50SXRlbS50eXBlLm5hbWUpKSB7XHJcbiAgICBjb25zdCBsaXN0SW5kZXhJbkl0ZW0gPSBjb250ZXh0Lmxpc3RQYXRoW2NvbnRleHQubGlzdFBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBvdXRlclBhdGggPSBwYXJlbnRJdGVtUGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IHBhcmVudEluZGV4ID0gcGFyZW50SXRlbVBhdGhbcGFyZW50SXRlbVBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBrZXB0TmVzdGVkID0gYmVmb3JlLmxlbmd0aCA+IDAgPyBbY29udGV4dC5saXN0LndpdGhDb250ZW50KEZyYWdtZW50LmZyb20oYmVmb3JlKSldIDogW11cclxuICAgIGNvbnN0IG5ld1BhcmVudCA9IHBhcmVudEl0ZW0ud2l0aENvbnRlbnQoXHJcbiAgICAgIHBhcmVudEl0ZW0uY29udGVudC5yZXBsYWNlUmFuZ2UoXHJcbiAgICAgICAgbGlzdEluZGV4SW5JdGVtLFxyXG4gICAgICAgIGxpc3RJbmRleEluSXRlbSArIDEsXHJcbiAgICAgICAgRnJhZ21lbnQuZnJvbShrZXB0TmVzdGVkKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICAgIGNvbnN0IGNhcnJpZWQgPVxyXG4gICAgICBhZnRlci5sZW5ndGggPiAwID8gW2NvbnRleHQubGlzdC50eXBlLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50LmZyb20oYWZ0ZXIpKV0gOiBbXVxyXG4gICAgY29uc3QgbmV3SXRlbSA9IGNvbnRleHQuaXRlbS53aXRoQ29udGVudChjb250ZXh0Lml0ZW0uY29udGVudC5hcHBlbmQoRnJhZ21lbnQuZnJvbShjYXJyaWVkKSkpXHJcbiAgICB0ci5zdGVwKFxyXG4gICAgICBuZXcgUmVwbGFjZU5vZGVzU3RlcChcclxuICAgICAgICBvdXRlclBhdGgsXHJcbiAgICAgICAgcGFyZW50SW5kZXgsXHJcbiAgICAgICAgcGFyZW50SW5kZXggKyAxLFxyXG4gICAgICAgIEZyYWdtZW50Lm9mKG5ld1BhcmVudCwgbmV3SXRlbSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24oXHJcbiAgICAgIG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhbLi4ub3V0ZXJQYXRoLCBwYXJlbnRJbmRleCArIDEsIGJsb2NrSW5kZXhdLCBzZWxlY3Rpb24uZnJvbS5vZmZzZXQpKSxcclxuICAgIClcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxuXHJcbiAgLy8gVG9wLWxldmVsIGxpc3Q6IHRoZSBpdGVtJ3MgYmxvY2tzIGxhbmQgYmVzaWRlIHRoZSAocG9zc2libHkgc3BsaXQpIGxpc3QuXHJcbiAgY29uc3QgcmVwbGFjZW1lbnQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgaWYgKGJlZm9yZS5sZW5ndGggPiAwKSByZXBsYWNlbWVudC5wdXNoKGNvbnRleHQubGlzdC53aXRoQ29udGVudChGcmFnbWVudC5mcm9tKGJlZm9yZSkpKVxyXG4gIHJlcGxhY2VtZW50LnB1c2goLi4uY29udGV4dC5pdGVtLmNvbnRlbnQuY2hpbGRyZW4pXHJcbiAgaWYgKGFmdGVyLmxlbmd0aCA+IDApIHtcclxuICAgIHJlcGxhY2VtZW50LnB1c2goY29udGV4dC5saXN0LnR5cGUuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQuZnJvbShhZnRlcikpKVxyXG4gIH1cclxuICB0ci5zdGVwKHJlcGxhY2VOb2RlQXQoY29udGV4dC5saXN0UGF0aCwgRnJhZ21lbnQuZnJvbShyZXBsYWNlbWVudCkpKVxyXG5cclxuICBjb25zdCBsaXN0SW5kZXggPSBjb250ZXh0Lmxpc3RQYXRoW2NvbnRleHQubGlzdFBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgY29uc3QgbmV3SW5kZXggPSBsaXN0SW5kZXggKyAoYmVmb3JlLmxlbmd0aCA+IDAgPyAxIDogMCkgKyBibG9ja0luZGV4XHJcbiAgdHIuc2V0U2VsZWN0aW9uKFxyXG4gICAgbmV3IFRleHRTZWxlY3Rpb24ocG9zKFsuLi5jb250ZXh0Lmxpc3RQYXRoLnNsaWNlKDAsIC0xKSwgbmV3SW5kZXhdLCBzZWxlY3Rpb24uZnJvbS5vZmZzZXQpKSxcclxuICApXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKiBUb2dnbGUgdGhlIHNlbGVjdGlvbiBpbnRvL291dCBvZiBhIHRhc2sgbGlzdC4gKi9cclxuZXhwb3J0IGNvbnN0IHRvZ2dsZVRhc2tMaXN0OiBDb21tYW5kID0gdG9nZ2xlTGlzdCgndGFza0xpc3QnKVxyXG5cclxuLyoqIEZsaXAgdGhlIGBjaGVja2VkYCBhdHRyaWJ1dGUgb2YgdGhlIHRhc2sgaXRlbSBob2xkaW5nIHRoZSBzZWxlY3Rpb24uICovXHJcbmV4cG9ydCBjb25zdCB0b2dnbGVUYXNrQ2hlY2tlZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IGNvbnRleHQgPSBsaXN0Q29udGV4dEF0KHN0YXRlLmRvYywgc3RhdGUuc2VsZWN0aW9uLmZyb20ucGF0aClcclxuICBpZiAoY29udGV4dD8uaXRlbS50eXBlLm5hbWUgIT09ICd0YXNrSXRlbScpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIHN0YXRlLnRyLnN0ZXAoXHJcbiAgICBuZXcgU2V0Tm9kZUF0dHJzU3RlcChjb250ZXh0Lml0ZW1QYXRoLCB7XHJcbiAgICAgIC4uLmNvbnRleHQuaXRlbS5hdHRycyxcclxuICAgICAgY2hlY2tlZDogY29udGV4dC5pdGVtLmF0dHJzLmNoZWNrZWQgIT09IHRydWUsXHJcbiAgICB9KSxcclxuICApXHJcbn1cclxuXHJcbi8qKiBTZXQgYW4gZXhwbGljaXQgYGNoZWNrZWRgIHN0YXRlIG9uIHRoZSB0YXNrIGl0ZW0gYXQgYGl0ZW1QYXRoYC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNldFRhc2tDaGVja2VkKGl0ZW1QYXRoOiBQYXRoLCBjaGVja2VkOiBib29sZWFuKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3QgaXRlbSA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBpdGVtUGF0aClcclxuICAgIGlmIChpdGVtPy50eXBlLm5hbWUgIT09ICd0YXNrSXRlbScgfHwgaXRlbS5hdHRycy5jaGVja2VkID09PSBjaGVja2VkKSByZXR1cm4gbnVsbFxyXG4gICAgcmV0dXJuIHN0YXRlLnRyLnN0ZXAobmV3IFNldE5vZGVBdHRyc1N0ZXAoaXRlbVBhdGgsIHsgLi4uaXRlbS5hdHRycywgY2hlY2tlZCB9KSlcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXQgdGhlIG1hcmtlciBzdHlsZSBvZiB0aGUgbGlzdCB3cmFwcGluZyB0aGUgc2VsZWN0aW9uLiBEZWNsaW5lcyBvdXRzaWRlIGFcclxuICogbGlzdCwgYW5kIGZvciBhIHZhbHVlIHRoaXMgbGlzdCB0eXBlIGRvZXMgbm90IGFjY2VwdC4gVGhlIGF0dHJpYnV0ZSBpc1xyXG4gKiBzZXJpYWxpemVkIGludG8gYSBgc3R5bGVgIGF0dHJpYnV0ZSwgc28gdGhlIGFsbG93bGlzdCBpcyBsb2FkLWJlYXJpbmcuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0TGlzdFN0eWxlKHN0eWxlOiBzdHJpbmcgfCBudWxsKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3QgY29udGV4dCA9IGxpc3RDb250ZXh0QXQoc3RhdGUuZG9jLCBzdGF0ZS5zZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gICAgaWYgKCFjb250ZXh0KSByZXR1cm4gbnVsbFxyXG4gICAgaWYgKHN0eWxlICE9PSBudWxsICYmICFsaXN0U3R5bGVzRm9yKGNvbnRleHQubGlzdC50eXBlLm5hbWUpLmhhcyhzdHlsZSkpIHJldHVybiBudWxsXHJcbiAgICBpZiAoISgnbGlzdFN0eWxlJyBpbiBjb250ZXh0Lmxpc3QuYXR0cnMpKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYXR0cnMgPSB7IC4uLmNvbnRleHQubGlzdC5hdHRycywgbGlzdFN0eWxlOiBzdHlsZSB9XHJcbiAgICBpZiAoYXR0cnNFcShjb250ZXh0Lmxpc3QuYXR0cnMsIGF0dHJzKSkgcmV0dXJuIG51bGxcclxuICAgIHJldHVybiBzdGF0ZS50ci5zdGVwKG5ldyBTZXROb2RlQXR0cnNTdGVwKGNvbnRleHQubGlzdFBhdGgsIGF0dHJzKSlcclxuICB9XHJcbn1cclxuXHJcbi8qKiBOdW1iZXIgdGhlIG9yZGVyZWQgbGlzdCBhdCB0aGUgc2VsZWN0aW9uIGZyb20gMSBhZ2Fpbi4gKi9cclxuZXhwb3J0IGNvbnN0IHJlc3RhcnROdW1iZXJpbmc6IENvbW1hbmQgPSBjb250aW51ZU51bWJlcmluZygxKVxyXG5cclxuLyoqXHJcbiAqIE51bWJlciB0aGUgb3JkZXJlZCBsaXN0IGF0IHRoZSBzZWxlY3Rpb24gb24gZnJvbSB3aGVyZSB0aGUgbmVhcmVzdCBvcmRlcmVkXHJcbiAqIGxpc3QgYWJvdmUgaXQgKGluIHRoZSBzYW1lIHBhcmVudCkgbGVmdCBvZmYsIFdvcmQncyBcIkNvbnRpbnVlIG51bWJlcmluZ1wiLlxyXG4gKiBEZWNsaW5lcyB3aGVuIG5vIGVhcmxpZXIgb3JkZXJlZCBsaXN0IGV4aXN0cyB0byBjb250aW51ZSBmcm9tLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNvbnRpbnVlTnVtYmVyaW5nRnJvbVByZXZpb3VzOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgY29udGV4dCA9IGxpc3RDb250ZXh0QXQoc3RhdGUuZG9jLCBzdGF0ZS5zZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gIGlmIChjb250ZXh0Py5saXN0LnR5cGUubmFtZSAhPT0gJ29yZGVyZWRMaXN0JykgcmV0dXJuIG51bGxcclxuICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgY29udGV4dC5saXN0UGF0aC5zbGljZSgwLCAtMSkpXHJcbiAgaWYgKCFwYXJlbnQpIHJldHVybiBudWxsXHJcbiAgY29uc3QgaW5kZXggPSBjb250ZXh0Lmxpc3RQYXRoW2NvbnRleHQubGlzdFBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgZm9yIChsZXQgaSA9IGluZGV4IC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgIGNvbnN0IHNpYmxpbmcgPSBwYXJlbnQuY2hpbGQoaSlcclxuICAgIGlmIChzaWJsaW5nLnR5cGUubmFtZSAhPT0gJ29yZGVyZWRMaXN0JykgY29udGludWVcclxuICAgIGNvbnN0IHN0YXJ0ID0gdHlwZW9mIHNpYmxpbmcuYXR0cnMuc3RhcnQgPT09ICdudW1iZXInID8gc2libGluZy5hdHRycy5zdGFydCA6IDFcclxuICAgIHJldHVybiBjb250aW51ZU51bWJlcmluZyhzdGFydCArIHNpYmxpbmcuY2hpbGRDb3VudCkoc3RhdGUpXHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbi8qKiBOdW1iZXIgdGhlIG9yZGVyZWQgbGlzdCBhdCB0aGUgc2VsZWN0aW9uIGZyb20gYHN0YXJ0YC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnRpbnVlTnVtYmVyaW5nKHN0YXJ0OiBudW1iZXIpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBjb250ZXh0ID0gbGlzdENvbnRleHRBdChzdGF0ZS5kb2MsIHN0YXRlLnNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgICBpZiAoY29udGV4dD8ubGlzdC50eXBlLm5hbWUgIT09ICdvcmRlcmVkTGlzdCcpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCB2YWx1ZSA9IE1hdGgucm91bmQoc3RhcnQpXHJcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgfHwgY29udGV4dC5saXN0LmF0dHJzLnN0YXJ0ID09PSB2YWx1ZSkgcmV0dXJuIG51bGxcclxuICAgIHJldHVybiBzdGF0ZS50ci5zdGVwKFxyXG4gICAgICBuZXcgU2V0Tm9kZUF0dHJzU3RlcChjb250ZXh0Lmxpc3RQYXRoLCB7IC4uLmNvbnRleHQubGlzdC5hdHRycywgc3RhcnQ6IHZhbHVlIH0pLFxyXG4gICAgKVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBBdHRycyB9IGZyb20gJy4uL21vZGVsL2F0dHJzJ1xyXG5pbXBvcnQgeyBibG9ja3NJblJhbmdlIH0gZnJvbSAnLi4vbW9kZWwvYmxvY2tzJ1xyXG5pbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgeyBpbmxpbmVMZW5ndGgsIG1hcmtzQXRJbmxpbmVPZmZzZXQsIHJhbmdlc1dpdGhNYXJrIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IE1hcmsgfSBmcm9tICcuLi9tb2RlbC9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBwb3MgfSBmcm9tICcuLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHR5cGUgeyBTY2hlbWEgfSBmcm9tICcuLi9tb2RlbC9zY2hlbWEnXHJcbmltcG9ydCB7IG5vZGVBdFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBzYWZlSHJlZiB9IGZyb20gJy4uL3NjaGVtYS9iYXNpYydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uL3N0YXRlL2VkaXRvci1zdGF0ZSdcclxuaW1wb3J0IHsgVGV4dFNlbGVjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3NlbGVjdGlvbidcclxuaW1wb3J0IHsgQWRkTWFya1N0ZXAsIFJlbW92ZU1hcmtTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvbWFyay1zdGVwcydcclxuaW1wb3J0IHsgUmVwbGFjZUlubGluZVN0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9yZXBsYWNlLWlubGluZSdcclxuaW1wb3J0IHR5cGUgeyBUcmFuc2FjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3RyYW5zYWN0aW9uJ1xyXG5pbXBvcnQgdHlwZSB7IENvbW1hbmQgfSBmcm9tICcuL2NvbW1hbmRzJ1xyXG5pbXBvcnQgeyBzZXRNYXJrLCB1bnNldE1hcmsgfSBmcm9tICcuL2NvbW1hbmRzJ1xyXG5cclxuLyoqXHJcbiAqIEEgZGVsaWJlcmF0ZWx5IGNvbnNlcnZhdGl2ZSBlbWFpbCBwYXR0ZXJuOiBvbmUgYEBgLCBhIG5vbi1lbXB0eSBsb2NhbCBwYXJ0XHJcbiAqIHdpdGggbm8gc3BhY2VzIG9yIGFuZ2xlIGJyYWNrZXRzLCBhbmQgYSBkb3R0ZWQgZG9tYWluIHdob3NlIFRMRCBpc1xyXG4gKiBhbHBoYWJldGljLiBJdCByZWplY3RzIGZhciBtb3JlIHRoYW4gUkZDIDUzMjIgYWxsb3dzLCB3aGljaCBpcyB0aGUgcmlnaHRcclxuICogdHJhZGUgZm9yIGEgVUkgYWZmb3JkYW5jZS4gQSBmYWxzZSBhY2NlcHQgcHJvZHVjZXMgYSBkZWFkIGBtYWlsdG86YCBsaW5rLlxyXG4gKi9cclxuY29uc3QgRU1BSUwgPVxyXG4gIC9eW15cXHNAPD4oKVtcXF0sOzpcIlxcXFxdK0BbYS16MC05XSg/OlthLXowLTktXSpbYS16MC05XSk/KD86XFwuW2EtejAtOV0oPzpbYS16MC05LV0qW2EtejAtOV0pPykqXFwuW2Etel17Mix9JC9pXHJcblxyXG4vKiogSXMgYGFkZHJlc3NgIHNvbWV0aGluZyB3ZSBhcmUgd2lsbGluZyB0byB0dXJuIGludG8gYSBgbWFpbHRvOmAgbGluaz8gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRW1haWxBZGRyZXNzKGFkZHJlc3M6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gIGNvbnN0IHRyaW1tZWQgPSBhZGRyZXNzLnRyaW0oKVxyXG4gIGlmICh0cmltbWVkLmxlbmd0aCA9PT0gMCB8fCB0cmltbWVkLmxlbmd0aCA+IDI1NCkgcmV0dXJuIGZhbHNlXHJcbiAgLy8gQSBsb2NhbCBwYXJ0IGxvbmdlciB0aGFuIDY0IG9jdGV0cyBpcyBpbnZhbGlkIHBlciBSRkMgNTMyMS5cclxuICBjb25zdCBsb2NhbCA9IHRyaW1tZWQuc3BsaXQoJ0AnKVswXVxyXG4gIGlmICghbG9jYWwgfHwgbG9jYWwubGVuZ3RoID4gNjQpIHJldHVybiBmYWxzZVxyXG4gIGlmICh0cmltbWVkLmluY2x1ZGVzKCcuLicpKSByZXR1cm4gZmFsc2VcclxuICByZXR1cm4gRU1BSUwudGVzdCh0cmltbWVkKVxyXG59XHJcblxyXG4vKipcclxuICogU2V0IChvciBjbGVhcikgdGhlIGxpbmsgdGFyZ2V0IG9uIGV2ZXJ5IGxpbmsgdG91Y2hlZCBieSB0aGUgc2VsZWN0aW9uLlxyXG4gKlxyXG4gKiBgJ19ibGFuaydgIGFsd2F5cyBjYXJyaWVzIGByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJgLiBUaGUgbWFyaydzIGB0b0hUTUxgXHJcbiAqIGVtaXRzIHRoZSB0d28gdG9nZXRoZXIsIHNvIHRoZXJlIGlzIG5vIHdheSB0byBwcm9kdWNlIGEgYHRhcmdldD1fYmxhbmtgXHJcbiAqIGxpbmsgd2l0aG91dCB0aGUgcmVsIHRoYXQgcHJldmVudHMgcmV2ZXJzZSB0YWJuYWJiaW5nLiBgbnVsbGAgY2xlYXJzIGJvdGguXHJcbiAqXHJcbiAqIERlY2xpbmVzIHdoZW4gdGhlIHNlbGVjdGlvbiB0b3VjaGVzIG5vIGxpbmssIHNvIGl0IGNhbiBiZSBjaGFpbmVkLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNldExpbmtUYXJnZXQodGFyZ2V0OiAnX2JsYW5rJyB8IG51bGwpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiBtYXBMaW5rTWFya3Moc3RhdGUsIChtYXJrKSA9PiByZXRhcmdldChtYXJrLCB0YXJnZXQpKVxyXG59XHJcblxyXG4vKiogV2hpY2ggYXR0cmlidXRlcyBvZiBhIGxpbmsgdG8gY2hhbmdlOyB0aGUgcmVzdCBhcmUgbGVmdCBhcyB0aGV5IGFyZS4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBMaW5rVXBkYXRlIHtcclxuICByZWFkb25seSBocmVmPzogc3RyaW5nXHJcbiAgcmVhZG9ubHkgdGl0bGU/OiBzdHJpbmcgfCBudWxsXHJcbiAgcmVhZG9ubHkgdGFyZ2V0PzogJ19ibGFuaycgfCBudWxsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDaGFuZ2UgYSBsaW5rJ3MgYXR0cmlidXRlcyB3aXRob3V0IGRpc3R1cmJpbmcgaXRzIHRleHQuXHJcbiAqXHJcbiAqIFRoZSBjYXNlIHRoYXQgbWF0dGVycyBpcyBhIGJhcmUgY3Vyc29yLiBgc2V0TWFyaygnbGluaycsIFx1MjAyNilgIHdyaXRlcyBhIG1hcmtcclxuICogb3ZlciB0aGUgKnNlbGVjdGlvbiosIHNvIHdpdGggbm90aGluZyBzZWxlY3RlZCBpdCBzdG9yZXMgYSBwZW5kaW5nIG1hcmsgYW5kXHJcbiAqIHRoZSBsaW5rIHRoZSBjYXJldCBpcyBhY3R1YWxseSBzaXR0aW5nIGluIGtlZXBzIGl0cyBvbGQgYWRkcmVzcywgd2hpY2hcclxuICogbG9va3MsIGZyb20gdGhlIG91dHNpZGUsIGV4YWN0bHkgbGlrZSBhbiBlZGl0IHRoYXQgc2lsZW50bHkgZGlkIG5vdGhpbmcuXHJcbiAqIEhlcmUgdGhlIHdob2xlIGxpbmsgdW5kZXIgdGhlIGNhcmV0IGlzIHJld3JpdHRlbiwgdGhlIHdheSByZW1vdmluZyBvbmVcclxuICogYWxyZWFkeSB3b3Jrcy5cclxuICpcclxuICogRGVjbGluZXMgd2hlbiB0aGUgc2VsZWN0aW9uIHRvdWNoZXMgbm8gbGluaywgb3Igd2hlbiBub3RoaW5nIHdvdWxkIGNoYW5nZS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVMaW5rKGF0dHJzOiBMaW5rVXBkYXRlKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgLy8gRXZlcnkgaHJlZiByZWFjaGluZyB0aGUgZG9jdW1lbnQgZ29lcyB0aHJvdWdoIHRoZSBzYW5pdGl6ZXIsIGluY2x1ZGluZ1xyXG4gICAgLy8gb25lIHR5cGVkIGludG8gYW4gZWRpdGluZyBmaWVsZCBieSBzb21lb25lIHdobyBtZWFudCBubyBoYXJtLlxyXG4gICAgY29uc3QgaHJlZiA9IGF0dHJzLmhyZWYgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHNhZmVIcmVmKGF0dHJzLmhyZWYpXHJcbiAgICBpZiAoYXR0cnMuaHJlZiAhPT0gdW5kZWZpbmVkICYmICFocmVmKSByZXR1cm4gbnVsbFxyXG4gICAgcmV0dXJuIG1hcExpbmtNYXJrcyhzdGF0ZSwgKG1hcmspID0+IHtcclxuICAgICAgY29uc3QgbmV4dDogQXR0cnMgPSB7XHJcbiAgICAgICAgLi4ubWFyay5hdHRycyxcclxuICAgICAgICAuLi4oaHJlZiA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGhyZWYgfSksXHJcbiAgICAgICAgLi4uKGF0dHJzLnRpdGxlID09PSB1bmRlZmluZWQgPyB7fSA6IHsgdGl0bGU6IGF0dHJzLnRpdGxlIH0pLFxyXG4gICAgICAgIC4uLihhdHRycy50YXJnZXQgPT09IHVuZGVmaW5lZCA/IHt9IDogeyB0YXJnZXQ6IGF0dHJzLnRhcmdldCB9KSxcclxuICAgICAgfVxyXG4gICAgICBjb25zdCB1bmNoYW5nZWQgPSBPYmplY3Qua2V5cyhuZXh0KS5ldmVyeSgoa2V5KSA9PiBuZXh0W2tleV0gPT09IG1hcmsuYXR0cnNba2V5XSlcclxuICAgICAgcmV0dXJuIHVuY2hhbmdlZCA/IG51bGwgOiBtYXJrLnR5cGUuY3JlYXRlKG5leHQpXHJcbiAgICB9KVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJld3JpdGUgZXZlcnkgbGluayBtYXJrIHRoZSBzZWxlY3Rpb24gdG91Y2hlcywgb3IsIGF0IGEgYmFyZSBjdXJzb3IsIGV2ZXJ5XHJcbiAqIHJ1biBvZiB0aGUgb25lIGxpbmsgdGhlIGNhcmV0IGlzIGluc2lkZSwgd2hpY2ggaXMgdGhlIG9ubHkgd2F5IGEgdXNlciB3aXRoXHJcbiAqIG5vIHNlbGVjdGlvbiBjYW4gc2F5IFwidGhpcyBsaW5rXCIuXHJcbiAqXHJcbiAqIGB0cmFuc2Zvcm1gIHJldHVybnMgdGhlIHJlcGxhY2VtZW50IG1hcmssIG9yIG51bGwgdG8gbGVhdmUgYSBydW4gYWxvbmUuXHJcbiAqL1xyXG5mdW5jdGlvbiBtYXBMaW5rTWFya3MoXHJcbiAgc3RhdGU6IEVkaXRvclN0YXRlLFxyXG4gIHRyYW5zZm9ybTogKG1hcms6IE1hcmspID0+IE1hcmsgfCBudWxsLFxyXG4pOiBUcmFuc2FjdGlvbiB8IG51bGwge1xyXG4gIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubWFya1R5cGUoJ2xpbmsnKVxyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG5cclxuICBpZiAoc2VsZWN0aW9uLmVtcHR5ICYmIHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5oZWFkLnBhdGgpXHJcbiAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IGFjdGl2ZSA9IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgc2VsZWN0aW9uLmhlYWQub2Zmc2V0KS5maW5kKFxyXG4gICAgICAobWFyaykgPT4gbWFyay50eXBlID09PSB0eXBlLFxyXG4gICAgKVxyXG4gICAgaWYgKCFhY3RpdmUpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlc1dpdGhNYXJrKGJsb2NrLmNvbnRlbnQsIDAsIGlubGluZUxlbmd0aChibG9jay5jb250ZW50KSwgdHlwZSkpIHtcclxuICAgICAgaWYgKCFzYW1lTGluayhyYW5nZS5tYXJrLCBhY3RpdmUpKSBjb250aW51ZVxyXG4gICAgICBjb25zdCBuZXh0ID0gdHJhbnNmb3JtKHJhbmdlLm1hcmspXHJcbiAgICAgIGlmICghbmV4dCkgY29udGludWVcclxuICAgICAgdHIuc3RlcChuZXcgUmVtb3ZlTWFya1N0ZXAoc2VsZWN0aW9uLmhlYWQucGF0aCwgcmFuZ2UuZnJvbSwgcmFuZ2UudG8sIHJhbmdlLm1hcmspKVxyXG4gICAgICB0ci5zdGVwKG5ldyBBZGRNYXJrU3RlcChzZWxlY3Rpb24uaGVhZC5wYXRoLCByYW5nZS5mcm9tLCByYW5nZS50bywgbmV4dCkpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxuXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICBpZiAoYmxvY2suZnJvbSA+PSBibG9jay50bykgY29udGludWVcclxuICAgIGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzV2l0aE1hcmsoYmxvY2subm9kZS5jb250ZW50LCBibG9jay5mcm9tLCBibG9jay50bywgdHlwZSkpIHtcclxuICAgICAgY29uc3QgbmV4dCA9IHRyYW5zZm9ybShyYW5nZS5tYXJrKVxyXG4gICAgICBpZiAoIW5leHQpIGNvbnRpbnVlXHJcbiAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgdHIuc3RlcChuZXcgQWRkTWFya1N0ZXAoYmxvY2sucGF0aCwgcmFuZ2UuZnJvbSwgcmFuZ2UudG8sIG5leHQpKVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG59XHJcblxyXG4vKiogVGhlIHNhbWUgbWFyayB3aXRoIGEgbmV3IHRhcmdldCwgb3IgbnVsbCB3aGVuIGl0IGFscmVhZHkgaGFzIGl0LiAqL1xyXG5mdW5jdGlvbiByZXRhcmdldChtYXJrOiBNYXJrLCB0YXJnZXQ6ICdfYmxhbmsnIHwgbnVsbCk6IE1hcmsgfCBudWxsIHtcclxuICBjb25zdCBjdXJyZW50ID0gbWFyay5hdHRycy50YXJnZXQgPz8gbnVsbFxyXG4gIGlmIChjdXJyZW50ID09PSB0YXJnZXQpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIG1hcmsudHlwZS5jcmVhdGUoeyAuLi5tYXJrLmF0dHJzLCB0YXJnZXQgfSlcclxufVxyXG5cclxuLyoqIFR3byBsaW5rIG1hcmtzIHBvaW50aW5nIGF0IHRoZSBzYW1lIGRlc3RpbmF0aW9uLiAqL1xyXG5mdW5jdGlvbiBzYW1lTGluayhhOiBNYXJrLCBiOiBNYXJrKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIGEuYXR0cnMuaHJlZiA9PT0gYi5hdHRycy5ocmVmICYmIGEuYXR0cnMudGl0bGUgPT09IGIuYXR0cnMudGl0bGVcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJbnNlcnRFbWFpbExpbmtPcHRpb25zIHtcclxuICAvKiogTGluayB0ZXh0OyB0aGUgYWRkcmVzcyBpdHNlbGYgYnkgZGVmYXVsdC4gKi9cclxuICByZWFkb25seSB0ZXh0Pzogc3RyaW5nXHJcbiAgLyoqIE9wZW4gaW4gYSBuZXcgdGFiIChpbXBseWluZyBgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiYCkuICovXHJcbiAgcmVhZG9ubHkgdGFyZ2V0PzogJ19ibGFuaycgfCBudWxsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBMaW5rIHRoZSBzZWxlY3Rpb24gdG8gYSBgbWFpbHRvOmAgYWRkcmVzcywgb3IgaW5zZXJ0IHRoZSBhZGRyZXNzIGFzIGEgbmV3XHJcbiAqIGxpbmtlZCBzcGFuIHdoZW4gdGhlIHNlbGVjdGlvbiBpcyBlbXB0eS4gRGVjbGluZXMgb24gYW4gYWRkcmVzcyB0aGF0IGRvZXNcclxuICogbm90IHZhbGlkYXRlLCBzbyBhIHR5cG8gbmV2ZXIgYmVjb21lcyBhIGRlYWQgbGluay5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRFbWFpbExpbmsoYWRkcmVzczogc3RyaW5nLCBvcHRpb25zOiBJbnNlcnRFbWFpbExpbmtPcHRpb25zID0ge30pOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCB0cmltbWVkID0gYWRkcmVzcy50cmltKClcclxuICAgIGlmICghaXNFbWFpbEFkZHJlc3ModHJpbW1lZCkpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBocmVmID0gYG1haWx0bzoke3RyaW1tZWR9YFxyXG4gICAgLy8gQmVsdCBhbmQgYnJhY2VzOiB0aGUgYWRkcmVzcyBpcyBhbHJlYWR5IHZhbGlkYXRlZCwgYnV0IGV2ZXJ5IGhyZWYgaW5cclxuICAgIC8vIHRoZSBkb2N1bWVudCBnb2VzIHRocm91Z2ggdGhlIHNhbWUgc2FuaXRpemVyIHJlZ2FyZGxlc3MuXHJcbiAgICBpZiAoIXNhZmVIcmVmKGhyZWYpKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYXR0cnMgPSB7IGhyZWYsIHRpdGxlOiBudWxsLCB0YXJnZXQ6IG9wdGlvbnMudGFyZ2V0ID8/IG51bGwgfVxyXG5cclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gICAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBzZXRNYXJrKCdsaW5rJywgYXR0cnMpKHN0YXRlKVxyXG4gICAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikpIHJldHVybiBudWxsXHJcblxyXG4gICAgLy8gRW1wdHkgc2VsZWN0aW9uOiBpbnNlcnQgdGhlIGxhYmVsLCB0aGVuIGxpbmsgZXhhY3RseSB3aGF0IHdhcyBpbnNlcnRlZC5cclxuICAgIGNvbnN0IHBvaW50ID0gc2VsZWN0aW9uLmZyb21cclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBvaW50LnBhdGgpXHJcbiAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubWFya1R5cGUoJ2xpbmsnKVxyXG4gICAgaWYgKCFibG9jay50eXBlLmFsbG93c01hcmtUeXBlKHR5cGUpKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIGNvbnN0IGxhYmVsID0gb3B0aW9ucy50ZXh0Py50cmltKCkgfHwgdHJpbW1lZFxyXG4gICAgY29uc3QgaW5oZXJpdGVkID0gKFxyXG4gICAgICBzdGF0ZS5zdG9yZWRNYXJrcyA/PyBtYXJrc0F0SW5saW5lT2Zmc2V0KGJsb2NrLmNvbnRlbnQsIHBvaW50Lm9mZnNldClcclxuICAgICkuZmlsdGVyKChleGlzdGluZykgPT4gZXhpc3RpbmcudHlwZSAhPT0gdHlwZSAmJiBibG9jay50eXBlLmFsbG93c01hcmtUeXBlKGV4aXN0aW5nLnR5cGUpKVxyXG4gICAgY29uc3QgbWFyayA9IHR5cGUuY3JlYXRlKGF0dHJzKVxyXG5cclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIHRyLnN0ZXAoXHJcbiAgICAgIG5ldyBSZXBsYWNlSW5saW5lU3RlcChcclxuICAgICAgICBwb2ludC5wYXRoLFxyXG4gICAgICAgIHBvaW50Lm9mZnNldCxcclxuICAgICAgICBwb2ludC5vZmZzZXQsXHJcbiAgICAgICAgRnJhZ21lbnQub2Yoc3RhdGUuc2NoZW1hLnRleHQobGFiZWwsIG1hcmsuYWRkVG9TZXQoaW5oZXJpdGVkKSkpLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhwb2ludC5wYXRoLCBwb2ludC5vZmZzZXQgKyBsYWJlbC5sZW5ndGgpKSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlbW92ZSB0aGUgbGluayBtYXJrIGZyb20gdGhlIHNlbGVjdGlvbiwgb3IgZnJvbSB0aGUgd2hvbGUgbGluayB1bmRlciBhXHJcbiAqIGJhcmUgY3Vyc29yLCB3aGljaCBpcyB3aGF0IFwidW5saW5rXCIgbWVhbnMgd2hlbiBub3RoaW5nIGlzIHNlbGVjdGVkLlxyXG4gKiBEZWNsaW5lcyB3aGVuIHRoZXJlIGlzIG5vIGxpbmsgdG8gcmVtb3ZlLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IHJlbW92ZUxpbms6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm1hcmtUeXBlKCdsaW5rJylcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuXHJcbiAgaWYgKHNlbGVjdGlvbi5lbXB0eSAmJiBzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSB7XHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBzZWxlY3Rpb24uaGVhZC5wYXRoKVxyXG4gICAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2spIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBhY3RpdmUgPSBtYXJrc0F0SW5saW5lT2Zmc2V0KGJsb2NrLmNvbnRlbnQsIHNlbGVjdGlvbi5oZWFkLm9mZnNldCkuZmluZChcclxuICAgICAgKG1hcmspID0+IG1hcmsudHlwZSA9PT0gdHlwZSxcclxuICAgIClcclxuICAgIC8vIE5vIGxpbmsgdW5kZXIgdGhlIGNhcmV0OiBmYWxsIGJhY2sgdG8gY2xlYXJpbmcgdGhlIHN0b3JlZCBtYXJrLCBzbyBhXHJcbiAgICAvLyBwZW5kaW5nIGxpbmsgdGhlIHVzZXIgaGFzIG5vdCB0eXBlZCBpbnRvIHlldCBjYW4gc3RpbGwgYmUgY2FuY2VsbGVkLlxyXG4gICAgaWYgKCFhY3RpdmUpIHJldHVybiB1bnNldE1hcmsoJ2xpbmsnKShzdGF0ZSlcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzV2l0aE1hcmsoYmxvY2suY29udGVudCwgMCwgaW5saW5lTGVuZ3RoKGJsb2NrLmNvbnRlbnQpLCB0eXBlKSkge1xyXG4gICAgICBpZiAoIXNhbWVMaW5rKHJhbmdlLm1hcmssIGFjdGl2ZSkpIGNvbnRpbnVlXHJcbiAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKHNlbGVjdGlvbi5oZWFkLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgIH1cclxuICAgIHJldHVybiB0ci5kb2NDaGFuZ2VkID8gdHIgOiBudWxsXHJcbiAgfVxyXG5cclxuICByZXR1cm4gdW5zZXRNYXJrKCdsaW5rJykoc3RhdGUpXHJcbn1cclxuXHJcbmNvbnN0IFVSTF9JTl9URVhUID0gLyg/Omh0dHBzPzpcXC9cXC98d3d3XFwuKVteXFxzPD5cIidgXXsyLDIwMDB9L2dpXHJcblxyXG4vKiogUHVuY3R1YXRpb24gdGhhdCBlbmRzIGEgc2VudGVuY2UgcmF0aGVyIHRoYW4gYSBVUkwuICovXHJcbmNvbnN0IFVSTF9UUkFJTElOR19QVU5DVFVBVElPTiA9ICcuLDs6IT9cXCdcImApJ1xyXG5cclxuLyoqXHJcbiAqIFNwbGl0IHBsYWluIHRleHQgaW50byB0ZXh0IG5vZGVzIHdpdGggZXZlcnkgVVJMIHdyYXBwZWQgaW4gYSBsaW5rIG1hcms6XHJcbiAqIHdoYXQgcGFzdGluZyBhIHBhcmFncmFwaCB0aGF0IG1lbnRpb25zIGEgZmV3IHNpdGVzIHNob3VsZCBwcm9kdWNlLiBSZXR1cm5zXHJcbiAqIG51bGwgd2hlbiB0aGUgdGV4dCBob2xkcyBubyBVUkwsIHNvIGNhbGxlcnMgY2FuIGZhbGwgYmFjayB0byBhIHBsYWluIGluc2VydC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBsaW5raWZ5VGV4dChcclxuICBzY2hlbWE6IFNjaGVtYSxcclxuICB0ZXh0OiBzdHJpbmcsXHJcbiAgbWFya3M6IHJlYWRvbmx5IE1hcmtbXSA9IFtdLFxyXG4pOiBFZGl0b3JOb2RlW10gfCBudWxsIHtcclxuICBjb25zdCB0eXBlID0gc2NoZW1hLm1hcmtzLmxpbmtcclxuICBpZiAoIXR5cGUpIHJldHVybiBudWxsXHJcbiAgY29uc3Qgbm9kZXM6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgbGV0IGxhc3QgPSAwXHJcbiAgZm9yIChjb25zdCBtYXRjaCBvZiB0ZXh0Lm1hdGNoQWxsKFVSTF9JTl9URVhUKSkge1xyXG4gICAgbGV0IHVybCA9IG1hdGNoWzBdXHJcbiAgICB3aGlsZSAodXJsLmxlbmd0aCA+IDAgJiYgVVJMX1RSQUlMSU5HX1BVTkNUVUFUSU9OLmluY2x1ZGVzKHVybFt1cmwubGVuZ3RoIC0gMV0gYXMgc3RyaW5nKSkge1xyXG4gICAgICB1cmwgPSB1cmwuc2xpY2UoMCwgLTEpXHJcbiAgICB9XHJcbiAgICBjb25zdCBocmVmID0gc2FmZUhyZWYoL153d3dcXC4vaS50ZXN0KHVybCkgPyBgaHR0cHM6Ly8ke3VybH1gIDogdXJsKVxyXG4gICAgaWYgKCFocmVmIHx8IHVybC5sZW5ndGggPT09IDApIGNvbnRpbnVlXHJcbiAgICBjb25zdCBzdGFydCA9IG1hdGNoLmluZGV4ID8/IDBcclxuICAgIGlmIChzdGFydCA+IGxhc3QpIG5vZGVzLnB1c2goc2NoZW1hLnRleHQodGV4dC5zbGljZShsYXN0LCBzdGFydCksIG1hcmtzKSlcclxuICAgIG5vZGVzLnB1c2goc2NoZW1hLnRleHQodXJsLCB0eXBlLmNyZWF0ZSh7IGhyZWYgfSkuYWRkVG9TZXQobWFya3MpKSlcclxuICAgIGxhc3QgPSBzdGFydCArIHVybC5sZW5ndGhcclxuICB9XHJcbiAgaWYgKG5vZGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICBpZiAobGFzdCA8IHRleHQubGVuZ3RoKSBub2Rlcy5wdXNoKHNjaGVtYS50ZXh0KHRleHQuc2xpY2UobGFzdCksIG1hcmtzKSlcclxuICByZXR1cm4gbm9kZXNcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uL3N0YXRlL2VkaXRvci1zdGF0ZSdcclxuaW1wb3J0IHR5cGUgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS9zZWxlY3Rpb24nXHJcbmltcG9ydCB0eXBlIHsgU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXAnXHJcbmltcG9ydCB7IFNldE5vZGVBdHRyc1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9hdHRycy1zdGVwJ1xyXG5pbXBvcnQgeyBBZGRNYXJrU3RlcCwgUmVtb3ZlTWFya1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9tYXJrLXN0ZXBzJ1xyXG5pbXBvcnQgeyBSZXBsYWNlSW5saW5lU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lJ1xyXG5pbXBvcnQgeyBSZXBsYWNlTm9kZXNTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1ub2RlcydcclxuaW1wb3J0IHsgSm9pbk5vZGVzU3RlcCwgU3BsaXROb2RlU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3NwbGl0LWpvaW4nXHJcbmltcG9ydCB7IExpZnROb2Rlc1N0ZXAsIFdyYXBOb2Rlc1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy93cmFwLWxpZnQnXHJcbmltcG9ydCB0eXBlIHsgVHJhbnNhY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS90cmFuc2FjdGlvbidcclxuXHJcbmludGVyZmFjZSBIaXN0b3J5R3JvdXAge1xyXG4gIC8qKiBTdGVwcyB0aGF0IHVuZG8gdGhlIGdyb3VwLCBpbiBhcHBsaWNhdGlvbiBvcmRlci4gKi9cclxuICBzdGVwczogU3RlcFtdXHJcbiAgc2VsZWN0aW9uQmVmb3JlOiBTZWxlY3Rpb25cclxuICAvKiogVGltZSBvZiB0aGUgbGFzdCB0cmFuc2FjdGlvbiBmb2xkZWQgaW47IGRyaXZlcyB0eXBpbmctZ3JvdXAgbWVyZ2VzLiAqL1xyXG4gIHRpbWVzdGFtcDogbnVtYmVyXHJcbiAgLyoqIFdoZW4gdGhlIGdyb3VwIGhhcHBlbmVkLCBmb3IgZGlzcGxheSwga2VwdCBhY3Jvc3MgdW5kby9yZWRvIG1vdmVzLiAqL1xyXG4gIGF0OiBudW1iZXJcclxuICAvKiogV2hhdCB0aGUgZ3JvdXAgZGlkLCBmb3IgYSBoaXN0b3J5IHBhbmVsLiAqL1xyXG4gIGxhYmVsOiBzdHJpbmdcclxuICAvKiogSG93IG1hbnkgdHJhbnNhY3Rpb25zIHdlcmUgZm9sZGVkIGludG8gdGhlIGdyb3VwLiAqL1xyXG4gIHNpemU6IG51bWJlclxyXG59XHJcblxyXG4vKiogT25lIHVuZG8gb3IgcmVkbyBncm91cCwgYXMgYSBoaXN0b3J5IHBhbmVsIGxpc3RzIGl0LiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIEhpc3RvcnlFbnRyeSB7XHJcbiAgLyoqIFwiVHlwaW5nXCIsIFwiVGV4dCBmb3JtYXR0aW5nXCIsIFx1MjAyNiBvciBhIGxhYmVsIHNldCB0aHJvdWdoIHtAbGluayBISVNUT1JZX0xBQkVMfS4gKi9cclxuICByZWFkb25seSBsYWJlbDogc3RyaW5nXHJcbiAgLyoqIFdoZW4gdGhlIGdyb3VwIGhhcHBlbmVkIChtcyBzaW5jZSB0aGUgZXBvY2gsIGZyb20gdGhlIHRyYW5zYWN0aW9uKS4gKi9cclxuICByZWFkb25seSB0aW1lc3RhbXA6IG51bWJlclxyXG4gIC8qKiBIb3cgbWFueSB0cmFuc2FjdGlvbnMgd2VyZSBmb2xkZWQgaW50byB0aGUgZ3JvdXAuICovXHJcbiAgcmVhZG9ubHkgc2l6ZTogbnVtYmVyXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgSGlzdG9yeU9wdGlvbnMge1xyXG4gIC8qKiBUcmFuc2FjdGlvbnMgY2xvc2VyIHRvZ2V0aGVyIHRoYW4gdGhpcyAobXMpIG1lcmdlIGludG8gb25lIHVuZG8gZ3JvdXAuICovXHJcbiAgcmVhZG9ubHkgZ3JvdXBEZWxheT86IG51bWJlclxyXG4gIC8qKiBNYXhpbXVtIG51bWJlciBvZiB1bmRvIGdyb3VwcyBrZXB0LiAqL1xyXG4gIHJlYWRvbmx5IGRlcHRoPzogbnVtYmVyXHJcbn1cclxuXHJcbi8qKiBUcmFuc2FjdGlvbiBtZXRhIGtleTogc2V0IHRvIGBmYWxzZWAgdG8ga2VlcCBhIHRyYW5zYWN0aW9uIG91dCBvZiBoaXN0b3J5LiAqL1xyXG5leHBvcnQgY29uc3QgQUREX1RPX0hJU1RPUlkgPSAnYWRkVG9IaXN0b3J5J1xyXG4vKiogVHJhbnNhY3Rpb24gbWV0YSBrZXk6IHNldCB0byBgdHJ1ZWAgdG8gZm9yY2UgYSBuZXcgdW5kbyBncm91cC4gKi9cclxuZXhwb3J0IGNvbnN0IE5FV19ISVNUT1JZX0dST1VQID0gJ25ld0hpc3RvcnlHcm91cCdcclxuLyoqXHJcbiAqIFRyYW5zYWN0aW9uIG1ldGEga2V5OiBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGZvciB0aGUgdW5kbyBncm91cCAoXCJJbnNlcnRcclxuICogdGFibGVcIikuIFdpdGhvdXQgaXQgdGhlIGxhYmVsIGlzIGluZmVycmVkIGZyb20gdGhlIGtpbmRzIG9mIHN0ZXAgYXBwbGllZC5cclxuICovXHJcbmV4cG9ydCBjb25zdCBISVNUT1JZX0xBQkVMID0gJ2hpc3RvcnlMYWJlbCdcclxuXHJcbi8qKlxyXG4gKiBVbmRvIG1hbmFnZXIgYnVpbHQgb24gc3RlcCBpbnZlcnNpb24uIEdyb3VwcyBhZGphY2VudC1pbi10aW1lIHRyYW5zYWN0aW9uc1xyXG4gKiBhbmQgcmVzdG9yZXMgdGhlIHNlbGVjdGlvbiBmcm9tIGJlZm9yZSBlYWNoIGdyb3VwLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIEhpc3Rvcnkge1xyXG4gIHByaXZhdGUgdW5kb1N0YWNrOiBIaXN0b3J5R3JvdXBbXSA9IFtdXHJcbiAgcHJpdmF0ZSByZWRvU3RhY2s6IEhpc3RvcnlHcm91cFtdID0gW11cclxuICBwcml2YXRlIHJlYWRvbmx5IGdyb3VwRGVsYXk6IG51bWJlclxyXG4gIHByaXZhdGUgcmVhZG9ubHkgZGVwdGg6IG51bWJlclxyXG5cclxuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBIaXN0b3J5T3B0aW9ucyA9IHt9KSB7XHJcbiAgICB0aGlzLmdyb3VwRGVsYXkgPSBvcHRpb25zLmdyb3VwRGVsYXkgPz8gNTAwXHJcbiAgICB0aGlzLmRlcHRoID0gb3B0aW9ucy5kZXB0aCA/PyAxMDBcclxuICB9XHJcblxyXG4gIGdldCBjYW5VbmRvKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudW5kb1N0YWNrLmxlbmd0aCA+IDBcclxuICB9XHJcblxyXG4gIGdldCBjYW5SZWRvKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMucmVkb1N0YWNrLmxlbmd0aCA+IDBcclxuICB9XHJcblxyXG4gIC8qKiBVbmRvIGdyb3Vwcywgb2xkZXN0IGZpcnN0OiB0aGUgbGFzdCBlbnRyeSBpcyB3aGF0IHtAbGluayB1bmRvfSByZXZlcnRzIG5leHQuICovXHJcbiAgZ2V0IHVuZG9FbnRyaWVzKCk6IHJlYWRvbmx5IEhpc3RvcnlFbnRyeVtdIHtcclxuICAgIHJldHVybiB0aGlzLnVuZG9TdGFjay5tYXAoZW50cnlPZilcclxuICB9XHJcblxyXG4gIC8qKiBSZWRvIGdyb3VwczsgdGhlIGxhc3QgZW50cnkgaXMgd2hhdCB7QGxpbmsgcmVkb30gcmVhcHBsaWVzIG5leHQuICovXHJcbiAgZ2V0IHJlZG9FbnRyaWVzKCk6IHJlYWRvbmx5IEhpc3RvcnlFbnRyeVtdIHtcclxuICAgIHJldHVybiB0aGlzLnJlZG9TdGFjay5tYXAoZW50cnlPZilcclxuICB9XHJcblxyXG4gIC8qKiBSZWNvcmQgYSBkaXNwYXRjaGVkIGRvY3VtZW50LWNoYW5naW5nIHRyYW5zYWN0aW9uLiAqL1xyXG4gIHJlY29yZCh0cjogVHJhbnNhY3Rpb24sIHNlbGVjdGlvbkJlZm9yZTogU2VsZWN0aW9uKTogdm9pZCB7XHJcbiAgICBpZiAoIXRyLmRvY0NoYW5nZWQgfHwgdHIuZ2V0TWV0YShBRERfVE9fSElTVE9SWSkgPT09IGZhbHNlKSByZXR1cm5cclxuICAgIGNvbnN0IGludmVydGVkID0gaW52ZXJ0U3RlcHModHIuc3RlcHMsIHRyLmRvY3MpXHJcbiAgICBjb25zdCBsYWJlbCA9IGxhYmVsRm9yKHRyKVxyXG4gICAgY29uc3QgbGFzdCA9IHRoaXMudW5kb1N0YWNrW3RoaXMudW5kb1N0YWNrLmxlbmd0aCAtIDFdXHJcbiAgICBpZiAoXHJcbiAgICAgIGxhc3QgJiZcclxuICAgICAgdHIudGltZSAtIGxhc3QudGltZXN0YW1wIDwgdGhpcy5ncm91cERlbGF5ICYmXHJcbiAgICAgIHRyLmdldE1ldGEoTkVXX0hJU1RPUllfR1JPVVApICE9PSB0cnVlXHJcbiAgICApIHtcclxuICAgICAgbGFzdC5zdGVwcyA9IFsuLi5pbnZlcnRlZCwgLi4ubGFzdC5zdGVwc11cclxuICAgICAgbGFzdC50aW1lc3RhbXAgPSB0ci50aW1lXHJcbiAgICAgIGxhc3QuYXQgPSB0ci50aW1lXHJcbiAgICAgIGxhc3Quc2l6ZSArPSAxXHJcbiAgICAgIC8vIEEgYnVyc3QgbWl4aW5nIGtpbmRzIG9mIGNoYW5nZSBpcyBiZXN0IGRlc2NyaWJlZCBhcyBwbGFpbiBlZGl0aW5nLlxyXG4gICAgICBpZiAobGFzdC5sYWJlbCAhPT0gbGFiZWwpIGxhc3QubGFiZWwgPSAnRWRpdGluZydcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMudW5kb1N0YWNrLnB1c2goe1xyXG4gICAgICAgIHN0ZXBzOiBpbnZlcnRlZCxcclxuICAgICAgICBzZWxlY3Rpb25CZWZvcmUsXHJcbiAgICAgICAgdGltZXN0YW1wOiB0ci50aW1lLFxyXG4gICAgICAgIGF0OiB0ci50aW1lLFxyXG4gICAgICAgIGxhYmVsLFxyXG4gICAgICAgIHNpemU6IDEsXHJcbiAgICAgIH0pXHJcbiAgICAgIGlmICh0aGlzLnVuZG9TdGFjay5sZW5ndGggPiB0aGlzLmRlcHRoKSB0aGlzLnVuZG9TdGFjay5zaGlmdCgpXHJcbiAgICB9XHJcbiAgICB0aGlzLnJlZG9TdGFjayA9IFtdXHJcbiAgfVxyXG5cclxuICB1bmRvKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IFRyYW5zYWN0aW9uIHwgbnVsbCB7XHJcbiAgICByZXR1cm4gdGhpcy5tb3ZlKHN0YXRlLCB0aGlzLnVuZG9TdGFjaywgdGhpcy5yZWRvU3RhY2spXHJcbiAgfVxyXG5cclxuICByZWRvKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IFRyYW5zYWN0aW9uIHwgbnVsbCB7XHJcbiAgICByZXR1cm4gdGhpcy5tb3ZlKHN0YXRlLCB0aGlzLnJlZG9TdGFjaywgdGhpcy51bmRvU3RhY2spXHJcbiAgfVxyXG5cclxuICBjbGVhcigpOiB2b2lkIHtcclxuICAgIHRoaXMudW5kb1N0YWNrID0gW11cclxuICAgIHRoaXMucmVkb1N0YWNrID0gW11cclxuICB9XHJcblxyXG4gIHByaXZhdGUgbW92ZShzdGF0ZTogRWRpdG9yU3RhdGUsIGZyb206IEhpc3RvcnlHcm91cFtdLCB0bzogSGlzdG9yeUdyb3VwW10pOiBUcmFuc2FjdGlvbiB8IG51bGwge1xyXG4gICAgY29uc3QgZ3JvdXAgPSBmcm9tLnBvcCgpXHJcbiAgICBpZiAoIWdyb3VwKSByZXR1cm4gbnVsbFxyXG4gICAgLy8gTW92aW5nIG9mZiBhIGdyb3VwIGNsb3NlcyB0aGUgb25lIG5vdyBvbiB0b3A6IHRoZSBuZXh0IGVkaXQgbXVzdCBzdGFydFxyXG4gICAgLy8gaXRzIG93biBncm91cCwgb3IgYSBzaW5nbGUgdW5kbyB3b3VsZCByZXZlcnQgYm90aCB0aGF0IGVkaXQgYW5kIHdvcmtcclxuICAgIC8vIHRoZSB1c2VyIGhhZCBhbHJlYWR5IHN0ZXBwZWQgYmFjayBvdmVyLlxyXG4gICAgY29uc3QgZXhwb3NlZCA9IGZyb21bZnJvbS5sZW5ndGggLSAxXVxyXG4gICAgaWYgKGV4cG9zZWQpIGV4cG9zZWQudGltZXN0YW1wID0gMFxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgZm9yIChjb25zdCBzdGVwIG9mIGdyb3VwLnN0ZXBzKSB0ci5zdGVwKHN0ZXApXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24oZ3JvdXAuc2VsZWN0aW9uQmVmb3JlKVxyXG4gICAgdHIuc2V0TWV0YShBRERfVE9fSElTVE9SWSwgZmFsc2UpXHJcbiAgICB0by5wdXNoKHtcclxuICAgICAgc3RlcHM6IGludmVydFN0ZXBzKHRyLnN0ZXBzLCB0ci5kb2NzKSxcclxuICAgICAgc2VsZWN0aW9uQmVmb3JlOiBzdGF0ZS5zZWxlY3Rpb24sXHJcbiAgICAgIHRpbWVzdGFtcDogMCwgLy8gbmV2ZXIgbWVyZ2VkIHdpdGggdHlwaW5nIGdyb3Vwc1xyXG4gICAgICBhdDogZ3JvdXAuYXQsXHJcbiAgICAgIGxhYmVsOiBncm91cC5sYWJlbCxcclxuICAgICAgc2l6ZTogZ3JvdXAuc2l6ZSxcclxuICAgIH0pXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGVudHJ5T2YoZ3JvdXA6IEhpc3RvcnlHcm91cCk6IEhpc3RvcnlFbnRyeSB7XHJcbiAgcmV0dXJuIHsgbGFiZWw6IGdyb3VwLmxhYmVsLCB0aW1lc3RhbXA6IGdyb3VwLmF0LCBzaXplOiBncm91cC5zaXplIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaW52ZXJ0U3RlcHMoc3RlcHM6IHJlYWRvbmx5IFN0ZXBbXSwgZG9jczogcmVhZG9ubHkgRWRpdG9yTm9kZVtdKTogU3RlcFtdIHtcclxuICByZXR1cm4gc3RlcHMubWFwKChzdGVwLCBpKSA9PiBzdGVwLmludmVydChkb2NzW2ldIGFzIEVkaXRvck5vZGUpKS5yZXZlcnNlKClcclxufVxyXG5cclxuLyoqIERlc2NyaWJlIGEgdHJhbnNhY3Rpb24gZm9yIHRoZSBoaXN0b3J5IHBhbmVsLCBmcm9tIGl0cyBtZXRhIG9yIGl0cyBzdGVwcy4gKi9cclxuZnVuY3Rpb24gbGFiZWxGb3IodHI6IFRyYW5zYWN0aW9uKTogc3RyaW5nIHtcclxuICBjb25zdCBjdXN0b20gPSB0ci5nZXRNZXRhKEhJU1RPUllfTEFCRUwpXHJcbiAgaWYgKHR5cGVvZiBjdXN0b20gPT09ICdzdHJpbmcnICYmIGN1c3RvbS5sZW5ndGggPiAwKSByZXR1cm4gY3VzdG9tXHJcbiAgY29uc3Qga2luZHMgPSBuZXcgU2V0KHRyLnN0ZXBzLm1hcChraW5kT2YpKVxyXG4gIGlmIChraW5kcy5oYXMoJ3N0cnVjdHVyZScpKSByZXR1cm4gJ1N0cnVjdHVyZSBjaGFuZ2UnXHJcbiAgaWYgKGtpbmRzLmhhcygnc3BsaXQnKSkgcmV0dXJuICdQYXJhZ3JhcGggY2hhbmdlJ1xyXG4gIGlmIChraW5kcy5oYXMoJ3dyYXAnKSkgcmV0dXJuICdCbG9jayBjaGFuZ2UnXHJcbiAgaWYgKGtpbmRzLmhhcygnYXR0cnMnKSkgcmV0dXJuICdCbG9jayBmb3JtYXR0aW5nJ1xyXG4gIGlmIChraW5kcy5oYXMoJ21hcmsnKSkgcmV0dXJuICdUZXh0IGZvcm1hdHRpbmcnXHJcbiAgaWYgKGtpbmRzLmhhcygndGV4dCcpKSByZXR1cm4gJ1R5cGluZydcclxuICByZXR1cm4gJ0VkaXQnXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGtpbmRPZihzdGVwOiBTdGVwKTogc3RyaW5nIHtcclxuICBpZiAoc3RlcCBpbnN0YW5jZW9mIFJlcGxhY2VJbmxpbmVTdGVwKSByZXR1cm4gJ3RleHQnXHJcbiAgaWYgKHN0ZXAgaW5zdGFuY2VvZiBBZGRNYXJrU3RlcCB8fCBzdGVwIGluc3RhbmNlb2YgUmVtb3ZlTWFya1N0ZXApIHJldHVybiAnbWFyaydcclxuICBpZiAoc3RlcCBpbnN0YW5jZW9mIFNldE5vZGVBdHRyc1N0ZXApIHJldHVybiAnYXR0cnMnXHJcbiAgaWYgKHN0ZXAgaW5zdGFuY2VvZiBTcGxpdE5vZGVTdGVwIHx8IHN0ZXAgaW5zdGFuY2VvZiBKb2luTm9kZXNTdGVwKSByZXR1cm4gJ3NwbGl0J1xyXG4gIGlmIChzdGVwIGluc3RhbmNlb2YgV3JhcE5vZGVzU3RlcCB8fCBzdGVwIGluc3RhbmNlb2YgTGlmdE5vZGVzU3RlcCkgcmV0dXJuICd3cmFwJ1xyXG4gIGlmIChzdGVwIGluc3RhbmNlb2YgUmVwbGFjZU5vZGVzU3RlcCkgcmV0dXJuICdzdHJ1Y3R1cmUnXHJcbiAgcmV0dXJuICdvdGhlcidcclxufVxyXG4iLCAiaW1wb3J0IHsgaXNMaXN0SXRlbVR5cGVOYW1lIH0gZnJvbSAnLi4vY29tbWFuZHMvbGlzdHMnXHJcbmltcG9ydCB7IE5FV19ISVNUT1JZX0dST1VQIH0gZnJvbSAnLi4vaGlzdG9yeS9oaXN0b3J5J1xyXG5pbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgeyBtYXJrc0F0SW5saW5lT2Zmc2V0IH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBwb3MgfSBmcm9tICcuLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoIH0gZnJvbSAnLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHsgc2FmZUhyZWYgfSBmcm9tICcuLi9zY2hlbWEvYmFzaWMnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yU3RhdGUgfSBmcm9tICcuLi9zdGF0ZS9lZGl0b3Itc3RhdGUnXHJcbmltcG9ydCB7IFRleHRTZWxlY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS9zZWxlY3Rpb24nXHJcbmltcG9ydCB7IEFkZE1hcmtTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvbWFyay1zdGVwcydcclxuaW1wb3J0IHsgUmVwbGFjZUlubGluZVN0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9yZXBsYWNlLWlubGluZSdcclxuaW1wb3J0IHsgUmVwbGFjZU5vZGVzU3RlcCwgcmVwbGFjZU5vZGVBdCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2Utbm9kZXMnXHJcbmltcG9ydCB7IFdyYXBOb2Rlc1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy93cmFwLWxpZnQnXHJcbmltcG9ydCB0eXBlIHsgVHJhbnNhY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS90cmFuc2FjdGlvbidcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgSW5wdXRSdWxlQ29udGV4dCB7XHJcbiAgcmVhZG9ubHkgc3RhdGU6IEVkaXRvclN0YXRlXHJcbiAgcmVhZG9ubHkgYmxvY2tQYXRoOiBQYXRoXHJcbiAgcmVhZG9ubHkgYmxvY2s6IEVkaXRvck5vZGVcclxuICAvKiogTWF0Y2hlZCByYW5nZSBpbiB0aGUgYmxvY2sncyBleGlzdGluZyBpbmxpbmUgY29udGVudCAoW2Zyb20sIGNhcmV0KSkuICovXHJcbiAgcmVhZG9ubHkgZnJvbTogbnVtYmVyXHJcbiAgcmVhZG9ubHkgdG86IG51bWJlclxyXG59XHJcblxyXG4vKipcclxuICogQSBwYXR0ZXJuLXRyaWdnZXJlZCB0cmFuc2Zvcm0uIGBtYXRjaGAgcnVucyBhZ2FpbnN0IHRoZSBibG9jayB0ZXh0IGZyb20gaXRzXHJcbiAqIHN0YXJ0IHRvIHRoZSBjYXJldCBwbHVzIHRoZSBqdXN0LXR5cGVkIGNoYXJhY3RlciwgYW5kIG11c3QgYW5jaG9yIGF0IHRoZVxyXG4gKiBlbmQgKGAkYCkuIFdoZW4gaXQgZmlyZXMsIHRoZSB0eXBlZCBjaGFyYWN0ZXIgaXMgbmV2ZXIgaW5zZXJ0ZWQuIFRoZSBydWxlXHJcbiAqIHByb2R1Y2VzIHRoZSB3aG9sZSB0cmFuc2FjdGlvbi5cclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgSW5wdXRSdWxlIHtcclxuICByZWFkb25seSBtYXRjaDogUmVnRXhwXHJcbiAgcmVhZG9ubHkgcnVuOiAoY29udGV4dDogSW5wdXRSdWxlQ29udGV4dCwgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gVHJhbnNhY3Rpb24gfCBudWxsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUcnkgdGhlIHJ1bGVzIGZvciBhIHR5cGVkIGNoYXJhY3Rlci4gUmV0dXJucyB0aGUgdHJhbnNmb3JtIHRyYW5zYWN0aW9uLCBvclxyXG4gKiBudWxsIHdoZW4gbm8gcnVsZSBhcHBsaWVzICh0aGUgY2FsbGVyIHRoZW4gaW5zZXJ0cyB0aGUgdGV4dCBub3JtYWxseSkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlJbnB1dFJ1bGVzKFxyXG4gIHN0YXRlOiBFZGl0b3JTdGF0ZSxcclxuICB0eXBlZDogc3RyaW5nLFxyXG4gIHJ1bGVzOiByZWFkb25seSBJbnB1dFJ1bGVbXSxcclxuKTogVHJhbnNhY3Rpb24gfCBudWxsIHtcclxuICBpZiAodHlwZWQubGVuZ3RoICE9PSAxKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHx8ICFzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBudWxsXHJcbiAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uaGVhZFxyXG4gIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBvaW50LnBhdGgpXHJcbiAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2spIHJldHVybiBudWxsXHJcbiAgLy8gU291cmNlIHRleHQgaXMgdHlwZWQsIG5vdCB3cml0dGVuOiBcIiMgXCIsIFwiPiBcIiwgXCJgYGBcIiBhbmQgXCItLVwiIGFyZSBhbGxcclxuICAvLyB0aGluZ3MgYSBjb2RlIGJsb2NrIGlzIGV4cGVjdGVkIHRvIGhvbGQgbGl0ZXJhbGx5LCBzbyBubyBydWxlIG1heSBmaXJlXHJcbiAgLy8gaW5zaWRlIG9uZS4gVGhlIHNhbWUgZ29lcyBmb3IgdGV4dCBhbHJlYWR5IGNhcnJ5aW5nIHRoZSBgY29kZWAgbWFyay5cclxuICBpZiAoYmxvY2sudHlwZS5zcGVjLnByZXNlcnZlV2hpdGVzcGFjZSkgcmV0dXJuIG51bGxcclxuICBpZiAoaXNJbnNpZGVJbmxpbmVDb2RlKGJsb2NrLCBwb2ludC5vZmZzZXQpKSByZXR1cm4gbnVsbFxyXG4gIC8vIE9mZnNldHMgaW4gYHRleHRDb250ZW50YCBlcXVhbCBpbmxpbmUgb2Zmc2V0cyBvbmx5IHdpdGhvdXQgYXRvbXMsIGJhaWwgb3RoZXJ3aXNlLlxyXG4gIGlmIChibG9jay5jb250ZW50LmNoaWxkcmVuLnNvbWUoKGNoaWxkKSA9PiAhY2hpbGQuaXNUZXh0KSkgcmV0dXJuIG51bGxcclxuICBjb25zdCB0ZXh0QmVmb3JlID0gYmxvY2sudGV4dENvbnRlbnQuc2xpY2UoMCwgcG9pbnQub2Zmc2V0KVxyXG4gIGNvbnN0IGNhbmRpZGF0ZSA9IHRleHRCZWZvcmUgKyB0eXBlZFxyXG4gIGZvciAoY29uc3QgcnVsZSBvZiBydWxlcykge1xyXG4gICAgY29uc3QgbWF0Y2ggPSBydWxlLm1hdGNoLmV4ZWMoY2FuZGlkYXRlKVxyXG4gICAgaWYgKCFtYXRjaCB8fCBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCAhPT0gY2FuZGlkYXRlLmxlbmd0aCkgY29udGludWVcclxuICAgIGNvbnN0IHRyID0gcnVsZS5ydW4oXHJcbiAgICAgIHsgc3RhdGUsIGJsb2NrUGF0aDogcG9pbnQucGF0aCwgYmxvY2ssIGZyb206IG1hdGNoLmluZGV4LCB0bzogcG9pbnQub2Zmc2V0IH0sXHJcbiAgICAgIG1hdGNoLFxyXG4gICAgKVxyXG4gICAgaWYgKHRyKSByZXR1cm4gdHIuc2V0TWV0YShORVdfSElTVE9SWV9HUk9VUCwgdHJ1ZSlcclxuICB9XHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuLyoqXHJcbiAqIFdoZXRoZXIgdGhlIHRleHQgdGhlIGNhcmV0IGlzIGV4dGVuZGluZyBjYXJyaWVzIHRoZSBgY29kZWAgbWFyay4gTWFya3NcclxuICogY29udGludWUgZnJvbSB0aGUgbGVmdCBhcyB5b3UgdHlwZSwgc28gaXQgaXMgdGhlIHJ1biAqZW5kaW5nKiBhdCB0aGUgY2FyZXRcclxuICogdGhhdCBkZWNpZGVzLiBUaGUgc2FtZSBydWxlIGBtYXJrc0F0SW5saW5lT2Zmc2V0YCBhcHBsaWVzLlxyXG4gKi9cclxuZnVuY3Rpb24gaXNJbnNpZGVJbmxpbmVDb2RlKGJsb2NrOiBFZGl0b3JOb2RlLCBvZmZzZXQ6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gIGNvbnN0IG1hcmtzID0gbWFya3NBdElubGluZU9mZnNldChibG9jay5jb250ZW50LCBvZmZzZXQpXHJcbiAgcmV0dXJuIG1hcmtzLnNvbWUoKG1hcmspID0+IG1hcmsudHlwZS5uYW1lID09PSAnY29kZScpXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGVmYXVsdElucHV0UnVsZU9wdGlvbnMge1xyXG4gIC8qKiBgLS1gIFx1MjE5MiBlbSBkYXNoLiBPbiBieSBkZWZhdWx0LiAqL1xyXG4gIHJlYWRvbmx5IGVtRGFzaD86IGJvb2xlYW5cclxuICAvKiogTGluayBhIFVSTCBhcyBzb29uIGFzIGl0IGlzIGZvbGxvd2VkIGJ5IGEgc3BhY2UuIE9uIGJ5IGRlZmF1bHQuICovXHJcbiAgcmVhZG9ubHkgYXV0b2xpbms/OiBib29sZWFuXHJcbiAgLyoqIGBgIGB0ZXh0YCBgYCBcdTIxOTIgaW5saW5lIGNvZGUsIG9uIHRoZSBjbG9zaW5nIGJhY2t0aWNrLiBPbiBieSBkZWZhdWx0LiAqL1xyXG4gIHJlYWRvbmx5IGlubGluZUNvZGU/OiBib29sZWFuXHJcbn1cclxuXHJcbi8qKiBUaGUgc3RvY2sgbWFya2Rvd24tc3R5bGUgc2hvcnRjdXRzOiBoZWFkaW5ncywgbGlzdHMsIHF1b3RlLCBjb2RlLCBlbSBkYXNoLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdElucHV0UnVsZXMob3B0aW9uczogRGVmYXVsdElucHV0UnVsZU9wdGlvbnMgPSB7fSk6IElucHV0UnVsZVtdIHtcclxuICBjb25zdCBydWxlczogSW5wdXRSdWxlW10gPSBbXHJcbiAgICAvLyBcIiMjIFwiIFx1MjE5MiBoZWFkaW5nXHJcbiAgICB7XHJcbiAgICAgIG1hdGNoOiAvXigjezEsNn0pICQvLFxyXG4gICAgICBydW46ICh7IHN0YXRlLCBibG9ja1BhdGgsIGZyb20sIHRvIH0sIG1hdGNoKSA9PiB7XHJcbiAgICAgICAgY29uc3QgbGV2ZWwgPSAobWF0Y2hbMV0gYXMgc3RyaW5nKS5sZW5ndGhcclxuICAgICAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAgICAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAoYmxvY2tQYXRoLCBmcm9tLCB0bywgRnJhZ21lbnQuZW1wdHkpKVxyXG4gICAgICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aCh0ci5kb2MsIGJsb2NrUGF0aClcclxuICAgICAgICBpZiAoIWJsb2NrKSByZXR1cm4gbnVsbFxyXG4gICAgICAgIHRyLnN0ZXAoXHJcbiAgICAgICAgICByZXBsYWNlTm9kZUF0KFxyXG4gICAgICAgICAgICBibG9ja1BhdGgsXHJcbiAgICAgICAgICAgIEZyYWdtZW50Lm9mKHN0YXRlLnNjaGVtYS5ub2RlVHlwZSgnaGVhZGluZycpLmNyZWF0ZSh7IGxldmVsIH0sIGJsb2NrLmNvbnRlbnQpKSxcclxuICAgICAgICAgICksXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoYmxvY2tQYXRoLCAwKSkpXHJcbiAgICAgICAgcmV0dXJuIHRyXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgLy8gXCItIFwiIC8gXCIqIFwiIC8gXCIrIFwiIFx1MjE5MiBidWxsZXQgbGlzdDsgXCIxLiBcIiBcdTIxOTIgb3JkZXJlZCBsaXN0XHJcbiAgICB7XHJcbiAgICAgIG1hdGNoOiAvXihbLSorXSkgJC8sXHJcbiAgICAgIHJ1bjogKGNvbnRleHQpID0+IHdyYXBJbkxpc3QoY29udGV4dCwgJ2J1bGxldExpc3QnLCB1bmRlZmluZWQpLFxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgbWF0Y2g6IC9eKFxcZHsxLDl9KVxcLiAkLyxcclxuICAgICAgcnVuOiAoY29udGV4dCwgbWF0Y2gpID0+XHJcbiAgICAgICAgd3JhcEluTGlzdChjb250ZXh0LCAnb3JkZXJlZExpc3QnLCB7XHJcbiAgICAgICAgICBzdGFydDogTnVtYmVyLnBhcnNlSW50KG1hdGNoWzFdIGFzIHN0cmluZywgMTApLFxyXG4gICAgICAgIH0pLFxyXG4gICAgfSxcclxuICAgIC8vIFwiPiBcIiBcdTIxOTIgYmxvY2txdW90ZVxyXG4gICAge1xyXG4gICAgICBtYXRjaDogL14+ICQvLFxyXG4gICAgICBydW46ICh7IHN0YXRlLCBibG9ja1BhdGgsIGZyb20sIHRvIH0pID0+IHtcclxuICAgICAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAgICAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAoYmxvY2tQYXRoLCBmcm9tLCB0bywgRnJhZ21lbnQuZW1wdHkpKVxyXG4gICAgICAgIGNvbnN0IHBhcmVudFBhdGggPSBibG9ja1BhdGguc2xpY2UoMCwgLTEpXHJcbiAgICAgICAgY29uc3QgaW5kZXggPSBibG9ja1BhdGhbYmxvY2tQYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgICAgIHRyLnN0ZXAobmV3IFdyYXBOb2Rlc1N0ZXAocGFyZW50UGF0aCwgaW5kZXgsIGluZGV4ICsgMSwgJ2Jsb2NrcXVvdGUnKSlcclxuICAgICAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKFsuLi5wYXJlbnRQYXRoLCBpbmRleCwgMF0sIDApKSlcclxuICAgICAgICByZXR1cm4gdHJcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICAvLyBcImBgYFwiIFx1MjE5MiBjb2RlIGJsb2NrXHJcbiAgICB7XHJcbiAgICAgIG1hdGNoOiAvXmBgYCQvLFxyXG4gICAgICBydW46ICh7IHN0YXRlLCBibG9ja1BhdGgsIGZyb20sIHRvIH0pID0+IHtcclxuICAgICAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAgICAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAoYmxvY2tQYXRoLCBmcm9tLCB0bywgRnJhZ21lbnQuZW1wdHkpKVxyXG4gICAgICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aCh0ci5kb2MsIGJsb2NrUGF0aClcclxuICAgICAgICBpZiAoIWJsb2NrKSByZXR1cm4gbnVsbFxyXG4gICAgICAgIHRyLnN0ZXAoXHJcbiAgICAgICAgICByZXBsYWNlTm9kZUF0KFxyXG4gICAgICAgICAgICBibG9ja1BhdGgsXHJcbiAgICAgICAgICAgIEZyYWdtZW50Lm9mKHN0YXRlLnNjaGVtYS5ub2RlVHlwZSgnY29kZUJsb2NrJykuY3JlYXRlKHVuZGVmaW5lZCwgYmxvY2suY29udGVudCkpLFxyXG4gICAgICAgICAgKSxcclxuICAgICAgICApXHJcbiAgICAgICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhibG9ja1BhdGgsIDApKSlcclxuICAgICAgICByZXR1cm4gdHJcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgXVxyXG4gIGlmIChvcHRpb25zLmF1dG9saW5rICE9PSBmYWxzZSkgcnVsZXMucHVzaChhdXRvbGlua1J1bGUoKSlcclxuICBpZiAob3B0aW9ucy5pbmxpbmVDb2RlICE9PSBmYWxzZSkgcnVsZXMucHVzaChpbmxpbmVDb2RlUnVsZSgpKVxyXG4gIGlmIChvcHRpb25zLmVtRGFzaCAhPT0gZmFsc2UpIHtcclxuICAgIHJ1bGVzLnB1c2goe1xyXG4gICAgICBtYXRjaDogLy0tJC8sXHJcbiAgICAgIHJ1bjogKHsgc3RhdGUsIGJsb2NrUGF0aCwgZnJvbSwgdG8gfSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChibG9ja1BhdGgsIGZyb20sIHRvLCBGcmFnbWVudC5vZihzdGF0ZS5zY2hlbWEudGV4dCgnXHUyMDE0JykpKSlcclxuICAgICAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKGJsb2NrUGF0aCwgZnJvbSArIDEpKSlcclxuICAgICAgICByZXR1cm4gdHJcclxuICAgICAgfSxcclxuICAgIH0pXHJcbiAgfVxyXG4gIHJldHVybiBydWxlc1xyXG59XHJcblxyXG5mdW5jdGlvbiB3cmFwSW5MaXN0KFxyXG4gIGNvbnRleHQ6IElucHV0UnVsZUNvbnRleHQsXHJcbiAgbGlzdFR5cGVOYW1lOiBzdHJpbmcsXHJcbiAgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLFxyXG4pOiBUcmFuc2FjdGlvbiB8IG51bGwge1xyXG4gIGNvbnN0IHsgc3RhdGUsIGJsb2NrUGF0aCwgZnJvbSwgdG8gfSA9IGNvbnRleHRcclxuICAvLyBOZXZlciB0cmlnZ2VyIGluc2lkZSBhbiBleGlzdGluZyBsaXN0IGl0ZW0gb3IgYSBub24tcGFyYWdyYXBoIGJsb2NrLlxyXG4gIGlmIChjb250ZXh0LmJsb2NrLnR5cGUubmFtZSAhPT0gJ3BhcmFncmFwaCcpIHJldHVybiBudWxsXHJcbiAgY29uc3QgcGFyZW50UGF0aCA9IGJsb2NrUGF0aC5zbGljZSgwLCAtMSlcclxuICBpZiAocGFyZW50UGF0aC5sZW5ndGggPiAwICYmIGlzTGlzdEl0ZW1UeXBlTmFtZShub2RlQXRQYXRoKHN0YXRlLmRvYywgcGFyZW50UGF0aCk/LnR5cGUubmFtZSkpIHtcclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChibG9ja1BhdGgsIGZyb20sIHRvLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHRyLmRvYywgYmxvY2tQYXRoKVxyXG4gIGlmICghYmxvY2spIHJldHVybiBudWxsXHJcbiAgY29uc3QgaW5kZXggPSBibG9ja1BhdGhbYmxvY2tQYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIGNvbnN0IHNjaGVtYSA9IHN0YXRlLnNjaGVtYVxyXG4gIGNvbnN0IGl0ZW0gPSBzY2hlbWEubm9kZVR5cGUoJ2xpc3RJdGVtJykuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQub2YoYmxvY2spKVxyXG4gIHRyLnN0ZXAoXHJcbiAgICBuZXcgUmVwbGFjZU5vZGVzU3RlcChcclxuICAgICAgcGFyZW50UGF0aCxcclxuICAgICAgaW5kZXgsXHJcbiAgICAgIGluZGV4ICsgMSxcclxuICAgICAgRnJhZ21lbnQub2Yoc2NoZW1hLm5vZGVUeXBlKGxpc3RUeXBlTmFtZSkuY3JlYXRlKGF0dHJzLCBGcmFnbWVudC5vZihpdGVtKSkpLFxyXG4gICAgKSxcclxuICApXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhbLi4ucGFyZW50UGF0aCwgaW5kZXgsIDAsIDBdLCAwKSkpXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIFVSTCBmb2xsb3dlZCBieSBhIHNwYWNlIGJlY29tZXMgYSBsaW5rLiBNYXRjaGluZyBvbmx5IGF0IGEgdGVybWluYXRpbmdcclxuICogc3BhY2UgKG9yIGNsb3NpbmcgYnJhY2tldCkgbWVhbnMgdGhlIHJ1bGUgZmlyZXMgb25jZSwgb24gYSBjb21wbGV0ZSBVUkwsXHJcbiAqIHJhdGhlciB0aGFuIHJlLXJ1bm5pbmcgb24gZXZlcnkga2V5c3Ryb2tlIGFzIG9uZSBpcyB0eXBlZC5cclxuICpcclxuICogVHJhaWxpbmcgc2VudGVuY2UgcHVuY3R1YXRpb24gaXMgbGVmdCBvdXQgb2YgdGhlIGxpbmsuIFwiU2VlIGh0dHBzOi8veC5kZXYuXCJcclxuICogc2hvdWxkIG5vdCBsaW5rIHRoZSBmdWxsIHN0b3AuIEJhbGFuY2VkIHRyYWlsaW5nIHBhcmVucyBhcmUga2VwdCwgc2luY2VcclxuICogdGhleSBhcmUgY29tbW9uIGluIHJlYWwgVVJMcyAoV2lraXBlZGlhIGFydGljbGUgdGl0bGVzLCBmb3Igb25lKS5cclxuICovXHJcbmNvbnN0IEFVVE9MSU5LID0gLyg/Ol58W1xccyhdKSgoPzpodHRwcz86XFwvXFwvfHd3d1xcLilbXlxcczw+XCInYF17MiwyMDAwfSkoW1xccyldKSQvaVxyXG5cclxuZnVuY3Rpb24gYXV0b2xpbmtSdWxlKCk6IElucHV0UnVsZSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG1hdGNoOiBBVVRPTElOSyxcclxuICAgIHJ1bjogKHsgc3RhdGUsIGJsb2NrUGF0aCwgYmxvY2ssIHRvIH0sIG1hdGNoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubWFya1R5cGUoJ2xpbmsnKVxyXG4gICAgICAvLyBDb2RlIGJsb2NrcyBkaXNhbGxvdyBldmVyeSBtYXJrLCBzbyB0aGlzIGlzIHdoYXQga2VlcHMgYSBVUkwgdHlwZWRcclxuICAgICAgLy8gaW50byBvbmUgcGxhaW4gdGV4dC4gVGhlIHNhbWUgY2hlY2sgY292ZXJzIGFueSBzdWNoIGJsb2NrIHR5cGUuXHJcbiAgICAgIGlmICghYmxvY2sudHlwZS5hbGxvd3NNYXJrVHlwZSh0eXBlKSkgcmV0dXJuIG51bGxcclxuXHJcbiAgICAgIGNvbnN0IHJhdyA9IG1hdGNoWzFdIGFzIHN0cmluZ1xyXG4gICAgICBjb25zdCB0cmFpbGluZyA9IG1hdGNoWzJdIGFzIHN0cmluZ1xyXG4gICAgICBjb25zdCB1cmwgPSB0cmltVHJhaWxpbmdQdW5jdHVhdGlvbihyYXcpXHJcbiAgICAgIGlmICh1cmwubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgICAvLyBgd3d3LmAgaXMgYSBVUkwgdG8gYSBodW1hbiBidXQgbm90IHRvIGEgYnJvd3NlcjsgZ2l2ZSBpdCBhIHNjaGVtZS5cclxuICAgICAgY29uc3QgaHJlZiA9IHNhZmVIcmVmKC9ed3d3XFwuL2kudGVzdCh1cmwpID8gYGh0dHBzOi8vJHt1cmx9YCA6IHVybClcclxuICAgICAgaWYgKCFocmVmKSByZXR1cm4gbnVsbFxyXG5cclxuICAgICAgLy8gVGhlICptYXRjaGVkKiB0ZXh0LCBwdW5jdHVhdGlvbiBpbmNsdWRlZCwgaXMgd2hhdCBzaXRzIGltbWVkaWF0ZWx5XHJcbiAgICAgIC8vIGJlZm9yZSB0aGUgdHlwZWQgY2hhcmFjdGVyLCBzbyB0aGUgc3RhcnQgaXMgbWVhc3VyZWQgZnJvbSB0aGUgcmF3XHJcbiAgICAgIC8vIG1hdGNoIGFuZCB0aGUgbGluayB0aGVuIHN0b3BzIHNob3J0IG9mIHRoZSBwdW5jdHVhdGlvbi4gTWVhc3VyaW5nXHJcbiAgICAgIC8vIGZyb20gdGhlIHRyaW1tZWQgVVJMIGluc3RlYWQgd291bGQgc2hpZnQgdGhlIHdob2xlIHNwYW4gcmlnaHQsIGVhdGluZ1xyXG4gICAgICAvLyB0aGUgZmlyc3QgY2hhcmFjdGVyIG9mIHRoZSBVUkwgYW5kIG1hcmtpbmcgdGhlIGZ1bGwgc3RvcCBhZnRlciBpdC5cclxuICAgICAgY29uc3Qgc3RhcnQgPSB0byAtIHJhdy5sZW5ndGhcclxuICAgICAgaWYgKHN0YXJ0IDwgMCkgcmV0dXJuIG51bGxcclxuICAgICAgY29uc3QgZW5kID0gc3RhcnQgKyB1cmwubGVuZ3RoXHJcblxyXG4gICAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAgIHRyLnN0ZXAobmV3IEFkZE1hcmtTdGVwKGJsb2NrUGF0aCwgc3RhcnQsIGVuZCwgdHlwZS5jcmVhdGUoeyBocmVmIH0pKSlcclxuICAgICAgLy8gVGhlIHJ1bGUgc3dhbGxvd2VkIHRoZSB0eXBlZCBjaGFyYWN0ZXIsIHNvIHB1dCBpdCBiYWNrLCB1bm1hcmtlZCxcclxuICAgICAgLy8gb3IgdGhlIGxpbmsgd291bGQga2VlcCBncm93aW5nIGFzIHRoZSB1c2VyIGNhcnJpZXMgb24gdHlwaW5nLiBJdFxyXG4gICAgICAvLyBiZWxvbmdzIGF0IHRoZSBjYXJldCwgYWZ0ZXIgYW55IHB1bmN0dWF0aW9uIGxlZnQgb3V0IG9mIHRoZSBsaW5rLlxyXG4gICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChibG9ja1BhdGgsIHRvLCB0bywgRnJhZ21lbnQub2Yoc3RhdGUuc2NoZW1hLnRleHQodHJhaWxpbmcpKSkpXHJcbiAgICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoYmxvY2tQYXRoLCB0byArIHRyYWlsaW5nLmxlbmd0aCkpKVxyXG4gICAgICByZXR1cm4gdHJcclxuICAgIH0sXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogYGAgYGNvZGVgIGBgIFx1MjE5MiB0aGUgdGV4dCBiZXR3ZWVuIHRoZSBiYWNrdGlja3MgaW4gdGhlIGBjb2RlYCBtYXJrLCBvbiB0aGVcclxuICogY2xvc2luZyBiYWNrdGljay4gVGhyZWUgYmFja3RpY2tzIGluIGEgcm93IGFyZSB0aGUgY29kZS1ibG9jayBydWxlJ3MsIHNvIGFcclxuICogcnVuIG9mIGJhY2t0aWNrcyB3aXRoIG5vdGhpbmcgYmV0d2VlbiB0aGVtIG5ldmVyIG1hdGNoZXMgaGVyZS5cclxuICovXHJcbmZ1bmN0aW9uIGlubGluZUNvZGVSdWxlKCk6IElucHV0UnVsZSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG1hdGNoOiAvKD86XnxbXmBdKWAoW15gXSspYCQvLFxyXG4gICAgcnVuOiAoeyBzdGF0ZSwgYmxvY2tQYXRoLCBibG9jaywgdG8gfSwgbWF0Y2gpID0+IHtcclxuICAgICAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrcy5jb2RlXHJcbiAgICAgIGlmICghdHlwZSB8fCAhYmxvY2sudHlwZS5hbGxvd3NNYXJrVHlwZSh0eXBlKSkgcmV0dXJuIG51bGxcclxuICAgICAgY29uc3QgaW5uZXIgPSBtYXRjaFsxXSBhcyBzdHJpbmdcclxuICAgICAgLy8gVGhlIGNhcmV0IHNpdHMgYWZ0ZXIgXCJgaW5uZXJcIjsgdGhlIHR5cGVkIGNsb3NpbmcgYmFja3RpY2sgaXMgc3dhbGxvd2VkLlxyXG4gICAgICBjb25zdCBzdGFydCA9IHRvIC0gaW5uZXIubGVuZ3RoIC0gMVxyXG4gICAgICBpZiAoc3RhcnQgPCAwKSByZXR1cm4gbnVsbFxyXG4gICAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAgIHRyLnN0ZXAoXHJcbiAgICAgICAgbmV3IFJlcGxhY2VJbmxpbmVTdGVwKFxyXG4gICAgICAgICAgYmxvY2tQYXRoLFxyXG4gICAgICAgICAgc3RhcnQsXHJcbiAgICAgICAgICB0byxcclxuICAgICAgICAgIEZyYWdtZW50Lm9mKHN0YXRlLnNjaGVtYS50ZXh0KGlubmVyLCBbdHlwZS5jcmVhdGUoKV0pKSxcclxuICAgICAgICApLFxyXG4gICAgICApXHJcbiAgICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoYmxvY2tQYXRoLCBzdGFydCArIGlubmVyLmxlbmd0aCkpKVxyXG4gICAgICByZXR1cm4gdHJcclxuICAgIH0sXHJcbiAgfVxyXG59XHJcblxyXG4vKiogUHVuY3R1YXRpb24gdGhhdCBlbmRzIGEgc2VudGVuY2UgcmF0aGVyIHRoYW4gYSBVUkwuICovXHJcbmNvbnN0IFRSQUlMSU5HX1BVTkNUVUFUSU9OID0gJy4sOzohP1xcJ1wiYCdcclxuXHJcbi8qKiBEcm9wIHRoZSBwdW5jdHVhdGlvbiBhIHNlbnRlbmNlLCBub3QgYSBVUkwsIGlzIGxpa2VseSB0byBoYXZlIGVuZGVkIHdpdGguICovXHJcbmZ1bmN0aW9uIHRyaW1UcmFpbGluZ1B1bmN0dWF0aW9uKHVybDogc3RyaW5nKTogc3RyaW5nIHtcclxuICBsZXQgZW5kID0gdXJsLmxlbmd0aFxyXG4gIHdoaWxlIChlbmQgPiAwKSB7XHJcbiAgICBjb25zdCBjaGFyID0gdXJsW2VuZCAtIDFdIGFzIHN0cmluZ1xyXG4gICAgaWYgKGNoYXIgPT09ICcpJykge1xyXG4gICAgICAvLyBLZWVwIGEgY2xvc2luZyBwYXJlbiBvbmx5IHdoZW4gdGhlIFVSTCBvcGVuZWQgb25lLlxyXG4gICAgICBjb25zdCBvcGVucyA9ICh1cmwuc2xpY2UoMCwgZW5kKS5tYXRjaCgvXFwoL2cpID8/IFtdKS5sZW5ndGhcclxuICAgICAgY29uc3QgY2xvc2VzID0gKHVybC5zbGljZSgwLCBlbmQpLm1hdGNoKC9cXCkvZykgPz8gW10pLmxlbmd0aFxyXG4gICAgICBpZiAob3BlbnMgPj0gY2xvc2VzKSBicmVha1xyXG4gICAgICBlbmQgLT0gMVxyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG4gICAgaWYgKFRSQUlMSU5HX1BVTkNUVUFUSU9OLmluY2x1ZGVzKGNoYXIpKSB7XHJcbiAgICAgIGVuZCAtPSAxXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBicmVha1xyXG4gIH1cclxuICByZXR1cm4gdXJsLnNsaWNlKDAsIGVuZClcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBDb21tYW5kIH0gZnJvbSAnLi4vY29tbWFuZHMvY29tbWFuZHMnXHJcbmltcG9ydCB7IHRleHRibG9ja3MgfSBmcm9tICcuLi9tb2RlbC9ibG9ja3MnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IGlubGluZVNpemUsIG1hcmtzQXRJbmxpbmVPZmZzZXQgfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSwgVGV4dE5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBSZXBsYWNlSW5saW5lU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hNYXRjaCB7XHJcbiAgcmVhZG9ubHkgcGF0aDogUGF0aFxyXG4gIHJlYWRvbmx5IGZyb206IG51bWJlclxyXG4gIHJlYWRvbmx5IHRvOiBudW1iZXJcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hPcHRpb25zIHtcclxuICByZWFkb25seSBjYXNlU2Vuc2l0aXZlPzogYm9vbGVhblxyXG59XHJcblxyXG4vKiogQSBibG9jaydzIHRleHQgd2l0aCBpbmxpbmUgYXRvbXMgYXMgcGxhY2Vob2xkZXJzLCBzbyBvZmZzZXRzIHN0YXkgYWxpZ25lZC4gKi9cclxuZnVuY3Rpb24gc2VhcmNoYWJsZVRleHQoYmxvY2s6IEVkaXRvck5vZGUpOiBzdHJpbmcge1xyXG4gIGxldCB0ZXh0ID0gJydcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGJsb2NrLmNvbnRlbnQuY2hpbGRyZW4pIHtcclxuICAgIHRleHQgKz0gY2hpbGQuaXNUZXh0ID8gKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0IDogJ1x1RkZGQycucmVwZWF0KGlubGluZVNpemUoY2hpbGQpKVxyXG4gIH1cclxuICByZXR1cm4gdGV4dFxyXG59XHJcblxyXG4vKiogQWxsIG1hdGNoZXMgb2YgYSBxdWVyeSBhY3Jvc3MgdGhlIGRvY3VtZW50J3MgdGV4dGJsb2Nrcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRNYXRjaGVzKFxyXG4gIGRvYzogRWRpdG9yTm9kZSxcclxuICBxdWVyeTogc3RyaW5nLFxyXG4gIG9wdGlvbnM6IFNlYXJjaE9wdGlvbnMgPSB7fSxcclxuKTogcmVhZG9ubHkgU2VhcmNoTWF0Y2hbXSB7XHJcbiAgaWYgKHF1ZXJ5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdXHJcbiAgY29uc3QgY2FzZVNlbnNpdGl2ZSA9IG9wdGlvbnMuY2FzZVNlbnNpdGl2ZSA9PT0gdHJ1ZVxyXG4gIGNvbnN0IG5lZWRsZSA9IGNhc2VTZW5zaXRpdmUgPyBxdWVyeSA6IHF1ZXJ5LnRvTG93ZXJDYXNlKClcclxuICBjb25zdCBtYXRjaGVzOiBTZWFyY2hNYXRjaFtdID0gW11cclxuICBmb3IgKGNvbnN0IHsgcGF0aCwgbm9kZSB9IG9mIHRleHRibG9ja3MoZG9jKSkge1xyXG4gICAgY29uc3QgaGF5c3RhY2sgPSBjYXNlU2Vuc2l0aXZlID8gc2VhcmNoYWJsZVRleHQobm9kZSkgOiBzZWFyY2hhYmxlVGV4dChub2RlKS50b0xvd2VyQ2FzZSgpXHJcbiAgICBsZXQgaW5kZXggPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSlcclxuICAgIHdoaWxlIChpbmRleCAhPT0gLTEpIHtcclxuICAgICAgbWF0Y2hlcy5wdXNoKHsgcGF0aCwgZnJvbTogaW5kZXgsIHRvOiBpbmRleCArIHF1ZXJ5Lmxlbmd0aCB9KVxyXG4gICAgICBpbmRleCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlLCBpbmRleCArIHF1ZXJ5Lmxlbmd0aClcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIG1hdGNoZXNcclxufVxyXG5cclxuLyoqIFJlcGxhY2Ugb25lIG1hdGNoLCBpbmhlcml0aW5nIHRoZSBtYXJrcyBhdCBpdHMgc3RhcnQuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByZXBsYWNlTWF0Y2gobWF0Y2g6IFNlYXJjaE1hdGNoLCByZXBsYWNlbWVudDogc3RyaW5nKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgY29uc3QgaW5zZXJ0ID0gYnVpbGRSZXBsYWNlbWVudChzdGF0ZS5kb2MsIG1hdGNoLCByZXBsYWNlbWVudClcclxuICAgIGlmIChpbnNlcnQgPT09IG51bGwpIHJldHVybiBudWxsXHJcbiAgICBpZiAoIXRyLm1heWJlU3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAobWF0Y2gucGF0aCwgbWF0Y2guZnJvbSwgbWF0Y2gudG8sIGluc2VydCkpKSByZXR1cm4gbnVsbFxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG4vKiogUmVwbGFjZSBldmVyeSBtYXRjaCBvZiB0aGUgcXVlcnkuIE9mZnNldHMgYXJlIGFwcGxpZWQgYmFjay10by1mcm9udCBwZXIgYmxvY2suICovXHJcbmV4cG9ydCBmdW5jdGlvbiByZXBsYWNlQWxsKFxyXG4gIHF1ZXJ5OiBzdHJpbmcsXHJcbiAgcmVwbGFjZW1lbnQ6IHN0cmluZyxcclxuICBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sXHJcbik6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IG1hdGNoZXMgPSBmaW5kTWF0Y2hlcyhzdGF0ZS5kb2MsIHF1ZXJ5LCBvcHRpb25zKVxyXG4gICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgLy8gUmV2ZXJzZSBvcmRlciBrZWVwcyBlYXJsaWVyIG9mZnNldHMgaW4gdGhlIHNhbWUgYmxvY2sgc3RhYmxlLlxyXG4gICAgZm9yIChsZXQgaSA9IG1hdGNoZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgY29uc3QgbWF0Y2ggPSBtYXRjaGVzW2ldIGFzIFNlYXJjaE1hdGNoXHJcbiAgICAgIGNvbnN0IGluc2VydCA9IGJ1aWxkUmVwbGFjZW1lbnQoc3RhdGUuZG9jLCBtYXRjaCwgcmVwbGFjZW1lbnQpXHJcbiAgICAgIGlmIChpbnNlcnQgPT09IG51bGwpIGNvbnRpbnVlXHJcbiAgICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKG1hdGNoLnBhdGgsIG1hdGNoLmZyb20sIG1hdGNoLnRvLCBpbnNlcnQpKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRyLmRvY0NoYW5nZWQgPyB0ciA6IG51bGxcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJ1aWxkUmVwbGFjZW1lbnQoXHJcbiAgZG9jOiBFZGl0b3JOb2RlLFxyXG4gIG1hdGNoOiBTZWFyY2hNYXRjaCxcclxuICByZXBsYWNlbWVudDogc3RyaW5nLFxyXG4pOiBGcmFnbWVudCB8IG51bGwge1xyXG4gIGlmIChyZXBsYWNlbWVudC5sZW5ndGggPT09IDApIHJldHVybiBGcmFnbWVudC5lbXB0eVxyXG4gIGxldCBibG9jazogRWRpdG9yTm9kZSB8IG51bGwgPSBkb2NcclxuICBmb3IgKGNvbnN0IGluZGV4IG9mIG1hdGNoLnBhdGgpIHtcclxuICAgIGJsb2NrID0gYmxvY2s/LmNvbnRlbnQubWF5YmVDaGlsZChpbmRleCkgPz8gbnVsbFxyXG4gIH1cclxuICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICBjb25zdCBtYXJrcyA9IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgbWF0Y2guZnJvbSArIDEpXHJcbiAgcmV0dXJuIEZyYWdtZW50Lm9mKGJsb2NrLnR5cGUuc2NoZW1hLnRleHQocmVwbGFjZW1lbnQsIG1hcmtzKSlcclxufVxyXG4iLCAiaW1wb3J0IHsgdGV4dGJsb2NrcyB9IGZyb20gJy4vYmxvY2tzJ1xyXG5pbXBvcnQgeyBpbmxpbmVMZW5ndGggfSBmcm9tICcuL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4vbm9kZSdcclxuXHJcbi8qKiBDaGFyYWN0ZXIgY291bnQ6IGlubGluZSBsZW5ndGggc3VtbWVkIG92ZXIgYWxsIHRleHRibG9ja3MgKGF0b21zIGNvdW50IDEpLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY2hhcmFjdGVyQ291bnQoZG9jOiBFZGl0b3JOb2RlKTogbnVtYmVyIHtcclxuICByZXR1cm4gdGV4dGJsb2Nrcyhkb2MpLnJlZHVjZSgoc3VtLCB7IG5vZGUgfSkgPT4gc3VtICsgaW5saW5lTGVuZ3RoKG5vZGUuY29udGVudCksIDApXHJcbn1cclxuXHJcbi8qKiBXb3JkIGNvdW50IG92ZXIgdGhlIGRvY3VtZW50J3MgdmlzaWJsZSB0ZXh0LiBJbmxpbmUgYXRvbXMgc2VwYXJhdGUgd29yZHMuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB3b3JkQ291bnQoZG9jOiBFZGl0b3JOb2RlKTogbnVtYmVyIHtcclxuICBsZXQgY291bnQgPSAwXHJcbiAgZm9yIChjb25zdCB7IG5vZGUgfSBvZiB0ZXh0YmxvY2tzKGRvYykpIHtcclxuICAgIGNvdW50ICs9IGJsb2NrVGV4dChub2RlKVxyXG4gICAgICAuc3BsaXQoL1xccysvKVxyXG4gICAgICAuZmlsdGVyKCh3b3JkKSA9PiB3b3JkLmxlbmd0aCA+IDApLmxlbmd0aFxyXG4gIH1cclxuICByZXR1cm4gY291bnRcclxufVxyXG5cclxuLyoqXHJcbiAqIFNlbnRlbmNlIGNvdW50OiBydW5zIG9mIHRleHQgY2xvc2VkIGJ5IGAuYCwgYCFgLCBgP2Agb3IgYFx1MjAyNmAsIHdpdGggYSBibG9jaydzXHJcbiAqIGVuZCBjbG9zaW5nIGl0cyBsYXN0IHNlbnRlbmNlLiBBIGhldXJpc3RpYywgXCJlLmcuXCIgY291bnRzIGFzIGEgYm91bmRhcnksXHJcbiAqIGJ1dCB0aGUgb25lIGV2ZXJ5IHdvcmQgcHJvY2Vzc29yJ3Mgc3RhdGlzdGljcyBkaWFsb2cgdXNlcy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZW50ZW5jZUNvdW50KGRvYzogRWRpdG9yTm9kZSk6IG51bWJlciB7XHJcbiAgbGV0IGNvdW50ID0gMFxyXG4gIGZvciAoY29uc3QgeyBub2RlIH0gb2YgdGV4dGJsb2Nrcyhkb2MpKSB7XHJcbiAgICBjb25zdCB0ZXh0ID0gYmxvY2tUZXh0KG5vZGUpLnRyaW0oKVxyXG4gICAgaWYgKHRleHQubGVuZ3RoID09PSAwKSBjb250aW51ZVxyXG4gICAgY291bnQgKz0gTWF0aC5tYXgoXHJcbiAgICAgIDEsXHJcbiAgICAgIHRleHQuc3BsaXQoL1suIT9cdTIwMjZdKyg/Olxccyt8JCkvKS5maWx0ZXIoKHBhcnQpID0+IHBhcnQudHJpbSgpLmxlbmd0aCA+IDApLmxlbmd0aCxcclxuICAgIClcclxuICB9XHJcbiAgcmV0dXJuIGNvdW50XHJcbn1cclxuXHJcbi8qKiBQYXJhZ3JhcGggY291bnQ6IHRleHRibG9ja3MgaG9sZGluZyBhdCBsZWFzdCBvbmUgdmlzaWJsZSBjaGFyYWN0ZXIuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJhZ3JhcGhDb3VudChkb2M6IEVkaXRvck5vZGUpOiBudW1iZXIge1xyXG4gIGxldCBjb3VudCA9IDBcclxuICBmb3IgKGNvbnN0IHsgbm9kZSB9IG9mIHRleHRibG9ja3MoZG9jKSkge1xyXG4gICAgaWYgKGJsb2NrVGV4dChub2RlKS50cmltKCkubGVuZ3RoID4gMCkgY291bnQrK1xyXG4gIH1cclxuICByZXR1cm4gY291bnRcclxufVxyXG5cclxuLyoqIEEgYmxvY2sncyB0ZXh0IHdpdGggZWFjaCBpbmxpbmUgYXRvbSBzdGFuZGluZyBpbiBhcyBhIHdvcmQgc2VwYXJhdG9yLiAqL1xyXG5mdW5jdGlvbiBibG9ja1RleHQobm9kZTogRWRpdG9yTm9kZSk6IHN0cmluZyB7XHJcbiAgbGV0IHRleHQgPSAnJ1xyXG4gIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jb250ZW50LmNoaWxkcmVuKSB7XHJcbiAgICB0ZXh0ICs9IGNoaWxkLmlzVGV4dCA/IChjaGlsZCBhcyBUZXh0Tm9kZSkudGV4dCA6ICcgJ1xyXG4gIH1cclxuICByZXR1cm4gdGV4dFxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUsIFRleHROb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBIVE1MU3BlYyB9IGZyb20gJy4uL21vZGVsL3NjaGVtYSdcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgSFRNTFNlcmlhbGl6ZU9wdGlvbnMge1xyXG4gIC8qKlxyXG4gICAqIE1hcmt1cCB0byBlbWl0IGZvciBhIG5vZGUgaW5zdGVhZCBvZiB0aGUgb25lIGl0cyBzY2hlbWEgZGVzY3JpYmVzO1xyXG4gICAqIHJldHVybiBudWxsIHRvIGxlYXZlIHRoZSBub2RlIGFsb25lLlxyXG4gICAqXHJcbiAgICogVGhpcyBpcyBob3cgYSBkb2N1bWVudCBnZXRzIG91dCBjYXJyeWluZyB3aGF0IHRoZSBlZGl0b3IgKmRyZXcqIHJhdGhlclxyXG4gICAqIHRoYW4gb25seSB3aGF0IGl0IGhvbGRzLCBzeW50YXggaGlnaGxpZ2h0aW5nIGlzIGEgZGVjb3JhdGlvbiBsYXllciBhbmQgYVxyXG4gICAqIGRpYWdyYW0gcHJldmlldyBpcyBhbiBlbGVtZW50IHRoZSByZW5kZXJlciBhcHBlbmRzLCBzbyBuZWl0aGVyIGlzIGluIHRoZVxyXG4gICAqIG1vZGVsIGFuZCBuZWl0aGVyIHdvdWxkIG90aGVyd2lzZSBzdXJ2aXZlIGJlaW5nIHNlcmlhbGl6ZWQgZnJvbSBpdC5cclxuICAgKlxyXG4gICAqICoqVGhlIHN0cmluZyBpcyBlbWl0dGVkIHZlcmJhdGltLCBub3QgZXNjYXBlZC4qKiBJdCBpcyBtYXJrdXAgdGhlIGhvc3RcclxuICAgKiBwcm9kdWNlZCwgb24gdGhlIHNhbWUgZm9vdGluZyBhcyB0aGUgZGlhZ3JhbSByZW5kZXJlcidzIG93biBvdXRwdXQ7XHJcbiAgICogbmV2ZXIgaGFuZCB0aGlzIGFueXRoaW5nIHRoYXQgYXJyaXZlZCB3aXRoIGEgZG9jdW1lbnQuXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgcmVuZGVyTm9kZT86IChub2RlOiBFZGl0b3JOb2RlKSA9PiBzdHJpbmcgfCBudWxsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTdHJpbmctYmFzZWQgSFRNTCBleHBvcnQgZHJpdmVuIGJ5IHRoZSBzY2hlbWEncyBgdG9IVE1MYCBzcGVjcy4gTm8gRE9NXHJcbiAqIHVzYWdlIChTU1Itc2FmZSk7IGFsbCB0ZXh0IGFuZCBhdHRyaWJ1dGUgdmFsdWVzIGFyZSBlc2NhcGVkLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZVRvSFRNTChub2RlOiBFZGl0b3JOb2RlLCBvcHRpb25zOiBIVE1MU2VyaWFsaXplT3B0aW9ucyA9IHt9KTogc3RyaW5nIHtcclxuICBpZiAobm9kZS5pc1RleHQpIHJldHVybiBzZXJpYWxpemVUZXh0KG5vZGUgYXMgVGV4dE5vZGUpXHJcbiAgY29uc3QgcmVwbGFjZW1lbnQgPSBvcHRpb25zLnJlbmRlck5vZGU/Lihub2RlKVxyXG4gIGlmIChyZXBsYWNlbWVudCAhPT0gbnVsbCAmJiByZXBsYWNlbWVudCAhPT0gdW5kZWZpbmVkKSByZXR1cm4gcmVwbGFjZW1lbnRcclxuICBjb25zdCBzcGVjID0gbm9kZS50eXBlLnNwZWMudG9IVE1MPy4obm9kZSlcclxuICAvLyBBbiBhcnJvdywgbm90IGEgYmFyZSByZWZlcmVuY2U6IGBtYXBgIHdvdWxkIHBhc3MgdGhlIGluZGV4IGFsb25nIGFzIHRoZVxyXG4gIC8vIG9wdGlvbnMgYXJndW1lbnQuXHJcbiAgY29uc3QgY2hpbGRyZW4gPSBub2RlLmNvbnRlbnQuY2hpbGRyZW4ubWFwKChjaGlsZCkgPT4gc2VyaWFsaXplVG9IVE1MKGNoaWxkLCBvcHRpb25zKSkuam9pbignJylcclxuICBpZiAoIXNwZWMpIHJldHVybiBjaGlsZHJlblxyXG4gIHJldHVybiByZW5kZXJUYWcoc3BlYywgY2hpbGRyZW4pXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlcmlhbGl6ZVRleHQobm9kZTogVGV4dE5vZGUpOiBzdHJpbmcge1xyXG4gIGxldCBodG1sID0gZXNjYXBlSFRNTChub2RlLnRleHQpXHJcbiAgLy8gSW5uZXJtb3N0IG1hcmsgZmlyc3Qgc28gdGhlIGZpcnN0IG1hcmsgaW4gdGhlIHNldCBpcyB0aGUgb3V0ZXJtb3N0IHRhZy5cclxuICBmb3IgKGxldCBpID0gbm9kZS5tYXJrcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgY29uc3QgbWFyayA9IG5vZGUubWFya3NbaV1cclxuICAgIGNvbnN0IHNwZWMgPSBtYXJrLnR5cGUuc3BlYy50b0hUTUw/LihtYXJrKVxyXG4gICAgaWYgKHNwZWMpIGh0bWwgPSByZW5kZXJUYWcoc3BlYywgaHRtbClcclxuICB9XHJcbiAgcmV0dXJuIGh0bWxcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyVGFnKHNwZWM6IEhUTUxTcGVjLCBjaGlsZHJlbjogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCBhdHRycyA9IE9iamVjdC5lbnRyaWVzKHNwZWMuYXR0cnMgPz8ge30pXHJcbiAgICAubWFwKChbbmFtZSwgdmFsdWVdKSA9PiBgICR7bmFtZX09XCIke2VzY2FwZUhUTUwodmFsdWUpfVwiYClcclxuICAgIC5qb2luKCcnKVxyXG4gIGlmIChzcGVjLmlzVm9pZCkgcmV0dXJuIGA8JHtzcGVjLnRhZ30ke2F0dHJzfT5gXHJcbiAgY29uc3QgYm9keSA9IGNoaWxkcmVuIHx8IHNwZWMuaW5uZXJIVE1MIHx8IChzcGVjLnRleHQgPyBlc2NhcGVIVE1MKHNwZWMudGV4dCkgOiAnJylcclxuICBjb25zdCBpbm5lciA9IHNwZWMuY2hpbGRUYWcgPyBgPCR7c3BlYy5jaGlsZFRhZ30+JHtib2R5fTwvJHtzcGVjLmNoaWxkVGFnfT5gIDogYm9keVxyXG4gIHJldHVybiBgPCR7c3BlYy50YWd9JHthdHRyc30+JHtpbm5lcn08LyR7c3BlYy50YWd9PmBcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUhUTUwodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHZhbHVlXHJcbiAgICAucmVwbGFjZUFsbCgnJicsICcmYW1wOycpXHJcbiAgICAucmVwbGFjZUFsbCgnPCcsICcmbHQ7JylcclxuICAgIC5yZXBsYWNlQWxsKCc+JywgJyZndDsnKVxyXG4gICAgLnJlcGxhY2VBbGwoJ1wiJywgJyZxdW90OycpXHJcbiAgICAucmVwbGFjZUFsbChcIidcIiwgJyYjMzk7JylcclxufVxyXG5cclxuLyoqIFBsYWluLXRleHQgZXhwb3J0OiB0ZXh0YmxvY2sgY29udGVudHMgam9pbmVkIGJ5IG5ld2xpbmVzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplVG9UZXh0KGRvYzogRWRpdG9yTm9kZSk6IHN0cmluZyB7XHJcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW11cclxuICBjb25zdCB3YWxrID0gKG5vZGU6IEVkaXRvck5vZGUpOiB2b2lkID0+IHtcclxuICAgIGlmIChub2RlLmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgIGxpbmVzLnB1c2gobm9kZS50ZXh0Q29udGVudClcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY29udGVudC5jaGlsZHJlbikgd2FsayhjaGlsZClcclxuICB9XHJcbiAgd2Fsayhkb2MpXHJcbiAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpXHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IHR5cGUgSFRNTFNlcmlhbGl6ZU9wdGlvbnMsIHNlcmlhbGl6ZVRvSFRNTCB9IGZyb20gJy4vaHRtbCdcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgSFRNTERvY3VtZW50T3B0aW9ucyB7XHJcbiAgLyoqIEdvZXMgaW4gYDx0aXRsZT5gLiBEZWZhdWx0cyB0byBcIkRvY3VtZW50XCIuICovXHJcbiAgcmVhZG9ubHkgdGl0bGU/OiBzdHJpbmdcclxuICAvKipcclxuICAgKiBTdHlsZXNoZWV0IFVSTHMgdG8gbGluay4gUmVsYXRpdmUgVVJMcyBhcmUgcmVzb2x2ZWQgYWdhaW5zdCBgYmFzZVVSTGAsXHJcbiAgICogc28gYSBkb2N1bWVudCBzYXZlZCBlbHNld2hlcmUgc3RpbGwgZmluZHMgdGhlbS5cclxuICAgKi9cclxuICByZWFkb25seSBzdHlsZVNoZWV0cz86IHJlYWRvbmx5IHN0cmluZ1tdXHJcbiAgLyoqIFNjcmlwdCBVUkxzIHRvIGxvYWQsIHJlc29sdmVkIHRoZSBzYW1lIHdheS4gKi9cclxuICByZWFkb25seSBzY3JpcHRzPzogcmVhZG9ubHkgc3RyaW5nW11cclxuICAvKipcclxuICAgKiBCYXNlIGZvciByZXNvbHZpbmcgdGhlIFVSTHMgYWJvdmUsIGUuZy4gYFwiaHR0cDovL2xvY2FsaG9zdDo1MTczXCJgLiBBbHNvXHJcbiAgICogZW1pdHRlZCBhcyBgPGJhc2UgaHJlZj5gIHNvIGFueSByZWxhdGl2ZSBsaW5rIGluc2lkZSB0aGUgZG9jdW1lbnQgaXRzZWxmXHJcbiAgICogcmVzb2x2ZXMgYWdhaW5zdCB0aGUgb3JpZ2luIGl0IGNhbWUgZnJvbSByYXRoZXIgdGhhbiB3aGVyZXZlciB0aGUgZmlsZVxyXG4gICAqIGVuZHMgdXAuXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgYmFzZVVSTD86IHN0cmluZ1xyXG4gIC8qKiBDU1MgZW1iZWRkZWQgZGlyZWN0bHkgaW4gdGhlIHBhZ2UsIGFmdGVyIHRoZSBsaW5rZWQgc3R5bGVzaGVldHMuICovXHJcbiAgcmVhZG9ubHkgaW5saW5lQ1NTPzogc3RyaW5nXHJcbiAgLyoqIEphdmFTY3JpcHQgZW1iZWRkZWQgZGlyZWN0bHksIGFmdGVyIHRoZSBsaW5rZWQgc2NyaXB0cy4gKi9cclxuICByZWFkb25seSBpbmxpbmVKUz86IHN0cmluZ1xyXG4gIC8qKiBMYW5ndWFnZSBmb3IgYDxodG1sIGxhbmc+YC4gRGVmYXVsdHMgdG8gXCJlblwiLiAqL1xyXG4gIHJlYWRvbmx5IGxhbmc/OiBzdHJpbmdcclxuICAvKiogUGFzc2VkIHRvIHtAbGluayBzZXJpYWxpemVUb0hUTUx9OyBzZWUge0BsaW5rIEhUTUxTZXJpYWxpemVPcHRpb25zLnJlbmRlck5vZGV9LiAqL1xyXG4gIHJlYWRvbmx5IHJlbmRlck5vZGU/OiBIVE1MU2VyaWFsaXplT3B0aW9uc1sncmVuZGVyTm9kZSddXHJcbiAgLyoqXHJcbiAgICogVGhlIHBhbGV0dGUgdGhlIGRvY3VtZW50IHdhcyBiZWluZyBlZGl0ZWQgaW4sIGJha2VkIGludG8gdGhlIHBhZ2Ugc28gaXRcclxuICAgKiBvcGVucyBpbiB0aGF0IHRoZW1lIHJhdGhlciB0aGFuIGluIHdoYXRldmVyIHRoZSByZWFkZXIncyBzdHlsZXNoZWV0LCBvclxyXG4gICAqIG9wZXJhdGluZyBzeXN0ZW0sIGRlY2lkZXMgZm9yIGl0LlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IHRoZW1lPzogSFRNTERvY3VtZW50VGhlbWVcclxufVxyXG5cclxuLyoqIFRoZSBlZGl0b3IncyB0aGVtZSwgYXMgYW4gZXhwb3J0ZWQgcGFnZSBoYXMgdG8gY2FycnkgaXQuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgSFRNTERvY3VtZW50VGhlbWUge1xyXG4gIC8qKiBUaGUgZ3JvdW5kIHRoZSBwYWxldHRlIHNpdHMgb247IHdyaXR0ZW4gdG8gYGRhdGEtdHJldml4YWwtdGhlbWVgLiAqL1xyXG4gIHJlYWRvbmx5IHNjaGVtZT86ICdsaWdodCcgfCAnZGFyaydcclxuICAvKiogVGhlIHByZXNldCBpbiBmb3JjZSwgaWYgYW55OyB3cml0dGVuIHRvIGBkYXRhLXRyZXZpeGFsLXByZXNldGAuICovXHJcbiAgcmVhZG9ubHkgcHJlc2V0Pzogc3RyaW5nIHwgbnVsbFxyXG4gIC8qKlxyXG4gICAqIFJlc29sdmVkIHRva2VuIHZhbHVlcyBrZXllZCBieSBuYW1lIHdpdGhvdXQgdGhlIGAtLXR2eC1gIHByZWZpeCwgZS5nLlxyXG4gICAqIGB7ICdjb2xvci1iZyc6ICcjMmUzNDQwJyB9YC5cclxuICAgKi9cclxuICByZWFkb25seSB0b2tlbnM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PlxyXG59XHJcblxyXG4vKiogQWJzb2x1dGUgZm9ybXMgdGhpcyB3aWxsIGVtaXQgYXMtaXMuICovXHJcbmNvbnN0IEFCU09MVVRFID0gL14oPzpodHRwcz86XFwvXFwvfFxcL1xcLykvaVxyXG5cclxuLy8gQSB0aGVtZSBjYW4gYmUgYXV0aG9yZWQgYnkgYSB1c2VyIHRocm91Z2ggYSBjdXN0b20tdGhlbWUgZGlhbG9nLCBzbyBpdHNcclxuLy8gbmFtZSBhbmQgZXZlcnkgdG9rZW4gdmFsdWUgYXJlIHVudHJ1c3RlZCB0ZXh0IG9uIHRoZSB3YXkgaW50byBDU1MuIEEgbmFtZVxyXG4vLyB0aGF0IGNvdWxkIGNsb3NlIHRoZSBhdHRyaWJ1dGUgaXQgbGFuZHMgaW4sIG9yIGEgdmFsdWUgdGhhdCBjb3VsZCBjbG9zZSB0aGVcclxuLy8gZGVjbGFyYXRpb24gYmxvY2ssIHdvdWxkIGxldCBhIFwidGhlbWVcIiB3cml0ZSBydWxlcyBmb3IgdGhlIHdob2xlIHBhZ2UuXHJcblxyXG4vKiogQSB0b2tlbiBuYW1lIGlzIHRoZSB0YWlsIG9mIGEgY3VzdG9tIHByb3BlcnR5OiBsZXR0ZXJzLCBkaWdpdHMsIGRhc2hlcy4gKi9cclxuY29uc3QgU0FGRV9UT0tFTl9OQU1FID0gL15bYS16QS1aMC05LV0rJC9cclxuLyoqIEEgdmFsdWUgdGhhdCBjb3VsZCBlbmQgdGhlIGRlY2xhcmF0aW9uLCBjbG9zZSB0aGUgYmxvY2ssIG9yIG9wZW4gYSBjb21tZW50LiAqL1xyXG5jb25zdCBVTlNBRkVfSU5fVkFMVUUgPSAvW3t9PD47QFxcXFxdfFxcL1xcKi9cclxuLyoqIEEgcHJlc2V0IG5hbWUgdGhhdCBjb3VsZCBicmVhayBvdXQgb2YgdGhlIGF0dHJpYnV0ZSBpdCBpcyB3cml0dGVuIHRvLiAqL1xyXG5jb25zdCBVTlNBRkVfSU5fUFJFU0VUID0gL1tcIidcXFxce308Plxcblxccl0vXHJcblxyXG4vKipcclxuICogV2hldGhlciBhIFVSTCBjYXJyaWVzIGEgc2NoZW1lIG9mIGl0cyBvd24uIEEgY29sb24gYXBwZWFyaW5nIGJlZm9yZSB0aGVcclxuICogZmlyc3Qgc2xhc2ggaXMgd2hhdCBtYWtlcyBvbmUsIHNvIGBqYXZhc2NyaXB0OmFsZXJ0KDEpYCBhbmQgYGRhdGE6XHUyMDI2YCBhcmVcclxuICogY2F1Z2h0IHdoaWxlIGBhc3NldHMvYS5jc3NgIGFuZCBgL2EuY3NzYCBhcmUgbm90LlxyXG4gKi9cclxuZnVuY3Rpb24gaGFzU2NoZW1lKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgY29uc3QgY29sb24gPSB1cmwuaW5kZXhPZignOicpXHJcbiAgaWYgKGNvbG9uID09PSAtMSkgcmV0dXJuIGZhbHNlXHJcbiAgY29uc3Qgc2xhc2ggPSB1cmwuaW5kZXhPZignLycpXHJcbiAgcmV0dXJuIHNsYXNoID09PSAtMSB8fCBjb2xvbiA8IHNsYXNoXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXNvbHZlIGEgVVJMIGFnYWluc3QgYSBiYXNlLCBkcm9wcGluZyBhbnl0aGluZyB0aGF0IGlzIG5vdCBwbGFpbmx5IGFcclxuICogZG9jdW1lbnQgcmVmZXJlbmNlLlxyXG4gKlxyXG4gKiBgamF2YXNjcmlwdDpgIGFuZCBgZGF0YTpgIGFyZSByZWZ1c2VkIG91dHJpZ2h0OiB0aGVzZSBVUkxzIGxhbmQgaW4gYSBgc3JjYFxyXG4gKiBvciBgaHJlZmAgdGhhdCB0aGUgcmVjZWl2aW5nIHBhZ2Ugd2lsbCBmZXRjaCBhbmQgZXhlY3V0ZS5cclxuICovXHJcbmZ1bmN0aW9uIHJlc29sdmVVUkwodXJsOiBzdHJpbmcsIGJhc2U6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IG51bGwge1xyXG4gIGNvbnN0IHRyaW1tZWQgPSB1cmwudHJpbSgpXHJcbiAgaWYgKCF0cmltbWVkKSByZXR1cm4gbnVsbFxyXG4gIC8vIEEgc2NoZW1lIG90aGVyIHRoYW4gaHR0cChzKSBpcyByZWZ1c2VkOiB0aGVzZSBsYW5kIGluIGEgc3JjL2hyZWYgdGhhdCB0aGVcclxuICAvLyByZWNlaXZpbmcgcGFnZSB3aWxsIGZldGNoIGFuZCBleGVjdXRlLlxyXG4gIGlmIChoYXNTY2hlbWUodHJpbW1lZCkgJiYgIUFCU09MVVRFLnRlc3QodHJpbW1lZCkpIHJldHVybiBudWxsXHJcbiAgaWYgKCFiYXNlKSByZXR1cm4gdHJpbW1lZFxyXG4gIC8vIEFscmVhZHkgYWJzb2x1dGU6IGxlYXZlIGl0IGFsb25lLlxyXG4gIGlmIChBQlNPTFVURS50ZXN0KHRyaW1tZWQpKSByZXR1cm4gdHJpbW1lZFxyXG4gIGNvbnN0IG9yaWdpbiA9IGJhc2UucmVwbGFjZSgvXFwvKyQvLCAnJylcclxuICAvLyBgLi9hc3NldHMveC5jc3NgIHdvdWxkIG90aGVyd2lzZSBqb2luIGFzIGBvcmlnaW4vLi9hc3NldHMveC5jc3NgLlxyXG4gIGNvbnN0IHBhdGggPSB0cmltbWVkLnJlcGxhY2UoL15cXC5cXC8vLCAnJylcclxuICByZXR1cm4gcGF0aC5zdGFydHNXaXRoKCcvJykgPyBgJHtvcmlnaW59JHtwYXRofWAgOiBgJHtvcmlnaW59LyR7cGF0aH1gXHJcbn1cclxuXHJcbi8qKiBFc2NhcGUgYSBzdHJpbmcgZm9yIHVzZSBpbnNpZGUgYSBkb3VibGUtcXVvdGVkIGF0dHJpYnV0ZS4gKi9cclxuZnVuY3Rpb24gZXNjYXBlQXR0cmlidXRlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIHJldHVybiB2YWx1ZVxyXG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcclxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcclxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcclxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcclxufVxyXG5cclxuLyoqIEVzY2FwZSB0ZXh0IGZvciBhIGA8dGl0bGU+YCBvciBvdGhlciBlbGVtZW50IGNvbnRlbnQuICovXHJcbmZ1bmN0aW9uIGVzY2FwZVRleHQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG59XHJcblxyXG4vKipcclxuICogVGhlIGdyb3VuZCwgYXMgb25lIG9mIHRoZSB0d28gd29yZHMgdGhhdCBtZWFuIGFueXRoaW5nIGhlcmUuIFRoZSB0eXBlIHNheXNcclxuICogYXMgbXVjaCwgYnV0IHRoaXMgaXMgYSBwbGFpbi1kYXRhIG9wdGlvbiBvbiBhIHB1YmxpYyBmdW5jdGlvbjogYSBob3N0IHRoYXRcclxuICogcmVhZHMgYSB0aGVtZSBvdXQgb2Ygc3RvcmFnZSwgb3Igb2ZmIHRoZSB3aXJlLCBoYW5kcyBvdmVyIHdoYXRldmVyIGlzXHJcbiAqIHRoZXJlLCBhbmQgb25lIG9mIHRoZSBwbGFjZXMgaXQgbGFuZHMgaXMgYSBDU1MgZGVjbGFyYXRpb24uXHJcbiAqL1xyXG5mdW5jdGlvbiBzY2hlbWUodGhlbWU6IEhUTUxEb2N1bWVudFRoZW1lKTogJ2xpZ2h0JyB8ICdkYXJrJyB8IG51bGwge1xyXG4gIHJldHVybiB0aGVtZS5zY2hlbWUgPT09ICdsaWdodCcgfHwgdGhlbWUuc2NoZW1lID09PSAnZGFyaycgPyB0aGVtZS5zY2hlbWUgOiBudWxsXHJcbn1cclxuXHJcbi8qKiBgZGF0YS10cmV2aXhhbC10aGVtZWAgYW5kIGBkYXRhLXRyZXZpeGFsLXByZXNldGAsIHJlYWR5IHRvIHNwbGljZSBpbnRvIGEgdGFnLiAqL1xyXG5mdW5jdGlvbiB0aGVtZUF0dHJpYnV0ZXModGhlbWU6IEhUTUxEb2N1bWVudFRoZW1lIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcclxuICBpZiAoIXRoZW1lKSByZXR1cm4gJydcclxuICBsZXQgb3V0ID0gJydcclxuICBjb25zdCBncm91bmQgPSBzY2hlbWUodGhlbWUpXHJcbiAgaWYgKGdyb3VuZCkgb3V0ICs9IGAgZGF0YS10cmV2aXhhbC10aGVtZT1cIiR7Z3JvdW5kfVwiYFxyXG4gIGlmICh0aGVtZS5wcmVzZXQgJiYgIVVOU0FGRV9JTl9QUkVTRVQudGVzdCh0aGVtZS5wcmVzZXQpKSB7XHJcbiAgICBvdXQgKz0gYCBkYXRhLXRyZXZpeGFsLXByZXNldD1cIiR7ZXNjYXBlQXR0cmlidXRlKHRoZW1lLnByZXNldCl9XCJgXHJcbiAgfVxyXG4gIHJldHVybiBvdXRcclxufVxyXG5cclxuLyoqXHJcbiAqIFRoZSB0aGVtZSBhcyBhIHN0eWxlc2hlZXQgb2YgaXRzIG93biwgZW1pdHRlZCBhZnRlciBldmVyeXRoaW5nIHRoZSBjYWxsZXJcclxuICogY29sbGVjdGVkIHNvIHRoYXQgaXQgd2lucyBvbiBzb3VyY2Ugb3JkZXIuXHJcbiAqXHJcbiAqIFRoZSBwYWxldHRlIGlzIHdyaXR0ZW4gb3V0IGFzIHJlc29sdmVkIHZhbHVlcyByYXRoZXIgdGhhbiBsZWZ0IHRvIHRoZVxyXG4gKiBhdHRyaWJ1dGVzIGFib3ZlLiBUaG9zZSBvbmx5IHdvcmsgaWYgdGhlIHJ1bGVzIHJlYWRpbmcgdGhlbSB3ZXJlIGNvbGxlY3RlZFxyXG4gKiB0b28sIGFuZCBhIHByZXNldCBydWxlIGlzIGluIGFueSBjYXNlIG9uZSBzZWxlY3RvciBhbW9uZyBzZXZlcmFsIGNvbXBldGluZ1xyXG4gKiBmb3IgdGhlIHNhbWUgdG9rZW5zLCB3aGljaCBpcyBob3cgYW4gZXhwb3J0IGVuZHMgdXAgcGxhaW4gd2hpdGUgYWZ0ZXIgdGhlXHJcbiAqIGVkaXRvciBpdCBjYW1lIGZyb20gd2FzIG5vdC4gVmFsdWVzIHdyaXR0ZW4gc3RyYWlnaHQgb250byBgLnRyZXZpeGFsYFxyXG4gKiBkZXBlbmQgb24gbm90aGluZy5cclxuICovXHJcbmZ1bmN0aW9uIHRoZW1lQ1NTKHRoZW1lOiBIVE1MRG9jdW1lbnRUaGVtZSk6IHN0cmluZyB7XHJcbiAgY29uc3QgcnVsZXM6IHN0cmluZ1tdID0gW11cclxuICBjb25zdCBkZWNsYXJhdGlvbnMgPSBPYmplY3QuZW50cmllcyh0aGVtZS50b2tlbnMgPz8ge30pXHJcbiAgICAuZmlsdGVyKChbdG9rZW4sIHZhbHVlXSkgPT4gU0FGRV9UT0tFTl9OQU1FLnRlc3QodG9rZW4pICYmICFVTlNBRkVfSU5fVkFMVUUudGVzdCh2YWx1ZSkpXHJcbiAgICAubWFwKChbdG9rZW4sIHZhbHVlXSkgPT4gYCAgLS10dngtJHt0b2tlbn06ICR7dmFsdWV9O2ApXHJcbiAgLy8gYDpyb290YCBhcyB3ZWxsIGFzIGAudHJldml4YWxgOiB0aGUgcGFnZSBhcm91bmQgdGhlIGRvY3VtZW50IHJlYWRzIHRoZVxyXG4gIC8vIHNhbWUgdG9rZW5zLCBhbmQgbm90aGluZyBlbHNlIGRlZmluZXMgdGhlbSB1cCB0aGVyZS5cclxuICBpZiAoZGVjbGFyYXRpb25zLmxlbmd0aCA+IDApIHJ1bGVzLnB1c2goYDpyb290LCAudHJldml4YWwge1xcbiR7ZGVjbGFyYXRpb25zLmpvaW4oJ1xcbicpfVxcbn1gKVxyXG4gIGNvbnN0IGdyb3VuZCA9IHNjaGVtZSh0aGVtZSlcclxuICBpZiAoZ3JvdW5kKSBydWxlcy5wdXNoKGA6cm9vdCB7IGNvbG9yLXNjaGVtZTogJHtncm91bmR9OyB9YClcclxuICAvLyBBIGRhcmsgZG9jdW1lbnQgaW4gYSB3aGl0ZSBndXR0ZXIgcmVhZHMgYXMgYSBicm9rZW4gZXhwb3J0IHJhdGhlciB0aGFuIGFcclxuICAvLyBkYXJrIHRoZW1lLCBhbmQgbm8gYC50cmV2aXhhbGAgcnVsZSByZWFjaGVzIHRoYXQgZmFyLlxyXG4gIHJ1bGVzLnB1c2goXHJcbiAgICAnaHRtbCwgYm9keSB7IG1hcmdpbjogMDsgYmFja2dyb3VuZDogdmFyKC0tdHZ4LWNvbG9yLWJnLCAjZmZmZmZmKTsgY29sb3I6IHZhcigtLXR2eC1jb2xvci10ZXh0LCAjMWExYTJiKTsgfScsXHJcbiAgKVxyXG4gIC8vIFRoZSBwYWdlJ3Mgb3duIHNjcm9sbGJhciwgaW4gdGhlIHBhbGV0dGUgdGhlIHBhZ2UgaXMgaW4uXHJcbiAgLy9cclxuICAvLyBBIHN0YW5kYWxvbmUgZG9jdW1lbnQgaXMgYSB3aG9sZSBicm93c2luZyBjb250ZXh0OiBpdCBwYWludHMgaXRzIG93biBiYXIsXHJcbiAgLy8gYW5kIGxlZnQgYWxvbmUgdGhhdCBiYXIgaXMgdGhlIGJyb3dzZXIncyBkZWZhdWx0IGZ1cm5pdHVyZSwgd2hpY2ggb24gYVxyXG4gIC8vIGRhcmsgZXhwb3J0LCBvciBpbiB0aGUgc2lkZS1ieS1zaWRlIHByZXZpZXcgZnJhbWUsIGlzIGEgaGVhdnkgcGFsZSBzdHJpcGVcclxuICAvLyBkb3duIHRoZSBlZGdlIG9mIGFuIG90aGVyd2lzZSBkYXJrIHBhZ2UuIGBjb2xvci1zY2hlbWVgIGFib3ZlIGdldHMgdGhlXHJcbiAgLy8gYnJvd3NlciBtb3N0IG9mIHRoZSB3YXkgdGhlcmU7IHRoZXNlIG1hdGNoIGl0IHRvIHRoZSBlZGl0b3IgaXQgY2FtZSBmcm9tLlxyXG4gIHJ1bGVzLnB1c2goXHJcbiAgICAnaHRtbCB7IHNjcm9sbGJhci13aWR0aDogdGhpbjsgc2Nyb2xsYmFyLWNvbG9yOiB2YXIoLS10dngtY29sb3ItYm9yZGVyLCAjZDlkOWUzKSB0cmFuc3BhcmVudDsgfScsXHJcbiAgICAnOjotd2Via2l0LXNjcm9sbGJhciB7IHdpZHRoOiAxMHB4OyBoZWlnaHQ6IDEwcHg7IH0nLFxyXG4gICAgLy8gU2l6ZWQgYXdheSByYXRoZXIgdGhhbiBgZGlzcGxheWAtZWQgYXdheTogdGhlIGluamVjdGlvbiB0ZXN0cyBvdmVyIHRoaXNcclxuICAgIC8vIGZ1bmN0aW9uIHVzZSB0aGF0IGV4YWN0IGRlY2xhcmF0aW9uIGFzIHRoZWlyIHNlbnRpbmVsLCBhbmQgYSBjb3NtZXRpY1xyXG4gICAgLy8gcnVsZSBoZXJlIG11c3Qgbm90IGJsdW50IG9uZS5cclxuICAgICc6Oi13ZWJraXQtc2Nyb2xsYmFyLWJ1dHRvbiB7IHdpZHRoOiAwOyBoZWlnaHQ6IDA7IH0nLFxyXG4gICAgJzo6LXdlYmtpdC1zY3JvbGxiYXItdHJhY2ssIDo6LXdlYmtpdC1zY3JvbGxiYXItY29ybmVyIHsgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7IH0nLFxyXG4gICAgJzo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIgeyBiYWNrZ3JvdW5kOiB2YXIoLS10dngtY29sb3ItYm9yZGVyLCAjZDlkOWUzKTsgYm9yZGVyOiAzcHggc29saWQgdHJhbnNwYXJlbnQ7IGJvcmRlci1yYWRpdXM6IDVweDsgYmFja2dyb3VuZC1jbGlwOiBwYWRkaW5nLWJveDsgfScsXHJcbiAgICAnOjotd2Via2l0LXNjcm9sbGJhci10aHVtYjpob3ZlciB7IGJhY2tncm91bmQ6IHZhcigtLXR2eC1jb2xvci10ZXh0LW11dGVkLCAjNmI2YjgwKTsgYmFja2dyb3VuZC1jbGlwOiBwYWRkaW5nLWJveDsgfScsXHJcbiAgKVxyXG4gIC8vIEJyb3dzZXJzIGRyb3AgYmFja2dyb3VuZHMgd2hlbiBwcmludGluZyB1bmxlc3MgYSBwYWdlIGFza3MgZm9yIHRoZW0sIGFuZFxyXG4gIC8vIFwiU2F2ZSBhcyBQREZcIiBpcyBhIHByaW50OiB3aXRob3V0IHRoaXMgYSBkYXJrIHRoZW1lIHByaW50cyBhcyBwYWxlIHRleHRcclxuICAvLyBvbiB3aGl0ZSBwYXBlciwgYW5kIGNvZGUgYmxvY2tzIGFuZCBoaWdobGlnaHRzIGxvc2UgdGhlaXIgZmlsbHMgaW4gZXZlcnlcclxuICAvLyB0aGVtZS5cclxuICBydWxlcy5wdXNoKFxyXG4gICAgJ0BtZWRpYSBwcmludCB7XFxuICBodG1sLCBib2R5LCAudHJldml4YWwsIC50cmV2aXhhbCAqIHsgLXdlYmtpdC1wcmludC1jb2xvci1hZGp1c3Q6IGV4YWN0OyBwcmludC1jb2xvci1hZGp1c3Q6IGV4YWN0OyB9XFxufScsXHJcbiAgKVxyXG4gIHJldHVybiBydWxlcy5qb2luKCdcXG4nKVxyXG59XHJcblxyXG4vKipcclxuICogU2VyaWFsaXplIGEgZG9jdW1lbnQgYXMgYSBjb21wbGV0ZSwgc3RhbmRhbG9uZSBIVE1MIHBhZ2UuXHJcbiAqXHJcbiAqIHtAbGluayBzZXJpYWxpemVUb0hUTUx9IHJldHVybnMgYSBiYXJlIGZyYWdtZW50LCB3aGljaCBpcyB3aGF0IHlvdSB3YW50IGZvclxyXG4gKiBhIGNsaXBib2FyZCBwYXlsb2FkIG9yIGZvciBzdG9yaW5nIGNvbnRlbnQsIGJ1dCBwYXN0ZWQgaW50byBhIGZpbGUgb24gaXRzXHJcbiAqIG93biBpdCByZW5kZXJzIHVuc3R5bGVkLCBiZWNhdXNlIG5vdGhpbmcgY2FycmllcyB0aGUgc3R5bGVzaGVldCB3aXRoIGl0LlxyXG4gKiBUaGlzIHdyYXBzIHRoZSBzYW1lIG1hcmt1cCBpbiBhIHJlYWwgcGFnZSB3aXRoIGl0cyBzdHlsZXMgYW5kIHNjcmlwdHNcclxuICogYXR0YWNoZWQsIHNvIHRoZSBmaWxlIG9wZW5zIGxvb2tpbmcgbGlrZSB0aGUgZWRpdG9yIGRpZC5cclxuICpcclxuICogYGBgdHNcclxuICogc2VyaWFsaXplVG9IVE1MRG9jdW1lbnQoZWRpdG9yLnN0YXRlLmRvYywge1xyXG4gKiAgIGJhc2VVUkw6ICdodHRwOi8vbG9jYWxob3N0OjUxNzMnLFxyXG4gKiAgIHN0eWxlU2hlZXRzOiBbJy9zdHlsZXMuY3NzJ10sXHJcbiAqIH0pXHJcbiAqIGBgYFxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZVRvSFRNTERvY3VtZW50KFxyXG4gIGRvYzogRWRpdG9yTm9kZSxcclxuICBvcHRpb25zOiBIVE1MRG9jdW1lbnRPcHRpb25zID0ge30sXHJcbik6IHN0cmluZyB7XHJcbiAgY29uc3QgYmFzZSA9IG9wdGlvbnMuYmFzZVVSTD8udHJpbSgpXHJcbiAgY29uc3QgaGVhZDogc3RyaW5nW10gPSBbXHJcbiAgICAnPG1ldGEgY2hhcnNldD1cInV0Zi04XCI+JyxcclxuICAgICc8bWV0YSBuYW1lPVwidmlld3BvcnRcIiBjb250ZW50PVwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTFcIj4nLFxyXG4gIF1cclxuXHJcbiAgLy8gYDxiYXNlPmAgZmlyc3Q6IGl0IGdvdmVybnMgZXZlcnkgcmVsYXRpdmUgVVJMIHRoYXQgZm9sbG93cyBpdCwgaW5jbHVkaW5nXHJcbiAgLy8gb25lcyBpbnNpZGUgdGhlIGRvY3VtZW50IGJvZHkuXHJcbiAgaWYgKGJhc2UpIGhlYWQucHVzaChgPGJhc2UgaHJlZj1cIiR7ZXNjYXBlQXR0cmlidXRlKGJhc2UucmVwbGFjZSgvXFwvKyQvLCAnJykpfS9cIj5gKVxyXG4gIGhlYWQucHVzaChgPHRpdGxlPiR7ZXNjYXBlVGV4dChvcHRpb25zLnRpdGxlID8/ICdEb2N1bWVudCcpfTwvdGl0bGU+YClcclxuXHJcbiAgZm9yIChjb25zdCBocmVmIG9mIG9wdGlvbnMuc3R5bGVTaGVldHMgPz8gW10pIHtcclxuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVVSTChocmVmLCBiYXNlKVxyXG4gICAgaWYgKHJlc29sdmVkKSBoZWFkLnB1c2goYDxsaW5rIHJlbD1cInN0eWxlc2hlZXRcIiBocmVmPVwiJHtlc2NhcGVBdHRyaWJ1dGUocmVzb2x2ZWQpfVwiPmApXHJcbiAgfVxyXG5cclxuICBpZiAob3B0aW9ucy5pbmxpbmVDU1MpIHtcclxuICAgIC8vIGA8L3N0eWxlPmAgaW5zaWRlIHRoZSBDU1Mgd291bGQgY2xvc2UgdGhlIGJsb2NrIGVhcmx5IGFuZCBsZXQgdGhlIHJlc3RcclxuICAgIC8vIGJlIHBhcnNlZCBhcyBtYXJrdXAuXHJcbiAgICBoZWFkLnB1c2goYDxzdHlsZT5cXG4ke29wdGlvbnMuaW5saW5lQ1NTLnJlcGxhY2UoLzxcXC9zdHlsZT4vZ2ksICc8XFxcXC9zdHlsZT4nKX1cXG48L3N0eWxlPmApXHJcbiAgfVxyXG5cclxuICBpZiAob3B0aW9ucy50aGVtZSkgaGVhZC5wdXNoKGA8c3R5bGU+XFxuJHt0aGVtZUNTUyhvcHRpb25zLnRoZW1lKX1cXG48L3N0eWxlPmApXHJcblxyXG4gIGNvbnN0IHRoZW1lZCA9IHRoZW1lQXR0cmlidXRlcyhvcHRpb25zLnRoZW1lKVxyXG4gIGNvbnN0IGJvZHk6IHN0cmluZ1tdID0gW1xyXG4gICAgLy8gYC50cmV2aXhhbGAgYW5kIGAudHJldml4YWwtY29udGVudGAgYXJlIHdoYXQgdGhlIHN0eWxlc2hlZXQgdGFyZ2V0cywgc29cclxuICAgIC8vIHRoZSBleHBvcnRlZCBwYWdlIGhhcyB0byByZXByb2R1Y2UgdGhhdCBzdHJ1Y3R1cmUgdG8gYmUgc3R5bGVkIGF0IGFsbC5cclxuICAgIGA8ZGl2IGNsYXNzPVwidHJldml4YWxcIiR7dGhlbWVkfT5gLFxyXG4gICAgJzxkaXYgY2xhc3M9XCJ0cmV2aXhhbC1jb250ZW50XCI+JyxcclxuICAgIHNlcmlhbGl6ZVRvSFRNTChkb2MsIHsgcmVuZGVyTm9kZTogb3B0aW9ucy5yZW5kZXJOb2RlIH0pLFxyXG4gICAgJzwvZGl2PicsXHJcbiAgICAnPC9kaXY+JyxcclxuICBdXHJcblxyXG4gIGZvciAoY29uc3Qgc3JjIG9mIG9wdGlvbnMuc2NyaXB0cyA/PyBbXSkge1xyXG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVVJMKHNyYywgYmFzZSlcclxuICAgIGlmIChyZXNvbHZlZCkgYm9keS5wdXNoKGA8c2NyaXB0IHNyYz1cIiR7ZXNjYXBlQXR0cmlidXRlKHJlc29sdmVkKX1cIj48L3NjcmlwdD5gKVxyXG4gIH1cclxuXHJcbiAgaWYgKG9wdGlvbnMuaW5saW5lSlMpIHtcclxuICAgIGJvZHkucHVzaChgPHNjcmlwdD5cXG4ke29wdGlvbnMuaW5saW5lSlMucmVwbGFjZSgvPFxcL3NjcmlwdD4vZ2ksICc8XFxcXC9zY3JpcHQ+Jyl9XFxuPC9zY3JpcHQ+YClcclxuICB9XHJcblxyXG4gIHJldHVybiBbXHJcbiAgICAnPCFkb2N0eXBlIGh0bWw+JyxcclxuICAgIGA8aHRtbCBsYW5nPVwiJHtlc2NhcGVBdHRyaWJ1dGUob3B0aW9ucy5sYW5nID8/ICdlbicpfVwiJHt0aGVtZWR9PmAsXHJcbiAgICAnPGhlYWQ+JyxcclxuICAgIC4uLmhlYWQsXHJcbiAgICAnPC9oZWFkPicsXHJcbiAgICAnPGJvZHk+JyxcclxuICAgIC4uLmJvZHksXHJcbiAgICAnPC9ib2R5PicsXHJcbiAgICAnPC9odG1sPicsXHJcbiAgICAnJyxcclxuICBdLmpvaW4oJ1xcbicpXHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHR5cGUgeyBNYXJrIH0gZnJvbSAnLi4vbW9kZWwvbWFyaydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtkb3duU2VyaWFsaXplT3B0aW9ucyB7XHJcbiAgLyoqIEJ1bGxldCBtYXJrZXIgZm9yIHVub3JkZXJlZCBsaXN0czsgYFwiLVwiYCBieSBkZWZhdWx0LiAqL1xyXG4gIHJlYWRvbmx5IGJ1bGxldD86ICctJyB8ICcqJyB8ICcrJ1xyXG4gIC8qKiBFbXBoYXNpcyBkZWxpbWl0ZXIgZm9yIGl0YWxpY3M7IGBcIl9cImAgYnkgZGVmYXVsdC4gKi9cclxuICByZWFkb25seSBlbXBoYXNpcz86ICdfJyB8ICcqJ1xyXG4gIC8qKlxyXG4gICAqIE5vZGUgbmFtZXMgdG8gdHJlYXQgYXMgdGFibGVzLCByb3dzIGFuZCBjZWxscyB3aGVuIGEgdGFibGUgZXh0ZW5zaW9uIGlzXHJcbiAgICogbG9hZGVkLiBEZWZhdWx0cyBtYXRjaCBgQHRyZXZpeGFsL2V4dGVuc2lvbi10YWJsZWAuXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgdGFibGVOYW1lcz86IHtcclxuICAgIHJlYWRvbmx5IHRhYmxlPzogc3RyaW5nXHJcbiAgICByZWFkb25seSByb3c/OiBzdHJpbmdcclxuICAgIHJlYWRvbmx5IGNlbGw/OiBzdHJpbmdcclxuICB9XHJcbn1cclxuXHJcbmludGVyZmFjZSBSZXNvbHZlZCB7XHJcbiAgcmVhZG9ubHkgYnVsbGV0OiBzdHJpbmdcclxuICByZWFkb25seSBlbXBoYXNpczogc3RyaW5nXHJcbiAgcmVhZG9ubHkgdGFibGU6IHN0cmluZ1xyXG4gIHJlYWRvbmx5IHJvdzogc3RyaW5nXHJcbiAgcmVhZG9ubHkgY2VsbDogc3RyaW5nXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYXJrZG93biAoR0ZNKSBleHBvcnQuIENvdmVycyBldmVyeXRoaW5nIHRoZSBkZWZhdWx0IHNjaGVtYSBjYW4gaG9sZCwgcGx1c1xyXG4gKiB0YWJsZXMgYW5kIGltYWdlcyBmcm9tIHRoZSBidW5kbGVkIGV4dGVuc2lvbnMgd2hlbiB0aG9zZSBub2RlcyBhcmUgcHJlc2VudC5cclxuICpcclxuICogVW5rbm93biBibG9jayB0eXBlcyBkZWdyYWRlIHRvIHRoZWlyIHRleHQgY29udGVudCByYXRoZXIgdGhhbiBiZWluZ1xyXG4gKiBkcm9wcGVkLCBzbyBhIHNjaGVtYSB3aXRoIGN1c3RvbSBub2RlcyBzdGlsbCByb3VuZC10cmlwcyBpdHMgcHJvc2UuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplVG9NYXJrZG93bihcclxuICBkb2M6IEVkaXRvck5vZGUsXHJcbiAgb3B0aW9uczogTWFya2Rvd25TZXJpYWxpemVPcHRpb25zID0ge30sXHJcbik6IHN0cmluZyB7XHJcbiAgY29uc3QgY29uZmlnOiBSZXNvbHZlZCA9IHtcclxuICAgIGJ1bGxldDogb3B0aW9ucy5idWxsZXQgPz8gJy0nLFxyXG4gICAgZW1waGFzaXM6IG9wdGlvbnMuZW1waGFzaXMgPz8gJ18nLFxyXG4gICAgdGFibGU6IG9wdGlvbnMudGFibGVOYW1lcz8udGFibGUgPz8gJ3RhYmxlJyxcclxuICAgIHJvdzogb3B0aW9ucy50YWJsZU5hbWVzPy5yb3cgPz8gJ3RhYmxlUm93JyxcclxuICAgIGNlbGw6IG9wdGlvbnMudGFibGVOYW1lcz8uY2VsbCA/PyAndGFibGVDZWxsJyxcclxuICB9XHJcbiAgY29uc3QgYmxvY2tzID0gZG9jLmNvbnRlbnQuY2hpbGRyZW4ubWFwKChjaGlsZCkgPT4gc2VyaWFsaXplQmxvY2soY2hpbGQsIGNvbmZpZywgJycpKVxyXG4gIC8vIEEgdHJhaWxpbmcgbmV3bGluZSBpcyBjb252ZW50aW9uYWwgYW5kIG1ha2VzIHRoZSBvdXRwdXQgZGlmZi1mcmllbmRseS5cclxuICByZXR1cm4gYCR7YmxvY2tzLmZpbHRlcigoYmxvY2spID0+IGJsb2NrICE9PSBudWxsKS5qb2luKCdcXG5cXG4nKX1cXG5gXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPbmUgYmxvY2ssIGFscmVhZHkgaW5kZW50ZWQgZm9yIGl0cyBuZXN0aW5nIGxldmVsLiBgaW5kZW50YCBpcyB0aGUgcHJlZml4XHJcbiAqIGV2ZXJ5IGxpbmUgYWZ0ZXIgdGhlIGZpcnN0IG11c3QgY2FycnkuIFRoYXQgaXMgd2hhdCBrZWVwcyBuZXN0ZWQgbGlzdFxyXG4gKiBjb250ZW50IGF0dGFjaGVkIHRvIGl0cyBpdGVtLlxyXG4gKi9cclxuZnVuY3Rpb24gc2VyaWFsaXplQmxvY2sobm9kZTogRWRpdG9yTm9kZSwgY29uZmlnOiBSZXNvbHZlZCwgaW5kZW50OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIHN3aXRjaCAobm9kZS50eXBlLm5hbWUpIHtcclxuICAgIGNhc2UgJ3BhcmFncmFwaCc6XHJcbiAgICAgIHJldHVybiBpbmRlbnQgKyBzZXJpYWxpemVJbmxpbmUobm9kZS5jb250ZW50LCBjb25maWcpXHJcbiAgICBjYXNlICdoZWFkaW5nJzoge1xyXG4gICAgICBjb25zdCBsZXZlbCA9IE1hdGgubWluKDYsIE1hdGgubWF4KDEsIE51bWJlcihub2RlLmF0dHJzLmxldmVsKSB8fCAxKSlcclxuICAgICAgcmV0dXJuIGAke2luZGVudH0keycjJy5yZXBlYXQobGV2ZWwpfSAke3NlcmlhbGl6ZUlubGluZShub2RlLmNvbnRlbnQsIGNvbmZpZyl9YFxyXG4gICAgfVxyXG4gICAgY2FzZSAnY29kZUJsb2NrJzoge1xyXG4gICAgICBjb25zdCBsYW5ndWFnZSA9IHR5cGVvZiBub2RlLmF0dHJzLmxhbmd1YWdlID09PSAnc3RyaW5nJyA/IG5vZGUuYXR0cnMubGFuZ3VhZ2UgOiAnJ1xyXG4gICAgICBjb25zdCBib2R5ID0gbm9kZS50ZXh0Q29udGVudFxyXG4gICAgICAvLyBBIGZlbmNlIG11c3QgYmUgbG9uZ2VyIHRoYW4gdGhlIGxvbmdlc3QgYmFja3RpY2sgcnVuIGluc2lkZSBpdCwgb3IgdGhlXHJcbiAgICAgIC8vIGNvZGUgY2xvc2VzIHRoZSBibG9jayBlYXJseS5cclxuICAgICAgY29uc3QgZmVuY2UgPSAnYCcucmVwZWF0KE1hdGgubWF4KDMsIGxvbmdlc3RCYWNrdGlja1J1bihib2R5KSArIDEpKVxyXG4gICAgICBjb25zdCBsaW5lcyA9IGJvZHkubGVuZ3RoID4gMCA/IGJvZHkuc3BsaXQoJ1xcbicpIDogWycnXVxyXG4gICAgICByZXR1cm4gW1xyXG4gICAgICAgIGAke2luZGVudH0ke2ZlbmNlfSR7bGFuZ3VhZ2V9YCxcclxuICAgICAgICAuLi5saW5lcy5tYXAoKGxpbmUpID0+IGluZGVudCArIGxpbmUpLFxyXG4gICAgICAgIGAke2luZGVudH0ke2ZlbmNlfWAsXHJcbiAgICAgIF0uam9pbignXFxuJylcclxuICAgIH1cclxuICAgIGNhc2UgJ2Jsb2NrcXVvdGUnOiB7XHJcbiAgICAgIGNvbnN0IGlubmVyID0gbm9kZS5jb250ZW50LmNoaWxkcmVuXHJcbiAgICAgICAgLm1hcCgoY2hpbGQpID0+IHNlcmlhbGl6ZUJsb2NrKGNoaWxkLCBjb25maWcsICcnKSlcclxuICAgICAgICAuam9pbignXFxuXFxuJylcclxuICAgICAgcmV0dXJuIHByZWZpeExpbmVzKGlubmVyLCBgJHtpbmRlbnR9PiBgKVxyXG4gICAgfVxyXG4gICAgY2FzZSAnaG9yaXpvbnRhbFJ1bGUnOlxyXG4gICAgICByZXR1cm4gYCR7aW5kZW50fS0tLWBcclxuICAgIGNhc2UgJ2J1bGxldExpc3QnOlxyXG4gICAgLy8gQSB0YXNrIGxpc3QgaXMgYSBidWxsZXQgbGlzdCB3aG9zZSBpdGVtcyBlYWNoIGNhcnJ5IGEgY2hlY2tib3g7IHRoZVxyXG4gICAgLy8gYHRhc2tNYXJrZXJgIGJlbG93IHR1cm5zIGVhY2ggaXRlbSdzIGBjaGVja2VkYCBhdHRyIGludG8gYFsgXWAvYFt4XWAuXHJcbiAgICBjYXNlICd0YXNrTGlzdCc6XHJcbiAgICAgIHJldHVybiBzZXJpYWxpemVMaXN0KG5vZGUsIGNvbmZpZywgaW5kZW50LCBudWxsKVxyXG4gICAgY2FzZSAnb3JkZXJlZExpc3QnOiB7XHJcbiAgICAgIGNvbnN0IHN0YXJ0ID0gdHlwZW9mIG5vZGUuYXR0cnMuc3RhcnQgPT09ICdudW1iZXInID8gbm9kZS5hdHRycy5zdGFydCA6IDFcclxuICAgICAgcmV0dXJuIHNlcmlhbGl6ZUxpc3Qobm9kZSwgY29uZmlnLCBpbmRlbnQsIHN0YXJ0KVxyXG4gICAgfVxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgaWYgKG5vZGUudHlwZS5uYW1lID09PSBjb25maWcudGFibGUpIHJldHVybiBzZXJpYWxpemVUYWJsZShub2RlLCBjb25maWcsIGluZGVudClcclxuICAgICAgaWYgKG5vZGUuaXNUZXh0YmxvY2spIHJldHVybiBpbmRlbnQgKyBzZXJpYWxpemVJbmxpbmUobm9kZS5jb250ZW50LCBjb25maWcpXHJcbiAgICAgIC8vIFVua25vd24gY29udGFpbmVyOiBlbWl0IGl0cyBibG9ja3Mgc28gbm90aGluZyBpcyBzaWxlbnRseSBsb3N0LlxyXG4gICAgICByZXR1cm4gbm9kZS5jb250ZW50LmNoaWxkcmVuXHJcbiAgICAgICAgLm1hcCgoY2hpbGQpID0+IHNlcmlhbGl6ZUJsb2NrKGNoaWxkLCBjb25maWcsIGluZGVudCkpXHJcbiAgICAgICAgLmpvaW4oJ1xcblxcbicpXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzZXJpYWxpemVMaXN0KFxyXG4gIGxpc3Q6IEVkaXRvck5vZGUsXHJcbiAgY29uZmlnOiBSZXNvbHZlZCxcclxuICBpbmRlbnQ6IHN0cmluZyxcclxuICBzdGFydDogbnVtYmVyIHwgbnVsbCxcclxuKTogc3RyaW5nIHtcclxuICBjb25zdCBpdGVtczogc3RyaW5nW10gPSBbXVxyXG4gIGxldCBjb3VudGVyID0gc3RhcnQgPz8gMFxyXG4gIGZvciAoY29uc3QgaXRlbSBvZiBsaXN0LmNvbnRlbnQuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IG1hcmtlciA9IHN0YXJ0ID09PSBudWxsID8gYCR7Y29uZmlnLmJ1bGxldH0gYCA6IGAke2NvdW50ZXIrK30uIGBcclxuICAgIC8vIENvbnRpbnVhdGlvbiBsaW5lcyBhbGlnbiB1bmRlciB0aGUgbWFya2VyLCB3aGljaCBpcyB3aGF0IG1ha2VzIGEgbmVzdGVkXHJcbiAgICAvLyBsaXN0IGEgY2hpbGQgb2YgdGhpcyBpdGVtIHJhdGhlciB0aGFuIGEgc2libGluZyBvZiB0aGUgbGlzdC5cclxuICAgIGNvbnN0IGNoaWxkSW5kZW50ID0gaW5kZW50ICsgJyAnLnJlcGVhdChtYXJrZXIubGVuZ3RoKVxyXG4gICAgY29uc3QgdGFzayA9IHRhc2tNYXJrZXIoaXRlbSlcclxuICAgIGNvbnN0IGJsb2NrcyA9IGl0ZW0uY29udGVudC5jaGlsZHJlbi5tYXAoKGNoaWxkLCBpbmRleCkgPT5cclxuICAgICAgc2VyaWFsaXplQmxvY2soY2hpbGQsIGNvbmZpZywgaW5kZXggPT09IDAgPyAnJyA6IGNoaWxkSW5kZW50KSxcclxuICAgIClcclxuICAgIGNvbnN0IGJvZHkgPSBibG9ja3Muam9pbignXFxuXFxuJylcclxuICAgIGl0ZW1zLnB1c2goaW5kZW50ICsgbWFya2VyICsgdGFzayArIGJvZHkucmVwbGFjZSgvXi8sICcnKSlcclxuICB9XHJcbiAgcmV0dXJuIGl0ZW1zLmpvaW4oJ1xcbicpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgWyBdIGAgLyBgW3hdIGAgZm9yIGEgdGFzayBpdGVtLCBlbHNlIG5vdGhpbmcuIEtleWVkIG9uIHRoZSBub2RlIHR5cGVcclxuICogcmF0aGVyIHRoYW4gdGhlIG1lcmUgcHJlc2VuY2Ugb2YgYSBgY2hlY2tlZGAgYXR0ciwgc28gYW4gb3JkaW5hcnkgbGlzdFxyXG4gKiBpdGVtIHRoYXQgaGFwcGVucyB0byBjYXJyeSBvbmUgaXMgbm90IHR1cm5lZCBpbnRvIGEgY2hlY2tib3guXHJcbiAqL1xyXG5mdW5jdGlvbiB0YXNrTWFya2VyKGl0ZW06IEVkaXRvck5vZGUpOiBzdHJpbmcge1xyXG4gIGlmIChpdGVtLnR5cGUubmFtZSAhPT0gJ3Rhc2tJdGVtJykgcmV0dXJuICcnXHJcbiAgcmV0dXJuIGl0ZW0uYXR0cnMuY2hlY2tlZCA9PT0gdHJ1ZSA/ICdbeF0gJyA6ICdbIF0gJ1xyXG59XHJcblxyXG4vKiogQSBHRk0gcGlwZSB0YWJsZS4gQWxpZ25tZW50IGNvbWVzIGZyb20gdGhlIGZpcnN0IHJvdydzIGNlbGwgYXR0cnMuICovXHJcbmZ1bmN0aW9uIHNlcmlhbGl6ZVRhYmxlKHRhYmxlOiBFZGl0b3JOb2RlLCBjb25maWc6IFJlc29sdmVkLCBpbmRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgY29uc3Qgcm93cyA9IHRhYmxlLmNvbnRlbnQuY2hpbGRyZW4uZmlsdGVyKChyb3cpID0+IHJvdy50eXBlLm5hbWUgPT09IGNvbmZpZy5yb3cpXHJcbiAgaWYgKHJvd3MubGVuZ3RoID09PSAwKSByZXR1cm4gJydcclxuICBjb25zdCBjZWxsc09mID0gKHJvdzogRWRpdG9yTm9kZSk6IEVkaXRvck5vZGVbXSA9PlxyXG4gICAgcm93LmNvbnRlbnQuY2hpbGRyZW4uZmlsdGVyKChjZWxsKSA9PiBjZWxsLnR5cGUubmFtZSA9PT0gY29uZmlnLmNlbGwpXHJcblxyXG4gIGNvbnN0IGNvbHVtbnMgPSBNYXRoLm1heCguLi5yb3dzLm1hcCgocm93KSA9PiBjZWxsc09mKHJvdykubGVuZ3RoKSlcclxuICBjb25zdCByZW5kZXJSb3cgPSAocm93OiBFZGl0b3JOb2RlKTogc3RyaW5nID0+IHtcclxuICAgIGNvbnN0IGNlbGxzID0gY2VsbHNPZihyb3cpXHJcbiAgICBjb25zdCByZW5kZXJlZDogc3RyaW5nW10gPSBbXVxyXG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNvbHVtbnM7IGluZGV4KyspIHtcclxuICAgICAgY29uc3QgY2VsbCA9IGNlbGxzW2luZGV4XVxyXG4gICAgICByZW5kZXJlZC5wdXNoKGNlbGwgPyBjZWxsVGV4dChjZWxsLCBjb25maWcpIDogJycpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gYCR7aW5kZW50fXwgJHtyZW5kZXJlZC5qb2luKCcgfCAnKX0gfGBcclxuICB9XHJcblxyXG4gIGNvbnN0IGZpcnN0ID0gcm93c1swXSBhcyBFZGl0b3JOb2RlXHJcbiAgY29uc3QgaGVhZGVyQ2VsbHMgPSBjZWxsc09mKGZpcnN0KVxyXG4gIC8vIE9uZSBkZWxpbWl0ZXIgcGVyIGNvbHVtbiwgdGFraW5nIGl0cyBhbGlnbm1lbnQgZnJvbSB0aGUgaGVhZGVyIGNlbGwgLS1cclxuICAvLyBhIHNob3J0IGhlYWRlciByb3cgc3RpbGwgbmVlZHMgYSBydWxlIGZvciBldmVyeSBjb2x1bW4uXHJcbiAgY29uc3QgZGVsaW1pdGVyID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogY29sdW1ucyB9LCAoX3VudXNlZCwgaW5kZXgpID0+XHJcbiAgICBhbGlnbm1lbnRSdWxlKGhlYWRlckNlbGxzW2luZGV4XT8uYXR0cnMuYWxpZ24pLFxyXG4gIClcclxuICBjb25zdCBsaW5lcyA9IFtyZW5kZXJSb3coZmlyc3QpLCBgJHtpbmRlbnR9fCAke2RlbGltaXRlci5qb2luKCcgfCAnKX0gfGBdXHJcbiAgZm9yIChjb25zdCByb3cgb2Ygcm93cy5zbGljZSgxKSkgbGluZXMucHVzaChyZW5kZXJSb3cocm93KSlcclxuICByZXR1cm4gbGluZXMuam9pbignXFxuJylcclxufVxyXG5cclxuZnVuY3Rpb24gYWxpZ25tZW50UnVsZShhbGlnbjogdW5rbm93bik6IHN0cmluZyB7XHJcbiAgaWYgKGFsaWduID09PSAnbGVmdCcpIHJldHVybiAnOi0tLSdcclxuICBpZiAoYWxpZ24gPT09ICdjZW50ZXInKSByZXR1cm4gJzotLS06J1xyXG4gIGlmIChhbGlnbiA9PT0gJ3JpZ2h0JykgcmV0dXJuICctLS06J1xyXG4gIHJldHVybiAnLS0tJ1xyXG59XHJcblxyXG4vKipcclxuICogQSBjZWxsJ3MgY29udGVudCBmbGF0dGVuZWQgdG8gb25lIGxpbmU6IGEgcGlwZSB0YWJsZSBoYXMgbm8gd2F5IHRvIGV4cHJlc3NcclxuICogYSBibG9jayBicmVhaywgc28gcGFyYWdyYXBocyBqb2luIHdpdGggYSBzcGFjZSBhbmQgcGlwZXMgYXJlIGVzY2FwZWQuXHJcbiAqL1xyXG5mdW5jdGlvbiBjZWxsVGV4dChjZWxsOiBFZGl0b3JOb2RlLCBjb25maWc6IFJlc29sdmVkKTogc3RyaW5nIHtcclxuICByZXR1cm4gY2VsbC5jb250ZW50LmNoaWxkcmVuXHJcbiAgICAubWFwKChibG9jaykgPT4gc2VyaWFsaXplSW5saW5lKGJsb2NrLmNvbnRlbnQsIGNvbmZpZykpXHJcbiAgICAuam9pbignICcpXHJcbiAgICAucmVwbGFjZUFsbCgnfCcsICdcXFxcfCcpXHJcbiAgICAudHJpbSgpXHJcbn1cclxuXHJcbi8qKiBJbmxpbmUgY29udGVudDogdGV4dCB3aXRoIG1hcmtzLCBoYXJkIGJyZWFrcywgaW1hZ2VzIGFuZCBpbmxpbmUgYXRvbXMuICovXHJcbmZ1bmN0aW9uIHNlcmlhbGl6ZUlubGluZShjb250ZW50OiBGcmFnbWVudCwgY29uZmlnOiBSZXNvbHZlZCk6IHN0cmluZyB7XHJcbiAgbGV0IG91dCA9ICcnXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBjb250ZW50LmNoaWxkcmVuKSB7XHJcbiAgICBpZiAoY2hpbGQuaXNUZXh0KSB7XHJcbiAgICAgIG91dCArPSBhcHBseU1hcmtzKGVzY2FwZU1hcmtkb3duKChjaGlsZCBhcyBUZXh0Tm9kZSkudGV4dCksIGNoaWxkLm1hcmtzLCBjb25maWcpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBpZiAoY2hpbGQudHlwZS5uYW1lID09PSAnaGFyZEJyZWFrJykge1xyXG4gICAgICAvLyBUd28gdHJhaWxpbmcgc3BhY2VzIGlzIHRoZSBvbmx5IGhhcmQgYnJlYWsgdGhhdCBzdXJ2aXZlcyBhIHJvdW5kIHRyaXBcclxuICAgICAgLy8gdGhyb3VnaCBldmVyeSBwYXJzZXI7IGEgbG9uZSBiYWNrc2xhc2ggaXMgbm90IHVuaXZlcnNhbGx5IHN1cHBvcnRlZC5cclxuICAgICAgb3V0ICs9ICcgIFxcbidcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGlmIChjaGlsZC50eXBlLm5hbWUgPT09ICdpbWFnZScpIHtcclxuICAgICAgb3V0ICs9IHNlcmlhbGl6ZUltYWdlKGNoaWxkKVxyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG4gICAgLy8gVW5rbm93biBpbmxpbmUgbm9kZTogZmFsbCBiYWNrIHRvIGl0cyB0ZXh0LCBvciBpdHMgb3duIHRvSFRNTCB0ZXh0IHNwZWMuXHJcbiAgICBvdXQgKz0gZXNjYXBlTWFya2Rvd24oY2hpbGQudGV4dENvbnRlbnQgfHwgU3RyaW5nKGNoaWxkLnR5cGUuc3BlYy50b0hUTUw/LihjaGlsZCk/LnRleHQgPz8gJycpKVxyXG4gIH1cclxuICByZXR1cm4gb3V0XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlcmlhbGl6ZUltYWdlKG5vZGU6IEVkaXRvck5vZGUpOiBzdHJpbmcge1xyXG4gIGNvbnN0IHNyYyA9IHR5cGVvZiBub2RlLmF0dHJzLnNyYyA9PT0gJ3N0cmluZycgPyBub2RlLmF0dHJzLnNyYyA6ICcnXHJcbiAgY29uc3QgYWx0ID0gdHlwZW9mIG5vZGUuYXR0cnMuYWx0ID09PSAnc3RyaW5nJyA/IG5vZGUuYXR0cnMuYWx0IDogJydcclxuICBjb25zdCB0aXRsZSA9IHR5cGVvZiBub2RlLmF0dHJzLnRpdGxlID09PSAnc3RyaW5nJyA/IG5vZGUuYXR0cnMudGl0bGUgOiAnJ1xyXG4gIGNvbnN0IHN1ZmZpeCA9IHRpdGxlID8gYCBcIiR7dGl0bGUucmVwbGFjZUFsbCgnXCInLCAnXFxcXFwiJyl9XCJgIDogJydcclxuICByZXR1cm4gYCFbJHtlc2NhcGVMaW5rVGV4dChhbHQpfV0oJHtlbmNvZGVEZXN0aW5hdGlvbihzcmMpfSR7c3VmZml4fSlgXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBXcmFwIHRleHQgaW4gZWFjaCBvZiBpdHMgbWFya3MsIGlubmVybW9zdCBmaXJzdCBzbyB0aGUgZmlyc3QgbWFyayBpbiB0aGVcclxuICogc2V0IGVuZHMgdXAgb3V0ZXJtb3N0LCBtYXRjaGluZyB0aGUgSFRNTCBzZXJpYWxpemVyJ3Mgb3JkZXJpbmcuXHJcbiAqL1xyXG5mdW5jdGlvbiBhcHBseU1hcmtzKHRleHQ6IHN0cmluZywgbWFya3M6IHJlYWRvbmx5IE1hcmtbXSwgY29uZmlnOiBSZXNvbHZlZCk6IHN0cmluZyB7XHJcbiAgaWYgKG1hcmtzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRleHRcclxuICBsZXQgb3V0ID0gdGV4dFxyXG4gIC8vIGBjb2RlYCBtdXN0IGJlIGFwcGxpZWQgZmlyc3QgYW5kIHN1cHByZXNzZXMgdGhlIGVzY2FwaW5nIG9mIGV2ZXJ5dGhpbmdcclxuICAvLyBpbnNpZGUgaXQsIHNvIGhhbmRsZSBpdCBiZWZvcmUgdGhlIHdyYXBwaW5nIG1hcmtzLlxyXG4gIGNvbnN0IGNvZGVNYXJrID0gbWFya3MuZmluZCgobWFyaykgPT4gbWFyay50eXBlLm5hbWUgPT09ICdjb2RlJylcclxuICBpZiAoY29kZU1hcmspIG91dCA9IHdyYXBDb2RlKHVuZXNjYXBlTWFya2Rvd24ob3V0KSlcclxuICBmb3IgKGxldCBpbmRleCA9IG1hcmtzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcclxuICAgIGNvbnN0IG1hcmsgPSBtYXJrc1tpbmRleF0gYXMgTWFya1xyXG4gICAgc3dpdGNoIChtYXJrLnR5cGUubmFtZSkge1xyXG4gICAgICBjYXNlICdib2xkJzpcclxuICAgICAgICBvdXQgPSBgKioke291dH0qKmBcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdpdGFsaWMnOlxyXG4gICAgICAgIG91dCA9IGAke2NvbmZpZy5lbXBoYXNpc30ke291dH0ke2NvbmZpZy5lbXBoYXNpc31gXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnc3RyaWtldGhyb3VnaCc6XHJcbiAgICAgICAgb3V0ID0gYH5+JHtvdXR9fn5gXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnbGluayc6IHtcclxuICAgICAgICBjb25zdCBocmVmID0gdHlwZW9mIG1hcmsuYXR0cnMuaHJlZiA9PT0gJ3N0cmluZycgPyBtYXJrLmF0dHJzLmhyZWYgOiAnJ1xyXG4gICAgICAgIGNvbnN0IHRpdGxlID0gdHlwZW9mIG1hcmsuYXR0cnMudGl0bGUgPT09ICdzdHJpbmcnID8gbWFyay5hdHRycy50aXRsZSA6ICcnXHJcbiAgICAgICAgY29uc3Qgc3VmZml4ID0gdGl0bGUgPyBgIFwiJHt0aXRsZS5yZXBsYWNlQWxsKCdcIicsICdcXFxcXCInKX1cImAgOiAnJ1xyXG4gICAgICAgIG91dCA9IGBbJHtvdXR9XSgke2VuY29kZURlc3RpbmF0aW9uKGhyZWYpfSR7c3VmZml4fSlgXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgfVxyXG4gICAgICAvLyBjb2RlIGlzIGhhbmRsZWQgYWJvdmU7IHRoZSByZXN0ICh1bmRlcmxpbmUsIGhpZ2hsaWdodCwgY29sb3JzLCBcdTIwMjYpXHJcbiAgICAgIC8vIGhhdmUgbm8gbWFya2Rvd24gZXF1aXZhbGVudCBhbmQgcGFzcyB0aHJvdWdoIGFzIHBsYWluIHRleHQuXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgYnJlYWtcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIG91dFxyXG59XHJcblxyXG4vKiogSW5saW5lIGNvZGUgbmVlZHMgYSBiYWNrdGljayBydW4gbG9uZ2VyIHRoYW4gYW55IGluc2lkZSB0aGUgdGV4dC4gKi9cclxuZnVuY3Rpb24gd3JhcENvZGUodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCBmZW5jZSA9ICdgJy5yZXBlYXQobG9uZ2VzdEJhY2t0aWNrUnVuKHRleHQpICsgMSlcclxuICAvLyBBIGxlYWRpbmcvdHJhaWxpbmcgYmFja3RpY2sgb3Igc3BhY2UgbmVlZHMgcGFkZGluZywgcGVyIENvbW1vbk1hcmsuXHJcbiAgY29uc3QgcGFkID0gdGV4dC5zdGFydHNXaXRoKCdgJykgfHwgdGV4dC5lbmRzV2l0aCgnYCcpIHx8IHRleHQudHJpbSgpICE9PSB0ZXh0ID8gJyAnIDogJydcclxuICByZXR1cm4gYCR7ZmVuY2V9JHtwYWR9JHt0ZXh0fSR7cGFkfSR7ZmVuY2V9YFxyXG59XHJcblxyXG5mdW5jdGlvbiBsb25nZXN0QmFja3RpY2tSdW4odGV4dDogc3RyaW5nKTogbnVtYmVyIHtcclxuICBsZXQgbG9uZ2VzdCA9IDBcclxuICBsZXQgcnVuID0gMFxyXG4gIGZvciAoY29uc3QgY2hhciBvZiB0ZXh0KSB7XHJcbiAgICBpZiAoY2hhciA9PT0gJ2AnKSB7XHJcbiAgICAgIHJ1biArPSAxXHJcbiAgICAgIGlmIChydW4gPiBsb25nZXN0KSBsb25nZXN0ID0gcnVuXHJcbiAgICB9IGVsc2UgcnVuID0gMFxyXG4gIH1cclxuICByZXR1cm4gbG9uZ2VzdFxyXG59XHJcblxyXG4vKipcclxuICogQ2hhcmFjdGVycyB0aGF0IGJlZ2luIG1hcmtkb3duIGNvbnN0cnVjdHMuIEVzY2FwaW5nIHRoZXNlIG9uIHRoZSB3YXkgb3V0IGlzXHJcbiAqIHdoYXQgbWFrZXMgYSBwYXJhZ3JhcGggcmVhZGluZyBgKm5vdCBlbXBoYXNpcypgIGNvbWUgYmFjayBhcyB0aGF0IGxpdGVyYWxcclxuICogdGV4dCBpbnN0ZWFkIG9mIGFzIGVtcGhhc2lzLiBUaGUgY2VudHJhbCByb3VuZC10cmlwIGNvcnJlY3RuZXNzIHJ1bGUuXHJcbiAqL1xyXG5jb25zdCBJTkxJTkVfU1BFQ0lBTFMgPSAvW1xcXFxgKl9bXFxdPD4mfnwkXS9nXHJcblxyXG4vKiogQ29uc3RydWN0cyB0aGF0IG9ubHkgbWVhbiBzb21ldGhpbmcgYXQgdGhlIHN0YXJ0IG9mIGEgbGluZS4gKi9cclxuY29uc3QgTElORV9MRUFERVJTID0gL14oXFxzKikoI3sxLDZ9XFxzfFstKitdXFxzfD58PXsyLH1cXHMqJHwtezIsfVxccyokKS9cclxuLyoqIEFuIG9yZGVyZWQtaXRlbSBtYXJrZXI6IHRoZSBkaWdpdHMgYXJlIGxpdGVyYWwsIHRoZSBkZWxpbWl0ZXIgaXMgbWFya3VwLiAqL1xyXG5jb25zdCBPUkRFUkVEX0xFQURFUiA9IC9eKFxccyopKFxcZHsxLDl9KShbLildXFxzKS9cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBlc2NhcGVNYXJrZG93bih0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGxldCBlc2NhcGVkID0gdGV4dC5yZXBsYWNlKElOTElORV9TUEVDSUFMUywgKGNoYXIpID0+IGBcXFxcJHtjaGFyfWApXHJcbiAgLy8gYCMgYCBhbmQgYC0gYCBhcmUgbWFya3VwIG9ubHkgaW4gbGVhZGluZyBwb3NpdGlvbjsgZXNjYXBlIGp1c3QgdGhlIG1hcmtlclxyXG4gIC8vIHNvIHRoZSByZXN0IG9mIHRoZSBsaW5lIGlzIGxlZnQgcmVhZGFibGUuXHJcbiAgZXNjYXBlZCA9IGVzY2FwZWQucmVwbGFjZShMSU5FX0xFQURFUlMsIChfbWF0Y2gsIHNwYWNlOiBzdHJpbmcsIG1hcmtlcjogc3RyaW5nKSA9PiB7XHJcbiAgICByZXR1cm4gYCR7c3BhY2V9XFxcXCR7bWFya2VyfWBcclxuICB9KVxyXG4gIC8vIEZvciBcIjEuIFwiIHRoZSBiYWNrc2xhc2ggbXVzdCBwcmVjZWRlIHRoZSBkZWxpbWl0ZXIsIG5vdCB0aGUgZGlnaXRzOlxyXG4gIC8vIGEgYmFja3NsYXNoIGJlZm9yZSBhIGRpZ2l0IGlzIG5vdCBhbiBlc2NhcGUgYXQgYWxsLCBzbyBpdCB3b3VsZFxyXG4gIC8vIHN1cnZpdmUgaW50byB0aGUgb3V0cHV0IGFzIGEgbGl0ZXJhbCBiYWNrc2xhc2guXHJcbiAgZXNjYXBlZCA9IGVzY2FwZWQucmVwbGFjZShcclxuICAgIE9SREVSRURfTEVBREVSLFxyXG4gICAgKF9tYXRjaCwgc3BhY2U6IHN0cmluZywgZGlnaXRzOiBzdHJpbmcsIGRlbGltaXRlcjogc3RyaW5nKSA9PiB7XHJcbiAgICAgIHJldHVybiBgJHtzcGFjZX0ke2RpZ2l0c31cXFxcJHtkZWxpbWl0ZXJ9YFxyXG4gICAgfSxcclxuICApXHJcbiAgcmV0dXJuIGVzY2FwZWRcclxufVxyXG5cclxuLyoqIFVuZG8ge0BsaW5rIGVzY2FwZU1hcmtkb3dufTsgdXNlZCBmb3IgY29kZSBzcGFucywgd2hlcmUgbm90aGluZyBpcyBtYXJrdXAuICovXHJcbmZ1bmN0aW9uIHVuZXNjYXBlTWFya2Rvd24odGV4dDogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gdGV4dC5yZXBsYWNlKC9cXFxcKFtcXFxcYCpfW1xcXTw+Jn58JCMrLik+LV0pL2csICckMScpXHJcbn1cclxuXHJcbi8qKiBMaW5rIHRleHQgbWF5IGNvbnRhaW4gYnJhY2tldHM7IHRoZXkgbXVzdCBzdGF5IGJhbGFuY2VkLWVzY2FwZWQuICovXHJcbmZ1bmN0aW9uIGVzY2FwZUxpbmtUZXh0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHRleHQucmVwbGFjZUFsbCgnXFxcXCcsICdcXFxcXFxcXCcpLnJlcGxhY2VBbGwoJ1snLCAnXFxcXFsnKS5yZXBsYWNlQWxsKCddJywgJ1xcXFxdJylcclxufVxyXG5cclxuLyoqXHJcbiAqIEEgbGluayBkZXN0aW5hdGlvbi4gU3BhY2VzIGFuZCBwYXJlbnMgd291bGQgZW5kIHRoZSBkZXN0aW5hdGlvbiBlYXJseSwgc28gYVxyXG4gKiBVUkwgY29udGFpbmluZyB0aGVtIGlzIHdyYXBwZWQgaW4gYW5nbGUgYnJhY2tldHMsIGFzIENvbW1vbk1hcmsgYWxsb3dzLlxyXG4gKi9cclxuZnVuY3Rpb24gZW5jb2RlRGVzdGluYXRpb24odXJsOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGlmICh1cmwgPT09ICcnKSByZXR1cm4gJydcclxuICBpZiAoL1tcXHMoKTw+XS8udGVzdCh1cmwpKSByZXR1cm4gYDwke3VybC5yZXBsYWNlQWxsKCc8JywgJyUzQycpLnJlcGxhY2VBbGwoJz4nLCAnJTNFJyl9PmBcclxuICByZXR1cm4gdXJsXHJcbn1cclxuXHJcbi8qKiBQcmVmaXggZXZlcnkgbGluZSBvZiBhIGJsb2NrLCBrZWVwaW5nIGJsYW5rIGxpbmVzIHF1b3RlZCB0b28uICovXHJcbmZ1bmN0aW9uIHByZWZpeExpbmVzKHRleHQ6IHN0cmluZywgcHJlZml4OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIHJldHVybiB0ZXh0XHJcbiAgICAuc3BsaXQoJ1xcbicpXHJcbiAgICAubWFwKChsaW5lKSA9PiAobGluZS5sZW5ndGggPiAwID8gcHJlZml4ICsgbGluZSA6IHByZWZpeC50cmltRW5kKCkpKVxyXG4gICAgLmpvaW4oJ1xcbicpXHJcbn1cclxuIiwgImltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IG1lcmdlSW5saW5lIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IE1hcmsgfSBmcm9tICcuLi9tb2RlbC9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBub3JtYWxpemVEb2MgfSBmcm9tICcuLi9tb2RlbC9ub3JtYWxpemUnXHJcbmltcG9ydCB0eXBlIHsgTWFya1R5cGUsIE5vZGVUeXBlLCBQYXJzZVJ1bGUsIFNjaGVtYSB9IGZyb20gJy4uL21vZGVsL3NjaGVtYSdcclxuXHJcbi8qKlxyXG4gKiBTYW5pdGl6aW5nIEhUTUwgaW1wb3J0LiBTZWN1cml0eSBtb2RlbDogc2FuaXRpemUtYnktY29uc3RydWN0aW9uLiBUaGVcclxuICogcGFyc2VyIG9ubHkgZXZlciAqYnVpbGRzIG1vZGVsIG5vZGVzKiBmcm9tIGFuIGFsbG93bGlzdCBvZiBwYXJzZSBydWxlcywgc29cclxuICogc2NyaXB0cywgZXZlbnQgaGFuZGxlcnMsIHVua25vd24gZW1iZWRzIGFuZCBzdHlsZXMgY2FuIG5ldmVyIHJlYWNoIHRoZVxyXG4gKiBkb2N1bWVudC4gRGFuZ2Vyb3VzIHN1YnRyZWVzIGFyZSBkcm9wcGVkIHdob2xlc2FsZTsgdW5rbm93biBlbGVtZW50cyBrZWVwXHJcbiAqIHRoZWlyIGNvbnRlbnQgYnV0IGxvc2UgdGhlaXIgZm9ybWF0dGluZy4gTm8gYGlubmVySFRNTGAgaXMgZXZlciB3cml0dGVuLlxyXG4gKi9cclxuXHJcbi8qKiBFbGVtZW50cyB3aG9zZSBlbnRpcmUgc3VidHJlZSBpcyBkaXNjYXJkZWQuICovXHJcbmNvbnN0IERBTkdFUk9VU19UQUdTID0gbmV3IFNldChbXHJcbiAgJ3NjcmlwdCcsXHJcbiAgJ3N0eWxlJyxcclxuICAnaWZyYW1lJyxcclxuICAnZnJhbWUnLFxyXG4gICdvYmplY3QnLFxyXG4gICdlbWJlZCcsXHJcbiAgJ2FwcGxldCcsXHJcbiAgJ2xpbmsnLFxyXG4gICdtZXRhJyxcclxuICAnYmFzZScsXHJcbiAgJ2Zvcm0nLFxyXG4gICdpbnB1dCcsXHJcbiAgJ2J1dHRvbicsXHJcbiAgJ3NlbGVjdCcsXHJcbiAgJ3RleHRhcmVhJyxcclxuICAnc3ZnJyxcclxuICAnbWF0aCcsXHJcbiAgJ3RlbXBsYXRlJyxcclxuICAndGl0bGUnLFxyXG4gICdoZWFkJyxcclxuICAnbm9zY3JpcHQnLFxyXG5dKVxyXG5cclxuaW50ZXJmYWNlIFJ1bGVNYXRjaDxUPiB7XHJcbiAgcmVhZG9ubHkgb3duZXI6IFRcclxuICByZWFkb25seSBydWxlOiBQYXJzZVJ1bGVcclxufVxyXG5cclxuY2xhc3MgUnVsZVNldDxUPiB7XHJcbiAgcHJpdmF0ZSBieVRhZyA9IG5ldyBNYXA8c3RyaW5nLCBSdWxlTWF0Y2g8VD5bXT4oKVxyXG5cclxuICBhZGQob3duZXI6IFQsIHJ1bGU6IFBhcnNlUnVsZSk6IHZvaWQge1xyXG4gICAgY29uc3QgbGlzdCA9IHRoaXMuYnlUYWcuZ2V0KHJ1bGUudGFnKSA/PyBbXVxyXG4gICAgLy8gQXR0cmlidXRlLWNvbnN0cmFpbmVkIHJ1bGVzIGFyZSBtb3JlIHNwZWNpZmljOiB0cnkgdGhlbSBmaXJzdC5cclxuICAgIGlmIChydWxlLmF0dHJpYnV0ZSkgbGlzdC51bnNoaWZ0KHsgb3duZXIsIHJ1bGUgfSlcclxuICAgIGVsc2UgbGlzdC5wdXNoKHsgb3duZXIsIHJ1bGUgfSlcclxuICAgIHRoaXMuYnlUYWcuc2V0KHJ1bGUudGFnLCBsaXN0KVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXRoZXIgYW55IHJ1bGUgY2xhaW1zIHRoaXMgKGxvd2VyY2FzZSkgdGFnIG5hbWUuICovXHJcbiAgaGFzVGFnKHRhZzogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5ieVRhZy5oYXModGFnKVxyXG4gIH1cclxuXHJcbiAgLyoqIEZpcnN0IG1hdGNoaW5nIHJ1bGUgZm9yIGFuIGVsZW1lbnQsIHdpdGggcmVzb2x2ZWQgYXR0cmlidXRlcy4gKi9cclxuICBtYXRjaChlbGVtZW50OiBIVE1MRWxlbWVudCk6IHsgb3duZXI6IFQ7IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IG51bGwgfSB8IG51bGwge1xyXG4gICAgY29uc3QgbGlzdCA9IHRoaXMuYnlUYWcuZ2V0KGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpKVxyXG4gICAgaWYgKCFsaXN0KSByZXR1cm4gbnVsbFxyXG4gICAgZm9yIChjb25zdCB7IG93bmVyLCBydWxlIH0gb2YgbGlzdCkge1xyXG4gICAgICBpZiAocnVsZS5hdHRyaWJ1dGUgJiYgIWVsZW1lbnQuaGFzQXR0cmlidXRlKHJ1bGUuYXR0cmlidXRlKSkgY29udGludWVcclxuICAgICAgaWYgKCFydWxlLmdldEF0dHJzKSByZXR1cm4geyBvd25lciwgYXR0cnM6IG51bGwgfVxyXG4gICAgICBjb25zdCBhdHRycyA9IHJ1bGUuZ2V0QXR0cnMoZWxlbWVudClcclxuICAgICAgaWYgKGF0dHJzID09PSBmYWxzZSkgY29udGludWVcclxuICAgICAgcmV0dXJuIHsgb3duZXIsIGF0dHJzOiAoYXR0cnMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID8/IG51bGwgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcbn1cclxuXHJcbmNsYXNzIEhUTUxQYXJzZXIge1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgbm9kZVJ1bGVzID0gbmV3IFJ1bGVTZXQ8Tm9kZVR5cGU+KClcclxuICBwcml2YXRlIHJlYWRvbmx5IG1hcmtSdWxlcyA9IG5ldyBSdWxlU2V0PE1hcmtUeXBlPigpXHJcblxyXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc2NoZW1hOiBTY2hlbWEpIHtcclxuICAgIGZvciAoY29uc3QgdHlwZSBvZiBPYmplY3QudmFsdWVzKHNjaGVtYS5ub2RlcykpIHtcclxuICAgICAgZm9yIChjb25zdCBydWxlIG9mIHR5cGUuc3BlYy5wYXJzZUhUTUwgPz8gW10pIHRoaXMubm9kZVJ1bGVzLmFkZCh0eXBlLCBydWxlKVxyXG4gICAgfVxyXG4gICAgZm9yIChjb25zdCB0eXBlIG9mIE9iamVjdC52YWx1ZXMoc2NoZW1hLm1hcmtzKSkge1xyXG4gICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgdHlwZS5zcGVjLnBhcnNlSFRNTCA/PyBbXSkgdGhpcy5tYXJrUnVsZXMuYWRkKHR5cGUsIHJ1bGUpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwYXJzZShyb290OiBnbG9iYWxUaGlzLk5vZGUpOiBFZGl0b3JOb2RlIHtcclxuICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5wYXJzZUNoaWxkcmVuKHJvb3QsIFtdLCBmYWxzZSlcclxuICAgIGNvbnN0IGRvYyA9IHRoaXMuc2NoZW1hLnRvcFR5cGUuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQuZnJvbShjaGlsZHJlbikpXHJcbiAgICByZXR1cm4gbm9ybWFsaXplRG9jKGRvYylcclxuICB9XHJcblxyXG4gIC8qKiBQYXJzZSBlbGVtZW50IGNoaWxkcmVuIGludG8gYSBtaXhlZCBub2RlIGxpc3Q7IG5vcm1hbGl6YXRpb24gc29ydHMgc3RyYXlzLiAqL1xyXG4gIHByaXZhdGUgcGFyc2VDaGlsZHJlbihcclxuICAgIHBhcmVudDogZ2xvYmFsVGhpcy5Ob2RlLFxyXG4gICAgbWFya3M6IHJlYWRvbmx5IE1hcmtbXSxcclxuICAgIGlubGluZUNvbnRleHQ6IGJvb2xlYW4sXHJcbiAgKTogRWRpdG9yTm9kZVtdIHtcclxuICAgIGNvbnN0IG91dDogRWRpdG9yTm9kZVtdID0gW11cclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgWy4uLnBhcmVudC5jaGlsZE5vZGVzXSkge1xyXG4gICAgICBvdXQucHVzaCguLi50aGlzLnBhcnNlTm9kZShjaGlsZCwgbWFya3MsIGlubGluZUNvbnRleHQpKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG91dFxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwYXJzZU5vZGUoXHJcbiAgICBub2RlOiBnbG9iYWxUaGlzLk5vZGUsXHJcbiAgICBtYXJrczogcmVhZG9ubHkgTWFya1tdLFxyXG4gICAgaW5saW5lQ29udGV4dDogYm9vbGVhbixcclxuICApOiBFZGl0b3JOb2RlW10ge1xyXG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IDMgLyogVEVYVF9OT0RFICovKSB7XHJcbiAgICAgIGNvbnN0IGNvbGxhcHNlZCA9IChub2RlLnRleHRDb250ZW50ID8/ICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJylcclxuICAgICAgaWYgKGNvbGxhcHNlZCA9PT0gJycpIHJldHVybiBbXVxyXG4gICAgICBpZiAoY29sbGFwc2VkID09PSAnICcpIHtcclxuICAgICAgICAvLyBXaGl0ZXNwYWNlIGJldHdlZW4gYmxvY2tzIGlzIGxheW91dCBub2lzZTsgYmV0d2VlbiBpbmxpbmUgaXQgY291bnRzLlxyXG4gICAgICAgIHJldHVybiBpbmxpbmVDb250ZXh0ID8gW3RoaXMuc2NoZW1hLnRleHQoJyAnLCBtYXJrcyldIDogW11cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gW3RoaXMuc2NoZW1hLnRleHQoY29sbGFwc2VkLCBtYXJrcyldXHJcbiAgICB9XHJcbiAgICBpZiAobm9kZS5ub2RlVHlwZSAhPT0gMSAvKiBFTEVNRU5UX05PREUgKi8pIHJldHVybiBbXVxyXG4gICAgY29uc3QgZWxlbWVudCA9IG5vZGUgYXMgSFRNTEVsZW1lbnRcclxuICAgIGNvbnN0IHRhZyA9IGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpXHJcbiAgICAvLyBBIHNjaGVtYSB0aGF0IGRlY2xhcmVzIGEgcGFyc2UgcnVsZSBmb3Igb25lIG9mIHRoZXNlIChhbiBlbWJlZFxyXG4gICAgLy8gZXh0ZW5zaW9uJ3MgaWZyYW1lIG9yIHZpZGVvKSBoYXMgb3B0ZWQgaW47IGl0cyBgZ2V0QXR0cnNgIGlzIHRoZW5cclxuICAgIC8vIHJlc3BvbnNpYmxlIGZvciB2ZXR0aW5nIHRoZSBzb3VyY2UuIEV2ZXJ5dGhpbmcgZWxzZSBpcyBkcm9wcGVkIHdob2xlLlxyXG4gICAgY29uc3QgZGFuZ2Vyb3VzID0gREFOR0VST1VTX1RBR1MuaGFzKHRhZylcclxuICAgIGlmIChkYW5nZXJvdXMgJiYgIXRoaXMubm9kZVJ1bGVzLmhhc1RhZyh0YWcpKSByZXR1cm4gW11cclxuXHJcbiAgICBjb25zdCBtYXJrTWF0Y2ggPSB0aGlzLm1hcmtSdWxlcy5tYXRjaChlbGVtZW50KVxyXG4gICAgaWYgKG1hcmtNYXRjaCkge1xyXG4gICAgICBjb25zdCBtYXJrID0gbWFya01hdGNoLm93bmVyLmNyZWF0ZShtYXJrTWF0Y2guYXR0cnMgPz8gdW5kZWZpbmVkKVxyXG4gICAgICByZXR1cm4gdGhpcy5wYXJzZUNoaWxkcmVuKGVsZW1lbnQsIG1hcmsuYWRkVG9TZXQobWFya3MpLCBpbmxpbmVDb250ZXh0KVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG5vZGVNYXRjaCA9IHRoaXMubm9kZVJ1bGVzLm1hdGNoKGVsZW1lbnQpXHJcbiAgICBpZiAobm9kZU1hdGNoKSB7XHJcbiAgICAgIGNvbnN0IHR5cGUgPSBub2RlTWF0Y2gub3duZXJcclxuICAgICAgY29uc3QgYXR0cnMgPSBub2RlTWF0Y2guYXR0cnMgPz8gdW5kZWZpbmVkXHJcbiAgICAgIGlmICh0eXBlLnNwZWMucHJlc2VydmVXaGl0ZXNwYWNlKSB7XHJcbiAgICAgICAgLy8gQ29kZSBibG9ja3M6IHRha2UgdGhlIHJhdyB0ZXh0LCB2ZXJiYXRpbS5cclxuICAgICAgICBjb25zdCB0ZXh0ID0gZWxlbWVudC50ZXh0Q29udGVudCA/PyAnJ1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0ZXh0ID8gRnJhZ21lbnQub2YodGhpcy5zY2hlbWEudGV4dCh0ZXh0KSkgOiBGcmFnbWVudC5lbXB0eVxyXG4gICAgICAgIHJldHVybiBbdHlwZS5jcmVhdGUoYXR0cnMsIGNvbnRlbnQpXVxyXG4gICAgICB9XHJcbiAgICAgIGlmICghdHlwZS5zcGVjLmNvbnRlbnQpIHtcclxuICAgICAgICByZXR1cm4gW3R5cGUuY3JlYXRlKGF0dHJzKV0gLy8gbGVhZiAoaHIsIGJyKVxyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGlubGluZSA9IHR5cGUuaW5saW5lQ29udGVudFxyXG4gICAgICBjb25zdCBjaGlsZHJlbiA9IHRoaXMucGFyc2VDaGlsZHJlbihlbGVtZW50LCBpbmxpbmUgPyBtYXJrcyA6IFtdLCBpbmxpbmUpXHJcbiAgICAgIGlmIChpbmxpbmUpIHtcclxuICAgICAgICBjb25zdCBpbmxpbmVDaGlsZHJlbiA9IGNoaWxkcmVuLmZpbHRlcigoY2hpbGQpID0+IGNoaWxkLmlzSW5saW5lKVxyXG4gICAgICAgIHJldHVybiBbdHlwZS5jcmVhdGUoYXR0cnMsIG1lcmdlSW5saW5lKEZyYWdtZW50LmZyb20oaW5saW5lQ2hpbGRyZW4pKSldXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIFt0eXBlLmNyZWF0ZShhdHRycywgRnJhZ21lbnQuZnJvbShjaGlsZHJlbikpXVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEEgZGFuZ2Vyb3VzIHRhZyB3aG9zZSBjbGFpbWluZyBydWxlIHJlZnVzZWQgaXQgKGFuIGlmcmFtZSBwb2ludGluZ1xyXG4gICAgLy8gc29tZXdoZXJlIHRoZSBzY2hlbWEgZG9lcyBub3QgYWxsb3cpIGlzIGRyb3BwZWQgYWxvbmcgd2l0aCBpdHMgc3VidHJlZSxcclxuICAgIC8vIGV4YWN0bHkgYXMgYW4gdW5jbGFpbWVkIG9uZSBpcy4gS2VlcGluZyB0aGUgY2hpbGRyZW4gd291bGQgbGV0IG1hcmt1cFxyXG4gICAgLy8gbmVzdGVkIGluc2lkZSBhIHJlamVjdGVkIGZyYW1lIHNsaXAgaW50byB0aGUgZG9jdW1lbnQuXHJcbiAgICBpZiAoZGFuZ2Vyb3VzKSByZXR1cm4gW11cclxuXHJcbiAgICAvLyBVbmtub3duIGVsZW1lbnQgKGRpdiwgc3BhbiwgZm9udCwgbzpwLCBcdTIwMjYpOiBrZWVwIGNvbnRlbnQsIGRyb3AgZm9ybWF0dGluZy5cclxuICAgIHJldHVybiB0aGlzLnBhcnNlQ2hpbGRyZW4oZWxlbWVudCwgbWFya3MsIGlubGluZUNvbnRleHQpXHJcbiAgfVxyXG59XHJcblxyXG5jb25zdCBwYXJzZXJDYWNoZSA9IG5ldyBXZWFrTWFwPFNjaGVtYSwgSFRNTFBhcnNlcj4oKVxyXG5cclxuLyoqXHJcbiAqIFBhcnNlIGFuIEhUTUwgc3RyaW5nIGludG8gYSBub3JtYWxpemVkIGRvY3VtZW50LiBSZXF1aXJlcyBhIERPTVxyXG4gKiBlbnZpcm9ubWVudCAob3IgYW4gZXhwbGljaXQgYERvY3VtZW50YCwgZS5nLiBmcm9tIGhhcHB5LWRvbSBpbiB0ZXN0cykuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VIVE1MKHNjaGVtYTogU2NoZW1hLCBodG1sOiBzdHJpbmcsIGRvY3VtZW50PzogRG9jdW1lbnQpOiBFZGl0b3JOb2RlIHtcclxuICBjb25zdCBkb20gPSBkb2N1bWVudCA/PyAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cuZG9jdW1lbnQgOiBudWxsKVxyXG4gIGlmICghZG9tKSB7XHJcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcigncGFyc2VIVE1MIG5lZWRzIGEgRE9NIGVudmlyb25tZW50OyBwYXNzIGEgRG9jdW1lbnQgZXhwbGljaXRseSBpbiBOb2RlJylcclxuICB9XHJcbiAgLy8gQSB0ZW1wbGF0ZSdzIGNvbnRlbnQgZnJhZ21lbnQgaXMgaW5lcnQgYnkgc3BlYzogc2NyaXB0cyBuZXZlciBleGVjdXRlXHJcbiAgLy8gYW5kIGVtYmVkZGVkIHJlc291cmNlcyAoaWZyYW1lcywgaW1hZ2VzKSBuZXZlciBsb2FkIHdoaWxlIHdlIHdhbGsgaXQuXHJcbiAgY29uc3QgdGVtcGxhdGUgPSBkb20uY3JlYXRlRWxlbWVudCgndGVtcGxhdGUnKSBhcyBIVE1MVGVtcGxhdGVFbGVtZW50XHJcbiAgdGVtcGxhdGUuaW5uZXJIVE1MID0gaHRtbFxyXG4gIGxldCBwYXJzZXIgPSBwYXJzZXJDYWNoZS5nZXQoc2NoZW1hKVxyXG4gIGlmICghcGFyc2VyKSB7XHJcbiAgICBwYXJzZXIgPSBuZXcgSFRNTFBhcnNlcihzY2hlbWEpXHJcbiAgICBwYXJzZXJDYWNoZS5zZXQoc2NoZW1hLCBwYXJzZXIpXHJcbiAgfVxyXG4gIHJldHVybiBwYXJzZXIucGFyc2UodGVtcGxhdGUuY29udGVudClcclxufVxyXG4iLCAiLyoqXHJcbiAqIFdoZXJlIGEgcGllY2Ugb2YgcGFzdGVkIEhUTUwgY2FtZSBmcm9tLCBhbmQgaG93IHRvIGNsZWFuIGl0IHVwLlxyXG4gKlxyXG4gKiBPZmZpY2Ugc3VpdGVzIGRvIG5vdCB3cml0ZSBIVE1MIGZvciBvdGhlciBwZW9wbGUgdG8gcmVhZC4gV29yZCBzaGlwcyBhblxyXG4gKiBYTUwgaXNsYW5kLCBjb25kaXRpb25hbCBjb21tZW50cywgaHVuZHJlZHMgb2YgYG1zby1gIHN0eWxlIHByb3BlcnRpZXMgYW5kXHJcbiAqIGxpdGVyYWwgYnVsbGV0IGdseXBoczsgR29vZ2xlIERvY3Mgd3JhcHMgdGhlIHdob2xlIHNlbGVjdGlvbiBpbiBhIGA8Yj5gIHRoYXRcclxuICogdHVybnMgZXZlcnl0aGluZyBib2xkIGluIGFueSBlZGl0b3IgdGhhdCB0YWtlcyB0aGUgbWFya3VwIGF0IGZhY2UgdmFsdWUuXHJcbiAqIFBhc3RpbmcgZWl0aGVyIG9uZSBzdHJhaWdodCBpbnRvIGEgZG9jdW1lbnQgaW1wb3J0cyB0aGUgbWVzcyBhbG9uZyB3aXRoIHRoZVxyXG4gKiB3b3Jkcy5cclxuICpcclxuICogVGhpcyBydW5zICoqYmVmb3JlKiogdGhlIHNhbml0aXplciwgbm90IGluc3RlYWQgb2YgaXQuIE5vdGhpbmcgaGVyZSBpcyBhXHJcbiAqIHNlY3VyaXR5IG1lYXN1cmUuIFRoZSBhbGxvd2xpc3QgaW4gYHBhcnNlSFRNTGAgaXMsIGFuZCBpdCBzdGlsbCBydW5zIG9uXHJcbiAqIHdoYXRldmVyIGNvbWVzIG91dC4gVGhpcyBpcyBhYm91dCB0aGUgKnF1YWxpdHkqIG9mIHdoYXQgc3Vydml2ZXMuXHJcbiAqL1xyXG5cclxuLyoqIFRoZSBwcm9kdWNlciBvZiBhIGNsaXBib2FyZCBwYXlsb2FkLCBhcyBmYXIgYXMgaXRzIG1hcmt1cCBiZXRyYXlzLiAqL1xyXG5leHBvcnQgdHlwZSBQYXN0ZVNvdXJjZSA9ICd3b3JkJyB8ICdleGNlbCcgfCAnZ29vZ2xlLWRvY3MnIHwgJ2h0bWwnXHJcblxyXG4vKiogYDwhLS1baWYgZ3RlIG1zbyA5XT5cdTIwMjY8IVtlbmRpZl0tLT5gIGFuZCBmcmllbmRzLCBpbmNsdWRpbmcgdGhlaXIgY29udGVudHMuICovXHJcbmNvbnN0IENPTkRJVElPTkFMX0NPTU1FTlQgPSAvPCEtLVxcW2lmW15cXF1dKlxcXT5bXFxzXFxTXSo/PCFcXFtlbmRpZlxcXS0tPi9naVxyXG4vKiogV29yZCdzIFhNTCBpc2xhbmQ6IGA8eG1sPlx1MjAyNjwveG1sPmAsIHBsdXMgdGhlIGA8dzpcdTIwMjY+YCB0YWdzIGl0IG1heSBsZWF2ZSBsb29zZS4gKi9cclxuY29uc3QgWE1MX0lTTEFORCA9IC88eG1sXFxiW14+XSo+W1xcc1xcU10qPzxcXC94bWw+L2dpXHJcbi8qKlxyXG4gKiBXb3JkJ3Mgb3duIHN0eWxlc2hlZXQ6IHRlbnMgb2Yga2lsb2J5dGVzIG9mIGBtc28tYCBydWxlcyBkZXNjcmliaW5nIHRoZVxyXG4gKiBkb2N1bWVudCBpdCBjYW1lIGZyb20uIFRoZSBzYW5pdGl6ZXIgZHJvcHMgYDxzdHlsZT5gIGFueXdheSwgc28gbm90aGluZyBpc1xyXG4gKiBsb3N0IGJ5IGN1dHRpbmcgaXQgaGVyZTsgd2hhdCBpcyBnYWluZWQgaXMgbm90IGNhcnJ5aW5nIGl0IHRocm91Z2ggdGhlXHJcbiAqIHBhcnNlciBmaXJzdC5cclxuICovXHJcbmNvbnN0IFNUWUxFX0JMT0NLID0gLzxzdHlsZVxcYltePl0qPltcXHNcXFNdKj88XFwvc3R5bGU+L2dpXHJcbi8qKiBgPG86cD48L286cD5gOiBPZmZpY2UgcGFyYWdyYXBoIG1hcmtlcnMgdGhhdCBjYXJyeSBubyBjb250ZW50LiAqL1xyXG5jb25zdCBPRkZJQ0VfVEFHID0gLzxcXC8/W2Etel0rOlthLXpdW14+XSo+L2dpXHJcbi8vIFdvcmQgcXVvdGVzIGF0dHJpYnV0ZXMgd2l0aCBhcG9zdHJvcGhlcyBhbmQgb2Z0ZW4gbm90IGF0IGFsbCwgYGNsYXNzPU1zb05vcm1hbGBcclxuLy8gaXMgd2hhdCBpdCByZWFsbHkgd3JpdGVzLiBNYXRjaGluZyBvbmx5IGBjbGFzcz1cIlx1MjAyNlwiYCB3b3VsZCBsZWF2ZSBldmVyeSBvbmUgb2ZcclxuLy8gdGhlbSBpbiBwbGFjZSwgd2hpY2ggaXMgdGhlIHdob2xlIHBvaW50IG9mIHRoZXNlIHR3byBwYXNzZXMuXHJcbi8qKiBBIGBzdHlsZWAgYXR0cmlidXRlLCBob3dldmVyIGl0IGhhcHBlbnMgdG8gYmUgcXVvdGVkLiAqL1xyXG5jb25zdCBTVFlMRV9BVFRSSUJVVEUgPSAvXFxzc3R5bGVcXHMqPVxccyooPzpcIihbXlwiXSopXCJ8JyhbXiddKiknKS9naVxyXG4vKiogQSBgY2xhc3NgIGF0dHJpYnV0ZSwgaG93ZXZlciBpdCBoYXBwZW5zIHRvIGJlIHF1b3RlZCwgb3Igbm90IGF0IGFsbC4gKi9cclxuY29uc3QgQ0xBU1NfQVRUUklCVVRFID0gL1xcc2NsYXNzXFxzKj1cXHMqKD86XCIoW15cIl0qKVwifCcoW14nXSopJ3woW15cXHNcIic+XSspKS9naVxyXG4vKiogVGhlIHNwYW4gV29yZCB1c2VzIHRvIGhvbGQgYSBidWxsZXQgaXQgaGFzIGFscmVhZHkgZHJhd24uICovXHJcbmNvbnN0IE1TT19MSVNUX0lHTk9SRSA9IC88c3BhblxcYltePl0qbXNvLWxpc3RcXHMqOlxccyppZ25vcmVbXj5dKj5bXFxzXFxTXSo/PFxcL3NwYW4+L2dpXHJcbi8qKiBHb29nbGUncyB3cmFwcGVyOiBhIGA8Yj5gIHdob3NlIG9ubHkgam9iIGlzIHRvIGNhcnJ5IGFuIGlkLiAqL1xyXG5jb25zdCBHT09HTEVfQk9MRF9XUkFQUEVSID0gLzxiXFxiW14+XSppZFxccyo9XFxzKlwiZG9jcy1pbnRlcm5hbC1ndWlkW15cIl0qXCJbXj5dKj4oW1xcc1xcU10qKTxcXC9iPi9pXHJcbi8qKiBgZm9udC13ZWlnaHQ6NDAwYCBhbmQgYGZvbnQtd2VpZ2h0Om5vcm1hbGAgbWVhbiBcIm5vdCBib2xkXCIsIHNvIHNheSBub3RoaW5nLiAqL1xyXG5jb25zdCBOT1JNQUxfV0VJR0hUID0gL15mb250LXdlaWdodFxccyo6XFxzKig0MDB8bm9ybWFsKSQvaVxyXG4vKiogQSBzaW5nbGUgQ1NTIGRlY2xhcmF0aW9uIFdvcmQgaW52ZW50ZWQgZm9yIGl0c2VsZi4gKi9cclxuY29uc3QgTVNPX0RFQ0xBUkFUSU9OID0gL15cXHMqbXNvLS9pXHJcblxyXG4vKipcclxuICogV2hpY2ggYXBwbGljYXRpb24gcHJvZHVjZWQgdGhpcyBIVE1MLlxyXG4gKlxyXG4gKiBUaGUgbWFya2VycyBhcmUgdGhlIG9uZXMgZWFjaCBhcHBsaWNhdGlvbiB3cml0ZXMgaW50byBldmVyeSBwYXlsb2FkLCBub3RcclxuICogaGV1cmlzdGljcyBvdmVyIHRoZSBjb250ZW50OiBhIGRvY3VtZW50IHRoYXQgbWVyZWx5IG1lbnRpb25zIFdvcmQgaXMgbm90XHJcbiAqIGZyb20gV29yZC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RQYXN0ZVNvdXJjZShodG1sOiBzdHJpbmcpOiBQYXN0ZVNvdXJjZSB7XHJcbiAgaWYgKC9pZFxccyo9XFxzKlwiZG9jcy1pbnRlcm5hbC1ndWlkL2kudGVzdChodG1sKSkgcmV0dXJuICdnb29nbGUtZG9jcydcclxuICBpZiAoL3VybjpzY2hlbWFzLW1pY3Jvc29mdC1jb206b2ZmaWNlOmV4Y2VsL2kudGVzdChodG1sKSkgcmV0dXJuICdleGNlbCdcclxuICBpZiAoL2NvbnRlbnRcXHMqPVxccypcIj9NaWNyb3NvZnQgRXhjZWwvaS50ZXN0KGh0bWwpKSByZXR1cm4gJ2V4Y2VsJ1xyXG4gIGlmICgvdXJuOnNjaGVtYXMtbWljcm9zb2Z0LWNvbTpvZmZpY2U6d29yZC9pLnRlc3QoaHRtbCkpIHJldHVybiAnd29yZCdcclxuICBpZiAoL2NvbnRlbnRcXHMqPVxccypcIj9NaWNyb3NvZnQgV29yZC9pLnRlc3QoaHRtbCkpIHJldHVybiAnd29yZCdcclxuICAvLyBgY2xhc3M9TXNvTm9ybWFsYCB3aXRob3V0IHRoZSBuYW1lc3BhY2UgaGFwcGVucyB3aGVuIG9ubHkgYSBmcmFnbWVudCBvZlxyXG4gIC8vIHRoZSBjbGlwYm9hcmQgcGF5bG9hZCBzdXJ2aXZlZCB3aGF0ZXZlciBwYXNzZWQgaXQgYWxvbmcuXHJcbiAgaWYgKC9jbGFzc1xccyo9XFxzKlwiP01zb1tBLVpdLy50ZXN0KGh0bWwpKSByZXR1cm4gJ3dvcmQnXHJcbiAgaWYgKC9cXGJtc28tW2Etei1dK1xccyo6L2kudGVzdChodG1sKSkgcmV0dXJuICd3b3JkJ1xyXG4gIHJldHVybiAnaHRtbCdcclxufVxyXG5cclxuLyoqXHJcbiAqIFN0cmlwIHdoYXQgdGhlIHNvdXJjZSBhcHBsaWNhdGlvbiBhZGRlZCBmb3IgaXRzZWxmLlxyXG4gKlxyXG4gKiBSZXR1cm5zIHRoZSBpbnB1dCB1bmNoYW5nZWQgZm9yIG9yZGluYXJ5IHdlYiBIVE1MOiBwYXlpbmcgdGhlIGNvc3Qgb2YgdGhlc2VcclxuICogcGFzc2VzIG9uIGV2ZXJ5IHBhc3RlLCB0byBmaXggbWFya3VwIHRoYXQgd2FzIG5ldmVyIGJyb2tlbiwgaXMgaG93IGEgcGFzdGVcclxuICogYmVjb21lcyBub3RpY2VhYmx5IHNsb3cuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY2xlYW5QYXN0ZWRIVE1MKFxyXG4gIGh0bWw6IHN0cmluZyxcclxuICBzb3VyY2U6IFBhc3RlU291cmNlID0gZGV0ZWN0UGFzdGVTb3VyY2UoaHRtbCksXHJcbik6IHN0cmluZyB7XHJcbiAgaWYgKHNvdXJjZSA9PT0gJ2h0bWwnKSByZXR1cm4gaHRtbFxyXG4gIGxldCBjbGVhbmVkID0gaHRtbFxyXG4gIGlmIChzb3VyY2UgPT09ICdnb29nbGUtZG9jcycpIHtcclxuICAgIC8vIFRoZSBmYW1vdXMgb25lOiBHb29nbGUgd3JhcHMgdGhlIHNlbGVjdGlvbiBpbiBgPGIgc3R5bGU9XCJmb250LXdlaWdodDpcclxuICAgIC8vIG5vcm1hbFwiPmAuIEFuIGVkaXRvciB0aGF0IHRydXN0cyB0aGUgdGFnIG1ha2VzIHRoZSBlbnRpcmUgcGFzdGUgYm9sZC5cclxuICAgIGNvbnN0IHdyYXBwZXIgPSBHT09HTEVfQk9MRF9XUkFQUEVSLmV4ZWMoY2xlYW5lZClcclxuICAgIGlmICh3cmFwcGVyPy5bMV0gIT09IHVuZGVmaW5lZCkgY2xlYW5lZCA9IHdyYXBwZXJbMV1cclxuICB9IGVsc2Uge1xyXG4gICAgY2xlYW5lZCA9IGNsZWFuZWRcclxuICAgICAgLnJlcGxhY2UoQ09ORElUSU9OQUxfQ09NTUVOVCwgJycpXHJcbiAgICAgIC5yZXBsYWNlKFhNTF9JU0xBTkQsICcnKVxyXG4gICAgICAucmVwbGFjZShTVFlMRV9CTE9DSywgJycpXHJcbiAgICAgIC5yZXBsYWNlKE1TT19MSVNUX0lHTk9SRSwgJycpXHJcbiAgICAgIC5yZXBsYWNlKE9GRklDRV9UQUcsICcnKVxyXG4gIH1cclxuICByZXR1cm4gY2xlYW5lZFxyXG4gICAgLnJlcGxhY2UoU1RZTEVfQVRUUklCVVRFLCBjbGVhblN0eWxlQXR0cmlidXRlKVxyXG4gICAgLnJlcGxhY2UoQ0xBU1NfQVRUUklCVVRFLCBjbGVhbkNsYXNzQXR0cmlidXRlKVxyXG59XHJcblxyXG4vKiogRHJvcCBgbXNvLSpgIGFuZCBuby1vcCB3ZWlnaHRzOyBrZWVwIGV2ZXJ5IGRlY2xhcmF0aW9uIGEgYnJvd3NlciB1bmRlcnN0YW5kcy4gKi9cclxuZnVuY3Rpb24gY2xlYW5TdHlsZUF0dHJpYnV0ZShfbWF0Y2g6IHN0cmluZywgZG91YmxlZD86IHN0cmluZywgc2luZ2xlPzogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCBrZXB0ID0gKGRvdWJsZWQgPz8gc2luZ2xlID8/ICcnKVxyXG4gICAgLnNwbGl0KCc7JylcclxuICAgIC5tYXAoKGRlY2xhcmF0aW9uKSA9PiBkZWNsYXJhdGlvbi50cmltKCkpXHJcbiAgICAuZmlsdGVyKFxyXG4gICAgICAoZGVjbGFyYXRpb24pID0+XHJcbiAgICAgICAgZGVjbGFyYXRpb24ubGVuZ3RoID4gMCAmJlxyXG4gICAgICAgICFNU09fREVDTEFSQVRJT04udGVzdChkZWNsYXJhdGlvbikgJiZcclxuICAgICAgICAhTk9STUFMX1dFSUdIVC50ZXN0KGRlY2xhcmF0aW9uKSxcclxuICAgIClcclxuICByZXR1cm4ga2VwdC5sZW5ndGggPiAwID8gYCBzdHlsZT1cIiR7a2VwdC5qb2luKCc7ICcpfVwiYCA6ICcnXHJcbn1cclxuXHJcbi8qKiBEcm9wIGBNc28qYCBjbGFzcyBuYW1lczsga2VlcCBhbnl0aGluZyB0aGUgYXV0aG9yIGFjdHVhbGx5IGNob3NlLiAqL1xyXG5mdW5jdGlvbiBjbGVhbkNsYXNzQXR0cmlidXRlKFxyXG4gIF9tYXRjaDogc3RyaW5nLFxyXG4gIGRvdWJsZWQ/OiBzdHJpbmcsXHJcbiAgc2luZ2xlPzogc3RyaW5nLFxyXG4gIGJhcmU/OiBzdHJpbmcsXHJcbik6IHN0cmluZyB7XHJcbiAgY29uc3Qga2VwdCA9IChkb3VibGVkID8/IHNpbmdsZSA/PyBiYXJlID8/ICcnKVxyXG4gICAgLnNwbGl0KC9cXHMrLylcclxuICAgIC5maWx0ZXIoKG5hbWUpID0+IG5hbWUubGVuZ3RoID4gMCAmJiAhL15Nc28vLnRlc3QobmFtZSkpXHJcbiAgcmV0dXJuIGtlcHQubGVuZ3RoID4gMCA/IGAgY2xhc3M9XCIke2tlcHQuam9pbignICcpfVwiYCA6ICcnXHJcbn1cclxuIiwgImltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IG1lcmdlSW5saW5lIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IE1hcmsgfSBmcm9tICcuLi9tb2RlbC9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBub3JtYWxpemVEb2MgfSBmcm9tICcuLi9tb2RlbC9ub3JtYWxpemUnXHJcbmltcG9ydCB0eXBlIHsgU2NoZW1hIH0gZnJvbSAnLi4vbW9kZWwvc2NoZW1hJ1xyXG5pbXBvcnQgeyBzYWZlSHJlZiwgc2FmZUltYWdlU3JjIH0gZnJvbSAnLi4vc2NoZW1hL2Jhc2ljJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBNYXJrZG93blBhcnNlT3B0aW9ucyB7XHJcbiAgLyoqIE5vZGUgbmFtZXMgZm9yIHRhYmxlcywgbWF0Y2hpbmcgYEB0cmV2aXhhbC9leHRlbnNpb24tdGFibGVgLiAqL1xyXG4gIHJlYWRvbmx5IHRhYmxlTmFtZXM/OiB7XHJcbiAgICByZWFkb25seSB0YWJsZT86IHN0cmluZ1xyXG4gICAgcmVhZG9ubHkgcm93Pzogc3RyaW5nXHJcbiAgICByZWFkb25seSBjZWxsPzogc3RyaW5nXHJcbiAgfVxyXG59XHJcblxyXG5pbnRlcmZhY2UgTmFtZXMge1xyXG4gIHJlYWRvbmx5IHRhYmxlOiBzdHJpbmdcclxuICByZWFkb25seSByb3c6IHN0cmluZ1xyXG4gIHJlYWRvbmx5IGNlbGw6IHN0cmluZ1xyXG59XHJcblxyXG4vKipcclxuICogTWFya2Rvd24gKEdGTSkgaW1wb3J0IGZvciB0aGUgc2FtZSBzdWJzZXQge0BsaW5rIHNlcmlhbGl6ZVRvTWFya2Rvd259XHJcbiAqIGVtaXRzLiBCbG9jayBzdHJ1Y3R1cmUgaXMgcmVzb2x2ZWQgbGluZSBieSBsaW5lLCB0aGVuIGVhY2ggYmxvY2sncyB0ZXh0IGlzXHJcbiAqIHNjYW5uZWQgZm9yIGlubGluZSBtYXJrdXAuXHJcbiAqXHJcbiAqIFNlY3VyaXR5OiBsaW5rIGFuZCBpbWFnZSBkZXN0aW5hdGlvbnMgZ28gdGhyb3VnaCB0aGUgc2FtZSBgc2FmZUhyZWZgIC9cclxuICogYHNhZmVJbWFnZVNyY2Agc2FuaXRpemVycyB0aGUgSFRNTCBwYXJzZXIgYW5kIHRoZSBzY2hlbWEgdXNlLCBzbyBhXHJcbiAqIGBqYXZhc2NyaXB0OmAgVVJMIGluIG1hcmtkb3duIGlzIGRyb3BwZWQgZXhhY3RseSBhcyBpdCBpcyBpbiBIVE1MLiBUaGVcclxuICogbWFyayBpcyBzaW1wbHkgbm90IGFwcGxpZWQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNYXJrZG93bihcclxuICB0ZXh0OiBzdHJpbmcsXHJcbiAgc2NoZW1hOiBTY2hlbWEsXHJcbiAgb3B0aW9uczogTWFya2Rvd25QYXJzZU9wdGlvbnMgPSB7fSxcclxuKTogRWRpdG9yTm9kZSB7XHJcbiAgY29uc3QgbmFtZXM6IE5hbWVzID0ge1xyXG4gICAgdGFibGU6IG9wdGlvbnMudGFibGVOYW1lcz8udGFibGUgPz8gJ3RhYmxlJyxcclxuICAgIHJvdzogb3B0aW9ucy50YWJsZU5hbWVzPy5yb3cgPz8gJ3RhYmxlUm93JyxcclxuICAgIGNlbGw6IG9wdGlvbnMudGFibGVOYW1lcz8uY2VsbCA/PyAndGFibGVDZWxsJyxcclxuICB9XHJcbiAgY29uc3QgcGFyc2VyID0gbmV3IEJsb2NrUGFyc2VyKHNjaGVtYSwgbmFtZXMpXHJcbiAgY29uc3QgYmxvY2tzID0gcGFyc2VyLnBhcnNlQmxvY2tzKHRleHQucmVwbGFjZSgvXFxyXFxuPy9nLCAnXFxuJykuc3BsaXQoJ1xcbicpKVxyXG4gIGNvbnN0IGNvbnRlbnQgPSBibG9ja3MubGVuZ3RoID4gMCA/IGJsb2NrcyA6IFtzY2hlbWEubm9kZVR5cGUoJ3BhcmFncmFwaCcpLmNyZWF0ZSgpXVxyXG4gIHJldHVybiBub3JtYWxpemVEb2Moc2NoZW1hLnRvcFR5cGUuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQuZnJvbShjb250ZW50KSkpXHJcbn1cclxuXHJcbi8qKiBgLSBpdGVtYCwgYCogaXRlbWAsIGArIGl0ZW1gLCBgMS4gaXRlbWA7IGNhcHR1cmVzIGluZGVudCwgbWFya2VyIGFuZCByZXN0LiAqL1xyXG5jb25zdCBCVUxMRVRfSVRFTSA9IC9eKFxccyopKFstKitdKShcXHMrKSguKikkL1xyXG5jb25zdCBPUkRFUkVEX0lURU0gPSAvXihcXHMqKShcXGR7MSw5fSlbLildKFxccyspKC4qKSQvXHJcbmNvbnN0IEhFQURJTkcgPSAvXiB7MCwzfSgjezEsNn0pKD86XFxzKyguKj8pKT9cXHMqIypcXHMqJC9cclxuY29uc3QgRkVOQ0UgPSAvXihcXHMqKShgezMsfXx+ezMsfSlcXHMqKFteXFxzYF0qKVxccyokL1xyXG5jb25zdCBSVUxFID0gL14gezAsM30oPzooPzotXFxzKil7Myx9fCg/OlxcKlxccyopezMsfXwoPzpfXFxzKil7Myx9KSQvXHJcbmNvbnN0IEJMT0NLUVVPVEUgPSAvXiB7MCwzfT5cXHM/KC4qKSQvXHJcbmNvbnN0IFRBU0sgPSAvXlxcWyhbIHhYXSlcXF1cXHMrKC4qKSQvXHJcbmNvbnN0IFRBQkxFX0RFTElNSVRFUiA9IC9eXFxzKlxcfD8oXFxzKjo/LXsxLH06P1xccypcXHwpKyhcXHMqOj8tezEsfTo/XFxzKilcXHw/XFxzKiQvXHJcblxyXG5jbGFzcyBCbG9ja1BhcnNlciB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNjaGVtYTogU2NoZW1hLFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBuYW1lczogTmFtZXMsXHJcbiAgKSB7fVxyXG5cclxuICBwcml2YXRlIGhhcyhuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiBPYmplY3QuaGFzT3duKHRoaXMuc2NoZW1hLm5vZGVzLCBuYW1lKVxyXG4gIH1cclxuXHJcbiAgLyoqIENvbnN1bWUgbGluZXMgaW50byBibG9ja3MgdW50aWwgdGhleSBydW4gb3V0LiAqL1xyXG4gIHBhcnNlQmxvY2tzKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSk6IEVkaXRvck5vZGVbXSB7XHJcbiAgICBjb25zdCBvdXQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgICBsZXQgaW5kZXggPSAwXHJcblxyXG4gICAgd2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoKSB7XHJcbiAgICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpbmRleF0gYXMgc3RyaW5nXHJcblxyXG4gICAgICBpZiAobGluZS50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgaW5kZXggKz0gMVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGZlbmNlID0gRkVOQ0UuZXhlYyhsaW5lKVxyXG4gICAgICBpZiAoZmVuY2UpIHtcclxuICAgICAgICBjb25zdCBbLCAsIG1hcmtlciwgbGFuZ3VhZ2VdID0gZmVuY2UgYXMgdW5rbm93biBhcyBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZywgc3RyaW5nXVxyXG4gICAgICAgIGNvbnN0IGJvZHk6IHN0cmluZ1tdID0gW11cclxuICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgLy8gQW4gdW50ZXJtaW5hdGVkIGZlbmNlIHJ1bnMgdG8gdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnQsIHBlciBDb21tb25NYXJrLlxyXG4gICAgICAgIHdoaWxlIChpbmRleCA8IGxpbmVzLmxlbmd0aCAmJiAhaXNGZW5jZUNsb3NlKGxpbmVzW2luZGV4XSBhcyBzdHJpbmcsIG1hcmtlcikpIHtcclxuICAgICAgICAgIGJvZHkucHVzaChsaW5lc1tpbmRleF0gYXMgc3RyaW5nKVxyXG4gICAgICAgICAgaW5kZXggKz0gMVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoaW5kZXggPCBsaW5lcy5sZW5ndGgpIGluZGV4ICs9IDFcclxuICAgICAgICBvdXQucHVzaCh0aGlzLmNvZGVCbG9jayhib2R5LmpvaW4oJ1xcbicpLCBsYW5ndWFnZSB8fCBudWxsKSlcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoUlVMRS50ZXN0KGxpbmUpICYmIHRoaXMuaGFzKCdob3Jpem9udGFsUnVsZScpKSB7XHJcbiAgICAgICAgb3V0LnB1c2godGhpcy5zY2hlbWEubm9kZVR5cGUoJ2hvcml6b250YWxSdWxlJykuY3JlYXRlKCkpXHJcbiAgICAgICAgaW5kZXggKz0gMVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IGhlYWRpbmcgPSBIRUFESU5HLmV4ZWMobGluZSlcclxuICAgICAgaWYgKGhlYWRpbmcpIHtcclxuICAgICAgICBjb25zdCBsZXZlbCA9IChoZWFkaW5nWzFdIGFzIHN0cmluZykubGVuZ3RoXHJcbiAgICAgICAgb3V0LnB1c2godGhpcy5zY2hlbWEubm9kZVR5cGUoJ2hlYWRpbmcnKS5jcmVhdGUoeyBsZXZlbCB9LCB0aGlzLmlubGluZShoZWFkaW5nWzJdID8/ICcnKSkpXHJcbiAgICAgICAgaW5kZXggKz0gMVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChCTE9DS1FVT1RFLnRlc3QobGluZSkpIHtcclxuICAgICAgICBjb25zdCBxdW90ZWQ6IHN0cmluZ1tdID0gW11cclxuICAgICAgICB3aGlsZSAoaW5kZXggPCBsaW5lcy5sZW5ndGgpIHtcclxuICAgICAgICAgIGNvbnN0IG1hdGNoID0gQkxPQ0tRVU9URS5leGVjKGxpbmVzW2luZGV4XSBhcyBzdHJpbmcpXHJcbiAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgcXVvdGVkLnB1c2gobWF0Y2hbMV0gYXMgc3RyaW5nKVxyXG4gICAgICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgICAgIGNvbnRpbnVlXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICAvLyBBIGxhenkgY29udGludWF0aW9uIGxpbmUgYmVsb25ncyB0byB0aGUgcXVvdGUncyBsYXN0IHBhcmFncmFwaC5cclxuICAgICAgICAgIGlmICgobGluZXNbaW5kZXhdIGFzIHN0cmluZykudHJpbSgpID09PSAnJykgYnJlYWtcclxuICAgICAgICAgIGlmICh0aGlzLnN0YXJ0c05ld0Jsb2NrKGxpbmVzW2luZGV4XSBhcyBzdHJpbmcpKSBicmVha1xyXG4gICAgICAgICAgcXVvdGVkLnB1c2gobGluZXNbaW5kZXhdIGFzIHN0cmluZylcclxuICAgICAgICAgIGluZGV4ICs9IDFcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgaW5uZXIgPSB0aGlzLnBhcnNlQmxvY2tzKHF1b3RlZClcclxuICAgICAgICBvdXQucHVzaChcclxuICAgICAgICAgIHRoaXMuc2NoZW1hXHJcbiAgICAgICAgICAgIC5ub2RlVHlwZSgnYmxvY2txdW90ZScpXHJcbiAgICAgICAgICAgIC5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5mcm9tKGlubmVyLmxlbmd0aCA+IDAgPyBpbm5lciA6IFt0aGlzLnBhcmFncmFwaCgnJyldKSksXHJcbiAgICAgICAgKVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHRhYmxlID0gdGhpcy50cnlUYWJsZShsaW5lcywgaW5kZXgpXHJcbiAgICAgIGlmICh0YWJsZSkge1xyXG4gICAgICAgIG91dC5wdXNoKHRhYmxlLm5vZGUpXHJcbiAgICAgICAgaW5kZXggPSB0YWJsZS5uZXh0XHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgbGlzdCA9IHRoaXMudHJ5TGlzdChsaW5lcywgaW5kZXgpXHJcbiAgICAgIGlmIChsaXN0KSB7XHJcbiAgICAgICAgb3V0LnB1c2gobGlzdC5ub2RlKVxyXG4gICAgICAgIGluZGV4ID0gbGlzdC5uZXh0XHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUGFyYWdyYXBoOiBydW4gdW50aWwgYSBibGFuayBsaW5lIG9yIHRoZSBzdGFydCBvZiBhbm90aGVyIGJsb2NrLlxyXG4gICAgICBjb25zdCBwYXJhZ3JhcGg6IHN0cmluZ1tdID0gW2xpbmVdXHJcbiAgICAgIGluZGV4ICs9IDFcclxuICAgICAgd2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlID0gbGluZXNbaW5kZXhdIGFzIHN0cmluZ1xyXG4gICAgICAgIGlmIChjYW5kaWRhdGUudHJpbSgpID09PSAnJyB8fCB0aGlzLnN0YXJ0c05ld0Jsb2NrKGNhbmRpZGF0ZSkpIGJyZWFrXHJcbiAgICAgICAgcGFyYWdyYXBoLnB1c2goY2FuZGlkYXRlKVxyXG4gICAgICAgIGluZGV4ICs9IDFcclxuICAgICAgfVxyXG4gICAgICBvdXQucHVzaCh0aGlzLnBhcmFncmFwaExpbmVzKHBhcmFncmFwaCkpXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG91dFxyXG4gIH1cclxuXHJcbiAgLyoqIFdvdWxkIHRoaXMgbGluZSBiZWdpbiBhIGJsb2NrIG90aGVyIHRoYW4gYSBwYXJhZ3JhcGggY29udGludWF0aW9uPyAqL1xyXG4gIHByaXZhdGUgc3RhcnRzTmV3QmxvY2sobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gKFxyXG4gICAgICBIRUFESU5HLnRlc3QobGluZSkgfHxcclxuICAgICAgRkVOQ0UudGVzdChsaW5lKSB8fFxyXG4gICAgICBSVUxFLnRlc3QobGluZSkgfHxcclxuICAgICAgQkxPQ0tRVU9URS50ZXN0KGxpbmUpIHx8XHJcbiAgICAgIEJVTExFVF9JVEVNLnRlc3QobGluZSkgfHxcclxuICAgICAgT1JERVJFRF9JVEVNLnRlc3QobGluZSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY29kZUJsb2NrKHRleHQ6IHN0cmluZywgbGFuZ3VhZ2U6IHN0cmluZyB8IG51bGwpOiBFZGl0b3JOb2RlIHtcclxuICAgIHJldHVybiB0aGlzLnNjaGVtYVxyXG4gICAgICAubm9kZVR5cGUoJ2NvZGVCbG9jaycpXHJcbiAgICAgIC5jcmVhdGUoeyBsYW5ndWFnZSB9LCB0ZXh0Lmxlbmd0aCA+IDAgPyBGcmFnbWVudC5vZih0aGlzLnNjaGVtYS50ZXh0KHRleHQpKSA6IEZyYWdtZW50LmVtcHR5KVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwYXJhZ3JhcGgodGV4dDogc3RyaW5nKTogRWRpdG9yTm9kZSB7XHJcbiAgICByZXR1cm4gdGhpcy5zY2hlbWEubm9kZVR5cGUoJ3BhcmFncmFwaCcpLmNyZWF0ZSh1bmRlZmluZWQsIHRoaXMuaW5saW5lKHRleHQpKVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU2V2ZXJhbCBzb3VyY2UgbGluZXMgZm9ybWluZyBvbmUgcGFyYWdyYXBoLiBBIGxpbmUgZW5kaW5nIGluIHR3byBzcGFjZXNcclxuICAgKiBpcyBhIGhhcmQgYnJlYWs7IG90aGVyd2lzZSB0aGUgbGluZXMgam9pbiB3aXRoIGEgc3BhY2UsIGFzIG1hcmtkb3duIHNheXMuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBwYXJhZ3JhcGhMaW5lcyhsaW5lczogcmVhZG9ubHkgc3RyaW5nW10pOiBFZGl0b3JOb2RlIHtcclxuICAgIGxldCB0ZXh0ID0gJydcclxuICAgIGxpbmVzLmZvckVhY2goKGxpbmUsIGluZGV4KSA9PiB7XHJcbiAgICAgIGNvbnN0IGlzTGFzdCA9IGluZGV4ID09PSBsaW5lcy5sZW5ndGggLSAxXHJcbiAgICAgIGlmICgvIHsyLH0kLy50ZXN0KGxpbmUpICYmICFpc0xhc3QpIHRleHQgKz0gYCR7bGluZS50cmltRW5kKCl9XFxuYFxyXG4gICAgICBlbHNlIHRleHQgKz0gaXNMYXN0ID8gbGluZS50cmltKCkgOiBgJHtsaW5lLnRyaW0oKX0gYFxyXG4gICAgfSlcclxuICAgIHJldHVybiB0aGlzLnNjaGVtYS5ub2RlVHlwZSgncGFyYWdyYXBoJykuY3JlYXRlKHVuZGVmaW5lZCwgdGhpcy5pbmxpbmUodGV4dCkpXHJcbiAgfVxyXG5cclxuICAvKiogQSBydW4gb2YgbGlzdCBpdGVtcyBhdCB0aGUgc2FtZSBpbmRlbnQsIHdpdGggbmVzdGVkIGxpc3RzIGluc2lkZSB0aGVtLiAqL1xyXG4gIHByaXZhdGUgdHJ5TGlzdChcclxuICAgIGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSxcclxuICAgIHN0YXJ0OiBudW1iZXIsXHJcbiAgKTogeyBub2RlOiBFZGl0b3JOb2RlOyBuZXh0OiBudW1iZXIgfSB8IG51bGwge1xyXG4gICAgY29uc3QgZmlyc3QgPSBsaW5lc1tzdGFydF0gYXMgc3RyaW5nXHJcbiAgICBjb25zdCBidWxsZXQgPSBCVUxMRVRfSVRFTS5leGVjKGZpcnN0KVxyXG4gICAgY29uc3Qgb3JkZXJlZCA9IGJ1bGxldCA/IG51bGwgOiBPUkRFUkVEX0lURU0uZXhlYyhmaXJzdClcclxuICAgIGlmICghYnVsbGV0ICYmICFvcmRlcmVkKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIC8vIEEgYnVsbGV0IGxpc3Qgd2hvc2UgZmlyc3QgaXRlbSBjYXJyaWVzIGEgY2hlY2tib3ggaXMgYSB0YXNrIGxpc3QsIHdoZW5cclxuICAgIC8vIHRoZSBzY2hlbWEgaGFzIHRob3NlIG5vZGVzIC0tIHRoYXQgaXMgaG93IEdGTSB3cml0ZXMgb25lLlxyXG4gICAgY29uc3QgaXNUYXNrID1cclxuICAgICAgQm9vbGVhbihidWxsZXQpICYmXHJcbiAgICAgIFRBU0sudGVzdCgoYnVsbGV0IGFzIFJlZ0V4cEV4ZWNBcnJheSlbNF0gYXMgc3RyaW5nKSAmJlxyXG4gICAgICB0aGlzLmhhcygndGFza0xpc3QnKSAmJlxyXG4gICAgICB0aGlzLmhhcygndGFza0l0ZW0nKVxyXG4gICAgY29uc3QgbGlzdE5hbWUgPSBpc1Rhc2sgPyAndGFza0xpc3QnIDogYnVsbGV0ID8gJ2J1bGxldExpc3QnIDogJ29yZGVyZWRMaXN0J1xyXG4gICAgY29uc3QgaXRlbU5hbWUgPSBpc1Rhc2sgPyAndGFza0l0ZW0nIDogJ2xpc3RJdGVtJ1xyXG4gICAgaWYgKCF0aGlzLmhhcyhsaXN0TmFtZSkgfHwgIXRoaXMuaGFzKGl0ZW1OYW1lKSkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IGJhc2VJbmRlbnQgPSAoKGJ1bGxldCA/PyBvcmRlcmVkKSBhcyBSZWdFeHBFeGVjQXJyYXkpWzFdPy5sZW5ndGggPz8gMFxyXG4gICAgY29uc3Qgc3RhcnROdW1iZXIgPSBvcmRlcmVkID8gTnVtYmVyLnBhcnNlSW50KG9yZGVyZWRbMl0gYXMgc3RyaW5nLCAxMCkgOiBudWxsXHJcblxyXG4gICAgY29uc3QgaXRlbXM6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgICBsZXQgaW5kZXggPSBzdGFydFxyXG5cclxuICAgIHdoaWxlIChpbmRleCA8IGxpbmVzLmxlbmd0aCkge1xyXG4gICAgICBjb25zdCBsaW5lID0gbGluZXNbaW5kZXhdIGFzIHN0cmluZ1xyXG4gICAgICBpZiAobGluZS50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgLy8gQSBibGFuayBsaW5lIGVuZHMgdGhlIGxpc3QgdW5sZXNzIHRoZSBuZXh0IGxpbmUgY29udGludWVzIGFuIGl0ZW0uXHJcbiAgICAgICAgY29uc3QgZm9sbG93aW5nID0gbGluZXNbaW5kZXggKyAxXVxyXG4gICAgICAgIGlmIChmb2xsb3dpbmcgPT09IHVuZGVmaW5lZCB8fCBmb2xsb3dpbmcudHJpbSgpID09PSAnJykgYnJlYWtcclxuICAgICAgICBjb25zdCBuZXh0SW5kZW50ID0gZm9sbG93aW5nLmxlbmd0aCAtIGZvbGxvd2luZy50cmltU3RhcnQoKS5sZW5ndGhcclxuICAgICAgICBjb25zdCBuZXh0SXRlbSA9IEJVTExFVF9JVEVNLmV4ZWMoZm9sbG93aW5nKSA/PyBPUkRFUkVEX0lURU0uZXhlYyhmb2xsb3dpbmcpXHJcbiAgICAgICAgaWYgKCFuZXh0SXRlbSAmJiBuZXh0SW5kZW50IDw9IGJhc2VJbmRlbnQpIGJyZWFrXHJcbiAgICAgICAgaWYgKG5leHRJdGVtICYmIChuZXh0SXRlbVsxXT8ubGVuZ3RoID8/IDApIDwgYmFzZUluZGVudCkgYnJlYWtcclxuICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgbWF0Y2ggPSBCVUxMRVRfSVRFTS5leGVjKGxpbmUpID8/IE9SREVSRURfSVRFTS5leGVjKGxpbmUpXHJcbiAgICAgIGlmICghbWF0Y2gpIGJyZWFrXHJcbiAgICAgIGNvbnN0IGluZGVudCA9IG1hdGNoWzFdPy5sZW5ndGggPz8gMFxyXG4gICAgICBpZiAoaW5kZW50IDwgYmFzZUluZGVudCkgYnJlYWtcclxuICAgICAgLy8gQSBtb3JlLWluZGVudGVkIG1hcmtlciBiZWxvbmdzIHRvIHRoZSBwcmV2aW91cyBpdGVtLCBoYW5kbGVkIGJlbG93LlxyXG4gICAgICBpZiAoaW5kZW50ID4gYmFzZUluZGVudCkgYnJlYWtcclxuICAgICAgLy8gQSBkaWZmZXJlbnQgbGlzdCBraW5kIGF0IHRoZSBzYW1lIGxldmVsIHN0YXJ0cyBhIG5ldyBsaXN0LlxyXG4gICAgICBjb25zdCBpc0J1bGxldCA9IEJVTExFVF9JVEVNLnRlc3QobGluZSlcclxuICAgICAgaWYgKGlzQnVsbGV0ICE9PSBCb29sZWFuKGJ1bGxldCkpIGJyZWFrXHJcblxyXG4gICAgICAvLyBFdmVyeXRoaW5nIGluZGVudGVkIHBhc3QgdGhlIG1hcmtlciBpcyB0aGlzIGl0ZW0ncyBjb250ZW50LlxyXG4gICAgICBjb25zdCBtYXJrZXJXaWR0aCA9XHJcbiAgICAgICAgKG1hdGNoWzFdPy5sZW5ndGggPz8gMCkgKyAobWF0Y2hbMl0/Lmxlbmd0aCA/PyAwKSArIChtYXRjaFszXT8ubGVuZ3RoID8/IDApXHJcbiAgICAgIGNvbnN0IGl0ZW1MaW5lczogc3RyaW5nW10gPSBbbWF0Y2hbNF0gYXMgc3RyaW5nXVxyXG4gICAgICBpbmRleCArPSAxXHJcbiAgICAgIHdoaWxlIChpbmRleCA8IGxpbmVzLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGxpbmVzW2luZGV4XSBhcyBzdHJpbmdcclxuICAgICAgICBpZiAoY2FuZGlkYXRlLnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgICAgIGNvbnN0IGZvbGxvd2luZyA9IGxpbmVzW2luZGV4ICsgMV1cclxuICAgICAgICAgIGlmIChmb2xsb3dpbmcgPT09IHVuZGVmaW5lZCB8fCBmb2xsb3dpbmcudHJpbSgpID09PSAnJykgYnJlYWtcclxuICAgICAgICAgIGNvbnN0IG5leHRJbmRlbnQgPSBmb2xsb3dpbmcubGVuZ3RoIC0gZm9sbG93aW5nLnRyaW1TdGFydCgpLmxlbmd0aFxyXG4gICAgICAgICAgaWYgKG5leHRJbmRlbnQgPCBtYXJrZXJXaWR0aCkgYnJlYWtcclxuICAgICAgICAgIGl0ZW1MaW5lcy5wdXNoKCcnKVxyXG4gICAgICAgICAgaW5kZXggKz0gMVxyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlSW5kZW50ID0gY2FuZGlkYXRlLmxlbmd0aCAtIGNhbmRpZGF0ZS50cmltU3RhcnQoKS5sZW5ndGhcclxuICAgICAgICBpZiAoY2FuZGlkYXRlSW5kZW50IDwgbWFya2VyV2lkdGgpIGJyZWFrXHJcbiAgICAgICAgaXRlbUxpbmVzLnB1c2goY2FuZGlkYXRlLnNsaWNlKG1hcmtlcldpZHRoKSlcclxuICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGl0ZW1zLnB1c2godGhpcy5saXN0SXRlbShpdGVtTGluZXMsIGl0ZW1OYW1lKSlcclxuICAgIH1cclxuXHJcbiAgICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYXR0cnMgPSBzdGFydE51bWJlciAhPT0gbnVsbCA/IHsgc3RhcnQ6IHN0YXJ0TnVtYmVyIH0gOiB1bmRlZmluZWRcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG5vZGU6IHRoaXMuc2NoZW1hLm5vZGVUeXBlKGxpc3ROYW1lKS5jcmVhdGUoYXR0cnMsIEZyYWdtZW50LmZyb20oaXRlbXMpKSxcclxuICAgICAgbmV4dDogaW5kZXgsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKiogT25lIGl0ZW0ncyBsaW5lcywgaW5jbHVkaW5nIGEgbGVhZGluZyB0YXNrIG1hcmtlciBhbmQgbmVzdGVkIGJsb2Nrcy4gKi9cclxuICBwcml2YXRlIGxpc3RJdGVtKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSwgaXRlbU5hbWU6IHN0cmluZyk6IEVkaXRvck5vZGUge1xyXG4gICAgY29uc3QgZmlyc3QgPSBsaW5lc1swXSA/PyAnJ1xyXG4gICAgY29uc3QgdGFzayA9IFRBU0suZXhlYyhmaXJzdClcclxuICAgIGNvbnN0IGl0ZW1UeXBlID0gdGhpcy5zY2hlbWEubm9kZVR5cGUoaXRlbU5hbWUpXHJcbiAgICBjb25zdCBzdXBwb3J0c0NoZWNrZWQgPSBPYmplY3QuaGFzT3duKGl0ZW1UeXBlLnNwZWMuYXR0cnMgPz8ge30sICdjaGVja2VkJylcclxuXHJcbiAgICBpZiAodGFzayAmJiBzdXBwb3J0c0NoZWNrZWQpIHtcclxuICAgICAgY29uc3QgYmxvY2tzID0gdGhpcy5wYXJzZUJsb2NrcyhbdGFza1syXSBhcyBzdHJpbmcsIC4uLmxpbmVzLnNsaWNlKDEpXSlcclxuICAgICAgY29uc3QgY2hlY2tlZCA9ICh0YXNrWzFdIGFzIHN0cmluZykudG9Mb3dlckNhc2UoKSA9PT0gJ3gnXHJcbiAgICAgIHJldHVybiBpdGVtVHlwZS5jcmVhdGUoXHJcbiAgICAgICAgeyBjaGVja2VkIH0sXHJcbiAgICAgICAgRnJhZ21lbnQuZnJvbShibG9ja3MubGVuZ3RoID4gMCA/IGJsb2NrcyA6IFt0aGlzLnBhcmFncmFwaCgnJyldKSxcclxuICAgICAgKVxyXG4gICAgfVxyXG4gICAgLy8gQSBjaGVja2JveCB0aGlzIHNjaGVtYSBjYW5ub3QgbW9kZWwgc3RheXMgbGl0ZXJhbCB0ZXh0LCByYXRoZXIgdGhhblxyXG4gICAgLy8gYmVpbmcgZHJvcHBlZDogdGhlIGVzY2FwZWQgZm9ybSByb3VuZC10cmlwcyBhcyB3aGF0IHRoZSB1c2VyIHdyb3RlLlxyXG4gICAgY29uc3QgYmxvY2tzID0gdGhpcy5wYXJzZUJsb2NrcyhbLi4ubGluZXNdKVxyXG4gICAgcmV0dXJuIGl0ZW1UeXBlLmNyZWF0ZShcclxuICAgICAgdW5kZWZpbmVkLFxyXG4gICAgICBGcmFnbWVudC5mcm9tKGJsb2Nrcy5sZW5ndGggPiAwID8gYmxvY2tzIDogW3RoaXMucGFyYWdyYXBoKCcnKV0pLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgLyoqIEEgR0ZNIHBpcGUgdGFibGU6IGEgaGVhZGVyIHJvdywgYSBkZWxpbWl0ZXIgcm93LCB0aGVuIGJvZHkgcm93cy4gKi9cclxuICBwcml2YXRlIHRyeVRhYmxlKFxyXG4gICAgbGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdLFxyXG4gICAgc3RhcnQ6IG51bWJlcixcclxuICApOiB7IG5vZGU6IEVkaXRvck5vZGU7IG5leHQ6IG51bWJlciB9IHwgbnVsbCB7XHJcbiAgICBpZiAoIXRoaXMuaGFzKHRoaXMubmFtZXMudGFibGUpIHx8ICF0aGlzLmhhcyh0aGlzLm5hbWVzLnJvdykgfHwgIXRoaXMuaGFzKHRoaXMubmFtZXMuY2VsbCkpIHtcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuICAgIGNvbnN0IGhlYWRlciA9IGxpbmVzW3N0YXJ0XSBhcyBzdHJpbmdcclxuICAgIGNvbnN0IGRlbGltaXRlciA9IGxpbmVzW3N0YXJ0ICsgMV1cclxuICAgIGlmICghaGVhZGVyLmluY2x1ZGVzKCd8JykgfHwgZGVsaW1pdGVyID09PSB1bmRlZmluZWQpIHJldHVybiBudWxsXHJcbiAgICBpZiAoIVRBQkxFX0RFTElNSVRFUi50ZXN0KGRlbGltaXRlcikpIHJldHVybiBudWxsXHJcblxyXG4gICAgY29uc3QgYWxpZ25zID0gc3BsaXRSb3coZGVsaW1pdGVyKS5tYXAoKHNwZWMpID0+IHtcclxuICAgICAgY29uc3QgdHJpbW1lZCA9IHNwZWMudHJpbSgpXHJcbiAgICAgIGNvbnN0IGxlZnQgPSB0cmltbWVkLnN0YXJ0c1dpdGgoJzonKVxyXG4gICAgICBjb25zdCByaWdodCA9IHRyaW1tZWQuZW5kc1dpdGgoJzonKVxyXG4gICAgICBpZiAobGVmdCAmJiByaWdodCkgcmV0dXJuICdjZW50ZXInXHJcbiAgICAgIGlmIChsZWZ0KSByZXR1cm4gJ2xlZnQnXHJcbiAgICAgIGlmIChyaWdodCkgcmV0dXJuICdyaWdodCdcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH0pXHJcblxyXG4gICAgY29uc3Qgcm93TGluZXM6IHN0cmluZ1tdID0gW2hlYWRlcl1cclxuICAgIGxldCBpbmRleCA9IHN0YXJ0ICsgMlxyXG4gICAgd2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoKSB7XHJcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGxpbmVzW2luZGV4XSBhcyBzdHJpbmdcclxuICAgICAgaWYgKGNhbmRpZGF0ZS50cmltKCkgPT09ICcnIHx8ICFjYW5kaWRhdGUuaW5jbHVkZXMoJ3wnKSkgYnJlYWtcclxuICAgICAgcm93TGluZXMucHVzaChjYW5kaWRhdGUpXHJcbiAgICAgIGluZGV4ICs9IDFcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb3dzID0gcm93TGluZXMubWFwKChsaW5lLCByb3dJbmRleCkgPT4ge1xyXG4gICAgICBjb25zdCBjZWxscyA9IHNwbGl0Um93KGxpbmUpLm1hcCgoY2VsbFNvdXJjZSwgY29sdW1uSW5kZXgpID0+XHJcbiAgICAgICAgdGhpcy5zY2hlbWFcclxuICAgICAgICAgIC5ub2RlVHlwZSh0aGlzLm5hbWVzLmNlbGwpXHJcbiAgICAgICAgICAuY3JlYXRlKFxyXG4gICAgICAgICAgICB7IGhlYWRlcjogcm93SW5kZXggPT09IDAsIGFsaWduOiBhbGlnbnNbY29sdW1uSW5kZXhdID8/IG51bGwgfSxcclxuICAgICAgICAgICAgRnJhZ21lbnQub2YodGhpcy5wYXJhZ3JhcGgoY2VsbFNvdXJjZS50cmltKCkucmVwbGFjZUFsbCgnXFxcXHwnLCAnfCcpKSksXHJcbiAgICAgICAgICApLFxyXG4gICAgICApXHJcbiAgICAgIHJldHVybiB0aGlzLnNjaGVtYS5ub2RlVHlwZSh0aGlzLm5hbWVzLnJvdykuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQuZnJvbShjZWxscykpXHJcbiAgICB9KVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIG5vZGU6IHRoaXMuc2NoZW1hLm5vZGVUeXBlKHRoaXMubmFtZXMudGFibGUpLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50LmZyb20ocm93cykpLFxyXG4gICAgICBuZXh0OiBpbmRleCxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKiBTY2FuIG9uZSBibG9jaydzIHRleHQgZm9yIGlubGluZSBtYXJrdXAsIHByb2R1Y2luZyBhbiBpbmxpbmUgRnJhZ21lbnQuICovXHJcbiAgcHJpdmF0ZSBpbmxpbmUoc291cmNlOiBzdHJpbmcpOiBGcmFnbWVudCB7XHJcbiAgICBjb25zdCBub2RlcyA9IG5ldyBJbmxpbmVQYXJzZXIodGhpcy5zY2hlbWEsIHNvdXJjZSkucGFyc2UoKVxyXG4gICAgcmV0dXJuIG1lcmdlSW5saW5lKEZyYWdtZW50LmZyb20obm9kZXMpKVxyXG4gIH1cclxufVxyXG5cclxuLyoqIFNwbGl0IGEgcGlwZS10YWJsZSByb3cgaW50byBpdHMgY2VsbHMsIGhvbm91cmluZyBgXFx8YCBlc2NhcGVzLiAqL1xyXG5mdW5jdGlvbiBzcGxpdFJvdyhsaW5lOiBzdHJpbmcpOiBzdHJpbmdbXSB7XHJcbiAgY29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpLnJlcGxhY2UoL15cXHwvLCAnJykucmVwbGFjZSgvXFx8JC8sICcnKVxyXG4gIGNvbnN0IGNlbGxzOiBzdHJpbmdbXSA9IFtdXHJcbiAgbGV0IGN1cnJlbnQgPSAnJ1xyXG4gIGxldCBlc2NhcGVkID0gZmFsc2VcclxuICBmb3IgKGNvbnN0IGNoYXIgb2YgdHJpbW1lZCkge1xyXG4gICAgaWYgKGVzY2FwZWQpIHtcclxuICAgICAgLy8gS2VlcCB0aGUgZXNjYXBlOiB0aGUgY2FsbGVyIHVuZXNjYXBlcyBhZnRlciB0cmltbWluZy5cclxuICAgICAgY3VycmVudCArPSBjaGFyID09PSAnfCcgPyAnXFxcXHwnIDogYFxcXFwke2NoYXJ9YFxyXG4gICAgICBlc2NhcGVkID0gZmFsc2VcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGlmIChjaGFyID09PSAnXFxcXCcpIHtcclxuICAgICAgZXNjYXBlZCA9IHRydWVcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGlmIChjaGFyID09PSAnfCcpIHtcclxuICAgICAgY2VsbHMucHVzaChjdXJyZW50KVxyXG4gICAgICBjdXJyZW50ID0gJydcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGN1cnJlbnQgKz0gY2hhclxyXG4gIH1cclxuICBjZWxscy5wdXNoKGN1cnJlbnQpXHJcbiAgcmV0dXJuIGNlbGxzXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzRmVuY2VDbG9zZShsaW5lOiBzdHJpbmcsIG1hcmtlcjogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgY29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpXHJcbiAgY29uc3QgY2hhciA9IG1hcmtlclswXSBhcyBzdHJpbmdcclxuICByZXR1cm4gdHJpbW1lZC5sZW5ndGggPj0gbWFya2VyLmxlbmd0aCAmJiB0cmltbWVkID09PSBjaGFyLnJlcGVhdCh0cmltbWVkLmxlbmd0aClcclxufVxyXG5cclxuLyoqXHJcbiAqIElubGluZSBzY2FubmVyLiBXYWxrcyB0aGUgdGV4dCBvbmNlLCByZWNvZ25pemluZyBjb2RlIHNwYW5zIGZpcnN0IChub3RoaW5nXHJcbiAqIGluc2lkZSB0aGVtIGlzIG1hcmt1cCksIHRoZW4gaW1hZ2VzLCBsaW5rcywgYW5kIHRoZSBlbXBoYXNpcyBkZWxpbWl0ZXJzLlxyXG4gKi9cclxuY2xhc3MgSW5saW5lUGFyc2VyIHtcclxuICBwcml2YXRlIGluZGV4ID0gMFxyXG4gIHByaXZhdGUgcmVhZG9ubHkgb3V0OiBFZGl0b3JOb2RlW10gPSBbXVxyXG4gIHByaXZhdGUgYnVmZmVyID0gJydcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNjaGVtYTogU2NoZW1hLFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBzb3VyY2U6IHN0cmluZyxcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgbWFya3M6IHJlYWRvbmx5IE1hcmtbXSA9IFtdLFxyXG4gICkge31cclxuXHJcbiAgcGFyc2UoKTogRWRpdG9yTm9kZVtdIHtcclxuICAgIHdoaWxlICh0aGlzLmluZGV4IDwgdGhpcy5zb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgIGNvbnN0IGNoYXIgPSB0aGlzLnNvdXJjZVt0aGlzLmluZGV4XSBhcyBzdHJpbmdcclxuXHJcbiAgICAgIGlmIChjaGFyID09PSAnXFxcXCcpIHtcclxuICAgICAgICAvLyBBIGJhY2tzbGFzaCBlc2NhcGUgY29udHJpYnV0ZXMgdGhlIG5leHQgY2hhcmFjdGVyIGxpdGVyYWxseS5cclxuICAgICAgICBjb25zdCBuZXh0ID0gdGhpcy5zb3VyY2VbdGhpcy5pbmRleCArIDFdXHJcbiAgICAgICAgaWYgKG5leHQgIT09IHVuZGVmaW5lZCAmJiAvW1xcXFxgKl9bXFxdPD4mfnwkIysuKCkhLV0vLnRlc3QobmV4dCkpIHtcclxuICAgICAgICAgIHRoaXMuYnVmZmVyICs9IG5leHRcclxuICAgICAgICAgIHRoaXMuaW5kZXggKz0gMlxyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5idWZmZXIgKz0gY2hhclxyXG4gICAgICAgIHRoaXMuaW5kZXggKz0gMVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChjaGFyID09PSAnXFxuJykge1xyXG4gICAgICAgIHRoaXMuZmx1c2goKVxyXG4gICAgICAgIGlmICh0aGlzLmhhcygnaGFyZEJyZWFrJykpIHRoaXMub3V0LnB1c2godGhpcy5zY2hlbWEubm9kZVR5cGUoJ2hhcmRCcmVhaycpLmNyZWF0ZSgpKVxyXG4gICAgICAgIHRoaXMuaW5kZXggKz0gMVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChjaGFyID09PSAnYCcgJiYgdGhpcy50cnlDb2RlKCkpIGNvbnRpbnVlXHJcbiAgICAgIGlmIChjaGFyID09PSAnIScgJiYgdGhpcy50cnlJbWFnZSgpKSBjb250aW51ZVxyXG4gICAgICBpZiAoY2hhciA9PT0gJ1snICYmIHRoaXMudHJ5TGluaygpKSBjb250aW51ZVxyXG4gICAgICBpZiAoKGNoYXIgPT09ICcqJyB8fCBjaGFyID09PSAnXycgfHwgY2hhciA9PT0gJ34nKSAmJiB0aGlzLnRyeUVtcGhhc2lzKCkpIGNvbnRpbnVlXHJcblxyXG4gICAgICB0aGlzLmJ1ZmZlciArPSBjaGFyXHJcbiAgICAgIHRoaXMuaW5kZXggKz0gMVxyXG4gICAgfVxyXG4gICAgdGhpcy5mbHVzaCgpXHJcbiAgICByZXR1cm4gdGhpcy5vdXRcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFzKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIE9iamVjdC5oYXNPd24odGhpcy5zY2hlbWEubm9kZXMsIG5hbWUpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhc01hcmsobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gT2JqZWN0Lmhhc093bih0aGlzLnNjaGVtYS5tYXJrcywgbmFtZSlcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZmx1c2goKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5idWZmZXIubGVuZ3RoID09PSAwKSByZXR1cm5cclxuICAgIHRoaXMub3V0LnB1c2godGhpcy5zY2hlbWEudGV4dCh0aGlzLmJ1ZmZlciwgdGhpcy5tYXJrcykpXHJcbiAgICB0aGlzLmJ1ZmZlciA9ICcnXHJcbiAgfVxyXG5cclxuICAvKiogQSBjb2RlIHNwYW46IHRoZSBtYXRjaGluZyBydW4gb2YgYmFja3RpY2tzIGNsb3NlcyBpdC4gKi9cclxuICBwcml2YXRlIHRyeUNvZGUoKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBmZW5jZSA9IC9eYCsvLmV4ZWModGhpcy5zb3VyY2Uuc2xpY2UodGhpcy5pbmRleCkpPy5bMF0gYXMgc3RyaW5nXHJcbiAgICBjb25zdCBjbG9zZSA9IHRoaXMuc291cmNlLmluZGV4T2YoZmVuY2UsIHRoaXMuaW5kZXggKyBmZW5jZS5sZW5ndGgpXHJcbiAgICBpZiAoY2xvc2UgPT09IC0xKSByZXR1cm4gZmFsc2VcclxuICAgIC8vIFJlamVjdCBhIGxvbmdlciBydW4gYXMgdGhlIGNsb3NlciwgcGVyIENvbW1vbk1hcmsuXHJcbiAgICBpZiAodGhpcy5zb3VyY2VbY2xvc2UgKyBmZW5jZS5sZW5ndGhdID09PSAnYCcpIHJldHVybiBmYWxzZVxyXG4gICAgbGV0IHRleHQgPSB0aGlzLnNvdXJjZS5zbGljZSh0aGlzLmluZGV4ICsgZmVuY2UubGVuZ3RoLCBjbG9zZSlcclxuICAgIC8vIEEgc2luZ2xlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNwYWNlIGlzIHN0cmlwcGVkIHdoZW4gYm90aCBhcmUgcHJlc2VudC5cclxuICAgIGlmICh0ZXh0LnN0YXJ0c1dpdGgoJyAnKSAmJiB0ZXh0LmVuZHNXaXRoKCcgJykgJiYgdGV4dC50cmltKCkubGVuZ3RoID4gMCkge1xyXG4gICAgICB0ZXh0ID0gdGV4dC5zbGljZSgxLCAtMSlcclxuICAgIH1cclxuICAgIHRoaXMuZmx1c2goKVxyXG4gICAgaWYgKHRleHQubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zdCBtYXJrcyA9IHRoaXMuaGFzTWFyaygnY29kZScpXHJcbiAgICAgICAgPyB0aGlzLnNjaGVtYS5tYXJrKCdjb2RlJykuYWRkVG9TZXQodGhpcy5tYXJrcylcclxuICAgICAgICA6IHRoaXMubWFya3NcclxuICAgICAgdGhpcy5vdXQucHVzaCh0aGlzLnNjaGVtYS50ZXh0KHRleHQsIG1hcmtzKSlcclxuICAgIH1cclxuICAgIHRoaXMuaW5kZXggPSBjbG9zZSArIGZlbmNlLmxlbmd0aFxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcblxyXG4gIHByaXZhdGUgdHJ5SW1hZ2UoKTogYm9vbGVhbiB7XHJcbiAgICBpZiAodGhpcy5zb3VyY2VbdGhpcy5pbmRleCArIDFdICE9PSAnWycpIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VCcmFja2V0TGluayh0aGlzLnNvdXJjZSwgdGhpcy5pbmRleCArIDEpXHJcbiAgICBpZiAoIXBhcnNlZCkgcmV0dXJuIGZhbHNlXHJcbiAgICBpZiAoIXRoaXMuaGFzKCdpbWFnZScpKSByZXR1cm4gZmFsc2VcclxuICAgIGNvbnN0IHNyYyA9IHNhZmVJbWFnZVNyYyhwYXJzZWQuZGVzdGluYXRpb24pXHJcbiAgICBpZiAoIXNyYykge1xyXG4gICAgICAvLyBVbnNhZmUgc291cmNlOiBrZWVwIHRoZSBhbHQgdGV4dCBzbyBub3RoaW5nIHRoZSB1c2VyIHdyb3RlIGlzIGxvc3QuXHJcbiAgICAgIHRoaXMuYnVmZmVyICs9IHBhcnNlZC50ZXh0XHJcbiAgICAgIHRoaXMuaW5kZXggPSBwYXJzZWQubmV4dFxyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG4gICAgdGhpcy5mbHVzaCgpXHJcbiAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IHNyYywgYWx0OiBwYXJzZWQudGV4dCB9XHJcbiAgICBpZiAocGFyc2VkLnRpdGxlKSBhdHRycy50aXRsZSA9IHBhcnNlZC50aXRsZVxyXG4gICAgdGhpcy5vdXQucHVzaCh0aGlzLnNjaGVtYS5ub2RlVHlwZSgnaW1hZ2UnKS5jcmVhdGUoYXR0cnMpKVxyXG4gICAgdGhpcy5pbmRleCA9IHBhcnNlZC5uZXh0XHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB0cnlMaW5rKCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VCcmFja2V0TGluayh0aGlzLnNvdXJjZSwgdGhpcy5pbmRleClcclxuICAgIGlmICghcGFyc2VkKSByZXR1cm4gZmFsc2VcclxuICAgIC8vIFRoZSBzYW1lIHNhbml0aXplciB0aGUgc2NoZW1hIGFuZCBIVE1MIHBhcnNlciB1c2U6IGEgYGphdmFzY3JpcHQ6YCBVUkxcclxuICAgIC8vIHlpZWxkcyBubyBtYXJrLCBhbmQgdGhlIGxpbmsgdGV4dCBzdXJ2aXZlcyBhcyBwbGFpbiB0ZXh0LlxyXG4gICAgY29uc3QgaHJlZiA9IHNhZmVIcmVmKHBhcnNlZC5kZXN0aW5hdGlvbilcclxuICAgIGNvbnN0IG1hcmtzID1cclxuICAgICAgaHJlZiAmJiB0aGlzLmhhc01hcmsoJ2xpbmsnKVxyXG4gICAgICAgID8gdGhpcy5zY2hlbWFcclxuICAgICAgICAgICAgLm1hcmsoJ2xpbmsnLCBwYXJzZWQudGl0bGUgPyB7IGhyZWYsIHRpdGxlOiBwYXJzZWQudGl0bGUgfSA6IHsgaHJlZiB9KVxyXG4gICAgICAgICAgICAuYWRkVG9TZXQodGhpcy5tYXJrcylcclxuICAgICAgICA6IHRoaXMubWFya3NcclxuICAgIHRoaXMuZmx1c2goKVxyXG4gICAgY29uc3QgaW5uZXIgPSBuZXcgSW5saW5lUGFyc2VyKHRoaXMuc2NoZW1hLCBwYXJzZWQudGV4dCwgbWFya3MpLnBhcnNlKClcclxuICAgIHRoaXMub3V0LnB1c2goLi4uaW5uZXIpXHJcbiAgICB0aGlzLmluZGV4ID0gcGFyc2VkLm5leHRcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICAvKiogYCoqYm9sZCoqYCwgYCppdGFsaWMqYCwgYF9pdGFsaWNfYCwgYH5+c3RyaWtlfn5gLiAqL1xyXG4gIHByaXZhdGUgdHJ5RW1waGFzaXMoKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBjaGFyID0gdGhpcy5zb3VyY2VbdGhpcy5pbmRleF0gYXMgc3RyaW5nXHJcbiAgICBjb25zdCBydW4gPSAvXihcXCorfF8rfH4rKS8uZXhlYyh0aGlzLnNvdXJjZS5zbGljZSh0aGlzLmluZGV4KSk/LlswXSBhcyBzdHJpbmdcclxuICAgIGNvbnN0IGlzU3Ryb25nID0gY2hhciAhPT0gJ34nICYmIHJ1bi5sZW5ndGggPj0gMlxyXG4gICAgY29uc3QgZGVsaW1pdGVyID0gY2hhciA9PT0gJ34nID8gJ35+JyA6IGlzU3Ryb25nID8gYCR7Y2hhcn0ke2NoYXJ9YCA6IGNoYXJcclxuICAgIGlmIChjaGFyID09PSAnficgJiYgcnVuLmxlbmd0aCA8IDIpIHJldHVybiBmYWxzZVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnRTdGFydCA9IHRoaXMuaW5kZXggKyBkZWxpbWl0ZXIubGVuZ3RoXHJcbiAgICBjb25zdCBjbG9zZSA9IGZpbmRDbG9zaW5nKHRoaXMuc291cmNlLCBjb250ZW50U3RhcnQsIGRlbGltaXRlcilcclxuICAgIGlmIChjbG9zZSA9PT0gLTEpIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3QgaW5uZXIgPSB0aGlzLnNvdXJjZS5zbGljZShjb250ZW50U3RhcnQsIGNsb3NlKVxyXG4gICAgaWYgKGlubmVyLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgY29uc3QgbWFya05hbWUgPSBjaGFyID09PSAnficgPyAnc3RyaWtldGhyb3VnaCcgOiBpc1N0cm9uZyA/ICdib2xkJyA6ICdpdGFsaWMnXHJcbiAgICBjb25zdCBtYXJrcyA9IHRoaXMuaGFzTWFyayhtYXJrTmFtZSlcclxuICAgICAgPyB0aGlzLnNjaGVtYS5tYXJrKG1hcmtOYW1lKS5hZGRUb1NldCh0aGlzLm1hcmtzKVxyXG4gICAgICA6IHRoaXMubWFya3NcclxuICAgIHRoaXMuZmx1c2goKVxyXG4gICAgdGhpcy5vdXQucHVzaCguLi5uZXcgSW5saW5lUGFyc2VyKHRoaXMuc2NoZW1hLCBpbm5lciwgbWFya3MpLnBhcnNlKCkpXHJcbiAgICB0aGlzLmluZGV4ID0gY2xvc2UgKyBkZWxpbWl0ZXIubGVuZ3RoXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxufVxyXG5cclxuLyoqIFRoZSBjbG9zaW5nIGRlbGltaXRlciBmb3IgYW4gZW1waGFzaXMgcnVuLCBza2lwcGluZyBlc2NhcGVzIGFuZCBjb2RlLiAqL1xyXG5mdW5jdGlvbiBmaW5kQ2xvc2luZyhzb3VyY2U6IHN0cmluZywgZnJvbTogbnVtYmVyLCBkZWxpbWl0ZXI6IHN0cmluZyk6IG51bWJlciB7XHJcbiAgbGV0IGluZGV4ID0gZnJvbVxyXG4gIHdoaWxlIChpbmRleCA8IHNvdXJjZS5sZW5ndGgpIHtcclxuICAgIGNvbnN0IGNoYXIgPSBzb3VyY2VbaW5kZXhdIGFzIHN0cmluZ1xyXG4gICAgaWYgKGNoYXIgPT09ICdcXFxcJykge1xyXG4gICAgICBpbmRleCArPSAyXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBpZiAoY2hhciA9PT0gJ2AnKSB7XHJcbiAgICAgIGNvbnN0IGZlbmNlID0gL15gKy8uZXhlYyhzb3VyY2Uuc2xpY2UoaW5kZXgpKT8uWzBdIGFzIHN0cmluZ1xyXG4gICAgICBjb25zdCBjbG9zZSA9IHNvdXJjZS5pbmRleE9mKGZlbmNlLCBpbmRleCArIGZlbmNlLmxlbmd0aClcclxuICAgICAgaW5kZXggPSBjbG9zZSA9PT0gLTEgPyBpbmRleCArIGZlbmNlLmxlbmd0aCA6IGNsb3NlICsgZmVuY2UubGVuZ3RoXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBpZiAoc291cmNlLnN0YXJ0c1dpdGgoZGVsaW1pdGVyLCBpbmRleCkpIHtcclxuICAgICAgLy8gYCpgIG11c3Qgbm90IG1hdGNoIHRoZSBmaXJzdCBgKmAgb2YgYSBgKipgIHJ1biB1c2VkIGFzIHN0cm9uZy5cclxuICAgICAgaWYgKGRlbGltaXRlci5sZW5ndGggPT09IDEgJiYgc291cmNlW2luZGV4ICsgMV0gPT09IGRlbGltaXRlcikge1xyXG4gICAgICAgIGluZGV4ICs9IDJcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBpbmRleFxyXG4gICAgfVxyXG4gICAgaW5kZXggKz0gMVxyXG4gIH1cclxuICByZXR1cm4gLTFcclxufVxyXG5cclxuLyoqXHJcbiAqIGBbdGV4dF0oZGVzdGluYXRpb24gXCJ0aXRsZVwiKWAgc3RhcnRpbmcgYXQgYGF0YC4gSGFuZGxlcyBuZXN0ZWQgYnJhY2tldHMgaW5cclxuICogdGhlIHRleHQgYW5kIGFuIGFuZ2xlLWJyYWNrZXRlZCBkZXN0aW5hdGlvbi5cclxuICovXHJcbmZ1bmN0aW9uIHBhcnNlQnJhY2tldExpbmsoXHJcbiAgc291cmNlOiBzdHJpbmcsXHJcbiAgYXQ6IG51bWJlcixcclxuKTogeyB0ZXh0OiBzdHJpbmc7IGRlc3RpbmF0aW9uOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmcgfCBudWxsOyBuZXh0OiBudW1iZXIgfSB8IG51bGwge1xyXG4gIGlmIChzb3VyY2VbYXRdICE9PSAnWycpIHJldHVybiBudWxsXHJcbiAgbGV0IGRlcHRoID0gMFxyXG4gIGxldCBpbmRleCA9IGF0XHJcbiAgbGV0IHRleHRFbmQgPSAtMVxyXG4gIHdoaWxlIChpbmRleCA8IHNvdXJjZS5sZW5ndGgpIHtcclxuICAgIGNvbnN0IGNoYXIgPSBzb3VyY2VbaW5kZXhdIGFzIHN0cmluZ1xyXG4gICAgaWYgKGNoYXIgPT09ICdcXFxcJykge1xyXG4gICAgICBpbmRleCArPSAyXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBpZiAoY2hhciA9PT0gJ1snKSBkZXB0aCArPSAxXHJcbiAgICBlbHNlIGlmIChjaGFyID09PSAnXScpIHtcclxuICAgICAgZGVwdGggLT0gMVxyXG4gICAgICBpZiAoZGVwdGggPT09IDApIHtcclxuICAgICAgICB0ZXh0RW5kID0gaW5kZXhcclxuICAgICAgICBicmVha1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBpbmRleCArPSAxXHJcbiAgfVxyXG4gIGlmICh0ZXh0RW5kID09PSAtMSB8fCBzb3VyY2VbdGV4dEVuZCArIDFdICE9PSAnKCcpIHJldHVybiBudWxsXHJcblxyXG4gIGNvbnN0IHRleHQgPSBzb3VyY2Uuc2xpY2UoYXQgKyAxLCB0ZXh0RW5kKVxyXG4gIGxldCBjdXJzb3IgPSB0ZXh0RW5kICsgMlxyXG4gIGxldCBkZXN0aW5hdGlvbiA9ICcnXHJcblxyXG4gIGlmIChzb3VyY2VbY3Vyc29yXSA9PT0gJzwnKSB7XHJcbiAgICBjb25zdCBjbG9zZSA9IHNvdXJjZS5pbmRleE9mKCc+JywgY3Vyc29yKVxyXG4gICAgaWYgKGNsb3NlID09PSAtMSkgcmV0dXJuIG51bGxcclxuICAgIGRlc3RpbmF0aW9uID0gc291cmNlLnNsaWNlKGN1cnNvciArIDEsIGNsb3NlKVxyXG4gICAgY3Vyc29yID0gY2xvc2UgKyAxXHJcbiAgfSBlbHNlIHtcclxuICAgIGxldCBwYXJlbnMgPSAwXHJcbiAgICB3aGlsZSAoY3Vyc29yIDwgc291cmNlLmxlbmd0aCkge1xyXG4gICAgICBjb25zdCBjaGFyID0gc291cmNlW2N1cnNvcl0gYXMgc3RyaW5nXHJcbiAgICAgIGlmIChjaGFyID09PSAnXFxcXCcpIHtcclxuICAgICAgICBkZXN0aW5hdGlvbiArPSBzb3VyY2VbY3Vyc29yICsgMV0gPz8gJydcclxuICAgICAgICBjdXJzb3IgKz0gMlxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuICAgICAgaWYgKGNoYXIgPT09ICcoJykgcGFyZW5zICs9IDFcclxuICAgICAgZWxzZSBpZiAoY2hhciA9PT0gJyknKSB7XHJcbiAgICAgICAgaWYgKHBhcmVucyA9PT0gMCkgYnJlYWtcclxuICAgICAgICBwYXJlbnMgLT0gMVxyXG4gICAgICB9IGVsc2UgaWYgKC9cXHMvLnRlc3QoY2hhcikpIGJyZWFrXHJcbiAgICAgIGRlc3RpbmF0aW9uICs9IGNoYXJcclxuICAgICAgY3Vyc29yICs9IDFcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIEFuIG9wdGlvbmFsIHF1b3RlZCB0aXRsZSwgdGhlbiB0aGUgY2xvc2luZyBwYXJlbi5cclxuICBsZXQgdGl0bGU6IHN0cmluZyB8IG51bGwgPSBudWxsXHJcbiAgd2hpbGUgKGN1cnNvciA8IHNvdXJjZS5sZW5ndGggJiYgL1xccy8udGVzdChzb3VyY2VbY3Vyc29yXSBhcyBzdHJpbmcpKSBjdXJzb3IgKz0gMVxyXG4gIGNvbnN0IHF1b3RlID0gc291cmNlW2N1cnNvcl1cclxuICBpZiAocXVvdGUgPT09ICdcIicgfHwgcXVvdGUgPT09IFwiJ1wiKSB7XHJcbiAgICBsZXQgY29sbGVjdGVkID0gJydcclxuICAgIGN1cnNvciArPSAxXHJcbiAgICB3aGlsZSAoY3Vyc29yIDwgc291cmNlLmxlbmd0aCAmJiBzb3VyY2VbY3Vyc29yXSAhPT0gcXVvdGUpIHtcclxuICAgICAgaWYgKHNvdXJjZVtjdXJzb3JdID09PSAnXFxcXCcpIHtcclxuICAgICAgICBjb2xsZWN0ZWQgKz0gc291cmNlW2N1cnNvciArIDFdID8/ICcnXHJcbiAgICAgICAgY3Vyc29yICs9IDJcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcbiAgICAgIGNvbGxlY3RlZCArPSBzb3VyY2VbY3Vyc29yXVxyXG4gICAgICBjdXJzb3IgKz0gMVxyXG4gICAgfVxyXG4gICAgaWYgKHNvdXJjZVtjdXJzb3JdICE9PSBxdW90ZSkgcmV0dXJuIG51bGxcclxuICAgIHRpdGxlID0gY29sbGVjdGVkXHJcbiAgICBjdXJzb3IgKz0gMVxyXG4gICAgd2hpbGUgKGN1cnNvciA8IHNvdXJjZS5sZW5ndGggJiYgL1xccy8udGVzdChzb3VyY2VbY3Vyc29yXSBhcyBzdHJpbmcpKSBjdXJzb3IgKz0gMVxyXG4gIH1cclxuICBpZiAoc291cmNlW2N1cnNvcl0gIT09ICcpJykgcmV0dXJuIG51bGxcclxuICByZXR1cm4geyB0ZXh0LCBkZXN0aW5hdGlvbiwgdGl0bGUsIG5leHQ6IGN1cnNvciArIDEgfVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5cclxuLyoqXHJcbiAqIEFubm91bmNlbWVudHMgdG8gYXNzaXN0aXZlIHRlY2hub2xvZ3kuXHJcbiAqXHJcbiAqIEEgY29udGVudGVkaXRhYmxlIHN1cmZhY2UgYWxyZWFkeSByZXBvcnRzIHR5cGVkIGNoYXJhY3RlcnMgYW5kIGNhcmV0XHJcbiAqIG1vdmVtZW50LCBzY3JlZW4gcmVhZGVycyB3YXRjaCB0aGUgRE9NIGZvciB0aGF0LiBXaGF0IHRoZXkgZG8gbm90IHJlcG9ydCBpc1xyXG4gKiAqc3RydWN0dXJlKiBjaGFuZ2luZyBvdXQgZnJvbSB1bmRlciB0aGUgY2FyZXQ6IHRocmVlIGJsb2NrcyBkZWxldGVkIGJ5IG9uZVxyXG4gKiBrZXkgcHJlc3MsIGEgcGFyYWdyYXBoIGJlY29taW5nIGEgaGVhZGluZywgYSBsaXN0IGFwcGVhcmluZy4gVGhvc2UgZWRpdHMgYXJlXHJcbiAqIHNpbGVudCwgYW5kIHNpbGVuY2UgYWZ0ZXIgYSBkZXN0cnVjdGl2ZSBrZXkgcHJlc3MgaXMgdGhlIHdvcnN0IGNhc2UuXHJcbiAqXHJcbiAqIFRoaXMgaXMgdGhlIHNoYXJlZCB3YXkgdG8gc2F5IHRoZW0gb3V0IGxvdWQuXHJcbiAqL1xyXG5cclxuLyoqIEhvdyB1cmdlbnRseSBhIG1lc3NhZ2Ugc2hvdWxkIGludGVycnVwdC4gKi9cclxuZXhwb3J0IHR5cGUgQW5ub3VuY2VQcmlvcml0eSA9ICdwb2xpdGUnIHwgJ2Fzc2VydGl2ZSdcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQW5ub3VuY2VyIHtcclxuICAvKiogVGhlIGxpdmUgcmVnaW9ucywgYXBwZW5kZWQgd2hlcmV2ZXIgdGhlIGFubm91bmNlciB3YXMgdG9sZCB0byBsaXZlLiAqL1xyXG4gIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50XHJcbiAgLyoqIFNheSBzb21ldGhpbmcuIFJlcGVhdGluZyB0aGUgc2FtZSB0ZXh0IHN0aWxsIGFubm91bmNlcyBpdC4gKi9cclxuICBhbm5vdW5jZShtZXNzYWdlOiBzdHJpbmcsIHByaW9yaXR5PzogQW5ub3VuY2VQcmlvcml0eSk6IHZvaWRcclxuICAvKiogRW1wdHkgYm90aCByZWdpb25zIHdpdGhvdXQgc2F5aW5nIGFueXRoaW5nLiAqL1xyXG4gIGNsZWFyKCk6IHZvaWRcclxuICBkZXN0cm95KCk6IHZvaWRcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBBbm5vdW5jZXJPcHRpb25zIHtcclxuICAvKiogV2hlcmUgdGhlIHJlZ2lvbnMgYXJlIGFwcGVuZGVkLiBEZWZhdWx0cyB0byBgZG9jdW1lbnQuYm9keWAuICovXHJcbiAgcmVhZG9ubHkgY29udGFpbmVyPzogSFRNTEVsZW1lbnRcclxuICAvKipcclxuICAgKiBIb3cgbG9uZyBhIG1lc3NhZ2Ugc3RheXMgaW4gdGhlIHJlZ2lvbiBiZWZvcmUgaXQgaXMgY2xlYXJlZCwgaW4gbXMuIExvbmdcclxuICAgKiBlbm91Z2ggZm9yIGEgcmVhZGVyIHRvIHBpY2sgaXQgdXAsIHNob3J0IGVub3VnaCB0aGF0IGEgbGF0ZXIgaWRlbnRpY2FsXHJcbiAgICogbWVzc2FnZSBpcyBhIHJlYWwgY2hhbmdlLiBEZWZhdWx0cyB0byAxMDAwLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IGNsZWFyQWZ0ZXJNcz86IG51bWJlclxyXG59XHJcblxyXG4vKipcclxuICogT2ZmLXNjcmVlbiByYXRoZXIgdGhhbiBgZGlzcGxheTogbm9uZWAgb3IgYGhpZGRlbmA6IGEgcmVnaW9uIHJlbW92ZWQgZnJvbVxyXG4gKiB0aGUgYWNjZXNzaWJpbGl0eSB0cmVlIGlzIG5ldmVyIHJlYWQsIHdoaWNoIHdvdWxkIG1ha2UgdGhlIHdob2xlIHRoaW5nIGFcclxuICogbm8tb3AgdGhhdCBsb29rcyBsaWtlIGl0IHdvcmtzLlxyXG4gKi9cclxuY29uc3QgVklTVUFMTFlfSElEREVOID1cclxuICAncG9zaXRpb246YWJzb2x1dGU7d2lkdGg6MXB4O2hlaWdodDoxcHg7bWFyZ2luOi0xcHg7cGFkZGluZzowO292ZXJmbG93OmhpZGRlbjsnICtcclxuICAnY2xpcDpyZWN0KDAgMCAwIDApO2NsaXAtcGF0aDppbnNldCg1MCUpO3doaXRlLXNwYWNlOm5vd3JhcDtib3JkZXI6MCdcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBbm5vdW5jZXIoZG9jdW1lbnQ6IERvY3VtZW50LCBvcHRpb25zOiBBbm5vdW5jZXJPcHRpb25zID0ge30pOiBBbm5vdW5jZXIge1xyXG4gIGNvbnN0IGNsZWFyQWZ0ZXJNcyA9IG9wdGlvbnMuY2xlYXJBZnRlck1zID8/IDEwMDBcclxuXHJcbiAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXHJcbiAgcm9vdC5jbGFzc05hbWUgPSAndHJldml4YWwtYW5ub3VuY2VyJ1xyXG4gIHJvb3Quc2V0QXR0cmlidXRlKCdzdHlsZScsIFZJU1VBTExZX0hJRERFTilcclxuXHJcbiAgLy8gT25lIHJlZ2lvbiBwZXIgcHJpb3JpdHkuIEZsaXBwaW5nIGBhcmlhLWxpdmVgIG9uIGEgc2luZ2xlIHJlZ2lvbiBpc1xyXG4gIC8vIHVucmVsaWFibGUgYWNyb3NzIHJlYWRlcnMsIHNldmVyYWwgbGF0Y2ggdGhlIHZhbHVlIHRoZXkgc2F3IGZpcnN0LCBzb1xyXG4gIC8vIHRoZSB0d28gbGl2ZSBzaWRlIGJ5IHNpZGUgYW5kIGVhY2gga2VlcHMgb25lIHNldHRpbmcgZm9yIGdvb2QuXHJcbiAgY29uc3QgcmVnaW9uczogUmVjb3JkPEFubm91bmNlUHJpb3JpdHksIEhUTUxFbGVtZW50PiA9IHtcclxuICAgIHBvbGl0ZTogcmVnaW9uKGRvY3VtZW50LCAncG9saXRlJyksXHJcbiAgICBhc3NlcnRpdmU6IHJlZ2lvbihkb2N1bWVudCwgJ2Fzc2VydGl2ZScpLFxyXG4gIH1cclxuICByb290LmFwcGVuZChyZWdpb25zLnBvbGl0ZSwgcmVnaW9ucy5hc3NlcnRpdmUpXHJcbiAgOyhvcHRpb25zLmNvbnRhaW5lciA/PyBkb2N1bWVudC5ib2R5KT8uYXBwZW5kQ2hpbGQocm9vdClcclxuXHJcbiAgbGV0IHRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBlbGVtZW50OiByb290LFxyXG4gICAgYW5ub3VuY2UobWVzc2FnZSwgcHJpb3JpdHkgPSAncG9saXRlJykge1xyXG4gICAgICBjb25zdCB0ZXh0ID0gbWVzc2FnZS50cmltKClcclxuICAgICAgaWYgKCF0ZXh0KSByZXR1cm5cclxuICAgICAgY29uc3QgdGFyZ2V0ID0gcmVnaW9uc1twcmlvcml0eV0gPz8gcmVnaW9ucy5wb2xpdGVcclxuICAgICAgaWYgKHRpbWVyICE9PSBudWxsKSBjbGVhclRpbWVvdXQodGltZXIpXHJcbiAgICAgIC8vIEVtcHR5aW5nIGZpcnN0IGlzIHdoYXQgbWFrZXMgdGhlIHNhbWUgbWVzc2FnZSBhbm5vdW5jZSB0d2ljZTogYVxyXG4gICAgICAvLyByZWFkZXIgd2F0Y2hlcyBmb3IgdGhlIHRleHQgdG8gKmNoYW5nZSosIHNvIHNldHRpbmcgaXQgdG8gdGhlIHZhbHVlXHJcbiAgICAgIC8vIGl0IGFscmVhZHkgaG9sZHMgc2F5cyBub3RoaW5nIGF0IGFsbC5cclxuICAgICAgdGFyZ2V0LnRleHRDb250ZW50ID0gJydcclxuICAgICAgdGFyZ2V0LnRleHRDb250ZW50ID0gdGV4dFxyXG4gICAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHRhcmdldC50ZXh0Q29udGVudCA9ICcnXHJcbiAgICAgICAgdGltZXIgPSBudWxsXHJcbiAgICAgIH0sIGNsZWFyQWZ0ZXJNcylcclxuICAgIH0sXHJcbiAgICBjbGVhcigpIHtcclxuICAgICAgaWYgKHRpbWVyICE9PSBudWxsKSBjbGVhclRpbWVvdXQodGltZXIpXHJcbiAgICAgIHRpbWVyID0gbnVsbFxyXG4gICAgICByZWdpb25zLnBvbGl0ZS50ZXh0Q29udGVudCA9ICcnXHJcbiAgICAgIHJlZ2lvbnMuYXNzZXJ0aXZlLnRleHRDb250ZW50ID0gJydcclxuICAgIH0sXHJcbiAgICBkZXN0cm95KCkge1xyXG4gICAgICBpZiAodGltZXIgIT09IG51bGwpIGNsZWFyVGltZW91dCh0aW1lcilcclxuICAgICAgdGltZXIgPSBudWxsXHJcbiAgICAgIHJvb3QucmVtb3ZlKClcclxuICAgIH0sXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZWdpb24oZG9jdW1lbnQ6IERvY3VtZW50LCBwcmlvcml0eTogQW5ub3VuY2VQcmlvcml0eSk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcclxuICBlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgcHJpb3JpdHkpXHJcbiAgLy8gUmVhZCB0aGUgd2hvbGUgcmVnaW9uLCBub3QgdGhlIGNoYW5nZWQgd29yZDogYSBwYXJ0aWFsIHJlYWRpbmcgb2ZcclxuICAvLyBcIjMgYmxvY2tzIGRlbGV0ZWRcIiBpcyB3b3JzZSB0aGFuIG5vbmUuXHJcbiAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtYXRvbWljJywgJ3RydWUnKVxyXG4gIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgcHJpb3JpdHkgPT09ICdhc3NlcnRpdmUnID8gJ2FsZXJ0JyA6ICdzdGF0dXMnKVxyXG4gIHJldHVybiBlbGVtZW50XHJcbn1cclxuXHJcbi8qKiBFbmdsaXNoIHBsdXJhbCBmb3IgdGhlIHNtYWxsIGNvdW50cyB0aGVzZSBtZXNzYWdlcyBhY3R1YWxseSBjYXJyeS4gKi9cclxuZnVuY3Rpb24gY291bnQobjogbnVtYmVyLCBzaW5ndWxhcjogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gYCR7bn0gJHtzaW5ndWxhcn0ke24gPT09IDEgPyAnJyA6ICdzJ31gXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBXaGF0IHRvIHNheSBhYm91dCBhIGRvY3VtZW50IGNoYW5nZSwgb3IgbnVsbCB3aGVuIGl0IHNwZWFrcyBmb3IgaXRzZWxmLlxyXG4gKlxyXG4gKiBEZWxpYmVyYXRlbHkgcXVpZXQuIFR5cGluZywgY2FyZXQgbW92ZW1lbnQgYW5kIGEgc2luZ2xlIG5ldyBibG9jayBhcmUgYWxsXHJcbiAqIHRoaW5ncyBhIHJlYWRlciBhbHJlYWR5IHJlcG9ydHMgZnJvbSB0aGUgRE9NLCBhbmQgcmVwZWF0aW5nIHRoZW0gdHVybnMgdGhlXHJcbiAqIGxpdmUgcmVnaW9uIGludG8gbm9pc2UgdGhhdCB1c2VycyBzd2l0Y2ggb2ZmLiBXaGF0IGlzIGFubm91bmNlZCBpcyB3aGF0IGFcclxuICogcmVhZGVyIGNhbm5vdCBzZWUgY29taW5nOiBibG9ja3MgZGlzYXBwZWFyaW5nLCBhbmQgdGhlIGJsb2NrIHVuZGVyIHRoZVxyXG4gKiBjYXJldCBiZWNvbWluZyBhIGRpZmZlcmVudCBraW5kIG9mIHRoaW5nLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRlc2NyaWJlRG9jQ2hhbmdlKFxyXG4gIGJlZm9yZTogRWRpdG9yTm9kZSxcclxuICBhZnRlcjogRWRpdG9yTm9kZSxcclxuICBibG9ja1R5cGVCZWZvcmU/OiBzdHJpbmcgfCBudWxsLFxyXG4gIGJsb2NrVHlwZUFmdGVyPzogc3RyaW5nIHwgbnVsbCxcclxuKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgY29uc3QgcmVtb3ZlZCA9IGJlZm9yZS5jaGlsZENvdW50IC0gYWZ0ZXIuY2hpbGRDb3VudFxyXG4gIGlmIChyZW1vdmVkID4gMCkgcmV0dXJuIGAke2NvdW50KHJlbW92ZWQsICdibG9jaycpfSBkZWxldGVkYFxyXG4gIGlmIChibG9ja1R5cGVCZWZvcmUgJiYgYmxvY2tUeXBlQWZ0ZXIgJiYgYmxvY2tUeXBlQmVmb3JlICE9PSBibG9ja1R5cGVBZnRlcikge1xyXG4gICAgcmV0dXJuIHJlYWRhYmxlVHlwZShibG9ja1R5cGVBZnRlcilcclxuICB9XHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuLyoqIGBjb2RlQmxvY2tgIHJlYWRzIGFzIFwiY29kZSBibG9ja1wiOyBhIHR5cGUgbmFtZSBpcyBub3QgYSBsYWJlbC4gKi9cclxuZnVuY3Rpb24gcmVhZGFibGVUeXBlKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgY29uc3Qgc3BhY2VkID0gbmFtZS5yZXBsYWNlKC8oW2EtejAtOV0pKFtBLVpdKS9nLCAnJDEgJDInKS50b0xvd2VyQ2FzZSgpXHJcbiAgcmV0dXJuIHNwYWNlZC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHNwYWNlZC5zbGljZSgxKVxyXG59XHJcbiIsICJpbXBvcnQgeyBpbmxpbmVMZW5ndGggfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHR5cGUgeyBET01SZW5kZXJlciB9IGZyb20gJy4vcmVuZGVyZXInXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIERPTVBvaW50IHtcclxuICByZWFkb25seSBub2RlOiBnbG9iYWxUaGlzLk5vZGVcclxuICByZWFkb25seSBvZmZzZXQ6IG51bWJlclxyXG59XHJcblxyXG5jb25zdCBURVhUX05PREUgPSAzXHJcbmNvbnN0IEVMRU1FTlRfTk9ERSA9IDFcclxuXHJcbi8qKiBQbGFjZWhvbGRlciBgPGJyPmBzIGFuZCB3aWRnZXQgZGVjb3JhdGlvbnMgb2NjdXB5IG5vIG1vZGVsIG9mZnNldHMuICovXHJcbmZ1bmN0aW9uIGlzTm9uQ29udGVudChub2RlOiBnbG9iYWxUaGlzLk5vZGUpOiBib29sZWFuIHtcclxuICBpZiAobm9kZS5ub2RlVHlwZSAhPT0gRUxFTUVOVF9OT0RFKSByZXR1cm4gZmFsc2VcclxuICBjb25zdCBkYXRhc2V0ID0gKG5vZGUgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXRcclxuICByZXR1cm4gZGF0YXNldC50cmV2aXhhbFBsYWNlaG9sZGVyID09PSAndHJ1ZScgfHwgZGF0YXNldC50cmV2aXhhbFdpZGdldCA9PT0gJ3RydWUnXHJcbn1cclxuXHJcbi8qKiBNb2RlbCBub2RlIGFuIGVsZW1lbnQgcmVuZGVycywgaWYgYW55LiAqL1xyXG5mdW5jdGlvbiBtb2RlbEF0KHJlbmRlcmVyOiBET01SZW5kZXJlciwgbm9kZTogZ2xvYmFsVGhpcy5Ob2RlKTogRWRpdG9yTm9kZSB8IG51bGwge1xyXG4gIHJldHVybiByZW5kZXJlci5tb2RlbE9mLmdldChub2RlKSA/PyBudWxsXHJcbn1cclxuXHJcbi8qKiBTaXplIGEgRE9NIG5vZGUgY29udHJpYnV0ZXMgdG8gaW5saW5lIG9mZnNldHMuICovXHJcbmZ1bmN0aW9uIGlubGluZURPTVNpemUocmVuZGVyZXI6IERPTVJlbmRlcmVyLCBub2RlOiBnbG9iYWxUaGlzLk5vZGUpOiBudW1iZXIge1xyXG4gIGlmIChub2RlLm5vZGVUeXBlID09PSBURVhUX05PREUpIHJldHVybiAobm9kZS50ZXh0Q29udGVudCA/PyAnJykubGVuZ3RoXHJcbiAgaWYgKGlzTm9uQ29udGVudChub2RlKSkgcmV0dXJuIDBcclxuICBjb25zdCBtb2RlbCA9IG1vZGVsQXQocmVuZGVyZXIsIG5vZGUpXHJcbiAgaWYgKG1vZGVsICYmICFtb2RlbC5pc1RleHQpIHJldHVybiAxIC8vIGlubGluZSBhdG9tXHJcbiAgLy8gTWFyayB3cmFwcGVyOiBzdW0gb2YgY29udGVudHMuXHJcbiAgbGV0IHNpemUgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4ubm9kZS5jaGlsZE5vZGVzXSkgc2l6ZSArPSBpbmxpbmVET01TaXplKHJlbmRlcmVyLCBjaGlsZClcclxuICByZXR1cm4gc2l6ZVxyXG59XHJcblxyXG4vKipcclxuICogTWFwIGEgRE9NIHBvaW50IGluc2lkZSB0aGUgdmlldyB0byBhIG1vZGVsIFBvc2l0aW9uLiBSZXR1cm5zIG51bGwgZm9yXHJcbiAqIHBvaW50cyBvdXRzaWRlIGFueSByZW5kZXJlZCB0ZXh0YmxvY2suXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcG9zaXRpb25Gcm9tRE9NUG9pbnQoXHJcbiAgcm9vdDogSFRNTEVsZW1lbnQsXHJcbiAgcmVuZGVyZXI6IERPTVJlbmRlcmVyLFxyXG4gIGRvbU5vZGU6IGdsb2JhbFRoaXMuTm9kZSxcclxuICBkb21PZmZzZXQ6IG51bWJlcixcclxuKTogUG9zaXRpb24gfCBudWxsIHtcclxuICAvLyBGaW5kIHRoZSB0ZXh0YmxvY2sgZWxlbWVudCBjb250YWluaW5nIHRoZSBwb2ludC5cclxuICBsZXQgYmxvY2tFbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsXHJcbiAgZm9yIChcclxuICAgIGxldCBjdXJyZW50OiBnbG9iYWxUaGlzLk5vZGUgfCBudWxsID0gZG9tTm9kZTtcclxuICAgIGN1cnJlbnQgJiYgY3VycmVudCAhPT0gcm9vdC5wYXJlbnROb2RlO1xyXG4gICAgY3VycmVudCA9IGN1cnJlbnQucGFyZW50Tm9kZVxyXG4gICkge1xyXG4gICAgY29uc3QgbW9kZWwgPSBjdXJyZW50Lm5vZGVUeXBlID09PSBFTEVNRU5UX05PREUgPyBtb2RlbEF0KHJlbmRlcmVyLCBjdXJyZW50KSA6IG51bGxcclxuICAgIGlmIChtb2RlbD8uaXNUZXh0YmxvY2spIHtcclxuICAgICAgYmxvY2tFbGVtZW50ID0gY3VycmVudCBhcyBIVE1MRWxlbWVudFxyXG4gICAgICBicmVha1xyXG4gICAgfVxyXG4gICAgaWYgKGN1cnJlbnQgPT09IHJvb3QpIGJyZWFrXHJcbiAgfVxyXG4gIGlmICghYmxvY2tFbGVtZW50KSB7XHJcbiAgICAvLyBBIHBvaW50IG9uIGEgY29udGFpbmVyICh0aGUgcm9vdCwgYSBibG9ja3F1b3RlLCBhIGxpc3QpOiB0aGUgb2Zmc2V0IGlzXHJcbiAgICAvLyBhIGNoaWxkIGluZGV4LiBCcm93c2VycyByZXBvcnQgd2hvbGUtYmxvY2sgc2VsZWN0aW9ucyB0aGlzIHdheS5cclxuICAgIHJldHVybiBwb3NpdGlvbkluQ29udGFpbmVyKHJvb3QsIHJlbmRlcmVyLCBkb21Ob2RlLCBkb21PZmZzZXQpXHJcbiAgfVxyXG5cclxuICBjb25zdCBwYXRoID0gcGF0aE9mRWxlbWVudChyb290LCByZW5kZXJlciwgYmxvY2tFbGVtZW50KVxyXG4gIGlmICghcGF0aCkgcmV0dXJuIG51bGxcclxuXHJcbiAgY29uc3QgY29udGVudCA9IHJlbmRlcmVyLmNvbnRlbnRFbGVtZW50T2YoYmxvY2tFbGVtZW50KVxyXG4gIGNvbnN0IG9mZnNldCA9IGlubGluZU9mZnNldE9mKHJlbmRlcmVyLCBjb250ZW50LCBkb21Ob2RlLCBkb21PZmZzZXQpXHJcbiAgcmV0dXJuIG9mZnNldCA9PT0gbnVsbCA/IG51bGwgOiB7IHBhdGgsIG9mZnNldCB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXNvbHZlIGEgcG9pbnQgd2hvc2Ugbm9kZSBpcyBhIGNvbnRhaW5lciBlbGVtZW50OiB0aGUgb2Zmc2V0IGlzIGEgY2hpbGRcclxuICogaW5kZXgsIHNvIGRlc2NlbmQgaW50byB0aGF0IGNoaWxkIChvciB0aGUgbGFzdCBvbmUsIGZvciBhbiBlbmQtb2YtY29udGFpbmVyXHJcbiAqIG9mZnNldCkgdW50aWwgYSB0ZXh0YmxvY2sgaXMgcmVhY2hlZC5cclxuICovXHJcbmZ1bmN0aW9uIHBvc2l0aW9uSW5Db250YWluZXIoXHJcbiAgcm9vdDogSFRNTEVsZW1lbnQsXHJcbiAgcmVuZGVyZXI6IERPTVJlbmRlcmVyLFxyXG4gIGNvbnRhaW5lcjogZ2xvYmFsVGhpcy5Ob2RlLFxyXG4gIGluZGV4OiBudW1iZXIsXHJcbik6IFBvc2l0aW9uIHwgbnVsbCB7XHJcbiAgaWYgKGNvbnRhaW5lci5ub2RlVHlwZSAhPT0gRUxFTUVOVF9OT0RFKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGNoaWxkcmVuID0gWy4uLihjb250YWluZXIgYXMgSFRNTEVsZW1lbnQpLmNoaWxkcmVuXS5maWx0ZXIoKGNoaWxkKSA9PlxyXG4gICAgcmVuZGVyZXIubW9kZWxPZi5nZXQoY2hpbGQpLFxyXG4gICkgYXMgSFRNTEVsZW1lbnRbXVxyXG4gIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgLy8gQW4gb2Zmc2V0IHBhc3QgdGhlIGxhc3QgY2hpbGQgbWVhbnMgXCJ0aGUgZW5kIG9mIHRoZSBjb250YWluZXJcIi5cclxuICBjb25zdCBhdEVuZCA9IGluZGV4ID49IGNoaWxkcmVuLmxlbmd0aFxyXG4gIGNvbnN0IHRhcmdldCA9IGNoaWxkcmVuW01hdGgubWluKGluZGV4LCBjaGlsZHJlbi5sZW5ndGggLSAxKV1cclxuICBpZiAoIXRhcmdldCkgcmV0dXJuIG51bGxcclxuXHJcbiAgY29uc3QgZGVzY2VuZCA9IChlbGVtZW50OiBIVE1MRWxlbWVudCk6IFBvc2l0aW9uIHwgbnVsbCA9PiB7XHJcbiAgICBjb25zdCBtb2RlbCA9IHJlbmRlcmVyLm1vZGVsT2YuZ2V0KGVsZW1lbnQpXHJcbiAgICBpZiAobW9kZWw/LmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgIGNvbnN0IHBhdGggPSBwYXRoT2ZFbGVtZW50KHJvb3QsIHJlbmRlcmVyLCBlbGVtZW50KVxyXG4gICAgICBpZiAoIXBhdGgpIHJldHVybiBudWxsXHJcbiAgICAgIHJldHVybiB7IHBhdGgsIG9mZnNldDogYXRFbmQgPyBpbmxpbmVMZW5ndGgobW9kZWwuY29udGVudCkgOiAwIH1cclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRlbnQgPSByZW5kZXJlci5jb250ZW50RWxlbWVudE9mKGVsZW1lbnQpXHJcbiAgICBjb25zdCBuZXN0ZWQgPSBbLi4uY29udGVudC5jaGlsZHJlbl0uZmlsdGVyKChjaGlsZCkgPT5cclxuICAgICAgcmVuZGVyZXIubW9kZWxPZi5nZXQoY2hpbGQpLFxyXG4gICAgKSBhcyBIVE1MRWxlbWVudFtdXHJcbiAgICBjb25zdCBuZXh0ID0gYXRFbmQgPyBuZXN0ZWRbbmVzdGVkLmxlbmd0aCAtIDFdIDogbmVzdGVkWzBdXHJcbiAgICByZXR1cm4gbmV4dCA/IGRlc2NlbmQobmV4dCkgOiBudWxsXHJcbiAgfVxyXG4gIHJldHVybiBkZXNjZW5kKHRhcmdldClcclxufVxyXG5cclxuLyoqIENoaWxkLWluZGV4IHBhdGggb2YgYSByZW5kZXJlZCBlbGVtZW50LCBjbGltYmluZyB0byB0aGUgdmlldyByb290LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcGF0aE9mRWxlbWVudChcclxuICByb290OiBIVE1MRWxlbWVudCxcclxuICByZW5kZXJlcjogRE9NUmVuZGVyZXIsXHJcbiAgZWxlbWVudDogSFRNTEVsZW1lbnQsXHJcbik6IG51bWJlcltdIHwgbnVsbCB7XHJcbiAgY29uc3QgcGF0aDogbnVtYmVyW10gPSBbXVxyXG4gIGxldCBjdXJyZW50OiBIVE1MRWxlbWVudCA9IGVsZW1lbnRcclxuICB3aGlsZSAoY3VycmVudCAhPT0gcm9vdCkge1xyXG4gICAgY29uc3QgcGFyZW50ID0gY3VycmVudC5wYXJlbnRFbGVtZW50XHJcbiAgICBpZiAoIXBhcmVudCkgcmV0dXJuIG51bGxcclxuICAgIC8vIEluZGV4IGFtb25nIHNpYmxpbmdzIHRoYXQgcmVuZGVyIG1vZGVsIG5vZGVzIChwbGFjZWhvbGRlcnMgZG9uJ3QgY291bnQpLlxyXG4gICAgbGV0IGluZGV4ID0gMFxyXG4gICAgbGV0IGZvdW5kID0gZmFsc2VcclxuICAgIGZvciAoY29uc3Qgc2libGluZyBvZiBbLi4ucGFyZW50LmNoaWxkcmVuXSkge1xyXG4gICAgICBpZiAoc2libGluZyA9PT0gY3VycmVudCkge1xyXG4gICAgICAgIGZvdW5kID0gdHJ1ZVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIH1cclxuICAgICAgaWYgKHJlbmRlcmVyLm1vZGVsT2YuZ2V0KHNpYmxpbmcpKSBpbmRleCsrXHJcbiAgICB9XHJcbiAgICBpZiAoIWZvdW5kKSByZXR1cm4gbnVsbFxyXG4gICAgcGF0aC51bnNoaWZ0KGluZGV4KVxyXG4gICAgaWYgKHJlbmRlcmVyLm1vZGVsT2YuZ2V0KHBhcmVudCkgfHwgcGFyZW50ID09PSByb290KSB7XHJcbiAgICAgIGN1cnJlbnQgPSBwYXJlbnRcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIENvbnRlbnQgd3JhcHBlciAoZS5nLiB0aGUgYGNvZGVgIGluIGBwcmUgPiBjb2RlYCk6IGl0cyBwYXJlbnQgcmVuZGVycyB0aGUgbm9kZS5cclxuICAgICAgY29uc3Qgb3duZXIgPSBwYXJlbnQucGFyZW50RWxlbWVudFxyXG4gICAgICBpZiAoIW93bmVyKSByZXR1cm4gbnVsbFxyXG4gICAgICBjdXJyZW50ID0gb3duZXJcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIHBhdGhcclxufVxyXG5cclxuLyoqIElubGluZSBjaGFyYWN0ZXIgb2Zmc2V0IG9mIGEgRE9NIHBvaW50IHdpdGhpbiBhIHRleHRibG9jaydzIGNvbnRlbnQgZWxlbWVudC4gKi9cclxuZnVuY3Rpb24gaW5saW5lT2Zmc2V0T2YoXHJcbiAgcmVuZGVyZXI6IERPTVJlbmRlcmVyLFxyXG4gIGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxyXG4gIHRhcmdldE5vZGU6IGdsb2JhbFRoaXMuTm9kZSxcclxuICB0YXJnZXRPZmZzZXQ6IG51bWJlcixcclxuKTogbnVtYmVyIHwgbnVsbCB7XHJcbiAgaWYgKHRhcmdldE5vZGUgPT09IGNvbnRlbnQgfHwgdGFyZ2V0Tm9kZS5ub2RlVHlwZSA9PT0gRUxFTUVOVF9OT0RFKSB7XHJcbiAgICAvLyBFbGVtZW50IHBvaW50OiBzdW0gc2l6ZXMgb2YgY2hpbGRyZW4gYmVmb3JlIHRoZSBvZmZzZXQuXHJcbiAgICBpZiAodGFyZ2V0Tm9kZSA9PT0gY29udGVudCB8fCBjb250ZW50LmNvbnRhaW5zKHRhcmdldE5vZGUpKSB7XHJcbiAgICAgIGxldCBzdW0gPSAwXHJcbiAgICAgIGlmICh0YXJnZXROb2RlICE9PSBjb250ZW50KSB7XHJcbiAgICAgICAgLy8gQ291bnQgZXZlcnl0aGluZyBiZWZvcmUgdGhlIGVsZW1lbnQgaXRzZWxmIGZpcnN0LlxyXG4gICAgICAgIGNvbnN0IGJlZm9yZSA9IG9mZnNldFRvTm9kZVN0YXJ0KHJlbmRlcmVyLCBjb250ZW50LCB0YXJnZXROb2RlKVxyXG4gICAgICAgIGlmIChiZWZvcmUgPT09IG51bGwpIHJldHVybiBudWxsXHJcbiAgICAgICAgc3VtID0gYmVmb3JlXHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgY2hpbGRyZW4gPSBbLi4udGFyZ2V0Tm9kZS5jaGlsZE5vZGVzXVxyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWluKHRhcmdldE9mZnNldCwgY2hpbGRyZW4ubGVuZ3RoKTsgaSsrKSB7XHJcbiAgICAgICAgc3VtICs9IGlubGluZURPTVNpemUocmVuZGVyZXIsIGNoaWxkcmVuW2ldIGFzIGdsb2JhbFRoaXMuTm9kZSlcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gc3VtXHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxuICAvLyBUZXh0IHBvaW50OiBkaXN0YW5jZSB0byB0aGUgdGV4dCBub2RlIHBsdXMgdGhlIG9mZnNldCB3aXRoaW4gaXQuXHJcbiAgY29uc3QgYmVmb3JlID0gb2Zmc2V0VG9Ob2RlU3RhcnQocmVuZGVyZXIsIGNvbnRlbnQsIHRhcmdldE5vZGUpXHJcbiAgcmV0dXJuIGJlZm9yZSA9PT0gbnVsbCA/IG51bGwgOiBiZWZvcmUgKyB0YXJnZXRPZmZzZXRcclxufVxyXG5cclxuLyoqIElubGluZSBvZmZzZXQgZnJvbSB0aGUgc3RhcnQgb2YgYGNvbnRlbnRgIHRvIHRoZSBzdGFydCBvZiBgdGFyZ2V0YC4gKi9cclxuZnVuY3Rpb24gb2Zmc2V0VG9Ob2RlU3RhcnQoXHJcbiAgcmVuZGVyZXI6IERPTVJlbmRlcmVyLFxyXG4gIGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxyXG4gIHRhcmdldDogZ2xvYmFsVGhpcy5Ob2RlLFxyXG4pOiBudW1iZXIgfCBudWxsIHtcclxuICBsZXQgc3VtID0gMFxyXG4gIGxldCBmb3VuZCA9IGZhbHNlXHJcbiAgY29uc3Qgd2FsayA9IChub2RlOiBnbG9iYWxUaGlzLk5vZGUpOiB2b2lkID0+IHtcclxuICAgIGlmIChmb3VuZCkgcmV0dXJuXHJcbiAgICBpZiAobm9kZSA9PT0gdGFyZ2V0KSB7XHJcbiAgICAgIGZvdW5kID0gdHJ1ZVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBURVhUX05PREUpIHtcclxuICAgICAgc3VtICs9IChub2RlLnRleHRDb250ZW50ID8/ICcnKS5sZW5ndGhcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBpZiAoaXNOb25Db250ZW50KG5vZGUpKSByZXR1cm4gLy8gb2NjdXBpZXMgbm8gb2Zmc2V0czsgbmV2ZXIgY29udGFpbnMgdGhlIHRhcmdldFxyXG4gICAgY29uc3QgbW9kZWwgPSBub2RlICE9PSBjb250ZW50ID8gbW9kZWxBdChyZW5kZXJlciwgbm9kZSkgOiBudWxsXHJcbiAgICBpZiAobW9kZWwgJiYgIW1vZGVsLmlzVGV4dCAmJiBub2RlICE9PSBjb250ZW50KSB7XHJcbiAgICAgIHN1bSArPSAxXHJcbiAgICAgIHJldHVybiAvLyBhdG9tcyBhcmUgb3BhcXVlXHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIFsuLi5ub2RlLmNoaWxkTm9kZXNdKSB7XHJcbiAgICAgIHdhbGsoY2hpbGQpXHJcbiAgICAgIGlmIChmb3VuZCkgcmV0dXJuXHJcbiAgICB9XHJcbiAgfVxyXG4gIHdhbGsoY29udGVudClcclxuICByZXR1cm4gZm91bmQgPyBzdW0gOiBudWxsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYXAgYSBtb2RlbCBQb3NpdGlvbiB0byBhIGNvbmNyZXRlIERPTSBwb2ludCwgcHJlZmVycmluZyB0ZXh0IG5vZGVzIHNvIHRoZVxyXG4gKiBicm93c2VyIGNhcmV0IHJlbmRlcnMgY29ycmVjdGx5LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRvbVBvaW50RnJvbVBvc2l0aW9uKFxyXG4gIHJvb3Q6IEhUTUxFbGVtZW50LFxyXG4gIHJlbmRlcmVyOiBET01SZW5kZXJlcixcclxuICBwb3NpdGlvbjogUG9zaXRpb24sXHJcbik6IERPTVBvaW50IHwgbnVsbCB7XHJcbiAgLy8gV2FsayBkb3duIHRoZSBwYXRoIG92ZXIgcmVuZGVyZWQgY2hpbGQgZWxlbWVudHMuXHJcbiAgbGV0IGVsZW1lbnQ6IEhUTUxFbGVtZW50ID0gcm9vdFxyXG4gIGZvciAoY29uc3QgaW5kZXggb2YgcG9zaXRpb24ucGF0aCkge1xyXG4gICAgY29uc3QgY2hpbGRyZW4gPSBbLi4ucmVuZGVyZXIuY29udGVudEVsZW1lbnRPZihlbGVtZW50KS5jaGlsZHJlbl0uZmlsdGVyKChjaGlsZCkgPT5cclxuICAgICAgcmVuZGVyZXIubW9kZWxPZi5nZXQoY2hpbGQpLFxyXG4gICAgKSBhcyBIVE1MRWxlbWVudFtdXHJcbiAgICBjb25zdCBuZXh0ID0gY2hpbGRyZW5baW5kZXhdXHJcbiAgICBpZiAoIW5leHQpIHJldHVybiBudWxsXHJcbiAgICBlbGVtZW50ID0gbmV4dFxyXG4gIH1cclxuICBjb25zdCBtb2RlbCA9IHJlbmRlcmVyLm1vZGVsT2YuZ2V0KGVsZW1lbnQpXHJcbiAgaWYgKCFtb2RlbD8uaXNUZXh0YmxvY2spIHtcclxuICAgIC8vIEVsZW1lbnQtbGV2ZWwgcG9zaXRpb246IG9mZnNldCBpcyBhIGNoaWxkIGluZGV4LlxyXG4gICAgY29uc3QgY29udGVudCA9IHJlbmRlcmVyLmNvbnRlbnRFbGVtZW50T2YoZWxlbWVudClcclxuICAgIHJldHVybiB7IG5vZGU6IGNvbnRlbnQsIG9mZnNldDogTWF0aC5taW4ocG9zaXRpb24ub2Zmc2V0LCBjb250ZW50LmNoaWxkTm9kZXMubGVuZ3RoKSB9XHJcbiAgfVxyXG5cclxuICBjb25zdCBjb250ZW50ID0gcmVuZGVyZXIuY29udGVudEVsZW1lbnRPZihlbGVtZW50KVxyXG4gIGxldCByZW1haW5pbmcgPSBwb3NpdGlvbi5vZmZzZXRcclxuICBsZXQgcmVzdWx0OiBET01Qb2ludCB8IG51bGwgPSBudWxsXHJcbiAgY29uc3Qgd2FsayA9IChub2RlOiBnbG9iYWxUaGlzLk5vZGUpOiBib29sZWFuID0+IHtcclxuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBURVhUX05PREUpIHtcclxuICAgICAgY29uc3QgbGVuZ3RoID0gKG5vZGUudGV4dENvbnRlbnQgPz8gJycpLmxlbmd0aFxyXG4gICAgICBpZiAocmVtYWluaW5nIDw9IGxlbmd0aCkge1xyXG4gICAgICAgIHJlc3VsdCA9IHsgbm9kZSwgb2Zmc2V0OiByZW1haW5pbmcgfVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgIH1cclxuICAgICAgcmVtYWluaW5nIC09IGxlbmd0aFxyXG4gICAgICByZXR1cm4gZmFsc2VcclxuICAgIH1cclxuICAgIGlmIChpc05vbkNvbnRlbnQobm9kZSkpIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3Qgbm9kZU1vZGVsID0gbm9kZSAhPT0gY29udGVudCA/IG1vZGVsQXQocmVuZGVyZXIsIG5vZGUpIDogbnVsbFxyXG4gICAgaWYgKG5vZGVNb2RlbCAmJiAhbm9kZU1vZGVsLmlzVGV4dCkge1xyXG4gICAgICBpZiAocmVtYWluaW5nID09PSAwKSB7XHJcbiAgICAgICAgY29uc3QgcGFyZW50ID0gbm9kZS5wYXJlbnROb2RlIGFzIGdsb2JhbFRoaXMuTm9kZVxyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gWy4uLnBhcmVudC5jaGlsZE5vZGVzXS5pbmRleE9mKG5vZGUgYXMgQ2hpbGROb2RlKVxyXG4gICAgICAgIHJlc3VsdCA9IHsgbm9kZTogcGFyZW50LCBvZmZzZXQ6IGluZGV4IH1cclxuICAgICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgICB9XHJcbiAgICAgIHJlbWFpbmluZyAtPSAxXHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgfVxyXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4ubm9kZS5jaGlsZE5vZGVzXSkge1xyXG4gICAgICBpZiAod2FsayhjaGlsZCkpIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcbiAgaWYgKHdhbGsoY29udGVudCkgJiYgcmVzdWx0KSByZXR1cm4gcmVzdWx0XHJcbiAgLy8gT2Zmc2V0IGF0IHRoZSB2ZXJ5IGVuZCAob3IgZW1wdHkgYmxvY2spOiBwYXJrIGF0IHRoZSBlbmQgb2YgdGhlIGNvbnRlbnQuXHJcbiAgcmV0dXJuIHsgbm9kZTogY29udGVudCwgb2Zmc2V0OiBjb250ZW50LmNoaWxkTm9kZXMubGVuZ3RoIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgZXhpdFByZWZvcm1hdHRlZCwgaW5kZW50SW5QcmVmb3JtYXR0ZWQsIG91dGRlbnRJblByZWZvcm1hdHRlZCB9IGZyb20gJy4uL2NvbW1hbmRzL2NvbW1hbmRzJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvciB9IGZyb20gJy4uL2VkaXRvci9lZGl0b3InXHJcblxyXG4vKiogQSBrZXkgYmluZGluZyBydW5zIGFnYWluc3QgdGhlIGVkaXRvcjsgcmV0dXJuaW5nIHRydWUgY29uc3VtZXMgdGhlIGV2ZW50LiAqL1xyXG5leHBvcnQgdHlwZSBLZXlCaW5kaW5nID0gKGVkaXRvcjogRWRpdG9yKSA9PiBib29sZWFuXHJcblxyXG5leHBvcnQgdHlwZSBLZXltYXAgPSBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBLZXlCaW5kaW5nPj5cclxuXHJcbi8qKlxyXG4gKiBOb3JtYWxpemUgYSBiaW5kaW5nIG5hbWUgbGlrZSBgXCJNb2QtU2hpZnQtelwiYCB0byBhIGNhbm9uaWNhbCBmb3JtLlxyXG4gKiBgTW9kYCBpcyBDbWQgb24gQXBwbGUgcGxhdGZvcm1zIGFuZCBDdHJsIGVsc2V3aGVyZS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVLZXlOYW1lKG5hbWU6IHN0cmluZywgaXNNYWM6IGJvb2xlYW4pOiBzdHJpbmcge1xyXG4gIGNvbnN0IHBhcnRzID0gbmFtZS5zcGxpdCgnLScpXHJcbiAgY29uc3Qga2V5ID0gcGFydHMucG9wKCkgPz8gJydcclxuICBsZXQgbW9kcyA9ICcnXHJcbiAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSB7XHJcbiAgICBjb25zdCBsb3dlciA9IHBhcnQudG9Mb3dlckNhc2UoKVxyXG4gICAgaWYgKGxvd2VyID09PSAnbW9kJykgbW9kcyArPSBpc01hYyA/ICdtJyA6ICdjJ1xyXG4gICAgZWxzZSBpZiAobG93ZXIgPT09ICdjdHJsJyB8fCBsb3dlciA9PT0gJ2NvbnRyb2wnKSBtb2RzICs9ICdjJ1xyXG4gICAgZWxzZSBpZiAobG93ZXIgPT09ICdtZXRhJyB8fCBsb3dlciA9PT0gJ2NtZCcpIG1vZHMgKz0gJ20nXHJcbiAgICBlbHNlIGlmIChsb3dlciA9PT0gJ2FsdCcpIG1vZHMgKz0gJ2EnXHJcbiAgICBlbHNlIGlmIChsb3dlciA9PT0gJ3NoaWZ0JykgbW9kcyArPSAncydcclxuICAgIGVsc2UgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYFVua25vd24gbW9kaWZpZXIgXCIke3BhcnR9XCIgaW4ga2V5IGJpbmRpbmcgXCIke25hbWV9XCJgKVxyXG4gIH1cclxuICByZXR1cm4gYCR7Wy4uLm1vZHNdLnNvcnQoKS5qb2luKCcnKX0tJHtrZXkubGVuZ3RoID09PSAxID8ga2V5LnRvTG93ZXJDYXNlKCkgOiBrZXl9YFxyXG59XHJcblxyXG5mdW5jdGlvbiBldmVudEtleU5hbWUoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBzdHJpbmcge1xyXG4gIGxldCBtb2RzID0gJydcclxuICBpZiAoZXZlbnQuYWx0S2V5KSBtb2RzICs9ICdhJ1xyXG4gIGlmIChldmVudC5jdHJsS2V5KSBtb2RzICs9ICdjJ1xyXG4gIGlmIChldmVudC5tZXRhS2V5KSBtb2RzICs9ICdtJ1xyXG4gIGlmIChldmVudC5zaGlmdEtleSkgbW9kcyArPSAncydcclxuICBjb25zdCBrZXkgPSBldmVudC5rZXkubGVuZ3RoID09PSAxID8gZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgOiBldmVudC5rZXlcclxuICByZXR1cm4gYCR7Wy4uLm1vZHNdLnNvcnQoKS5qb2luKCcnKX0tJHtrZXl9YFxyXG59XHJcblxyXG4vKipcclxuICogQnVpbGQgYSBrZXlkb3duIGhhbmRsZXIgZnJvbSBhIGtleW1hcC4gU2luZ2xlLWNoYXJhY3RlciBiaW5kaW5ncyB3aXRoIG9ubHlcclxuICogU2hpZnQgaGVsZCBhcmUgaWdub3JlZCAodGhhdCdzIHR5cGluZywgaGFuZGxlZCBieSBiZWZvcmVpbnB1dCkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24ga2V5ZG93bkhhbmRsZXIoXHJcbiAgYmluZGluZ3M6IEtleW1hcCxcclxuICBlZGl0b3I6IEVkaXRvcixcclxuICBpc01hYzogYm9vbGVhbixcclxuKTogKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiBib29sZWFuIHtcclxuICBjb25zdCBub3JtYWxpemVkID0gbmV3IE1hcDxzdHJpbmcsIEtleUJpbmRpbmc+KClcclxuICBmb3IgKGNvbnN0IFtuYW1lLCBiaW5kaW5nXSBvZiBPYmplY3QuZW50cmllcyhiaW5kaW5ncykpIHtcclxuICAgIG5vcm1hbGl6ZWQuc2V0KG5vcm1hbGl6ZUtleU5hbWUobmFtZSwgaXNNYWMpLCBiaW5kaW5nKVxyXG4gIH1cclxuICByZXR1cm4gKGV2ZW50KSA9PiB7XHJcbiAgICBjb25zdCBiaW5kaW5nID0gbm9ybWFsaXplZC5nZXQoZXZlbnRLZXlOYW1lKGV2ZW50KSlcclxuICAgIGlmICghYmluZGluZykgcmV0dXJuIGZhbHNlXHJcbiAgICByZXR1cm4gYmluZGluZyhlZGl0b3IpXHJcbiAgfVxyXG59XHJcblxyXG4vKiogVGhlIHN0b2NrIHNob3J0Y3V0czogbWFya3MsIHVuZG8vcmVkbywgbGlzdCBpbmRlbnQuIEVudGVyL0JhY2tzcGFjZSByaWRlIG9uIGJlZm9yZWlucHV0LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gYmFzZUtleW1hcCgpOiBLZXltYXAge1xyXG4gIHJldHVybiB7XHJcbiAgICAnTW9kLWInOiAoZWRpdG9yKSA9PiBlZGl0b3IuY29tbWFuZHMudG9nZ2xlTWFyaygnYm9sZCcpLFxyXG4gICAgJ01vZC1pJzogKGVkaXRvcikgPT4gZWRpdG9yLmNvbW1hbmRzLnRvZ2dsZU1hcmsoJ2l0YWxpYycpLFxyXG4gICAgJ01vZC11JzogKGVkaXRvcikgPT4gZWRpdG9yLmNvbW1hbmRzLnRvZ2dsZU1hcmsoJ3VuZGVybGluZScpLFxyXG4gICAgJ01vZC1lJzogKGVkaXRvcikgPT4gZWRpdG9yLmNvbW1hbmRzLnRvZ2dsZU1hcmsoJ2NvZGUnKSxcclxuICAgICdNb2Qteic6IChlZGl0b3IpID0+IGVkaXRvci5jb21tYW5kcy51bmRvKCkgfHwgdHJ1ZSxcclxuICAgICdNb2QtU2hpZnQteic6IChlZGl0b3IpID0+IGVkaXRvci5jb21tYW5kcy5yZWRvKCkgfHwgdHJ1ZSxcclxuICAgICdNb2QteSc6IChlZGl0b3IpID0+IGVkaXRvci5jb21tYW5kcy5yZWRvKCkgfHwgdHJ1ZSxcclxuICAgIC8vIEluIGEgY29kZSBibG9jayB0aGVzZSBpbmRlbnQgYnkgdHdvIHNwYWNlczsgaW4gYSBsaXN0IHRoZXkgaW5kZW50IHRoZVxyXG4gICAgLy8gaXRlbTsgZWxzZXdoZXJlIHRoZXkgZmFsbCB0aHJvdWdoIHRvIHRoZSBicm93c2VyLCBzbyBUYWIgc3RpbGwgbW92ZXNcclxuICAgIC8vIGZvY3VzIG91dCBvZiB0aGUgZWRpdG9yIHRoZSB3YXkga2V5Ym9hcmQgdXNlcnMgZXhwZWN0LlxyXG4gICAgVGFiOiAoZWRpdG9yKSA9PiBlZGl0b3IuZXhlYyhpbmRlbnRJblByZWZvcm1hdHRlZCkgfHwgZWRpdG9yLmNvbW1hbmRzLnNpbmtMaXN0SXRlbSgpLFxyXG4gICAgJ1NoaWZ0LVRhYic6IChlZGl0b3IpID0+IGVkaXRvci5leGVjKG91dGRlbnRJblByZWZvcm1hdHRlZCkgfHwgZWRpdG9yLmNvbW1hbmRzLmxpZnRMaXN0SXRlbSgpLFxyXG4gICAgLy8gT3V0IG9mIGEgY29kZSBibG9jayBmcm9tIGFueXdoZXJlIGluc2lkZSBpdDsgZWxzZXdoZXJlIHRoZSBrZXkgaXMgZnJlZS5cclxuICAgICdNb2QtRW50ZXInOiAoZWRpdG9yKSA9PiBlZGl0b3IuZXhlYyhleGl0UHJlZm9ybWF0dGVkKSxcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgaW5saW5lU2l6ZSB9IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgSFRNTFNwZWMgfSBmcm9tICcuLi9tb2RlbC9zY2hlbWEnXHJcblxyXG4vKiogQW4gaW5saW5lIHJhbmdlIGluIGEgdGV4dGJsb2NrIHJlbmRlcmVkIHdpdGggYW4gZXh0cmEgY2xhc3MgKHNlYXJjaCBtYXRjaCwgXHUyMDI2KS4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBJbmxpbmVEZWNvcmF0aW9uIHtcclxuICByZWFkb25seSBmcm9tOiBudW1iZXJcclxuICByZWFkb25seSB0bzogbnVtYmVyXHJcbiAgcmVhZG9ubHkgY2xhc3NOYW1lOiBzdHJpbmdcclxuICAvKiogRXh0cmEgaW5saW5lIENTUyBvbiB0aGUgZGVjb3JhdGVkIHNwYW4gKGEgcGVyLXJhbmdlIGhpZ2hsaWdodCBjb2xvdXIsIFx1MjAyNikuICovXHJcbiAgcmVhZG9ubHkgc3R5bGU/OiBzdHJpbmdcclxuICAvKipcclxuICAgKiBFeHRyYSBhdHRyaWJ1dGVzIG9uIHRoZSBkZWNvcmF0ZWQgc3BhbiwgYGRhdGEtYCBrZXlzIGZvciBhIGZlYXR1cmUgdG9cclxuICAgKiByZWNvZ25pc2UgaXRzIG93biBzcGFucyBieSwgYHRpdGxlYCwgYHJvbGVgLlxyXG4gICAqXHJcbiAgICogQSBkZWNvcmF0aW9uIHRoYXQgY2FuIG9ubHkgc2V0IGEgY2xhc3MgbmFtZSBjYW4gYmUgc2VlbiBidXQgbm90XHJcbiAgICogaWRlbnRpZmllZDogdGhlIHBhaW50ZWQgc3BhbiBjYXJyaWVzIG5vdGhpbmcgbGlua2luZyBpdCBiYWNrIHRvIHdoYXRldmVyXHJcbiAgICogcHJvZHVjZWQgaXQsIHNvIGEgaG92ZXIgY2FyZCBvciBhIGNsaWNrIG1lbnUgaGFzIG5vIHdheSB0byBrbm93IHdoaWNoIG9mXHJcbiAgICogYSBibG9jaydzIGRlY29yYXRpb25zIHRoZSBwb2ludGVyIGlzIG92ZXIuXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgYXR0cnM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PlxyXG4gIC8qKlxyXG4gICAqIFplcm8td2lkdGggd2lkZ2V0IHJlbmRlcmVkIGF0IGBmcm9tYCAocmVxdWlyZXMgYGZyb20gPT09IHRvYCksIGUuZy4gYVxyXG4gICAqIG1hcmtlciBwaW5uZWQgdG8gb25lIHBvc2l0aW9uLiBUaGUgZWxlbWVudCBpcyB3cmFwcGVkIGluIGEgbm9uLWVkaXRhYmxlXHJcbiAgICogc3BhbiB0aGUgcG9zaXRpb24gbWFwcGVyIHNraXBzLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IHdpZGdldD86ICgpID0+IEhUTUxFbGVtZW50XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlY29yYXRpb25zRXEoXHJcbiAgYTogcmVhZG9ubHkgSW5saW5lRGVjb3JhdGlvbltdIHwgbnVsbCxcclxuICBiOiByZWFkb25seSBJbmxpbmVEZWNvcmF0aW9uW10gfCBudWxsLFxyXG4pOiBib29sZWFuIHtcclxuICBpZiAoYSA9PT0gYikgcmV0dXJuIHRydWVcclxuICBpZiAoIWEgfHwgIWIgfHwgYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2VcclxuICByZXR1cm4gYS5ldmVyeSgoZGVjb3JhdGlvbiwgaSkgPT4ge1xyXG4gICAgY29uc3Qgb3RoZXIgPSBiW2ldIGFzIElubGluZURlY29yYXRpb25cclxuICAgIHJldHVybiAoXHJcbiAgICAgIGRlY29yYXRpb24uZnJvbSA9PT0gb3RoZXIuZnJvbSAmJlxyXG4gICAgICBkZWNvcmF0aW9uLnRvID09PSBvdGhlci50byAmJlxyXG4gICAgICBkZWNvcmF0aW9uLmNsYXNzTmFtZSA9PT0gb3RoZXIuY2xhc3NOYW1lICYmXHJcbiAgICAgIGRlY29yYXRpb24uc3R5bGUgPT09IG90aGVyLnN0eWxlICYmXHJcbiAgICAgIHNhbWVBdHRycyhkZWNvcmF0aW9uLmF0dHJzLCBvdGhlci5hdHRycykgJiZcclxuICAgICAgZGVjb3JhdGlvbi53aWRnZXQgPT09IG90aGVyLndpZGdldFxyXG4gICAgKVxyXG4gIH0pXHJcbn1cclxuXHJcbi8qKiBXaGV0aGVyIHR3byBkZWNvcmF0aW9ucycgYXR0cmlidXRlIG1hcHMgd291bGQgcmVuZGVyIHRoZSBzYW1lIHNwYW4uICovXHJcbmZ1bmN0aW9uIHNhbWVBdHRycyhcclxuICBhOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiB8IHVuZGVmaW5lZCxcclxuICBiOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiB8IHVuZGVmaW5lZCxcclxuKTogYm9vbGVhbiB7XHJcbiAgaWYgKGEgPT09IGIpIHJldHVybiB0cnVlXHJcbiAgaWYgKCFhIHx8ICFiKSByZXR1cm4gZmFsc2VcclxuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoYSlcclxuICByZXR1cm4ga2V5cy5sZW5ndGggPT09IE9iamVjdC5rZXlzKGIpLmxlbmd0aCAmJiBrZXlzLmV2ZXJ5KChrZXkpID0+IGFba2V5XSA9PT0gYltrZXldKVxyXG59XHJcblxyXG4vKiogU3VwcGxpZXMgZGVjb3JhdGlvbnMgZm9yIGEgYmxvY2sgbm9kZTsgbnVsbC9lbXB0eSBtZWFucyBub25lLiAqL1xyXG5leHBvcnQgdHlwZSBEZWNvcmF0aW9uU291cmNlID0gKG5vZGU6IEVkaXRvck5vZGUpID0+IHJlYWRvbmx5IElubGluZURlY29yYXRpb25bXSB8IG51bGxcclxuXHJcbi8qKlxyXG4gKiBBIGN1c3RvbSByZW5kZXJlciBmb3Igb25lIG5vZGUgdHlwZS4gYGRvbWAgaXMgdGhlIG5vZGUncyBlbGVtZW50OyBjaGlsZHJlblxyXG4gKiByZW5kZXIgaW50byBgY29udGVudERPTWAgd2hlbiBnaXZlbiwgb3RoZXJ3aXNlIHRoZSBub2RlIGlzIGFuIG9wYXF1ZSB3aWRnZXRcclxuICogdGhlIGVkaXRvciBuZXZlciBlZGl0cyBpbnNpZGUuIGB1cGRhdGVgIHBhdGNoZXMgaW4gcGxhY2UgZm9yIGEgY2hhbmdlZCBub2RlXHJcbiAqIG9mIHRoZSBzYW1lIHR5cGUsIHJldHVybiBmYWxzZSB0byBmb3JjZSBhIHJlYnVpbGQuXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIE5vZGVWaWV3SW5zdGFuY2Uge1xyXG4gIHJlYWRvbmx5IGRvbTogSFRNTEVsZW1lbnRcclxuICByZWFkb25seSBjb250ZW50RE9NPzogSFRNTEVsZW1lbnRcclxuICB1cGRhdGU/KG5vZGU6IEVkaXRvck5vZGUpOiBib29sZWFuXHJcbiAgZGVzdHJveT8oKTogdm9pZFxyXG59XHJcblxyXG4vKiogQ3JlYXRlcyB0aGUgdmlldyBpbnN0YW5jZSBmb3IgYSBub2RlIChhZGFwdGVycyBjbG9zZSBvdmVyIHRoZWlyIGVkaXRvcikuICovXHJcbmV4cG9ydCB0eXBlIE5vZGVWaWV3Q29uc3RydWN0b3IgPSAobm9kZTogRWRpdG9yTm9kZSkgPT4gTm9kZVZpZXdJbnN0YW5jZVxyXG5cclxuLyoqXHJcbiAqIE1vZGVsIFx1MjE5MiBET00gcmVuZGVyZXIuIFN0cnVjdHVyYWwgc2hhcmluZyBpbiB0aGUgaW1tdXRhYmxlIGRvY3VtZW50IG1ha2VzXHJcbiAqIGRpZmZpbmcgY2hlYXA6IGEgY2hpbGQgdGhhdCBpcyByZWZlcmVuY2UtZXF1YWwgdG8gd2hhdCBhbiBlbGVtZW50IGFscmVhZHlcclxuICogc2hvd3MgaXMgc2tpcHBlZDsgYSBzYW1lLXR5cGUgYmxvY2sgaXMgcGF0Y2hlZCBpbiBwbGFjZTsgYW55dGhpbmcgZWxzZSBpc1xyXG4gKiByZWJ1aWx0LiBUaGUgbWFwcGluZyBmcm9tIERPTSBlbGVtZW50cyBiYWNrIHRvIG1vZGVsIG5vZGVzIGxpdmVzIGluIGFcclxuICogV2Vha01hcCBjb25zdW1lZCBieSBwb3NpdGlvbiBtYXBwaW5nIGFuZCBzZWxlY3Rpb24gc3luYy5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBET01SZW5kZXJlciB7XHJcbiAgLyoqIERPTSBlbGVtZW50L3RleHQgXHUyMTkyIHRoZSBtb2RlbCBub2RlIGl0IHJlbmRlcnMuICovXHJcbiAgcmVhZG9ubHkgbW9kZWxPZiA9IG5ldyBXZWFrTWFwPGdsb2JhbFRoaXMuTm9kZSwgRWRpdG9yTm9kZT4oKVxyXG4gIC8qKiBET00gZWxlbWVudCBcdTIxOTIgdGhlIG1vZGVsIG5vZGUgd2hvc2UgY2hpbGRyZW4gaXQgaG9sZHMgKGRpZmZlcnMgZm9yIHByZSA+IGNvZGUpLiAqL1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgY29udGVudE9mID0gbmV3IFdlYWtNYXA8Z2xvYmFsVGhpcy5Ob2RlLCBIVE1MRWxlbWVudD4oKVxyXG4gIC8qKiBCdW1wcyB3aGVuIGRlY29yYXRpb25zIGNoYW5nZSwgaW52YWxpZGF0aW5nIG90aGVyd2lzZS11bmNoYW5nZWQgYmxvY2tzLiAqL1xyXG4gIHByaXZhdGUgZXBvY2ggPSAwXHJcbiAgcHJpdmF0ZSByZWFkb25seSByZW5kZXJlZEVwb2NoID0gbmV3IFdlYWtNYXA8SFRNTEVsZW1lbnQsIG51bWJlcj4oKVxyXG4gIHByaXZhdGUgZGVjb3JhdGlvbnM6IERlY29yYXRpb25Tb3VyY2UgfCBudWxsID0gbnVsbFxyXG4gIC8qKiBEZWNvcmF0aW9ucyBlYWNoIGNvbnRlbnQgZWxlbWVudCBsYXN0IHJlbmRlcmVkIHdpdGgsIGZvciBjaGVhcCBjaGFuZ2UgY2hlY2tzLiAqL1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyZWREZWNvcmF0aW9ucyA9IG5ldyBXZWFrTWFwPEhUTUxFbGVtZW50LCByZWFkb25seSBJbmxpbmVEZWNvcmF0aW9uW10+KClcclxuICBwcml2YXRlIHJlYWRvbmx5IGluc3RhbmNlcyA9IG5ldyBXZWFrTWFwPEhUTUxFbGVtZW50LCBOb2RlVmlld0luc3RhbmNlPigpXHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBkb2N1bWVudDogRG9jdW1lbnQsXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IG5vZGVWaWV3czogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgTm9kZVZpZXdDb25zdHJ1Y3Rvcj4+ID0ge30sXHJcbiAgKSB7fVxyXG5cclxuICAvKiogSW5zdGFsbCBhIGRlY29yYXRpb24gc291cmNlIGFuZCBpbnZhbGlkYXRlIHJlbmRlcmVkIGJsb2Nrcy4gKi9cclxuICBzZXREZWNvcmF0aW9ucyhzb3VyY2U6IERlY29yYXRpb25Tb3VyY2UgfCBudWxsKTogdm9pZCB7XHJcbiAgICB0aGlzLmRlY29yYXRpb25zID0gc291cmNlXHJcbiAgICB0aGlzLmVwb2NoKytcclxuICB9XHJcblxyXG4gIC8qKiBTeW5jIHRoZSByb290IGVsZW1lbnQncyBjaGlsZHJlbiB3aXRoIHRoZSBkb2N1bWVudCBub2RlJ3MgY2hpbGRyZW4uICovXHJcbiAgcmVuZGVyRG9jKGRvYzogRWRpdG9yTm9kZSwgcm9vdDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIHRoaXMubW9kZWxPZi5zZXQocm9vdCwgZG9jKVxyXG4gICAgdGhpcy5jb250ZW50T2Yuc2V0KHJvb3QsIHJvb3QpXHJcbiAgICB0aGlzLnBhdGNoQ2hpbGRyZW4ocm9vdCwgZG9jLmNvbnRlbnQpXHJcbiAgfVxyXG5cclxuICAvKiogVGhlIGVsZW1lbnQgdGhhdCBob2xkcyBhIHJlbmRlcmVkIG5vZGUncyBjaGlsZHJlbi4gKi9cclxuICBjb250ZW50RWxlbWVudE9mKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xyXG4gICAgcmV0dXJuIHRoaXMuY29udGVudE9mLmdldChlbGVtZW50KSA/PyBlbGVtZW50XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGlzQ3VycmVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMucmVuZGVyZWRFcG9jaC5nZXQoZWxlbWVudCkgPT09IHRoaXMuZXBvY2hcclxuICB9XHJcblxyXG4gIC8qKiBUZWFyIGRvd24gbm9kZS12aWV3IGluc3RhbmNlcyBpbiBhIHN1YnRyZWUgYWJvdXQgdG8gbGVhdmUgdGhlIERPTS4gKi9cclxuICBkZXN0cm95Vmlld3MoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIHRoaXMuaW5zdGFuY2VzLmdldChlbGVtZW50KT8uZGVzdHJveT8uKClcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgWy4uLmVsZW1lbnQuY2hpbGRyZW5dKSB0aGlzLmRlc3Ryb3lWaWV3cyhjaGlsZCBhcyBIVE1MRWxlbWVudClcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVuZGVyQmxvY2sobm9kZTogRWRpdG9yTm9kZSk6IEhUTUxFbGVtZW50IHtcclxuICAgIGNvbnN0IGNvbnN0cnVjdCA9IHRoaXMubm9kZVZpZXdzW25vZGUudHlwZS5uYW1lXVxyXG4gICAgaWYgKGNvbnN0cnVjdCkge1xyXG4gICAgICBjb25zdCBpbnN0YW5jZSA9IGNvbnN0cnVjdChub2RlKVxyXG4gICAgICBjb25zdCBlbGVtZW50ID0gaW5zdGFuY2UuZG9tXHJcbiAgICAgIHRoaXMubW9kZWxPZi5zZXQoZWxlbWVudCwgbm9kZSlcclxuICAgICAgdGhpcy5jb250ZW50T2Yuc2V0KGVsZW1lbnQsIGluc3RhbmNlLmNvbnRlbnRET00gPz8gZWxlbWVudClcclxuICAgICAgdGhpcy5yZW5kZXJlZEVwb2NoLnNldChlbGVtZW50LCB0aGlzLmVwb2NoKVxyXG4gICAgICB0aGlzLmluc3RhbmNlcy5zZXQoZWxlbWVudCwgaW5zdGFuY2UpXHJcbiAgICAgIGlmIChpbnN0YW5jZS5jb250ZW50RE9NKSB7XHJcbiAgICAgICAgaWYgKG5vZGUuaXNUZXh0YmxvY2spIHRoaXMucmVuZGVySW5saW5lKGluc3RhbmNlLmNvbnRlbnRET00sIG5vZGUpXHJcbiAgICAgICAgZWxzZSBpZiAoIW5vZGUuaXNBdG9tKSB0aGlzLnBhdGNoQ2hpbGRyZW4oaW5zdGFuY2UuY29udGVudERPTSwgbm9kZS5jb250ZW50KVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIE9wYXF1ZSB3aWRnZXQ6IHRoZSBlZGl0b3IgbmV2ZXIgZWRpdHMgaW5zaWRlIGl0LlxyXG4gICAgICAgIGVsZW1lbnQuY29udGVudEVkaXRhYmxlID0gJ2ZhbHNlJ1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBlbGVtZW50XHJcbiAgICB9XHJcbiAgICBjb25zdCBzcGVjID0gbm9kZS50eXBlLnNwZWMudG9IVE1MPy4obm9kZSlcclxuICAgIGNvbnN0IGVsZW1lbnQgPSB0aGlzLmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoc3BlYz8udGFnID8/ICdkaXYnKVxyXG4gICAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHNwZWM/LmF0dHJzID8/IHt9KSkge1xyXG4gICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSlcclxuICAgIH1cclxuICAgIGxldCBjb250ZW50ID0gZWxlbWVudFxyXG4gICAgaWYgKHNwZWM/LmNoaWxkVGFnKSB7XHJcbiAgICAgIGNvbnRlbnQgPSB0aGlzLmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoc3BlYy5jaGlsZFRhZylcclxuICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZChjb250ZW50KVxyXG4gICAgfVxyXG4gICAgdGhpcy5tb2RlbE9mLnNldChlbGVtZW50LCBub2RlKVxyXG4gICAgdGhpcy5jb250ZW50T2Yuc2V0KGVsZW1lbnQsIGNvbnRlbnQpXHJcbiAgICB0aGlzLnJlbmRlcmVkRXBvY2guc2V0KGVsZW1lbnQsIHRoaXMuZXBvY2gpXHJcbiAgICBpZiAobm9kZS5pc0F0b20pIHtcclxuICAgICAgZWxlbWVudC5jb250ZW50RWRpdGFibGUgPSAnZmFsc2UnXHJcbiAgICAgIHRoaXMucmVuZGVyQXRvbUJvZHkoY29udGVudCwgc3BlYylcclxuICAgICAgcmV0dXJuIGVsZW1lbnRcclxuICAgIH1cclxuICAgIGlmIChub2RlLmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgIHRoaXMucmVuZGVySW5saW5lKGNvbnRlbnQsIG5vZGUpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnBhdGNoQ2hpbGRyZW4oY29udGVudCwgbm9kZS5jb250ZW50KVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGVsZW1lbnRcclxuICB9XHJcblxyXG4gIC8qKiBSZWJ1aWxkIGEgdGV4dGJsb2NrJ3MgaW5saW5lIERPTSwgc3BsaXR0aW5nIHJ1bnMgYXQgZGVjb3JhdGlvbiBlZGdlcy4gKi9cclxuICBwcml2YXRlIHJlbmRlcklubGluZShjb250ZW50OiBIVE1MRWxlbWVudCwgYmxvY2s6IEVkaXRvck5vZGUpOiB2b2lkIHtcclxuICAgIHdoaWxlIChjb250ZW50LmZpcnN0Q2hpbGQpIGNvbnRlbnQucmVtb3ZlQ2hpbGQoY29udGVudC5maXJzdENoaWxkKVxyXG4gICAgY29uc3QgZnJhZyA9IGJsb2NrLmNvbnRlbnRcclxuICAgIGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5kZWNvcmF0aW9ucz8uKGJsb2NrKSA/PyBbXVxyXG4gICAgdGhpcy5yZW5kZXJlZERlY29yYXRpb25zLnNldChjb250ZW50LCBkZWNvcmF0aW9ucylcclxuICAgIGNvbnN0IHJhbmdlcyA9IGRlY29yYXRpb25zLmZpbHRlcigoZGVjb3JhdGlvbikgPT4gZGVjb3JhdGlvbi50byA+IGRlY29yYXRpb24uZnJvbSlcclxuICAgIGNvbnN0IHdpZGdldHMgPSBkZWNvcmF0aW9uc1xyXG4gICAgICAuZmlsdGVyKChkZWNvcmF0aW9uKSA9PiBkZWNvcmF0aW9uLndpZGdldClcclxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEuZnJvbSAtIGIuZnJvbSlcclxuICAgIGxldCB3aWRnZXRJbmRleCA9IDBcclxuICAgIGNvbnN0IGZsdXNoV2lkZ2V0cyA9ICh1cFRvOiBudW1iZXIpOiB2b2lkID0+IHtcclxuICAgICAgd2hpbGUgKHdpZGdldEluZGV4IDwgd2lkZ2V0cy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCBkZWNvcmF0aW9uID0gd2lkZ2V0c1t3aWRnZXRJbmRleF0gYXMgSW5saW5lRGVjb3JhdGlvblxyXG4gICAgICAgIGlmIChkZWNvcmF0aW9uLmZyb20gPiB1cFRvKSBicmVha1xyXG4gICAgICAgIHdpZGdldEluZGV4KytcclxuICAgICAgICBjb25zdCB3cmFwcGVyID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJylcclxuICAgICAgICB3cmFwcGVyLmNsYXNzTmFtZSA9IGRlY29yYXRpb24uY2xhc3NOYW1lXHJcbiAgICAgICAgaWYgKGRlY29yYXRpb24uc3R5bGUpIHdyYXBwZXIuc2V0QXR0cmlidXRlKCdzdHlsZScsIGRlY29yYXRpb24uc3R5bGUpXHJcbiAgICAgICAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGRlY29yYXRpb24uYXR0cnMgPz8ge30pKSB7XHJcbiAgICAgICAgICB3cmFwcGVyLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSlcclxuICAgICAgICB9XHJcbiAgICAgICAgd3JhcHBlci5jb250ZW50RWRpdGFibGUgPSAnZmFsc2UnXHJcbiAgICAgICAgd3JhcHBlci5kYXRhc2V0LnRyZXZpeGFsV2lkZ2V0ID0gJ3RydWUnXHJcbiAgICAgICAgY29uc3QgaW5uZXIgPSBkZWNvcmF0aW9uLndpZGdldD8uKClcclxuICAgICAgICBpZiAoaW5uZXIpIHdyYXBwZXIuYXBwZW5kQ2hpbGQoaW5uZXIpXHJcbiAgICAgICAgY29udGVudC5hcHBlbmRDaGlsZCh3cmFwcGVyKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBsZXQgb2Zmc2V0ID0gMFxyXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBmcmFnLmNoaWxkcmVuKSB7XHJcbiAgICAgIGNvbnN0IHNpemUgPSBpbmxpbmVTaXplKGNoaWxkKVxyXG4gICAgICBpZiAoIWNoaWxkLmlzVGV4dCkge1xyXG4gICAgICAgIGZsdXNoV2lkZ2V0cyhvZmZzZXQpXHJcbiAgICAgICAgY29uc3Qgc3BlYyA9IGNoaWxkLnR5cGUuc3BlYy50b0hUTUw/LihjaGlsZClcclxuICAgICAgICBjb25zdCBhdG9tID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KHNwZWM/LnRhZyA/PyAnc3BhbicpXHJcbiAgICAgICAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHNwZWM/LmF0dHJzID8/IHt9KSkge1xyXG4gICAgICAgICAgYXRvbS5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChzcGVjPy5pbm5lckhUTUwgIT09IHVuZGVmaW5lZCB8fCBzcGVjPy50ZXh0KSB7XHJcbiAgICAgICAgICB0aGlzLnJlbmRlckF0b21Cb2R5KGF0b20sIHNwZWMpXHJcbiAgICAgICAgICBhdG9tLmNvbnRlbnRFZGl0YWJsZSA9ICdmYWxzZScgLy8gbGFiZWxsZWQgY2hpcHMgYXJlIG9wYXF1ZSB0byBlZGl0aW5nXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMubW9kZWxPZi5zZXQoYXRvbSwgY2hpbGQpXHJcbiAgICAgICAgY29udGVudC5hcHBlbmRDaGlsZChhdG9tKVxyXG4gICAgICAgIG9mZnNldCArPSBzaXplXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG4gICAgICBjb25zdCB0ZXh0ID0gY2hpbGQgYXMgVGV4dE5vZGVcclxuICAgICAgZm9yIChjb25zdCBbZnJvbSwgdG9dIG9mIHNlZ21lbnRSYW5nZShvZmZzZXQsIG9mZnNldCArIHNpemUsIGRlY29yYXRpb25zKSkge1xyXG4gICAgICAgIGZsdXNoV2lkZ2V0cyhmcm9tKVxyXG4gICAgICAgIGNvbnN0IHBpZWNlID0gdGV4dC5jdXQoZnJvbSAtIG9mZnNldCwgdG8gLSBvZmZzZXQpXHJcbiAgICAgICAgY29uc3QgcmVuZGVyZWQgPSB0aGlzLnJlbmRlclRleHRSdW4ocGllY2UpXHJcbiAgICAgICAgY29uc3QgY292ZXJpbmcgPSByYW5nZXMuZmlsdGVyKFxyXG4gICAgICAgICAgKGRlY29yYXRpb24pID0+IGRlY29yYXRpb24uZnJvbSA8PSBmcm9tICYmIGRlY29yYXRpb24udG8gPj0gdG8sXHJcbiAgICAgICAgKVxyXG4gICAgICAgIGlmIChjb3ZlcmluZy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICBjb25zdCBzcGFuID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJylcclxuICAgICAgICAgIHNwYW4uY2xhc3NOYW1lID0gY292ZXJpbmcubWFwKChkZWNvcmF0aW9uKSA9PiBkZWNvcmF0aW9uLmNsYXNzTmFtZSkuam9pbignICcpXHJcbiAgICAgICAgICBjb25zdCBzdHlsZSA9IGNvdmVyaW5nXHJcbiAgICAgICAgICAgIC5tYXAoKGRlY29yYXRpb24pID0+IGRlY29yYXRpb24uc3R5bGUpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgICAgICAgLmpvaW4oJzsnKVxyXG4gICAgICAgICAgaWYgKHN0eWxlKSBzcGFuLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCBzdHlsZSlcclxuICAgICAgICAgIGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBjb3ZlcmluZykge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZGVjb3JhdGlvbi5hdHRycyA/PyB7fSkpIHtcclxuICAgICAgICAgICAgICBzcGFuLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgc3Bhbi5hcHBlbmRDaGlsZChyZW5kZXJlZClcclxuICAgICAgICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQoc3BhbilcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29udGVudC5hcHBlbmRDaGlsZChyZW5kZXJlZClcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgb2Zmc2V0ICs9IHNpemVcclxuICAgIH1cclxuICAgIGZsdXNoV2lkZ2V0cyhvZmZzZXQpXHJcbiAgICBpZiAoZnJhZy5jaGlsZENvdW50ID09PSAwKSB7XHJcbiAgICAgIC8vIGNvbnRlbnRlZGl0YWJsZSBuZWVkcyBzb21ldGhpbmcgdG8gcGFyayB0aGUgY2FyZXQgaW4uXHJcbiAgICAgIGNvbnN0IGJyID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdicicpXHJcbiAgICAgIGJyLmRhdGFzZXQudHJldml4YWxQbGFjZWhvbGRlciA9ICd0cnVlJ1xyXG4gICAgICBjb250ZW50LmFwcGVuZENoaWxkKGJyKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZW5kZXJUZXh0UnVuKG5vZGU6IFRleHROb2RlKTogZ2xvYmFsVGhpcy5Ob2RlIHtcclxuICAgIGxldCByZW5kZXJlZDogZ2xvYmFsVGhpcy5Ob2RlID0gdGhpcy5kb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShub2RlLnRleHQpXHJcbiAgICB0aGlzLm1vZGVsT2Yuc2V0KHJlbmRlcmVkLCBub2RlKVxyXG4gICAgZm9yIChsZXQgaSA9IG5vZGUubWFya3MubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgY29uc3QgbWFyayA9IG5vZGUubWFya3NbaV1cclxuICAgICAgY29uc3Qgc3BlYyA9IG1hcmsudHlwZS5zcGVjLnRvSFRNTD8uKG1hcmspXHJcbiAgICAgIGlmICghc3BlYykgY29udGludWVcclxuICAgICAgY29uc3Qgd3JhcHBlciA9IHRoaXMuZG9jdW1lbnQuY3JlYXRlRWxlbWVudChzcGVjLnRhZylcclxuICAgICAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHNwZWMuYXR0cnMgPz8ge30pKSB7XHJcbiAgICAgICAgd3JhcHBlci5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpXHJcbiAgICAgIH1cclxuICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChyZW5kZXJlZClcclxuICAgICAgcmVuZGVyZWQgPSB3cmFwcGVyXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVuZGVyZWRcclxuICB9XHJcblxyXG4gIC8qKiBEaWZmIGFuIGVsZW1lbnQncyBjaGlsZHJlbiBhZ2FpbnN0IGEgYmxvY2stbGV2ZWwgZnJhZ21lbnQuICovXHJcbiAgcHJpdmF0ZSBwYXRjaENoaWxkcmVuKHBhcmVudDogSFRNTEVsZW1lbnQsIGZyYWc6IEZyYWdtZW50KTogdm9pZCB7XHJcbiAgICBjb25zdCBvbGRFbGVtZW50cyA9IFsuLi5wYXJlbnQuY2hpbGRyZW5dIGFzIEhUTUxFbGVtZW50W11cclxuICAgIGNvbnN0IG9sZE5vZGVzID0gb2xkRWxlbWVudHMubWFwKChlbGVtZW50KSA9PiB0aGlzLm1vZGVsT2YuZ2V0KGVsZW1lbnQpID8/IG51bGwpXHJcbiAgICBjb25zdCBuZXh0ID0gZnJhZy5jaGlsZHJlblxyXG5cclxuICAgIGNvbnN0IHVuY2hhbmdlZCA9IChpbmRleDogbnVtYmVyLCBuZXdJbmRleDogbnVtYmVyKTogYm9vbGVhbiA9PiB7XHJcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSBvbGRFbGVtZW50c1tpbmRleF1cclxuICAgICAgcmV0dXJuIGVsZW1lbnQgIT09IHVuZGVmaW5lZCAmJiBvbGROb2Rlc1tpbmRleF0gPT09IG5leHRbbmV3SW5kZXhdICYmIHRoaXMuaXNDdXJyZW50KGVsZW1lbnQpXHJcbiAgICB9XHJcbiAgICBsZXQgc3RhcnQgPSAwXHJcbiAgICB3aGlsZSAoc3RhcnQgPCBvbGROb2Rlcy5sZW5ndGggJiYgc3RhcnQgPCBuZXh0Lmxlbmd0aCAmJiB1bmNoYW5nZWQoc3RhcnQsIHN0YXJ0KSkgc3RhcnQrK1xyXG4gICAgbGV0IG9sZEVuZCA9IG9sZE5vZGVzLmxlbmd0aFxyXG4gICAgbGV0IG5ld0VuZCA9IG5leHQubGVuZ3RoXHJcbiAgICB3aGlsZSAob2xkRW5kID4gc3RhcnQgJiYgbmV3RW5kID4gc3RhcnQgJiYgdW5jaGFuZ2VkKG9sZEVuZCAtIDEsIG5ld0VuZCAtIDEpKSB7XHJcbiAgICAgIG9sZEVuZC0tXHJcbiAgICAgIG5ld0VuZC0tXHJcbiAgICB9XHJcblxyXG4gICAgLy8gTWlkZGxlIHNlZ21lbnQ6IHBhdGNoIGxlYWRpbmcgcGFpcnMgaW4gcGxhY2UgKHNhbWUgdHlwZSksIHRoZW5cclxuICAgIC8vIGluc2VydCBvciByZW1vdmUgdGhlIGxlbmd0aCBkaWZmZXJlbmNlIGJlZm9yZSB0aGUgY29tbW9uIHN1ZmZpeC5cclxuICAgIGNvbnN0IHNoYXJlZCA9IE1hdGgubWluKG9sZEVuZCAtIHN0YXJ0LCBuZXdFbmQgLSBzdGFydClcclxuICAgIGZvciAobGV0IGsgPSAwOyBrIDwgc2hhcmVkOyBrKyspIHtcclxuICAgICAgY29uc3QgZWxlbWVudCA9IG9sZEVsZW1lbnRzW3N0YXJ0ICsga11cclxuICAgICAgY29uc3Qgb2xkTm9kZSA9IG9sZE5vZGVzW3N0YXJ0ICsga11cclxuICAgICAgY29uc3Qgbm9kZSA9IG5leHRbc3RhcnQgKyBrXVxyXG4gICAgICBpZiAoIWVsZW1lbnQgfHwgIW5vZGUpIGNvbnRpbnVlXHJcbiAgICAgIC8vIEluLXBsYWNlIHBhdGNoaW5nIGFsc28gcmVxdWlyZXMgdGhlIHJlbmRlcmVkIHRhZyB0byBiZSBzdGFibGVcclxuICAgICAgLy8gKGEgdGFibGUgY2VsbCBmbGlwcyB0ZCBcdTIxOTQgdGggd2hlbiBpdHMgaGVhZGVyIGF0dHJpYnV0ZSBjaGFuZ2VzKTtcclxuICAgICAgLy8gbm9kZSB2aWV3cyBkZWNpZGUgZm9yIHRoZW1zZWx2ZXMgdmlhIHRoZWlyIHVwZGF0ZSgpIGhvb2suXHJcbiAgICAgIGNvbnN0IGlzVmlldyA9IHRoaXMuaW5zdGFuY2VzLmhhcyhlbGVtZW50KVxyXG4gICAgICBjb25zdCB0YWcgPSAobm9kZS50eXBlLnNwZWMudG9IVE1MPy4obm9kZSk/LnRhZyA/PyAnZGl2JykudG9VcHBlckNhc2UoKVxyXG4gICAgICBpZiAob2xkTm9kZSAmJiBvbGROb2RlLnR5cGUgPT09IG5vZGUudHlwZSAmJiAoaXNWaWV3IHx8IGVsZW1lbnQudGFnTmFtZSA9PT0gdGFnKSkge1xyXG4gICAgICAgIGlmICghdGhpcy5wYXRjaEVsZW1lbnQoZWxlbWVudCwgbm9kZSkpIHtcclxuICAgICAgICAgIHRoaXMuZGVzdHJveVZpZXdzKGVsZW1lbnQpXHJcbiAgICAgICAgICBwYXJlbnQucmVwbGFjZUNoaWxkKHRoaXMucmVuZGVyQmxvY2sobm9kZSksIGVsZW1lbnQpXHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuZGVzdHJveVZpZXdzKGVsZW1lbnQpXHJcbiAgICAgICAgcGFyZW50LnJlcGxhY2VDaGlsZCh0aGlzLnJlbmRlckJsb2NrKG5vZGUpLCBlbGVtZW50KVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBjb25zdCBzdWZmaXhBbmNob3IgPSBvbGRFbGVtZW50c1tvbGRFbmRdID8/IG51bGxcclxuICAgIGZvciAobGV0IGkgPSBzdGFydCArIHNoYXJlZDsgaSA8IG5ld0VuZDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IG5vZGUgPSBuZXh0W2ldXHJcbiAgICAgIGlmIChub2RlKSBwYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMucmVuZGVyQmxvY2sobm9kZSksIHN1ZmZpeEFuY2hvcilcclxuICAgIH1cclxuICAgIGZvciAobGV0IGkgPSBzdGFydCArIHNoYXJlZDsgaSA8IG9sZEVuZDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSBvbGRFbGVtZW50c1tpXVxyXG4gICAgICBpZiAoIWVsZW1lbnQpIGNvbnRpbnVlXHJcbiAgICAgIHRoaXMuZGVzdHJveVZpZXdzKGVsZW1lbnQpXHJcbiAgICAgIGVsZW1lbnQucmVtb3ZlKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKiBVcGRhdGUgYW4gZWxlbWVudCBpbiBwbGFjZTsgZmFsc2UgbWVhbnMgdGhlIGNhbGxlciBtdXN0IHJlYnVpbGQgaXQuICovXHJcbiAgcHJpdmF0ZSBwYXRjaEVsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQsIG5vZGU6IEVkaXRvck5vZGUpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5tb2RlbE9mLmdldChlbGVtZW50KVxyXG4gICAgY29uc3Qgd2FzQ3VycmVudCA9IHRoaXMuaXNDdXJyZW50KGVsZW1lbnQpXHJcbiAgICBpZiAocHJldmlvdXMgPT09IG5vZGUgJiYgd2FzQ3VycmVudCkgcmV0dXJuIHRydWVcclxuXHJcbiAgICBjb25zdCBpbnN0YW5jZSA9IHRoaXMuaW5zdGFuY2VzLmdldChlbGVtZW50KVxyXG4gICAgaWYgKGluc3RhbmNlKSB7XHJcbiAgICAgIGlmICghaW5zdGFuY2UudXBkYXRlIHx8ICFpbnN0YW5jZS51cGRhdGUobm9kZSkpIHJldHVybiBmYWxzZVxyXG4gICAgICB0aGlzLm1vZGVsT2Yuc2V0KGVsZW1lbnQsIG5vZGUpXHJcbiAgICAgIHRoaXMucmVuZGVyZWRFcG9jaC5zZXQoZWxlbWVudCwgdGhpcy5lcG9jaClcclxuICAgICAgaWYgKGluc3RhbmNlLmNvbnRlbnRET00gJiYgIW5vZGUuaXNBdG9tKSB7XHJcbiAgICAgICAgaWYgKG5vZGUuaXNUZXh0YmxvY2spIHtcclxuICAgICAgICAgIGlmICh0aGlzLmlubGluZU5lZWRzUmVuZGVyKGluc3RhbmNlLmNvbnRlbnRET00sIHByZXZpb3VzLCB3YXNDdXJyZW50LCBub2RlKSkge1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcklubGluZShpbnN0YW5jZS5jb250ZW50RE9NLCBub2RlKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLnBhdGNoQ2hpbGRyZW4oaW5zdGFuY2UuY29udGVudERPTSwgbm9kZS5jb250ZW50KVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNwZWMgPSBub2RlLnR5cGUuc3BlYy50b0hUTUw/Lihub2RlKVxyXG4gICAgY29uc3QgbmV4dEF0dHJzID0gc3BlYz8uYXR0cnMgPz8ge31cclxuICAgIGlmIChwcmV2aW91cykge1xyXG4gICAgICAvLyBEcm9wIGF0dHJpYnV0ZXMgdGhlIHByZXZpb3VzIHJlbmRlciBlbWl0dGVkIHRoYXQgdGhlIG5ldyBvbmUgZG9lc24ndC5cclxuICAgICAgY29uc3Qgb2xkQXR0cnMgPSBwcmV2aW91cy50eXBlLnNwZWMudG9IVE1MPy4ocHJldmlvdXMpPy5hdHRycyA/PyB7fVxyXG4gICAgICBmb3IgKGNvbnN0IG5hbWUgb2YgT2JqZWN0LmtleXMob2xkQXR0cnMpKSB7XHJcbiAgICAgICAgaWYgKCEobmFtZSBpbiBuZXh0QXR0cnMpKSBlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZShuYW1lKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobmV4dEF0dHJzKSkge1xyXG4gICAgICAvLyBPbmx5IHdoZW4gaXQgZGlmZmVycy4gQXNzaWduaW5nIGFuIGF0dHJpYnV0ZSB0aGUgdmFsdWUgaXQgYWxyZWFkeSBoYXNcclxuICAgICAgLy8gaXMgc3RpbGwgYSB3cml0ZTogaXQgaW52YWxpZGF0ZXMgc3R5bGUsIGl0IHNob3dzIHVwIGFzIGEgbXV0YXRpb24gdG9cclxuICAgICAgLy8gYW55dGhpbmcgb2JzZXJ2aW5nLCBhbmQgb24gYW4gYDxpZnJhbWU+YCBhc3NpZ25pbmcgYHNyY2AgcmVsb2FkcyB0aGVcclxuICAgICAgLy8gZnJhbWUsIHNvIGFuIGVtYmVkZGVkIHZpZGVvIHJlc3RhcnRlZCBldmVyeSB0aW1lIGFueXRoaW5nIHJlLXJlbmRlcmVkXHJcbiAgICAgIC8vIHRoZSBkb2N1bWVudCwgd2hpY2ggYSBkZWNvcmF0aW9uIGxheWVyIGRvZXMgb24gYSB0aW1lci4gVGhhdCBpcyB3aGF0IGFcclxuICAgICAgLy8gcmVhZGVyIHNlZXMgYXMgdGhlIHBhZ2UgYmxpbmtpbmcuXHJcbiAgICAgIGlmIChlbGVtZW50LmdldEF0dHJpYnV0ZShuYW1lKSAhPT0gdmFsdWUpIGVsZW1lbnQuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKVxyXG4gICAgfVxyXG4gICAgdGhpcy5tb2RlbE9mLnNldChlbGVtZW50LCBub2RlKVxyXG4gICAgdGhpcy5yZW5kZXJlZEVwb2NoLnNldChlbGVtZW50LCB0aGlzLmVwb2NoKVxyXG4gICAgY29uc3QgY29udGVudCA9IHRoaXMuY29udGVudEVsZW1lbnRPZihlbGVtZW50KVxyXG4gICAgaWYgKG5vZGUuaXNBdG9tKSB7XHJcbiAgICAgIC8vIEFuIGF0b20ncyBib2R5IGNvbWVzIGZyb20gaXRzIHNwZWMsIHNvIGl0IGNoYW5nZXMgb25seSB3aXRoIGl0cyBhdHRycy5cclxuICAgICAgY29uc3QgcHJldmlvdXNTcGVjID0gcHJldmlvdXMgPyBwcmV2aW91cy50eXBlLnNwZWMudG9IVE1MPy4ocHJldmlvdXMpIDogdW5kZWZpbmVkXHJcbiAgICAgIGlmIChzcGVjPy5pbm5lckhUTUwgIT09IHByZXZpb3VzU3BlYz8uaW5uZXJIVE1MIHx8IHNwZWM/LnRleHQgIT09IHByZXZpb3VzU3BlYz8udGV4dCkge1xyXG4gICAgICAgIHRoaXMucmVuZGVyQXRvbUJvZHkoY29udGVudCwgc3BlYylcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChub2RlLmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgIGlmICh0aGlzLmlubGluZU5lZWRzUmVuZGVyKGNvbnRlbnQsIHByZXZpb3VzLCB3YXNDdXJyZW50LCBub2RlKSkge1xyXG4gICAgICAgIHRoaXMucmVuZGVySW5saW5lKGNvbnRlbnQsIG5vZGUpXHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMucGF0Y2hDaGlsZHJlbihjb250ZW50LCBub2RlLmNvbnRlbnQpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgLyoqIEZpbGwgYW4gYXRvbSdzIGVsZW1lbnQgZnJvbSBpdHMgc3BlYzogdHJ1c3RlZCBtYXJrdXAsIG9yIGEgdGV4dCBsYWJlbC4gKi9cclxuICBwcml2YXRlIHJlbmRlckF0b21Cb2R5KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzcGVjOiBIVE1MU3BlYyB8IHVuZGVmaW5lZCk6IHZvaWQge1xyXG4gICAgaWYgKHNwZWM/LmlubmVySFRNTCAhPT0gdW5kZWZpbmVkKSBlbGVtZW50LmlubmVySFRNTCA9IHNwZWMuaW5uZXJIVE1MXHJcbiAgICBlbHNlIGlmIChzcGVjPy50ZXh0ICE9PSB1bmRlZmluZWQpIGVsZW1lbnQudGV4dENvbnRlbnQgPSBzcGVjLnRleHRcclxuICAgIC8vIEEgc3BlYyB0aGF0IHN0b3BwZWQgb2ZmZXJpbmcgYSBib2R5IG1lYW5zIHRoZSBhdG9tIG5vIGxvbmdlciBoYXMgb25lO1xyXG4gICAgLy8gbGVhdmluZyB0aGUgcHJldmlvdXMgcmVuZGVyIGluIHBsYWNlIHdvdWxkIHNob3cgYSBzdGFsZSBsYWJlbC5cclxuICAgIGVsc2UgZWxlbWVudC50ZXh0Q29udGVudCA9ICcnXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBIHRleHRibG9jaydzIGlubGluZSBET00gbXVzdCBiZSByZWJ1aWx0IHdoZW4gaXRzIGNvbnRlbnQgY2hhbmdlZCwgb3JcclxuICAgKiB3aGVuIHRoZSBkZWNvcmF0aW9ucyBpdCByZW5kZXJzIHdpdGggY2hhbmdlZCwgZWl0aGVyIGZyb20gYW4gZXBvY2ggYnVtcFxyXG4gICAqIG9yIGJlY2F1c2UgdGhpcyBub2RlIGl0c2VsZiBpcyBkaWZmZXJlbnQuIEEgZGVjb3JhdGlvbiBzb3VyY2UgbWF5IGtleSBvZmZcclxuICAgKiBhIG5vZGUncyBhdHRyaWJ1dGVzIChhIGNvZGUgYmxvY2sncyBgbGFuZ3VhZ2VgLCBzYXkpLCBzbyBpZGVudGljYWxcclxuICAgKiBjb250ZW50IGlzIG5vdCBvbiBpdHMgb3duIGVub3VnaCB0byByZXVzZSB0aGUgcmVuZGVyZWQgaW5saW5lIERPTS5cclxuICAgKi9cclxuICBwcml2YXRlIGlubGluZU5lZWRzUmVuZGVyKFxyXG4gICAgY29udGVudDogSFRNTEVsZW1lbnQsXHJcbiAgICBwcmV2aW91czogRWRpdG9yTm9kZSB8IG51bGwgfCB1bmRlZmluZWQsXHJcbiAgICB3YXNDdXJyZW50OiBib29sZWFuLFxyXG4gICAgbm9kZTogRWRpdG9yTm9kZSxcclxuICApOiBib29sZWFuIHtcclxuICAgIGlmICghcHJldmlvdXMgfHwgIXByZXZpb3VzLmNvbnRlbnQuZXEobm9kZS5jb250ZW50KSkgcmV0dXJuIHRydWVcclxuICAgIC8vIFNhbWUgbm9kZSBvYmplY3QgYW5kIGEgY3VycmVudCBlcG9jaDogbm90aGluZyBjYW4gaGF2ZSBjaGFuZ2VkLlxyXG4gICAgaWYgKHdhc0N1cnJlbnQgJiYgcHJldmlvdXMgPT09IG5vZGUpIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3QgbmV4dCA9IHRoaXMuZGVjb3JhdGlvbnM/Lihub2RlKSA/PyBbXVxyXG4gICAgcmV0dXJuICFkZWNvcmF0aW9uc0VxKHRoaXMucmVuZGVyZWREZWNvcmF0aW9ucy5nZXQoY29udGVudCkgPz8gW10sIG5leHQpXHJcbiAgfVxyXG59XHJcblxyXG4vKiogQ3V0IFtmcm9tLCB0bykgYXQgZXZlcnkgZGVjb3JhdGlvbiBib3VuZGFyeSB0aGF0IGZhbGxzIGluc2lkZSBpdC4gKi9cclxuZnVuY3Rpb24gc2VnbWVudFJhbmdlKFxyXG4gIGZyb206IG51bWJlcixcclxuICB0bzogbnVtYmVyLFxyXG4gIGRlY29yYXRpb25zOiByZWFkb25seSBJbmxpbmVEZWNvcmF0aW9uW10sXHJcbik6IFtudW1iZXIsIG51bWJlcl1bXSB7XHJcbiAgY29uc3QgY3V0cyA9IG5ldyBTZXQ8bnVtYmVyPihbZnJvbSwgdG9dKVxyXG4gIGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBkZWNvcmF0aW9ucykge1xyXG4gICAgaWYgKGRlY29yYXRpb24uZnJvbSA+IGZyb20gJiYgZGVjb3JhdGlvbi5mcm9tIDwgdG8pIGN1dHMuYWRkKGRlY29yYXRpb24uZnJvbSlcclxuICAgIGlmIChkZWNvcmF0aW9uLnRvID4gZnJvbSAmJiBkZWNvcmF0aW9uLnRvIDwgdG8pIGN1dHMuYWRkKGRlY29yYXRpb24udG8pXHJcbiAgfVxyXG4gIGNvbnN0IHNvcnRlZCA9IFsuLi5jdXRzXS5zb3J0KChhLCBiKSA9PiBhIC0gYilcclxuICBjb25zdCBzZWdtZW50czogW251bWJlciwgbnVtYmVyXVtdID0gW11cclxuICBmb3IgKGxldCBpID0gMDsgaSA8IHNvcnRlZC5sZW5ndGggLSAxOyBpKyspIHtcclxuICAgIHNlZ21lbnRzLnB1c2goW3NvcnRlZFtpXSBhcyBudW1iZXIsIHNvcnRlZFtpICsgMV0gYXMgbnVtYmVyXSlcclxuICB9XHJcbiAgcmV0dXJuIHNlZ21lbnRzXHJcbn1cclxuIiwgImltcG9ydCB7IHR5cGUgQW5ub3VuY2VyLCBjcmVhdGVBbm5vdW5jZXIsIGRlc2NyaWJlRG9jQ2hhbmdlIH0gZnJvbSAnLi4vYTExeS9hbm5vdW5jZSdcclxuaW1wb3J0IHtcclxuICB0eXBlIENvbW1hbmQsXHJcbiAgY2hhaW5Db21tYW5kcyxcclxuICBkZWxldGVCYWNrd2FyZEluUHJlZm9ybWF0dGVkLFxyXG4gIGRlbGV0ZUNoYXJCYWNrd2FyZCxcclxuICBkZWxldGVDaGFyRm9yd2FyZCxcclxuICBkZWxldGVTZWxlY3Rpb24sXHJcbiAgaW5zZXJ0Q29udGVudCxcclxuICBpbnNlcnRJbmxpbmVOb2RlLFxyXG4gIGluc2VydE5ld2xpbmVJblByZWZvcm1hdHRlZCxcclxuICBpbnNlcnRUZXh0LFxyXG4gIHNldE1hcmssXHJcbiAgc3BsaXRCbG9jayxcclxuICBzcGxpdEJsb2NrSW5QcmVmb3JtYXR0ZWQsXHJcbiAgdG9nZ2xlTWFyayxcclxuICB0eXBlSW5QcmVmb3JtYXR0ZWQsXHJcbn0gZnJvbSAnLi4vY29tbWFuZHMvY29tbWFuZHMnXHJcbmltcG9ydCB7IGxpbmtpZnlUZXh0IH0gZnJvbSAnLi4vY29tbWFuZHMvbGlua3MnXHJcbmltcG9ydCB7IHNldFRhc2tDaGVja2VkLCBzcGxpdExpc3RJdGVtIH0gZnJvbSAnLi4vY29tbWFuZHMvbGlzdHMnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvcidcclxuaW1wb3J0IHsgdHlwZSBJbnB1dFJ1bGUsIGFwcGx5SW5wdXRSdWxlcywgZGVmYXVsdElucHV0UnVsZXMgfSBmcm9tICcuLi9pbnB1dC1ydWxlcy9pbnB1dC1ydWxlcydcclxuaW1wb3J0IHsgYmxvY2tzSW5SYW5nZSB9IGZyb20gJy4uL21vZGVsL2Jsb2NrcydcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHtcclxuICBpbmxpbmVMZW5ndGgsXHJcbiAgaW5saW5lT2Zmc2V0RnJvbVRleHQsXHJcbiAgbWFya3NBdElubGluZU9mZnNldCxcclxuICBzbGljZUlubGluZSxcclxufSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB7IG5vZGVGcm9tSlNPTiB9IGZyb20gJy4uL21vZGVsL2pzb24nXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IHBvcyB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgeyBub2RlQXRQYXRoIH0gZnJvbSAnLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHsgc2FmZUhyZWYgfSBmcm9tICcuLi9zY2hlbWEvYmFzaWMnXHJcbmltcG9ydCB0eXBlIHsgU2VhcmNoTWF0Y2ggfSBmcm9tICcuLi9zZWFyY2gvZmluZC1yZXBsYWNlJ1xyXG5pbXBvcnQgeyBzZXJpYWxpemVUb0hUTUwgfSBmcm9tICcuLi9zZXJpYWxpemUvaHRtbCdcclxuaW1wb3J0IHsgcGFyc2VIVE1MIH0gZnJvbSAnLi4vc2VyaWFsaXplL3BhcnNlLWh0bWwnXHJcbmltcG9ydCB7IGNsZWFuUGFzdGVkSFRNTCB9IGZyb20gJy4uL3NlcmlhbGl6ZS9wYXN0ZS1zb3VyY2UnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yU3RhdGUgfSBmcm9tICcuLi9zdGF0ZS9lZGl0b3Itc3RhdGUnXHJcbmltcG9ydCB7IFRleHRTZWxlY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS9zZWxlY3Rpb24nXHJcbmltcG9ydCB7IFJlcGxhY2VJbmxpbmVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1pbmxpbmUnXHJcbmltcG9ydCB7IGRvbVBvaW50RnJvbVBvc2l0aW9uLCBwYXRoT2ZFbGVtZW50LCBwb3NpdGlvbkZyb21ET01Qb2ludCB9IGZyb20gJy4vZG9tLXBvaW50J1xyXG5pbXBvcnQgeyB0eXBlIEtleW1hcCwgYmFzZUtleW1hcCwga2V5ZG93bkhhbmRsZXIgfSBmcm9tICcuL2tleW1hcCdcclxuaW1wb3J0IHtcclxuICBET01SZW5kZXJlcixcclxuICB0eXBlIERlY29yYXRpb25Tb3VyY2UsXHJcbiAgdHlwZSBJbmxpbmVEZWNvcmF0aW9uLFxyXG4gIHR5cGUgTm9kZVZpZXdJbnN0YW5jZSxcclxufSBmcm9tICcuL3JlbmRlcmVyJ1xyXG5cclxuY29uc3QgVFJFVklYQUxfTUlNRSA9ICdhcHBsaWNhdGlvbi94LXRyZXZpeGFsK2pzb24nXHJcblxyXG4vKiogQSBwYXN0ZWQgc3RyaW5nIHRoYXQgaXMgb25lIFVSTCBhbmQgbm90aGluZyBlbHNlLiAqL1xyXG5jb25zdCBCQVJFX1VSTCA9IC9eKD86aHR0cHM/OlxcL1xcL3x3d3dcXC4pW15cXHM8PlwiJ2BdezIsMjAwMH0kL2lcclxuXHJcbi8qKiBDcmVhdGVzIHRoZSBjdXN0b20gdmlldyBmb3Igb25lIG5vZGUgdHlwZS4gKi9cclxuZXhwb3J0IHR5cGUgTm9kZVZpZXdGYWN0b3J5ID0gKG5vZGU6IEVkaXRvck5vZGUsIGVkaXRvcjogRWRpdG9yKSA9PiBOb2RlVmlld0luc3RhbmNlXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRvclZpZXdPcHRpb25zIHtcclxuICByZWFkb25seSBhdXRvZm9jdXM/OiBib29sZWFuXHJcbiAgLyoqIEV4dHJhIGtleSBiaW5kaW5nczsgdGhleSB3aW4gb3ZlciB0aGUgYmFzZSBrZXltYXAuICovXHJcbiAgcmVhZG9ubHkga2V5bWFwPzogS2V5bWFwXHJcbiAgLyoqIFRleHQgc2hvd24gd2hpbGUgdGhlIGRvY3VtZW50IGlzIGVtcHR5LiAqL1xyXG4gIHJlYWRvbmx5IHBsYWNlaG9sZGVyPzogc3RyaW5nXHJcbiAgLyoqXHJcbiAgICogQWNjZXNzaWJsZSBuYW1lIGZvciB0aGUgZWRpdGluZyBzdXJmYWNlLiBJdCBjYXJyaWVzIGByb2xlPVwidGV4dGJveFwiYCwgYW5kXHJcbiAgICogYSB0ZXh0Ym94IHdpdGhvdXQgYSBuYW1lIGlzIGFubm91bmNlZCBhcyBhbiB1bmxhYmVsbGVkIGVkaXQgZmllbGQuIFRoZVxyXG4gICAqIHJlYWRlciBjYW4gdGVsbCB5b3UgYXJlIGluIG9uZSwgYnV0IG5vdCB3aGF0IGl0IGlzIGZvci4gRGVmYXVsdHMgdG9cclxuICAgKiBcIkRvY3VtZW50XCI7IGdpdmUgaXQgdGhlIG5hbWUgb2YgdGhlIHRoaW5nIGJlaW5nIGVkaXRlZCB3aGVyZSB5b3UgY2FuLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IGFyaWFMYWJlbD86IHN0cmluZ1xyXG4gIC8qKiBTdGFydCByZWFkLW9ubHkuIEZsaXAgYXQgcnVudGltZSB3aXRoIHtAbGluayBFZGl0b3JWaWV3LnNldEVkaXRhYmxlfS4gKi9cclxuICByZWFkb25seSBlZGl0YWJsZT86IGJvb2xlYW5cclxuICAvKiogQnJvd3NlciBzcGVsbCBjaGVja2luZzsgdGhlIGJyb3dzZXIncyBkZWZhdWx0IHdoZW4gb21pdHRlZC4gKi9cclxuICByZWFkb25seSBzcGVsbGNoZWNrPzogYm9vbGVhblxyXG4gIC8qKiBSZXBsYWNlcyB0aGUgZGVmYXVsdCBtYXJrZG93bi1zdHlsZSBpbnB1dCBydWxlcyB3aGVuIHByb3ZpZGVkLiAqL1xyXG4gIHJlYWRvbmx5IGlucHV0UnVsZXM/OiByZWFkb25seSBJbnB1dFJ1bGVbXVxyXG4gIC8qKiBDdXN0b20gcmVuZGVyZXJzIHBlciBub2RlIHR5cGUgKGZyYW1ld29yayBjb21wb25lbnRzIGluIHRoZSBkb2N1bWVudCkuICovXHJcbiAgcmVhZG9ubHkgbm9kZVZpZXdzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgTm9kZVZpZXdGYWN0b3J5Pj5cclxuICAvKipcclxuICAgKiBBbm5vdW5jZSBzdHJ1Y3R1cmFsIGVkaXRzOiBibG9ja3MgZGVsZXRlZCwgdGhlIGJsb2NrIHVuZGVyIHRoZSBjYXJldFxyXG4gICAqIGJlY29taW5nIGEgZGlmZmVyZW50IGtpbmQsIHRvIGFzc2lzdGl2ZSB0ZWNobm9sb2d5IHRocm91Z2ggYSBsaXZlXHJcbiAgICogcmVnaW9uLiBPbiBieSBkZWZhdWx0OiBhIHJlYWRlciBhbHJlYWR5IHJlcG9ydHMgdHlwZWQgY2hhcmFjdGVycyBmcm9tIHRoZVxyXG4gICAqIERPTSwgYnV0IG5vdCBhIGtleSBwcmVzcyB0aGF0IHJlbW92ZWQgdGhyZWUgcGFyYWdyYXBocywgYW5kIHNpbGVuY2UgYWZ0ZXJcclxuICAgKiBhIGRlc3RydWN0aXZlIGVkaXQgaXMgdGhlIHdvcnN0IHRoaW5nIHRoaXMgc3VyZmFjZSBjYW4gZG8uIFBhc3MgYGZhbHNlYFxyXG4gICAqIHdoZW4gdGhlIGhvc3QgcHJvdmlkZXMgaXRzIG93biBsaXZlIHJlZ2lvbi5cclxuICAgKi9cclxuICByZWFkb25seSBhbm5vdW5jZT86IGJvb2xlYW5cclxufVxyXG5cclxuZnVuY3Rpb24gZGV0ZWN0TWFjKCk6IGJvb2xlYW4ge1xyXG4gIGlmICh0eXBlb2YgbmF2aWdhdG9yID09PSAndW5kZWZpbmVkJykgcmV0dXJuIGZhbHNlXHJcbiAgY29uc3QgcGxhdGZvcm0gPSBuYXZpZ2F0b3IucGxhdGZvcm0gPz8gJydcclxuICByZXR1cm4gL01hY3xpUChob25lfGFkfG9kKS8udGVzdChwbGF0Zm9ybSB8fCBuYXZpZ2F0b3IudXNlckFnZW50IHx8ICcnKVxyXG59XHJcblxyXG4vKipcclxuICogVGhlIGNvbnRlbnRlZGl0YWJsZSB2aWV3LiBUaGUgRE9NIGlzIGEgcmVuZGVyIHRhcmdldCBhbmQgaW5wdXQgc291cmNlIG9ubHk6XHJcbiAqIGBiZWZvcmVpbnB1dGAgaW50ZW50cyBhcmUgaW50ZXJjZXB0ZWQgYW5kIHR1cm5lZCBpbnRvIGNvbW1hbmRzOyBJTUVcclxuICogY29tcG9zaXRpb24gbGV0cyB0aGUgRE9NIGxlYWQsIHRoZW4gcmVjb25jaWxlcyBhdCBgY29tcG9zaXRpb25lbmRgOyBhXHJcbiAqIE11dGF0aW9uT2JzZXJ2ZXIgcmVwYWlycyBhbnl0aGluZyB1bmV4cGVjdGVkIGJhY2sgaW50byB0aGUgbW9kZWwuXHJcbiAqL1xyXG4vKiogYE5vZGUuVEVYVF9OT0RFYCwgd2l0aG91dCByZWFjaGluZyBmb3IgdGhlIERPTSBjb25zdGFudCBhdCBydW50aW1lLiAqL1xyXG5jb25zdCBURVhUX05PREUgPSAzXHJcblxyXG5leHBvcnQgY2xhc3MgRWRpdG9yVmlldyB7XHJcbiAgcmVhZG9ubHkgZG9tOiBIVE1MRWxlbWVudFxyXG4gIC8qKiBBZHZhbmNlZCBBUEk6IHRoZSByZW5kZXJlcidzIERPTVx1MjE5NG1vZGVsIG1hcHBpbmcsIHVzZWQgYnkgYWRhcHRlcnMuICovXHJcbiAgcmVhZG9ubHkgcmVuZGVyZXI6IERPTVJlbmRlcmVyXHJcbiAgcHJpdmF0ZSByZWFkb25seSBkb2N1bWVudDogRG9jdW1lbnRcclxuICBwcml2YXRlIHJlYWRvbmx5IGhhbmRsZUtleTogKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiBib29sZWFuXHJcbiAgcHJpdmF0ZSByZWFkb25seSB1bnN1YnNjcmliZTogKCkgPT4gdm9pZFxyXG4gIHByaXZhdGUgcmVhZG9ubHkgaW5wdXRSdWxlczogcmVhZG9ubHkgSW5wdXRSdWxlW11cclxuICBwcml2YXRlIHJlYWRvbmx5IHBsYWNlaG9sZGVyOiBzdHJpbmcgfCBudWxsXHJcbiAgcHJpdmF0ZSBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSBjb21wb3NpbmcgPSBmYWxzZVxyXG4gIHByaXZhdGUgdXBkYXRpbmdET00gPSBmYWxzZVxyXG4gIHByaXZhdGUgZGVzdHJveWVkID0gZmFsc2VcclxuICBwcml2YXRlIGVkaXRhYmxlID0gdHJ1ZVxyXG4gIHByaXZhdGUgcGFzdGVQbGFpbk9uY2UgPSBmYWxzZVxyXG4gIHByaXZhdGUgaGlnaGxpZ2h0czogcmVhZG9ubHkgU2VhcmNoTWF0Y2hbXSA9IFtdXHJcbiAgcHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uTGF5ZXJzID0gbmV3IE1hcDxzdHJpbmcsIERlY29yYXRpb25Tb3VyY2U+KClcclxuICBwcml2YXRlIHJlYWRvbmx5IGtleWRvd25JbnRlcmNlcHRvcnMgPSBuZXcgU2V0PChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4gYm9vbGVhbj4oKVxyXG4gIHByaXZhdGUgcmVhZG9ubHkgYW5ub3VuY2VyOiBBbm5vdW5jZXIgfCBudWxsXHJcbiAgcHJpdmF0ZSByZWFkb25seSBzdG9wQW5ub3VuY2luZzogKCgpID0+IHZvaWQpIHwgbnVsbFxyXG5cclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IGVkaXRvcjogRWRpdG9yLFxyXG4gICAgcGxhY2U6IEhUTUxFbGVtZW50LFxyXG4gICAgb3B0aW9uczogRWRpdG9yVmlld09wdGlvbnMgPSB7fSxcclxuICApIHtcclxuICAgIHRoaXMuZG9jdW1lbnQgPSBwbGFjZS5vd25lckRvY3VtZW50XHJcbiAgICB0aGlzLmRvbSA9IHRoaXMuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcclxuICAgIHRoaXMuZG9tLmNsYXNzTmFtZSA9ICd0cmV2aXhhbC1jb250ZW50J1xyXG4gICAgdGhpcy5kb20uc2V0QXR0cmlidXRlKCdyb2xlJywgJ3RleHRib3gnKVxyXG4gICAgdGhpcy5kb20uc2V0QXR0cmlidXRlKCdhcmlhLW11bHRpbGluZScsICd0cnVlJylcclxuICAgIHRoaXMuZG9tLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG9wdGlvbnMuYXJpYUxhYmVsID8/ICdEb2N1bWVudCcpXHJcbiAgICBjb25zdCBjb25zdHJ1Y3RvcnM6IFJlY29yZDxzdHJpbmcsIChub2RlOiBFZGl0b3JOb2RlKSA9PiBOb2RlVmlld0luc3RhbmNlPiA9IHt9XHJcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBmYWN0b3J5XSBvZiBPYmplY3QuZW50cmllcyhvcHRpb25zLm5vZGVWaWV3cyA/PyB7fSkpIHtcclxuICAgICAgY29uc3RydWN0b3JzW25hbWVdID0gKG5vZGUpID0+IGZhY3Rvcnkobm9kZSwgZWRpdG9yKVxyXG4gICAgfVxyXG4gICAgdGhpcy5yZW5kZXJlciA9IG5ldyBET01SZW5kZXJlcih0aGlzLmRvY3VtZW50LCBjb25zdHJ1Y3RvcnMpXHJcbiAgICBpZiAoIWVkaXRvci52aWV3KSBlZGl0b3IudmlldyA9IHRoaXNcclxuICAgIHRoaXMuaW5wdXRSdWxlcyA9IG9wdGlvbnMuaW5wdXRSdWxlcyA/PyBkZWZhdWx0SW5wdXRSdWxlcygpXHJcbiAgICB0aGlzLmFubm91bmNlciA9XHJcbiAgICAgIG9wdGlvbnMuYW5ub3VuY2UgPT09IGZhbHNlID8gbnVsbCA6IGNyZWF0ZUFubm91bmNlcih0aGlzLmRvY3VtZW50LCB7IGNvbnRhaW5lcjogcGxhY2UgfSlcclxuICAgIHRoaXMuc3RvcEFubm91bmNpbmcgPSB0aGlzLmFubm91bmNlciA/IHRoaXMud2F0Y2hGb3JBbm5vdW5jZW1lbnRzKHRoaXMuYW5ub3VuY2VyKSA6IG51bGxcclxuICAgIHRoaXMucGxhY2Vob2xkZXIgPSBvcHRpb25zLnBsYWNlaG9sZGVyID8/IG51bGxcclxuICAgIGlmICh0aGlzLnBsYWNlaG9sZGVyKSB0aGlzLmRvbS5kYXRhc2V0LnRyZXZpeGFsUGxhY2Vob2xkZXIgPSB0aGlzLnBsYWNlaG9sZGVyXHJcbiAgICBwbGFjZS5hcHBlbmRDaGlsZCh0aGlzLmRvbSlcclxuICAgIHRoaXMuc2V0RWRpdGFibGUob3B0aW9ucy5lZGl0YWJsZSAhPT0gZmFsc2UpXHJcbiAgICBpZiAob3B0aW9ucy5zcGVsbGNoZWNrICE9PSB1bmRlZmluZWQpIHRoaXMuc2V0U3BlbGxjaGVjayhvcHRpb25zLnNwZWxsY2hlY2spXHJcblxyXG4gICAgdGhpcy5oYW5kbGVLZXkgPSBrZXlkb3duSGFuZGxlcihcclxuICAgICAge1xyXG4gICAgICAgIC4uLmJhc2VLZXltYXAoKSxcclxuICAgICAgICAnTW9kLVNoaWZ0LXYnOiAoKSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBhc3RlUGxhaW5PbmNlID0gdHJ1ZVxyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlIC8vIGxldCB0aGUgbmF0aXZlIHBhc3RlIHByb2NlZWQ7IG9uUGFzdGUgcGlja3MgdXAgdGhlIGZsYWdcclxuICAgICAgICB9LFxyXG4gICAgICAgIC4uLihvcHRpb25zLmtleW1hcCA/PyB7fSksXHJcbiAgICAgIH0sXHJcbiAgICAgIGVkaXRvcixcclxuICAgICAgZGV0ZWN0TWFjKCksXHJcbiAgICApXHJcblxyXG4gICAgdGhpcy5kb20uYWRkRXZlbnRMaXN0ZW5lcignYmVmb3JlaW5wdXQnLCB0aGlzLm9uQmVmb3JlSW5wdXQgYXMgRXZlbnRMaXN0ZW5lcilcclxuICAgIHRoaXMuZG9tLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMub25Nb3VzZURvd24gYXMgRXZlbnRMaXN0ZW5lcilcclxuICAgIHRoaXMuZG9tLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLm9uS2V5RG93bilcclxuICAgIHRoaXMuZG9tLmFkZEV2ZW50TGlzdGVuZXIoJ2NvbXBvc2l0aW9uc3RhcnQnLCB0aGlzLm9uQ29tcG9zaXRpb25TdGFydClcclxuICAgIHRoaXMuZG9tLmFkZEV2ZW50TGlzdGVuZXIoJ2NvbXBvc2l0aW9uZW5kJywgdGhpcy5vbkNvbXBvc2l0aW9uRW5kKVxyXG4gICAgdGhpcy5kb20uYWRkRXZlbnRMaXN0ZW5lcignY29weScsIHRoaXMub25Db3B5IGFzIEV2ZW50TGlzdGVuZXIpXHJcbiAgICB0aGlzLmRvbS5hZGRFdmVudExpc3RlbmVyKCdjdXQnLCB0aGlzLm9uQ3V0IGFzIEV2ZW50TGlzdGVuZXIpXHJcbiAgICB0aGlzLmRvbS5hZGRFdmVudExpc3RlbmVyKCdwYXN0ZScsIHRoaXMub25QYXN0ZSBhcyBFdmVudExpc3RlbmVyKVxyXG4gICAgdGhpcy5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdzZWxlY3Rpb25jaGFuZ2UnLCB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKVxyXG5cclxuICAgIGlmICh0eXBlb2YgTXV0YXRpb25PYnNlcnZlciAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgdGhpcy5vYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKHRoaXMub25NdXRhdGlvbnMpXHJcbiAgICAgIHRoaXMub2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmRvbSwgeyBjaGlsZExpc3Q6IHRydWUsIGNoYXJhY3RlckRhdGE6IHRydWUsIHN1YnRyZWU6IHRydWUgfSlcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnVuc3Vic2NyaWJlID0gZWRpdG9yLm9uKCd0cmFuc2FjdGlvbicsICgpID0+IHRoaXMudXBkYXRlKCkpXHJcbiAgICB0aGlzLnVwZGF0ZSgpXHJcbiAgICBpZiAob3B0aW9ucy5hdXRvZm9jdXMpIHRoaXMuZm9jdXMoKVxyXG4gIH1cclxuXHJcbiAgLyoqIFJlLXJlbmRlciBmcm9tIHRoZSBlZGl0b3Igc3RhdGUgYW5kIHB1c2ggdGhlIHNlbGVjdGlvbiBpbnRvIHRoZSBET00uICovXHJcbiAgdXBkYXRlKCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkIHx8IHRoaXMuY29tcG9zaW5nKSByZXR1cm5cclxuICAgIHRoaXMud2l0aERPTVVwZGF0ZSgoKSA9PiB0aGlzLnJlbmRlcmVyLnJlbmRlckRvYyh0aGlzLmVkaXRvci5zdGF0ZS5kb2MsIHRoaXMuZG9tKSlcclxuICAgIHRoaXMudXBkYXRlUGxhY2Vob2xkZXIoKVxyXG4gICAgdGhpcy5zeW5jU2VsZWN0aW9uVG9ET00oKVxyXG4gIH1cclxuXHJcbiAgLyoqIFRvZ2dsZSByZWFkLW9ubHkgbW9kZS4gKi9cclxuICBzZXRFZGl0YWJsZShlZGl0YWJsZTogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgdGhpcy5lZGl0YWJsZSA9IGVkaXRhYmxlXHJcbiAgICB0aGlzLmRvbS5jb250ZW50RWRpdGFibGUgPSBTdHJpbmcoZWRpdGFibGUpXHJcbiAgICB0aGlzLmRvbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtcmVhZG9ubHknLCBTdHJpbmcoIWVkaXRhYmxlKSlcclxuICB9XHJcblxyXG4gIGdldCBpc0VkaXRhYmxlKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdGFibGVcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFR1cm4gdGhlIGJyb3dzZXIncyBzcGVsbCBjaGVja2luZyBvZiB0aGUgc3VyZmFjZSBvbiBvciBvZmYuIFNldCBhcyB0aGVcclxuICAgKiBjb250ZW50IGF0dHJpYnV0ZSByYXRoZXIgdGhhbiB0aGUgSURMIHByb3BlcnR5LCBzbyBpdCBzdXJ2aXZlcyBhIERPTSB0aGF0XHJcbiAgICogZG9lcyBub3QgcmVmbGVjdCBgc3BlbGxjaGVja2AgKGFuZCBzaG93cyB1cCBpbiB0aGUgbWFya3VwIGZvciB0ZXN0cykuXHJcbiAgICpcclxuICAgKiBTd2l0Y2hpbmcgaXQgb2ZmIGlzIGVub3VnaCBvbiBpdHMgb3duLiBUaGUgYnJvd3NlciBkcm9wcyB0aGUgbWFya3MgaXQgaGFzXHJcbiAgICogYWxyZWFkeSBkcmF3bi4gU3dpdGNoaW5nIGl0IGJhY2sgb24gaXMgbm90OiB0aGUgdGV4dCBpcyBub3QgbmV3IHRvIHRoZVxyXG4gICAqIHNwZWxsIGNoZWNrZXIsIHNvIG5vdGhpbmcgaXMgcmUtc2Nhbm5lZCBhbmQgdGhlIHN1cmZhY2Ugc3RheXMgdW5tYXJrZWRcclxuICAgKiB1bnRpbCB0aGUgbmV4dCBlZGl0IGhhcHBlbnMgdG8gdG91Y2ggYSBibG9jay4gYHJlZnJlc2hUZXh0Tm9kZXNgIGJlbG93IGlzXHJcbiAgICogd2hhdCBtYWtlcyBpdCBsb29rIG5ldy5cclxuICAgKi9cclxuICBzZXRTcGVsbGNoZWNrKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIGNvbnN0IGNoYW5nZWQgPSB0aGlzLnNwZWxsY2hlY2sgIT09IGVuYWJsZWRcclxuICAgIHRoaXMuZG9tLnNldEF0dHJpYnV0ZSgnc3BlbGxjaGVjaycsIFN0cmluZyhlbmFibGVkKSlcclxuICAgIGlmICghY2hhbmdlZCB8fCAhZW5hYmxlZCkgcmV0dXJuXHJcbiAgICB0aGlzLndpdGhET01VcGRhdGUoKCkgPT4gdGhpcy5yZWZyZXNoVGV4dE5vZGVzKHRoaXMuZG9tKSlcclxuICAgIC8vIFJlcGxhY2luZyB0aGUgbm9kZXMgZHJvcHMgdGhlIERPTSBzZWxlY3Rpb247IHN0YXRlIHN0aWxsIGhhcyBpdC5cclxuICAgIHRoaXMuc3luY1NlbGVjdGlvblRvRE9NKClcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFN3YXAgZXZlcnkgcmVuZGVyZWQgdGV4dCBub2RlIGZvciBhbiBpZGVudGljYWwgZnJlc2ggb25lLCBzbyB0aGUgYnJvd3NlclxyXG4gICAqIHRyZWF0cyB0aGUgdGV4dCBhcyBuZXdseSBhcnJpdmVkIGFuZCBzcGVsbCBjaGVja3MgaXQgYWdhaW4uIE9ubHkgdGV4dCBpc1xyXG4gICAqIHJlcGxhY2VkOiBlbGVtZW50cyBrZWVwIHRoZWlyIGlkZW50aXR5LCBzbyBhIG5vZGUgdmlldywgYW4gZW1iZWRkZWRcclxuICAgKiBpZnJhbWUsIGEgZGlhZ3JhbSwgaXMgbm90IHRvcm4gZG93biBhbmQgcmVidWlsdCBiZWhpbmQgdGhlIHVzZXIncyBiYWNrLlxyXG4gICAqXHJcbiAgICogTm90aGluZyBjaGVhcGVyIHdvcmtzLiBGbGlwcGluZyB0aGUgYXR0cmlidXRlLCBhIGJsdXIvZm9jdXMgY3ljbGUsXHJcbiAgICogZGV0YWNoaW5nIHRoZSBzdXJmYWNlIGFuZCByZS10b2dnbGluZyBgY29udGVudGVkaXRhYmxlYCBhbGwgbGVhdmUgdGhlXHJcbiAgICogZXhpc3RpbmcgdGV4dCB1bmNoZWNrZWQuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSByZWZyZXNoVGV4dE5vZGVzKHBhcmVudDogZ2xvYmFsVGhpcy5Ob2RlKTogdm9pZCB7XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIFsuLi5wYXJlbnQuY2hpbGROb2Rlc10pIHtcclxuICAgICAgaWYgKGNoaWxkLm5vZGVUeXBlICE9PSBURVhUX05PREUpIHtcclxuICAgICAgICB0aGlzLnJlZnJlc2hUZXh0Tm9kZXMoY2hpbGQpXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBmcmVzaCA9IHRoaXMuZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoY2hpbGQudGV4dENvbnRlbnQgPz8gJycpXHJcbiAgICAgIC8vIFRoZSByZW5kZXJlciBtYXBzIHJlbmRlcmVkIHRleHQgYmFjayB0byB0aGUgbW9kZWwgbm9kZSBpdCBjYW1lIGZyb207XHJcbiAgICAgIC8vIHdpdGhvdXQgY2FycnlpbmcgdGhhdCBvdmVyLCBwb3NpdGlvbiBtYXBwaW5nIGxvc2VzIHRoZSBhbmNob3IuXHJcbiAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5yZW5kZXJlci5tb2RlbE9mLmdldChjaGlsZClcclxuICAgICAgaWYgKG1vZGVsKSB0aGlzLnJlbmRlcmVyLm1vZGVsT2Yuc2V0KGZyZXNoLCBtb2RlbClcclxuICAgICAgOyhjaGlsZCBhcyBnbG9iYWxUaGlzLlRleHQpLnJlcGxhY2VXaXRoKGZyZXNoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXRoZXIgdGhlIHN1cmZhY2UgaXMgc3BlbGwgY2hlY2tlZDsgdGhlIGJyb3dzZXIgZGVmYXVsdCB1bnRpbCBzZXQuICovXHJcbiAgZ2V0IHNwZWxsY2hlY2soKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5kb20uZ2V0QXR0cmlidXRlKCdzcGVsbGNoZWNrJykgIT09ICdmYWxzZSdcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEhpZ2hsaWdodCBpbmxpbmUgcmFuZ2VzIChmaW5kICYgcmVwbGFjZSBtYXRjaGVzKSBhcyBkZWNvcmF0aW9ucywgbmV2ZXJcclxuICAgKiBzdG9yZWQgaW4gdGhlIGRvY3VtZW50LiBQYXNzIGFuIGVtcHR5IGFycmF5IHRvIGNsZWFyLlxyXG4gICAqL1xyXG4gIHNldEhpZ2hsaWdodHMobWF0Y2hlczogcmVhZG9ubHkgU2VhcmNoTWF0Y2hbXSk6IHZvaWQge1xyXG4gICAgdGhpcy5oaWdobGlnaHRzID0gbWF0Y2hlc1xyXG4gICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRoaXMuc2V0RGVjb3JhdGlvbkxheWVyKCdzZWFyY2gnLCBudWxsKVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGNvbnN0IGJ5Tm9kZSA9IG5ldyBXZWFrTWFwPEVkaXRvck5vZGUsIElubGluZURlY29yYXRpb25bXT4oKVxyXG4gICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcbiAgICAgIGNvbnN0IG5vZGUgPSBub2RlQXRQYXRoKHRoaXMuZWRpdG9yLnN0YXRlLmRvYywgbWF0Y2gucGF0aClcclxuICAgICAgaWYgKCFub2RlKSBjb250aW51ZVxyXG4gICAgICBjb25zdCBsaXN0ID0gYnlOb2RlLmdldChub2RlKSA/PyBbXVxyXG4gICAgICBsaXN0LnB1c2goeyBmcm9tOiBtYXRjaC5mcm9tLCB0bzogbWF0Y2gudG8sIGNsYXNzTmFtZTogJ3RyZXZpeGFsLXNlYXJjaC1tYXRjaCcgfSlcclxuICAgICAgYnlOb2RlLnNldChub2RlLCBsaXN0KVxyXG4gICAgfVxyXG4gICAgdGhpcy5zZXREZWNvcmF0aW9uTGF5ZXIoJ3NlYXJjaCcsIChub2RlKSA9PiBieU5vZGUuZ2V0KG5vZGUpID8/IG51bGwpXHJcbiAgfVxyXG5cclxuICBnZXQgY3VycmVudEhpZ2hsaWdodHMoKTogcmVhZG9ubHkgU2VhcmNoTWF0Y2hbXSB7XHJcbiAgICByZXR1cm4gdGhpcy5oaWdobGlnaHRzXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbnN0YWxsIChvciBjbGVhciwgd2l0aCBgbnVsbGApIGFuIGluZGVwZW5kZW50IGRlY29yYXRpb24gbGF5ZXIuXHJcbiAgICogRXh0ZW5zaW9ucyBlYWNoIG93biBhIGtleTogY29kZSBoaWdobGlnaHRpbmcsIHNlYXJjaCBtYXRjaGVzIGFuZFxyXG4gICAqIHRyYWNrLWNoYW5nZSByYW5nZXMgY29tcG9zZSB3aXRob3V0IGNsb2JiZXJpbmcgb25lIGFub3RoZXIuXHJcbiAgICovXHJcbiAgc2V0RGVjb3JhdGlvbkxheWVyKGtleTogc3RyaW5nLCBzb3VyY2U6IERlY29yYXRpb25Tb3VyY2UgfCBudWxsKTogdm9pZCB7XHJcbiAgICBpZiAoc291cmNlKSB0aGlzLmRlY29yYXRpb25MYXllcnMuc2V0KGtleSwgc291cmNlKVxyXG4gICAgZWxzZSBpZiAoIXRoaXMuZGVjb3JhdGlvbkxheWVycy5kZWxldGUoa2V5KSkgcmV0dXJuXHJcbiAgICBpZiAodGhpcy5kZWNvcmF0aW9uTGF5ZXJzLnNpemUgPT09IDApIHtcclxuICAgICAgdGhpcy5yZW5kZXJlci5zZXREZWNvcmF0aW9ucyhudWxsKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3QgbGF5ZXJzID0gWy4uLnRoaXMuZGVjb3JhdGlvbkxheWVycy52YWx1ZXMoKV1cclxuICAgICAgdGhpcy5yZW5kZXJlci5zZXREZWNvcmF0aW9ucygobm9kZSkgPT4ge1xyXG4gICAgICAgIGxldCByZXN1bHQ6IElubGluZURlY29yYXRpb25bXSB8IG51bGwgPSBudWxsXHJcbiAgICAgICAgZm9yIChjb25zdCBsYXllciBvZiBsYXllcnMpIHtcclxuICAgICAgICAgIGNvbnN0IGRlY29yYXRpb25zID0gbGF5ZXIobm9kZSlcclxuICAgICAgICAgIGlmIChkZWNvcmF0aW9ucyAmJiBkZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdCA/IHJlc3VsdC5jb25jYXQoZGVjb3JhdGlvbnMpIDogWy4uLmRlY29yYXRpb25zXVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICAgIH0pXHJcbiAgICB9XHJcbiAgICB0aGlzLnVwZGF0ZSgpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbnRlcmNlcHQga2V5ZG93biBiZWZvcmUgdGhlIGtleW1hcCBydW5zOyByZXR1cm4gdHJ1ZSB0byBjb25zdW1lIHRoZVxyXG4gICAqIGV2ZW50IChzdWdnZXN0aW9uIHBvcHVwcyB0YWtlIEVudGVyL0Fycm93cyB3aGlsZSBvcGVuKS4gUmV0dXJucyBhXHJcbiAgICogZGlzcG9zZXIuXHJcbiAgICovXHJcbiAgYWRkS2V5ZG93bkludGVyY2VwdG9yKGludGVyY2VwdG9yOiAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IGJvb2xlYW4pOiAoKSA9PiB2b2lkIHtcclxuICAgIHRoaXMua2V5ZG93bkludGVyY2VwdG9ycy5hZGQoaW50ZXJjZXB0b3IpXHJcbiAgICByZXR1cm4gKCkgPT4gdGhpcy5rZXlkb3duSW50ZXJjZXB0b3JzLmRlbGV0ZShpbnRlcmNlcHRvcilcclxuICB9XHJcblxyXG4gIHByaXZhdGUgdXBkYXRlUGxhY2Vob2xkZXIoKTogdm9pZCB7XHJcbiAgICBpZiAoIXRoaXMucGxhY2Vob2xkZXIpIHJldHVyblxyXG4gICAgY29uc3QgZG9jID0gdGhpcy5lZGl0b3Iuc3RhdGUuZG9jXHJcbiAgICBjb25zdCBlbXB0eSA9XHJcbiAgICAgIGRvYy5jaGlsZENvdW50ID09PSAxICYmIGRvYy5jaGlsZCgwKS5pc1RleHRibG9jayAmJiBpbmxpbmVMZW5ndGgoZG9jLmNoaWxkKDApLmNvbnRlbnQpID09PSAwXHJcbiAgICBpZiAoZW1wdHkpIHtcclxuICAgICAgdGhpcy5kb20uZGF0YXNldC50cmV2aXhhbEVtcHR5ID0gJ3RydWUnXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBkZWxldGUgdGhpcy5kb20uZGF0YXNldC50cmV2aXhhbEVtcHR5XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHaXZlIHRoZSBzdXJmYWNlIGtleWJvYXJkIGZvY3VzICoqd2l0aG91dCBtb3ZpbmcgdGhlIHBhZ2UqKi5cclxuICAgKlxyXG4gICAqIEEgYmFyZSBgSFRNTEVsZW1lbnQuZm9jdXMoKWAgc2Nyb2xscyB0aGUgY2FyZXQgaW50byB2aWV3LCBhbmQgdGhlIGNhcmV0XHJcbiAgICogY2FuIGJlIHRob3VzYW5kcyBvZiBwaXhlbHMgZnJvbSB3aGF0ZXZlciB0aGUgcmVhZGVyIGlzIGFjdHVhbGx5IGxvb2tpbmdcclxuICAgKiBhdC4gRXZlcnkgY2FsbGVyIG9mIHRoaXMgbWV0aG9kIGlzIGhhbmRpbmcgZm9jdXMgYmFjayBhZnRlciBhIHBpZWNlIG9mXHJcbiAgICogY2hyb21lIHRvb2sgaXQgKGEgbWVudSwgdGhlIGNvbW1hbmQgcGFsZXR0ZSwgYSBkaWFsb2cpIGFuZCBub25lIG9mIHRoZW1cclxuICAgKiBtZWFucyBcInRha2UgbWUgdG8gdGhlIGNhcmV0XCI6IHRoZSBwYWdlIHNpbXBseSBqdW1wZWQuIFNvIGZvY3VzIG1vdmVzIGFuZFxyXG4gICAqIHRoZSB2aWV3cG9ydCBkb2VzIG5vdC4gVG8gZGVsaWJlcmF0ZWx5IHJldmVhbCB0aGUgY2FyZXQsIHdoaWNoIGlzIGFcclxuICAgKiBkaWZmZXJlbnQgaW50ZW50aW9uLCBjYWxsIHtAbGluayBzY3JvbGxTZWxlY3Rpb25JbnRvVmlld30uXHJcbiAgICovXHJcbiAgZm9jdXMoKTogdm9pZCB7XHJcbiAgICAvLyBUaGUgRE9NIGdldHMgdGhlIHNlbGVjdGlvbiBiZWZvcmUgdGhlIGZvY3VzIGNhbGwsIG5vdCBvbmx5IGFmdGVyIGl0OlxyXG4gICAgLy8gZm9jdXNpbmcgYW4gZW1wdHkgY29udGVudGVkaXRhYmxlIG1ha2VzIHRoZSBicm93c2VyIHBsYWNlIGEgY2FyZXQgb2ZcclxuICAgIC8vIGl0cyBvd24gYW5kIHJlcG9ydCBpdCwgYW5kIGEgYHNlbGVjdGlvbmNoYW5nZWAgZGVsaXZlcmVkIHN5bmNocm9ub3VzbHlcclxuICAgIC8vIHdvdWxkIHRoZW4gb3ZlcndyaXRlIHRoZSBtb2RlbCB3aXRoIHRoYXQgY2FyZXQuIFdyaXRpbmcgZmlyc3QgbWVhbnNcclxuICAgIC8vIHdoYXRldmVyIGlzIHJlYWQgYmFjayBpcyBhbHJlYWR5IHRoZSBzZWxlY3Rpb24gd2UgaW50ZW5kLlxyXG4gICAgdGhpcy5zeW5jU2VsZWN0aW9uVG9ET00oKVxyXG4gICAgdGhpcy53aXRoRE9NVXBkYXRlKCgpID0+IHRoaXMuZG9tLmZvY3VzKHsgcHJldmVudFNjcm9sbDogdHJ1ZSB9KSlcclxuICAgIHRoaXMuc3luY1NlbGVjdGlvblRvRE9NKClcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNjcm9sbCB0aGUgY2FyZXQgaW50byB2aWV3LCB0aGUgbGVhc3QgdGhlIHNjcm9sbGVycyBpbnZvbHZlZCBhbGxvdy5cclxuICAgKlxyXG4gICAqIFRoZSBjb3VudGVycGFydCB0byB7QGxpbmsgZm9jdXN9OiBuYXZpZ2F0aW9uIChhbiBvdXRsaW5lIGVudHJ5LCBhIHNlYXJjaFxyXG4gICAqIGhpdCkgbWVhbnMgdG8gbW92ZSB0aGUgcmVhZGVyLCBzbyBpdCBzYXlzIHNvIHJhdGhlciB0aGFuIHJlbHlpbmcgb24gYVxyXG4gICAqIHNpZGUgZWZmZWN0IG9mIGZvY3VzaW5nLlxyXG4gICAqL1xyXG4gIHNjcm9sbFNlbGVjdGlvbkludG9WaWV3KG9wdGlvbnM6IFNjcm9sbEludG9WaWV3T3B0aW9ucyA9IHsgYmxvY2s6ICduZWFyZXN0JyB9KTogdm9pZCB7XHJcbiAgICBjb25zdCBwb2ludCA9IGRvbVBvaW50RnJvbVBvc2l0aW9uKHRoaXMuZG9tLCB0aGlzLnJlbmRlcmVyLCB0aGlzLmVkaXRvci5zdGF0ZS5zZWxlY3Rpb24uZnJvbSlcclxuICAgIGNvbnN0IG5vZGUgPSBwb2ludD8ubm9kZVxyXG4gICAgY29uc3QgZWxlbWVudCA9IG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50ID8gbm9kZSA6IChub2RlPy5wYXJlbnRFbGVtZW50ID8/IG51bGwpXHJcbiAgICBlbGVtZW50Py5zY3JvbGxJbnRvVmlldz8uKG9wdGlvbnMpXHJcbiAgfVxyXG5cclxuICBkZXN0cm95KCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkKSByZXR1cm5cclxuICAgIHRoaXMuZGVzdHJveWVkID0gdHJ1ZVxyXG4gICAgdGhpcy51bnN1YnNjcmliZSgpXHJcbiAgICB0aGlzLm9ic2VydmVyPy5kaXNjb25uZWN0KClcclxuICAgIHRoaXMuZG9tLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JlZm9yZWlucHV0JywgdGhpcy5vbkJlZm9yZUlucHV0IGFzIEV2ZW50TGlzdGVuZXIpXHJcbiAgICB0aGlzLmRvbS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duIGFzIEV2ZW50TGlzdGVuZXIpXHJcbiAgICB0aGlzLmRvbS5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24pXHJcbiAgICB0aGlzLmRvbS5yZW1vdmVFdmVudExpc3RlbmVyKCdjb21wb3NpdGlvbnN0YXJ0JywgdGhpcy5vbkNvbXBvc2l0aW9uU3RhcnQpXHJcbiAgICB0aGlzLmRvbS5yZW1vdmVFdmVudExpc3RlbmVyKCdjb21wb3NpdGlvbmVuZCcsIHRoaXMub25Db21wb3NpdGlvbkVuZClcclxuICAgIHRoaXMuZG9tLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvcHknLCB0aGlzLm9uQ29weSBhcyBFdmVudExpc3RlbmVyKVxyXG4gICAgdGhpcy5kb20ucmVtb3ZlRXZlbnRMaXN0ZW5lcignY3V0JywgdGhpcy5vbkN1dCBhcyBFdmVudExpc3RlbmVyKVxyXG4gICAgdGhpcy5kb20ucmVtb3ZlRXZlbnRMaXN0ZW5lcigncGFzdGUnLCB0aGlzLm9uUGFzdGUgYXMgRXZlbnRMaXN0ZW5lcilcclxuICAgIHRoaXMuZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2VsZWN0aW9uY2hhbmdlJywgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSlcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgWy4uLnRoaXMuZG9tLmNoaWxkcmVuXSkge1xyXG4gICAgICB0aGlzLnJlbmRlcmVyLmRlc3Ryb3lWaWV3cyhjaGlsZCBhcyBIVE1MRWxlbWVudClcclxuICAgIH1cclxuICAgIHRoaXMuc3RvcEFubm91bmNpbmc/LigpXHJcbiAgICB0aGlzLmFubm91bmNlcj8uZGVzdHJveSgpXHJcbiAgICB0aGlzLmRvbS5yZW1vdmUoKVxyXG4gICAgaWYgKHRoaXMuZWRpdG9yLnZpZXcgPT09IHRoaXMpIHRoaXMuZWRpdG9yLnZpZXcgPSBudWxsXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTYXkgb3V0IGxvdWQgd2hhdCB0aGUgRE9NIGFsb25lIGRvZXMgbm90IHJlcG9ydC4gU3RydWN0dXJhbCBvbmx5LiBTZWVcclxuICAgKiB7QGxpbmsgZGVzY3JpYmVEb2NDaGFuZ2V9IGZvciB3aHkgdGhpcyBpcyBkZWxpYmVyYXRlbHkgcXVpZXQuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSB3YXRjaEZvckFubm91bmNlbWVudHMoYW5ub3VuY2VyOiBBbm5vdW5jZXIpOiAoKSA9PiB2b2lkIHtcclxuICAgIGNvbnN0IGJsb2NrVHlwZUF0ID0gKHN0YXRlOiBFZGl0b3JTdGF0ZSk6IHN0cmluZyB8IG51bGwgPT5cclxuICAgICAgbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHN0YXRlLnNlbGVjdGlvbi5mcm9tLnBhdGgpPy50eXBlLm5hbWUgPz8gbnVsbFxyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLm9uVHJhbnNhY3Rpb24oKHsgYmVmb3JlLCBzdGF0ZSB9KSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLmRlc3Ryb3llZCkgcmV0dXJuXHJcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBkZXNjcmliZURvY0NoYW5nZShcclxuICAgICAgICBiZWZvcmUuZG9jLFxyXG4gICAgICAgIHN0YXRlLmRvYyxcclxuICAgICAgICBibG9ja1R5cGVBdChiZWZvcmUpLFxyXG4gICAgICAgIGJsb2NrVHlwZUF0KHN0YXRlKSxcclxuICAgICAgKVxyXG4gICAgICBpZiAobWVzc2FnZSkgYW5ub3VuY2VyLmFubm91bmNlKG1lc3NhZ2UpXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gcmVuZGVyaW5nXHJcblxyXG4gIHByaXZhdGUgd2l0aERPTVVwZGF0ZShmbjogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgdGhpcy51cGRhdGluZ0RPTSA9IHRydWVcclxuICAgIHRyeSB7XHJcbiAgICAgIGZuKClcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIC8vIERyb3AgdGhlIG11dGF0aW9uIHJlY29yZHMgb3VyIG93biByZW5kZXIganVzdCBwcm9kdWNlZC5cclxuICAgICAgdGhpcy5vYnNlcnZlcj8udGFrZVJlY29yZHMoKVxyXG4gICAgICB0aGlzLnVwZGF0aW5nRE9NID0gZmFsc2VcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIHNlbGVjdGlvblxyXG5cclxuICBwcml2YXRlIHN5bmNTZWxlY3Rpb25Ub0RPTSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuZWRpdG9yLnN0YXRlLnNlbGVjdGlvblxyXG4gICAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikpIHJldHVyblxyXG4gICAgY29uc3QgZG9tU2VsZWN0aW9uID0gdGhpcy5kb2N1bWVudC5nZXRTZWxlY3Rpb24/LigpXHJcbiAgICBpZiAoIWRvbVNlbGVjdGlvbiB8fCB0eXBlb2YgZG9tU2VsZWN0aW9uLnNldEJhc2VBbmRFeHRlbnQgIT09ICdmdW5jdGlvbicpIHJldHVyblxyXG4gICAgY29uc3QgYW5jaG9yID0gZG9tUG9pbnRGcm9tUG9zaXRpb24odGhpcy5kb20sIHRoaXMucmVuZGVyZXIsIHNlbGVjdGlvbi5hbmNob3IpXHJcbiAgICBjb25zdCBoZWFkID0gZG9tUG9pbnRGcm9tUG9zaXRpb24odGhpcy5kb20sIHRoaXMucmVuZGVyZXIsIHNlbGVjdGlvbi5oZWFkKVxyXG4gICAgaWYgKCFhbmNob3IgfHwgIWhlYWQpIHJldHVyblxyXG4gICAgaWYgKFxyXG4gICAgICBkb21TZWxlY3Rpb24uYW5jaG9yTm9kZSA9PT0gYW5jaG9yLm5vZGUgJiZcclxuICAgICAgZG9tU2VsZWN0aW9uLmFuY2hvck9mZnNldCA9PT0gYW5jaG9yLm9mZnNldCAmJlxyXG4gICAgICBkb21TZWxlY3Rpb24uZm9jdXNOb2RlID09PSBoZWFkLm5vZGUgJiZcclxuICAgICAgZG9tU2VsZWN0aW9uLmZvY3VzT2Zmc2V0ID09PSBoZWFkLm9mZnNldFxyXG4gICAgKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgLy8gT25seSBzdGVlciB0aGUgYnJvd3NlciBjYXJldCB3aGlsZSB3ZSBvd24gZm9jdXMuXHJcbiAgICBjb25zdCBhY3RpdmUgPSB0aGlzLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnRcclxuICAgIGlmIChhY3RpdmUgIT09IHRoaXMuZG9tICYmICF0aGlzLmRvbS5jb250YWlucyhhY3RpdmUpKSByZXR1cm5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFdyaXRpbmcgdGhlIHNlbGVjdGlvbiBjYW4gaXRzZWxmIHJhaXNlIGBzZWxlY3Rpb25jaGFuZ2VgLCBhbmQgc29tZVxyXG4gICAgICAvLyBlbmdpbmVzIGRlbGl2ZXIgaXQgc3luY2hyb25vdXNseSwgbWlkLXdyaXRlLCB3aXRoIHRoZSBhbmNob3IgbW92ZWRcclxuICAgICAgLy8gYW5kIHRoZSBmb2N1cyBub3QgeWV0LiBSZWFkaW5nIHRoYXQgYmFjayB3b3VsZCBjb2xsYXBzZSB0aGUgdmVyeVxyXG4gICAgICAvLyByYW5nZSBiZWluZyB3cml0dGVuLCBzbyBvdXIgb3duIHdyaXRlcyBhcmUgbWFya2VkIGFzIG91cnMuXHJcbiAgICAgIHRoaXMud2l0aERPTVVwZGF0ZSgoKSA9PiB7XHJcbiAgICAgICAgZG9tU2VsZWN0aW9uLnNldEJhc2VBbmRFeHRlbnQoYW5jaG9yLm5vZGUsIGFuY2hvci5vZmZzZXQsIGhlYWQubm9kZSwgaGVhZC5vZmZzZXQpXHJcbiAgICAgIH0pXHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgLy8gU2VsZWN0aW9uIEFQSXMgdmFyeSBhY3Jvc3MgZW52aXJvbm1lbnRzOyB0aGUgbW9kZWwgc3RheXMgY29ycmVjdC5cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFB1bGwgdGhlIGJyb3dzZXIgc2VsZWN0aW9uIGludG8gdGhlIG1vZGVsLiBgc2VsZWN0aW9uY2hhbmdlYCBpc1xyXG4gICAqIGFzeW5jaHJvbm91cywgc28gYW55dGhpbmcgYWN0aW5nIG91dHNpZGUgdGhlIGlucHV0IHBpcGVsaW5lLCBhIHRvb2xiYXJcclxuICAgKiBidXR0b24sIHdoaWNoIHN1cHByZXNzZXMgZm9jdXMgY2hhbmdlcywgbXVzdCBjYWxsIHRoaXMgZmlyc3QgdG8gYXZvaWRcclxuICAgKiBvcGVyYXRpbmcgb24gYSBzdGFsZSBzZWxlY3Rpb24uXHJcbiAgICovXHJcbiAgc3luY1NlbGVjdGlvbkZyb21ET00oKTogdm9pZCB7XHJcbiAgICB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKClcclxuICB9XHJcblxyXG4gIC8qKiBSZWFkIHRoZSBET00gc2VsZWN0aW9uIGludG8gdGhlIGVkaXRvciBzdGF0ZSAoaWRlbXBvdGVudCkuICovXHJcbiAgcHJpdmF0ZSBvblNlbGVjdGlvbkNoYW5nZSA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCB8fCB0aGlzLmNvbXBvc2luZyB8fCB0aGlzLnVwZGF0aW5nRE9NKSByZXR1cm5cclxuICAgIGNvbnN0IGRvbVNlbGVjdGlvbiA9IHRoaXMuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uPy4oKVxyXG4gICAgY29uc3QgYW5jaG9yTm9kZSA9IGRvbVNlbGVjdGlvbj8uYW5jaG9yTm9kZVxyXG4gICAgaWYgKCFkb21TZWxlY3Rpb24gfHwgIWFuY2hvck5vZGUgfHwgIXRoaXMuZG9tLmNvbnRhaW5zKGFuY2hvck5vZGUpKSByZXR1cm5cclxuICAgIGNvbnN0IGFuY2hvciA9IHBvc2l0aW9uRnJvbURPTVBvaW50KFxyXG4gICAgICB0aGlzLmRvbSxcclxuICAgICAgdGhpcy5yZW5kZXJlcixcclxuICAgICAgYW5jaG9yTm9kZSxcclxuICAgICAgZG9tU2VsZWN0aW9uLmFuY2hvck9mZnNldCxcclxuICAgIClcclxuICAgIGNvbnN0IGhlYWQgPSBkb21TZWxlY3Rpb24uZm9jdXNOb2RlXHJcbiAgICAgID8gcG9zaXRpb25Gcm9tRE9NUG9pbnQoXHJcbiAgICAgICAgICB0aGlzLmRvbSxcclxuICAgICAgICAgIHRoaXMucmVuZGVyZXIsXHJcbiAgICAgICAgICBkb21TZWxlY3Rpb24uZm9jdXNOb2RlLFxyXG4gICAgICAgICAgZG9tU2VsZWN0aW9uLmZvY3VzT2Zmc2V0LFxyXG4gICAgICAgIClcclxuICAgICAgOiBhbmNob3JcclxuICAgIGlmICghYW5jaG9yIHx8ICFoZWFkKSByZXR1cm5cclxuICAgIGNvbnN0IG5leHQgPSBuZXcgVGV4dFNlbGVjdGlvbihhbmNob3IsIGhlYWQpXHJcbiAgICBpZiAodGhpcy5lZGl0b3Iuc3RhdGUuc2VsZWN0aW9uLmVxKG5leHQpKSByZXR1cm5cclxuICAgIHRoaXMuZWRpdG9yLmRpc3BhdGNoKHRoaXMuZWRpdG9yLnN0YXRlLnRyLnNldFNlbGVjdGlvbihuZXh0KSlcclxuICB9XHJcblxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBpbnB1dFxyXG5cclxuICAvKipcclxuICAgKiBBIHRhc2sgaXRlbSdzIGNoZWNrYm94IGlzIGEgQ1NTIG1hcmtlciBpbiB0aGUgaXRlbSdzIGxlZnQgZ3V0dGVyLCBub3QgYVxyXG4gICAqIHJlYWwgYDxpbnB1dD5gLiBBbiBpbnB1dCBpbnNpZGUgY29udGVudGVkaXRhYmxlIHdvdWxkIHRha2UgZm9jdXMsIHNpdCBpblxyXG4gICAqIHRoZSBtb2RlbCdzIGNvb3JkaW5hdGUgc3BhY2UgYW5kIGhhdmUgdG8gYmUga2VwdCBpbiBzeW5jLiBUaGF0IGxlYXZlc1xyXG4gICAqIGdlb21ldHJ5IGFzIHRoZSB3YXkgdG8gcmVjb2duaXNlIGEgY2xpY2sgb24gaXQ6IGEgcHJlc3Mgd2hvc2UgdGFyZ2V0IGlzXHJcbiAgICogdGhlIGA8bGk+YCBpdHNlbGYgKHRoZSBndXR0ZXIgaG9sZHMgbm8gdGV4dCkgYW5kIHdob3NlIHggZmFsbHMgbGVmdCBvZlxyXG4gICAqIHRoZSBjb250ZW50IGJveCBpcyBhIGNoZWNrYm94IHByZXNzLlxyXG4gICAqXHJcbiAgICogYG1vdXNlZG93bmAgcmF0aGVyIHRoYW4gYGNsaWNrYCwgYW5kIHByZXZlbnREZWZhdWx0LCBzbyB0aGUgYnJvd3NlciBuZXZlclxyXG4gICAqIG1vdmVzIHRoZSBjYXJldCBpbnRvIHRoZSBpdGVtLCB0b2dnbGluZyBhIHRhc2sgbXVzdCBub3QgZGlzdHVyYiB3aGVyZVxyXG4gICAqIHRoZSB1c2VyIHdhcyB0eXBpbmcuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBvbk1vdXNlRG93biA9IChldmVudDogTW91c2VFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkIHx8ICF0aGlzLmVkaXRhYmxlIHx8IGV2ZW50LmJ1dHRvbiAhPT0gMCkgcmV0dXJuXHJcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXRcclxuICAgIGlmICghdGFyZ2V0IHx8ICh0YXJnZXQgYXMgZ2xvYmFsVGhpcy5Ob2RlKS5ub2RlVHlwZSAhPT0gMSkgcmV0dXJuXHJcbiAgICBjb25zdCBlbGVtZW50ID0gdGFyZ2V0IGFzIEhUTUxFbGVtZW50XHJcbiAgICBjb25zdCBtb2RlbCA9IHRoaXMucmVuZGVyZXIubW9kZWxPZi5nZXQoZWxlbWVudClcclxuICAgIGlmIChtb2RlbD8udHlwZS5uYW1lICE9PSAndGFza0l0ZW0nKSByZXR1cm5cclxuICAgIGNvbnN0IGJveCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcclxuICAgIGNvbnN0IGd1dHRlciA9IE51bWJlci5wYXJzZUZsb2F0KFxyXG4gICAgICAoZWxlbWVudC5vd25lckRvY3VtZW50LmRlZmF1bHRWaWV3Py5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpLnBhZGRpbmdMZWZ0ID8/ICcwJykgfHwgJzAnLFxyXG4gICAgKVxyXG4gICAgY29uc3QgaW5HdXR0ZXIgPSBOdW1iZXIuaXNGaW5pdGUoZ3V0dGVyKVxyXG4gICAgICA/IGV2ZW50LmNsaWVudFggPCBib3gubGVmdCArIGd1dHRlclxyXG4gICAgICA6IGV2ZW50LmNsaWVudFggPCBib3gubGVmdFxyXG4gICAgaWYgKCFpbkd1dHRlcikgcmV0dXJuXHJcbiAgICBjb25zdCBwYXRoID0gcGF0aE9mRWxlbWVudCh0aGlzLmRvbSwgdGhpcy5yZW5kZXJlciwgZWxlbWVudClcclxuICAgIGlmICghcGF0aCkgcmV0dXJuXHJcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICB0aGlzLmVkaXRvci5leGVjKHNldFRhc2tDaGVja2VkKHBhdGgsIG1vZGVsLmF0dHJzLmNoZWNrZWQgIT09IHRydWUpKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBvbktleURvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCB8fCB0aGlzLmNvbXBvc2luZyB8fCAhdGhpcy5lZGl0YWJsZSkgcmV0dXJuXHJcbiAgICAvLyBzZWxlY3Rpb25jaGFuZ2UgaXMgYXN5bmM7IG1ha2Ugc3VyZSBiaW5kaW5ncyBzZWUgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxyXG4gICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSgpXHJcbiAgICBmb3IgKGNvbnN0IGludGVyY2VwdG9yIG9mIHRoaXMua2V5ZG93bkludGVyY2VwdG9ycykge1xyXG4gICAgICBpZiAoaW50ZXJjZXB0b3IoZXZlbnQpKSB7XHJcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5oYW5kbGVLZXkoZXZlbnQpKSBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9uQmVmb3JlSW5wdXQgPSAoZXZlbnQ6IElucHV0RXZlbnQpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCkgcmV0dXJuXHJcbiAgICBpZiAoIXRoaXMuZWRpdGFibGUpIHtcclxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGNvbnN0IHR5cGUgPSBldmVudC5pbnB1dFR5cGVcclxuICAgIGlmICh0aGlzLmNvbXBvc2luZyB8fCB0eXBlID09PSAnaW5zZXJ0Q29tcG9zaXRpb25UZXh0JykgcmV0dXJuIC8vIHRoZSBJTUUgbGVhZHNcclxuICAgIC8vIE1ha2Ugc3VyZSB0aGUgbW9kZWwgc2VsZWN0aW9uIG1hdGNoZXMgdGhlIERPTSBiZWZvcmUgYWN0aW5nIG9uIGludGVudC5cclxuICAgIHRoaXMub25TZWxlY3Rpb25DaGFuZ2UoKVxyXG5cclxuICAgIGNvbnN0IGNvbnN1bWUgPSAoY29tbWFuZDogQ29tbWFuZCB8IG51bGwpOiB2b2lkID0+IHtcclxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxyXG4gICAgICBpZiAoY29tbWFuZCkgdGhpcy5lZGl0b3IuZXhlYyhjb21tYW5kKVxyXG4gICAgfVxyXG5cclxuICAgIHN3aXRjaCAodHlwZSkge1xyXG4gICAgICBjYXNlICdpbnNlcnRUZXh0JzpcclxuICAgICAgY2FzZSAnaW5zZXJ0UmVwbGFjZW1lbnRUZXh0Jzoge1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSBldmVudC5kYXRhID8/IGV2ZW50LmRhdGFUcmFuc2Zlcj8uZ2V0RGF0YSgndGV4dC9wbGFpbicpID8/ICcnXHJcbiAgICAgICAgaWYgKCF0ZXh0KSB7XHJcbiAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICAgICAgICBicmVha1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBQYXR0ZXJuIHNob3J0Y3V0cyAoXCIjIyBcIiwgXCItIFwiLCBcIi0tXCIsIFx1MjAyNikgcnVuIGluc3RlYWQgb2YgdGhlIGluc2VydC5cclxuICAgICAgICBjb25zdCBydWxlVHIgPSBhcHBseUlucHV0UnVsZXModGhpcy5lZGl0b3Iuc3RhdGUsIHRleHQsIHRoaXMuaW5wdXRSdWxlcylcclxuICAgICAgICBpZiAocnVsZVRyKSB7XHJcbiAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICAgICAgICB0aGlzLmVkaXRvci5kaXNwYXRjaChydWxlVHIpXHJcbiAgICAgICAgICBicmVha1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBJbiBhIGNvZGUgYmxvY2ssIGJyYWNrZXRzIGFuZCBxdW90ZXMgcGFpciB1cCB0aGUgd2F5IGEgY29kZSBlZGl0b3IncyBkby5cclxuICAgICAgICBjb25zdW1lKGNoYWluQ29tbWFuZHModHlwZUluUHJlZm9ybWF0dGVkKHRleHQpLCBpbnNlcnRUZXh0KHRleHQpKSlcclxuICAgICAgICBicmVha1xyXG4gICAgICB9XHJcbiAgICAgIGNhc2UgJ2luc2VydFBhcmFncmFwaCc6XHJcbiAgICAgICAgY29uc3VtZShjaGFpbkNvbW1hbmRzKHNwbGl0QmxvY2tJblByZWZvcm1hdHRlZCwgc3BsaXRMaXN0SXRlbSwgc3BsaXRCbG9jaykpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnaW5zZXJ0TGluZUJyZWFrJzpcclxuICAgICAgICBjb25zdW1lKGNoYWluQ29tbWFuZHMoaW5zZXJ0TmV3bGluZUluUHJlZm9ybWF0dGVkLCBpbnNlcnRJbmxpbmVOb2RlKCdoYXJkQnJlYWsnKSkpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnZGVsZXRlQ29udGVudEJhY2t3YXJkJzpcclxuICAgICAgICBjb25zdW1lKGNoYWluQ29tbWFuZHMoZGVsZXRlQmFja3dhcmRJblByZWZvcm1hdHRlZCwgZGVsZXRlQ2hhckJhY2t3YXJkKSlcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdkZWxldGVXb3JkQmFja3dhcmQnOlxyXG4gICAgICBjYXNlICdkZWxldGVTb2Z0TGluZUJhY2t3YXJkJzpcclxuICAgICAgICBjb25zdW1lKGRlbGV0ZUNoYXJCYWNrd2FyZClcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdkZWxldGVDb250ZW50Rm9yd2FyZCc6XHJcbiAgICAgIGNhc2UgJ2RlbGV0ZVdvcmRGb3J3YXJkJzpcclxuICAgICAgICBjb25zdW1lKGRlbGV0ZUNoYXJGb3J3YXJkKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2RlbGV0ZUJ5Q3V0JzpcclxuICAgICAgY2FzZSAnZGVsZXRlQnlEcmFnJzpcclxuICAgICAgICBjb25zdW1lKGRlbGV0ZVNlbGVjdGlvbilcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdoaXN0b3J5VW5kbyc6XHJcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxyXG4gICAgICAgIHRoaXMuZWRpdG9yLnVuZG8oKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2hpc3RvcnlSZWRvJzpcclxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICAgICAgdGhpcy5lZGl0b3IucmVkbygpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnZm9ybWF0Qm9sZCc6XHJcbiAgICAgICAgY29uc3VtZSh0b2dnbGVNYXJrKCdib2xkJykpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnZm9ybWF0SXRhbGljJzpcclxuICAgICAgICBjb25zdW1lKHRvZ2dsZU1hcmsoJ2l0YWxpYycpKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2Zvcm1hdFVuZGVybGluZSc6XHJcbiAgICAgICAgY29uc3VtZSh0b2dnbGVNYXJrKCd1bmRlcmxpbmUnKSlcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdpbnNlcnRGcm9tUGFzdGUnOiB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2sgd2hlbiBubyBgcGFzdGVgIGV2ZW50IGZpcmVkIGZpcnN0IChpdCB1c3VhbGx5IGRvZXMpLlxyXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICAgICAgICBpZiAoZXZlbnQuZGF0YVRyYW5zZmVyKSB0aGlzLmluc2VydEZyb21DbGlwYm9hcmQoZXZlbnQuZGF0YVRyYW5zZmVyKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIH1cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICAvLyBVbmtub3duIGludGVudCBtdXN0IG5vdCBjb3JydXB0IHRoZSBET00gdGhlIG1vZGVsIG93bnMuXHJcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gY2xpcGJvYXJkXHJcblxyXG4gIHByaXZhdGUgb25Db3B5ID0gKGV2ZW50OiBDbGlwYm9hcmRFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkIHx8ICFldmVudC5jbGlwYm9hcmREYXRhKSByZXR1cm5cclxuICAgIGlmICh0aGlzLndyaXRlQ2xpcGJvYXJkKGV2ZW50LmNsaXBib2FyZERhdGEpKSBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9uQ3V0ID0gKGV2ZW50OiBDbGlwYm9hcmRFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkIHx8ICFldmVudC5jbGlwYm9hcmREYXRhKSByZXR1cm5cclxuICAgIGlmICghdGhpcy53cml0ZUNsaXBib2FyZChldmVudC5jbGlwYm9hcmREYXRhKSkgcmV0dXJuXHJcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICBpZiAodGhpcy5lZGl0YWJsZSkgdGhpcy5lZGl0b3IuZXhlYyhkZWxldGVTZWxlY3Rpb24pXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9uUGFzdGUgPSAoZXZlbnQ6IENsaXBib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQgfHwgIXRoaXMuZWRpdGFibGUgfHwgIWV2ZW50LmNsaXBib2FyZERhdGEpIHJldHVyblxyXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxyXG4gICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSgpXHJcbiAgICB0aGlzLmluc2VydEZyb21DbGlwYm9hcmQoZXZlbnQuY2xpcGJvYXJkRGF0YSlcclxuICB9XHJcblxyXG4gIC8qKiBTZXJpYWxpemUgdGhlIHNlbGVjdGVkIGJsb2NrcyBhcyBIVE1MLCBwbGFpbiB0ZXh0IGFuZCBUcmV2aXhhbCBKU09OLiAqL1xyXG4gIHByaXZhdGUgd3JpdGVDbGlwYm9hcmQoZGF0YTogRGF0YVRyYW5zZmVyKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZWRpdG9yLnN0YXRlXHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGlmIChzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3QgYmxvY2tzID0gYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pXHJcbiAgICAgIC5maWx0ZXIoKGJsb2NrKSA9PiBibG9jay5mcm9tIDwgYmxvY2sudG8pXHJcbiAgICAgIC5tYXAoKGJsb2NrKSA9PiBibG9jay5ub2RlLndpdGhDb250ZW50KHNsaWNlSW5saW5lKGJsb2NrLm5vZGUuY29udGVudCwgYmxvY2suZnJvbSwgYmxvY2sudG8pKSlcclxuICAgIGlmIChibG9ja3MubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2VcclxuICAgIGRhdGEuc2V0RGF0YSgndGV4dC9odG1sJywgYmxvY2tzLm1hcCgobm9kZSkgPT4gc2VyaWFsaXplVG9IVE1MKG5vZGUpKS5qb2luKCcnKSlcclxuICAgIGRhdGEuc2V0RGF0YSgndGV4dC9wbGFpbicsIGJsb2Nrcy5tYXAoKG5vZGUpID0+IG5vZGUudGV4dENvbnRlbnQpLmpvaW4oJ1xcbicpKVxyXG4gICAgZGF0YS5zZXREYXRhKFRSRVZJWEFMX01JTUUsIEpTT04uc3RyaW5naWZ5KGJsb2Nrcy5tYXAoKG5vZGUpID0+IG5vZGUudG9KU09OKCkpKSlcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICAvKiogUGFzdGUgcGlwZWxpbmU6IG93biBKU09OLCB0aGVuIHNhbml0aXplZCBIVE1MLCB0aGVuIHBsYWluIHRleHQuICovXHJcbiAgcHJpdmF0ZSBpbnNlcnRGcm9tQ2xpcGJvYXJkKGRhdGE6IERhdGFUcmFuc2Zlcik6IHZvaWQge1xyXG4gICAgY29uc3QgcGxhaW5Pbmx5ID0gdGhpcy5wYXN0ZVBsYWluT25jZVxyXG4gICAgdGhpcy5wYXN0ZVBsYWluT25jZSA9IGZhbHNlXHJcbiAgICBjb25zdCBzY2hlbWEgPSB0aGlzLmVkaXRvci5zY2hlbWFcclxuXHJcbiAgICAvLyBBIGJsb2NrIHRoYXQga2VlcHMgaXRzIHdoaXRlc3BhY2UgaG9sZHMgc291cmNlLCBub3QgcHJvc2U6IHdoYXRldmVyIHRoZVxyXG4gICAgLy8gY2xpcGJvYXJkIGFsc28gb2ZmZXJzLCB3aGF0IGJlbG9uZ3MgdGhlcmUgaXMgdGhlIHBsYWluIHRleHQgZXhhY3RseSBhc1xyXG4gICAgLy8gaXQgc3RhbmRzLCBuZXdsaW5lcyBpbmNsdWRlZCwgYW5kIG5ldmVyIHNwbGl0IGludG8gcGFyYWdyYXBocy5cclxuICAgIGlmICh0aGlzLnByZXNlcnZlc1doaXRlc3BhY2VBdFNlbGVjdGlvbigpKSB7XHJcbiAgICAgIGNvbnN0IHNvdXJjZSA9IGRhdGEuZ2V0RGF0YSgndGV4dC9wbGFpbicpXHJcbiAgICAgIGlmIChzb3VyY2UpIHRoaXMuZWRpdG9yLmV4ZWMoaW5zZXJ0VGV4dChzb3VyY2UpKVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXBsYWluT25seSkge1xyXG4gICAgICBjb25zdCByYXcgPSBkYXRhLmdldERhdGEoVFJFVklYQUxfTUlNRSlcclxuICAgICAgaWYgKHJhdykge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHJhdylcclxuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcclxuICAgICAgICAgICAgY29uc3Qgbm9kZXMgPSBwYXJzZWQubWFwKChqc29uKSA9PiBub2RlRnJvbUpTT04oc2NoZW1hLCBqc29uKSlcclxuICAgICAgICAgICAgdGhpcy5lZGl0b3IuZXhlYyhpbnNlcnRDb250ZW50KG5vZGVzKSlcclxuICAgICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAvLyBDb3JydXB0IHBheWxvYWQ6IGZhbGwgdGhyb3VnaCB0byBIVE1ML3BsYWluLlxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBjb25zdCBodG1sID0gZGF0YS5nZXREYXRhKCd0ZXh0L2h0bWwnKVxyXG4gICAgICBpZiAoaHRtbCkge1xyXG4gICAgICAgIC8vIFdvcmQgYW5kIEdvb2dsZSBEb2NzIHdyaXRlIG1hcmt1cCBmb3IgdGhlbXNlbHZlcywgbm90IGZvciBhXHJcbiAgICAgICAgLy8gZG9jdW1lbnQgdGhhdCBoYXMgdG8gbGl2ZSB3aXRoIGl0LiBDbGVhbmVkIGJlZm9yZSBwYXJzaW5nLCBuZXZlclxyXG4gICAgICAgIC8vIGluc3RlYWQgb2YgaXQuIFRoZSBhbGxvd2xpc3QgYmVsb3cgaXMgc3RpbGwgd2hhdCBtYWtlcyBpdCBzYWZlLlxyXG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlSFRNTChzY2hlbWEsIGNsZWFuUGFzdGVkSFRNTChodG1sKSwgdGhpcy5kb2N1bWVudClcclxuICAgICAgICB0aGlzLmVkaXRvci5leGVjKGluc2VydENvbnRlbnQocGFyc2VkLmNvbnRlbnQuY2hpbGRyZW4pKVxyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdGV4dCA9IGRhdGEuZ2V0RGF0YSgndGV4dC9wbGFpbicpXHJcbiAgICBpZiAoIXRleHQpIHJldHVyblxyXG4gICAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KC9cXHI/XFxuLylcclxuICAgIGNvbnN0IGxpbmthYmxlID0gdGhpcy5saW5rc0FsbG93ZWRBdFNlbGVjdGlvbigpXHJcbiAgICBpZiAobGluZXMubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgIGNvbnN0IHRyaW1tZWQgPSB0ZXh0LnRyaW0oKVxyXG4gICAgICAvLyBBIFVSTCBwYXN0ZWQgb3ZlciBzZWxlY3RlZCB0ZXh0IGxpbmtzIHRoYXQgdGV4dCwgdGhlIGdlc3R1cmUgZXZlcnlcclxuICAgICAgLy8gZWRpdG9yIHNpbmNlIHRoZSBmaXJzdCB3aWtpIGhhcyB0YXVnaHQgcGVvcGxlIHRvIGV4cGVjdC5cclxuICAgICAgaWYgKGxpbmthYmxlICYmICF0aGlzLmVkaXRvci5zdGF0ZS5zZWxlY3Rpb24uZW1wdHkgJiYgQkFSRV9VUkwudGVzdCh0cmltbWVkKSkge1xyXG4gICAgICAgIGNvbnN0IGhyZWYgPSBzYWZlSHJlZigvXnd3d1xcLi9pLnRlc3QodHJpbW1lZCkgPyBgaHR0cHM6Ly8ke3RyaW1tZWR9YCA6IHRyaW1tZWQpXHJcbiAgICAgICAgaWYgKGhyZWYgJiYgdGhpcy5lZGl0b3IuZXhlYyhzZXRNYXJrKCdsaW5rJywgeyBocmVmIH0pKSkgcmV0dXJuXHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgbGlua2VkID0gbGlua2FibGUgPyBsaW5raWZ5VGV4dChzY2hlbWEsIHRleHQpIDogbnVsbFxyXG4gICAgICB0aGlzLmVkaXRvci5leGVjKGxpbmtlZCA/IGluc2VydENvbnRlbnQobGlua2VkKSA6IGluc2VydFRleHQodGV4dCkpXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgY29uc3QgcGFyYWdyYXBoID0gc2NoZW1hLmZpcnN0VGV4dGJsb2NrVHlwZSgpXHJcbiAgICBjb25zdCBub2RlcyA9IGxpbmVzLm1hcCgobGluZSkgPT4ge1xyXG4gICAgICBpZiAoIWxpbmUpIHJldHVybiBwYXJhZ3JhcGguY3JlYXRlKClcclxuICAgICAgY29uc3QgaW5saW5lID0gKGxpbmthYmxlID8gbGlua2lmeVRleHQoc2NoZW1hLCBsaW5lKSA6IG51bGwpID8/IFtzY2hlbWEudGV4dChsaW5lKV1cclxuICAgICAgcmV0dXJuIHBhcmFncmFwaC5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5mcm9tKGlubGluZSkpXHJcbiAgICB9KVxyXG4gICAgdGhpcy5lZGl0b3IuZXhlYyhpbnNlcnRDb250ZW50KG5vZGVzKSlcclxuICB9XHJcblxyXG4gIC8qKiBXaGV0aGVyIHRoZSBibG9jayBhdCB0aGUgc2VsZWN0aW9uIHN0b3JlcyBpdHMgdGV4dCB2ZXJiYXRpbSAoYSBjb2RlIGJsb2NrKS4gKi9cclxuICBwcml2YXRlIHByZXNlcnZlc1doaXRlc3BhY2VBdFNlbGVjdGlvbigpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aCh0aGlzLmVkaXRvci5zdGF0ZS5kb2MsIHRoaXMuZWRpdG9yLnN0YXRlLnNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgICByZXR1cm4gYmxvY2s/LnR5cGUuc3BlYy5wcmVzZXJ2ZVdoaXRlc3BhY2UgPT09IHRydWVcclxuICB9XHJcblxyXG4gIC8qKiBXaGV0aGVyIHRoZSBibG9jayBhdCB0aGUgc2VsZWN0aW9uIHRha2VzIGxpbmsgbWFya3MgKGNvZGUgYmxvY2tzIGRvIG5vdCkuICovXHJcbiAgcHJpdmF0ZSBsaW5rc0FsbG93ZWRBdFNlbGVjdGlvbigpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHR5cGUgPSB0aGlzLmVkaXRvci5zY2hlbWEubWFya3MubGlua1xyXG4gICAgaWYgKCF0eXBlKSByZXR1cm4gZmFsc2VcclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aCh0aGlzLmVkaXRvci5zdGF0ZS5kb2MsIHRoaXMuZWRpdG9yLnN0YXRlLnNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgICByZXR1cm4gYmxvY2s/LmlzVGV4dGJsb2NrID09PSB0cnVlICYmIGJsb2NrLnR5cGUuYWxsb3dzTWFya1R5cGUodHlwZSlcclxuICB9XHJcblxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBjb21wb3NpdGlvblxyXG5cclxuICBwcml2YXRlIG9uQ29tcG9zaXRpb25TdGFydCA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghdGhpcy5kZXN0cm95ZWQpIHRoaXMuY29tcG9zaW5nID0gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBvbkNvbXBvc2l0aW9uRW5kID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkIHx8ICF0aGlzLmNvbXBvc2luZykgcmV0dXJuXHJcbiAgICB0aGlzLmNvbXBvc2luZyA9IGZhbHNlXHJcbiAgICBjb25zdCBkb21TZWxlY3Rpb24gPSB0aGlzLmRvY3VtZW50LmdldFNlbGVjdGlvbj8uKClcclxuICAgIGNvbnN0IGFuY2hvck5vZGUgPSBkb21TZWxlY3Rpb24/LmFuY2hvck5vZGUgPz8gbnVsbFxyXG4gICAgY29uc3QgYmxvY2sgPSAoYW5jaG9yTm9kZSA/IHRoaXMuYmxvY2tFbGVtZW50QXJvdW5kKGFuY2hvck5vZGUpIDogbnVsbCkgPz8gdGhpcy5maW5kRGlydHlCbG9jaygpXHJcbiAgICBpZiAoYmxvY2spIHtcclxuICAgICAgdGhpcy5yZXBhaXJCbG9jayhibG9jaylcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMudXBkYXRlKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKiBGaXJzdCByZW5kZXJlZCB0ZXh0YmxvY2sgd2hvc2UgRE9NIHRleHQgbm8gbG9uZ2VyIG1hdGNoZXMgaXRzIG1vZGVsLiAqL1xyXG4gIHByaXZhdGUgZmluZERpcnR5QmxvY2soKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcclxuICAgIGNvbnN0IHdhbGsgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB8IG51bGwgPT4ge1xyXG4gICAgICBjb25zdCBtb2RlbCA9IHRoaXMucmVuZGVyZXIubW9kZWxPZi5nZXQoZWxlbWVudClcclxuICAgICAgaWYgKG1vZGVsPy5pc1RleHRibG9jaykge1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLnJlbmRlcmVyLmNvbnRlbnRFbGVtZW50T2YoZWxlbWVudClcclxuICAgICAgICByZXR1cm4gKGNvbnRlbnQudGV4dENvbnRlbnQgPz8gJycpID09PSBtb2RlbC50ZXh0Q29udGVudCA/IG51bGwgOiBlbGVtZW50XHJcbiAgICAgIH1cclxuICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4uZWxlbWVudC5jaGlsZHJlbl0pIHtcclxuICAgICAgICBjb25zdCBkaXJ0eSA9IHdhbGsoY2hpbGQgYXMgSFRNTEVsZW1lbnQpXHJcbiAgICAgICAgaWYgKGRpcnR5KSByZXR1cm4gZGlydHlcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4udGhpcy5kb20uY2hpbGRyZW5dKSB7XHJcbiAgICAgIGNvbnN0IGRpcnR5ID0gd2FsayhjaGlsZCBhcyBIVE1MRWxlbWVudClcclxuICAgICAgaWYgKGRpcnR5KSByZXR1cm4gZGlydHlcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG5cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBtdXRhdGlvbnNcclxuXHJcbiAgcHJpdmF0ZSBvbk11dGF0aW9ucyA9IChyZWNvcmRzOiBNdXRhdGlvblJlY29yZFtdKTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQgfHwgdGhpcy51cGRhdGluZ0RPTSB8fCB0aGlzLmNvbXBvc2luZyB8fCByZWNvcmRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXHJcbiAgICBjb25zdCBibG9ja3MgPSBuZXcgU2V0PEhUTUxFbGVtZW50PigpXHJcbiAgICBsZXQgZmFsbGJhY2sgPSBmYWxzZVxyXG4gICAgZm9yIChjb25zdCByZWNvcmQgb2YgcmVjb3Jkcykge1xyXG4gICAgICBjb25zdCBibG9jayA9IHRoaXMuYmxvY2tFbGVtZW50QXJvdW5kKHJlY29yZC50YXJnZXQpXHJcbiAgICAgIGlmIChibG9jaykgYmxvY2tzLmFkZChibG9jaylcclxuICAgICAgZWxzZSBmYWxsYmFjayA9IHRydWVcclxuICAgIH1cclxuICAgIGNvbnN0IFtvbmx5XSA9IGJsb2Nrc1xyXG4gICAgaWYgKCFmYWxsYmFjayAmJiBibG9ja3Muc2l6ZSA9PT0gMSAmJiBvbmx5KSB7XHJcbiAgICAgIHRoaXMucmVwYWlyQmxvY2sob25seSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIFVuYXR0cmlidXRhYmxlIG11dGF0aW9uczogdGhlIG1vZGVsIGlzIHRoZSBzb3VyY2Ugb2YgdHJ1dGguXHJcbiAgICAgIHRoaXMudXBkYXRlKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYmxvY2tFbGVtZW50QXJvdW5kKG5vZGU6IGdsb2JhbFRoaXMuTm9kZSk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XHJcbiAgICBmb3IgKFxyXG4gICAgICBsZXQgY3VycmVudDogZ2xvYmFsVGhpcy5Ob2RlIHwgbnVsbCA9IG5vZGU7XHJcbiAgICAgIGN1cnJlbnQgJiYgY3VycmVudCAhPT0gdGhpcy5kb20ucGFyZW50Tm9kZTtcclxuICAgICAgY3VycmVudCA9IGN1cnJlbnQucGFyZW50Tm9kZVxyXG4gICAgKSB7XHJcbiAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5yZW5kZXJlci5tb2RlbE9mLmdldChjdXJyZW50KVxyXG4gICAgICBpZiAobW9kZWw/LmlzVGV4dGJsb2NrKSByZXR1cm4gY3VycmVudCBhcyBIVE1MRWxlbWVudFxyXG4gICAgICBpZiAoY3VycmVudCA9PT0gdGhpcy5kb20pIGJyZWFrXHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVjb25jaWxlIG9uZSB0ZXh0YmxvY2sncyBET00gYmFjayBpbnRvIHRoZSBtb2RlbCB3aXRoIGEgcHJlZml4L3N1ZmZpeFxyXG4gICAqIHRleHQgZGlmZi4gVGhlIHJlY292ZXJ5IHBhdGggZm9yIElNRSBjb21taXRzLCBhdXRvY29ycmVjdCBhbmQgYnJvd3NlclxyXG4gICAqIGV4dGVuc2lvbnMuXHJcbiAgICovXHJcbiAgcHJpdmF0ZSByZXBhaXJCbG9jayhibG9ja0VsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBjb25zdCBwYXRoID0gcGF0aE9mRWxlbWVudCh0aGlzLmRvbSwgdGhpcy5yZW5kZXJlciwgYmxvY2tFbGVtZW50KVxyXG4gICAgY29uc3QgYmxvY2sgPSBwYXRoID8gbm9kZUF0UGF0aCh0aGlzLmVkaXRvci5zdGF0ZS5kb2MsIHBhdGgpIDogbnVsbFxyXG4gICAgaWYgKCFwYXRoIHx8ICFibG9jaz8uaXNUZXh0YmxvY2spIHtcclxuICAgICAgdGhpcy51cGRhdGUoKSAvLyB1bm1hcHBhYmxlIHN0cnVjdHVyZTogZnVsbCByZS1yZW5kZXIgZnJvbSBzdGF0ZVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLnJlbmRlcmVyLmNvbnRlbnRFbGVtZW50T2YoYmxvY2tFbGVtZW50KVxyXG4gICAgLy8gQSBibG9jayBtYXkgaG9sZCBpbmxpbmUgYXRvbXMsIGEgaGFyZCBicmVhaywgYW4gaW5saW5lIG1hdGggbm9kZS4gVGhlaXJcclxuICAgIC8vIHJlbmRlcmVkIHRleHQgaXMgcGFydCBvZiB3aGF0IHdlIGRpZmYsIGJ1dCB0aGV5IG93biBwb3NpdGlvbnMgdGhlIHRleHRcclxuICAgIC8vIHNjYWxlIGtub3dzIG5vdGhpbmcgYWJvdXQsIHNvIHRoZSBkaWZmIGlzIG1hcHBlZCBiYWNrIHRocm91Z2hcclxuICAgIC8vIGBpbmxpbmVPZmZzZXRGcm9tVGV4dGAuIElmIG9uZSBoYXMgYmVlbiBhZGRlZCBvciByZW1vdmVkIHRoZSB0ZXh0IGRpZmZcclxuICAgIC8vIGNhbm5vdCBkZXNjcmliZSB0aGUgY2hhbmdlIGF0IGFsbCwgYW5kIHRoZSBzYWZlIGFuc3dlciBpcyB0byByZS1yZW5kZXIuXHJcbiAgICBpZiAodGhpcy5hdG9tc0NoYW5nZWQoY29udGVudCwgYmxvY2spKSB7XHJcbiAgICAgIHRoaXMudXBkYXRlKClcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBjb25zdCBuZXdUZXh0ID0gY29udGVudC50ZXh0Q29udGVudCA/PyAnJ1xyXG4gICAgY29uc3Qgb2xkVGV4dCA9IGJsb2NrLnRleHRDb250ZW50XHJcbiAgICBpZiAobmV3VGV4dCA9PT0gb2xkVGV4dCkge1xyXG4gICAgICB0aGlzLnVwZGF0ZSgpXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgbGV0IHN0YXJ0ID0gMFxyXG4gICAgd2hpbGUgKHN0YXJ0IDwgb2xkVGV4dC5sZW5ndGggJiYgc3RhcnQgPCBuZXdUZXh0Lmxlbmd0aCAmJiBvbGRUZXh0W3N0YXJ0XSA9PT0gbmV3VGV4dFtzdGFydF0pIHtcclxuICAgICAgc3RhcnQrK1xyXG4gICAgfVxyXG4gICAgbGV0IG9sZEVuZCA9IG9sZFRleHQubGVuZ3RoXHJcbiAgICBsZXQgbmV3RW5kID0gbmV3VGV4dC5sZW5ndGhcclxuICAgIHdoaWxlIChvbGRFbmQgPiBzdGFydCAmJiBuZXdFbmQgPiBzdGFydCAmJiBvbGRUZXh0W29sZEVuZCAtIDFdID09PSBuZXdUZXh0W25ld0VuZCAtIDFdKSB7XHJcbiAgICAgIG9sZEVuZC0tXHJcbiAgICAgIG5ld0VuZC0tXHJcbiAgICB9XHJcbiAgICBjb25zdCBpbnNlcnRlZCA9IG5ld1RleHQuc2xpY2Uoc3RhcnQsIG5ld0VuZClcclxuICAgIGNvbnN0IGZyb20gPSBpbmxpbmVPZmZzZXRGcm9tVGV4dChibG9jay5jb250ZW50LCBzdGFydClcclxuICAgIGNvbnN0IHRvID0gaW5saW5lT2Zmc2V0RnJvbVRleHQoYmxvY2suY29udGVudCwgb2xkRW5kKVxyXG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLmVkaXRvci5zdGF0ZVxyXG4gICAgY29uc3QgbWFya3MgPSBtYXJrc0F0SW5saW5lT2Zmc2V0KGJsb2NrLmNvbnRlbnQsIGZyb20pLmZpbHRlcigobWFyaykgPT5cclxuICAgICAgYmxvY2sudHlwZS5hbGxvd3NNYXJrVHlwZShtYXJrLnR5cGUpLFxyXG4gICAgKVxyXG4gICAgY29uc3QgZnJhZ21lbnQgPSBpbnNlcnRlZCA/IEZyYWdtZW50Lm9mKHN0YXRlLnNjaGVtYS50ZXh0KGluc2VydGVkLCBtYXJrcykpIDogRnJhZ21lbnQuZW1wdHlcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAocGF0aCwgZnJvbSwgdG8sIGZyYWdtZW50KSlcclxuXHJcbiAgICBjb25zdCBkb21TZWxlY3Rpb24gPSB0aGlzLmRvY3VtZW50LmdldFNlbGVjdGlvbj8uKClcclxuICAgIGNvbnN0IGNhcmV0ID1cclxuICAgICAgZG9tU2VsZWN0aW9uPy5hbmNob3JOb2RlICYmIHRoaXMuZG9tLmNvbnRhaW5zKGRvbVNlbGVjdGlvbi5hbmNob3JOb2RlKVxyXG4gICAgICAgID8gcG9zaXRpb25Gcm9tRE9NUG9pbnQoXHJcbiAgICAgICAgICAgIHRoaXMuZG9tLFxyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLFxyXG4gICAgICAgICAgICBkb21TZWxlY3Rpb24uYW5jaG9yTm9kZSxcclxuICAgICAgICAgICAgZG9tU2VsZWN0aW9uLmFuY2hvck9mZnNldCxcclxuICAgICAgICAgIClcclxuICAgICAgICA6IG51bGxcclxuICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihjYXJldCA/PyBwb3MocGF0aCwgZnJvbSArIGluc2VydGVkLmxlbmd0aCkpKVxyXG4gICAgdGhpcy5lZGl0b3IuZGlzcGF0Y2godHIpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBXaGV0aGVyIHRoZSBpbmxpbmUgYXRvbXMgcmVuZGVyZWQgZm9yIGEgYmxvY2sgc3RpbGwgbWF0Y2ggaXRzIG1vZGVsLCBieVxyXG4gICAqIGNvdW50LiBDb21wb3NpdGlvbiBvbmx5IGV2ZXIgcmV3cml0ZXMgdGV4dCwgc28gYSBtaXNtYXRjaCBtZWFucyB0aGVcclxuICAgKiBicm93c2VyIGRpZCBzb21ldGhpbmcgdGhlIHRleHQgZGlmZiBjYW5ub3QgZXhwcmVzcy5cclxuICAgKi9cclxuICBwcml2YXRlIGF0b21zQ2hhbmdlZChjb250ZW50OiBIVE1MRWxlbWVudCwgYmxvY2s6IEVkaXRvck5vZGUpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGV4cGVjdGVkID0gYmxvY2suY29udGVudC5jaGlsZHJlbi5maWx0ZXIoKGNoaWxkKSA9PiAhY2hpbGQuaXNUZXh0KS5sZW5ndGhcclxuICAgIGxldCBmb3VuZCA9IDBcclxuICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBjb250ZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyonKSkge1xyXG4gICAgICBpZiAodGhpcy5yZW5kZXJlci5tb2RlbE9mLmdldChlbGVtZW50IGFzIEhUTUxFbGVtZW50KT8uaXNBdG9tKSBmb3VuZCsrXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm91bmQgIT09IGV4cGVjdGVkXHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEVkaXRvciB9IGZyb20gJy4uL2VkaXRvci9lZGl0b3InXHJcbmltcG9ydCB7IGlubGluZVNpemUgfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgVGV4dE5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBub2RlQXRQYXRoIH0gZnJvbSAnLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uL3N0YXRlL2VkaXRvci1zdGF0ZSdcclxuaW1wb3J0IHsgVGV4dFNlbGVjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3NlbGVjdGlvbidcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHJpZ2dlck9wdGlvbnMge1xyXG4gIC8qKiBUaGUgdHJpZ2dlciBzZXF1ZW5jZSwgZS5nLiBgJ0AnYCwgYCcvJ2AsIGAnOidgLiAqL1xyXG4gIHJlYWRvbmx5IGNoYXI6IHN0cmluZ1xyXG4gIC8qKiBBbGxvdyB3aGl0ZXNwYWNlIGluc2lkZSB0aGUgcXVlcnkgKG11bHRpLXdvcmQgaXRlbSBuYW1lcykuICovXHJcbiAgcmVhZG9ubHkgYWxsb3dTcGFjZXM/OiBib29sZWFuXHJcbiAgLyoqIE9ubHkgbWF0Y2ggd2hlbiB0aGUgdHJpZ2dlciBzaXRzIGF0IHRoZSB2ZXJ5IHN0YXJ0IG9mIHRoZSBibG9jay4gKi9cclxuICByZWFkb25seSBzdGFydE9mQmxvY2s/OiBib29sZWFuXHJcbn1cclxuXHJcbi8qKiBBbiBhY3RpdmUgdHJpZ2dlcjogYFtmcm9tLCB0bylgIHNwYW5zIHRoZSB0cmlnZ2VyIGNoYXIgcGx1cyB0aGUgcXVlcnkuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHJpZ2dlck1hdGNoIHtcclxuICByZWFkb25seSBwYXRoOiBQYXRoXHJcbiAgcmVhZG9ubHkgZnJvbTogbnVtYmVyXHJcbiAgcmVhZG9ubHkgdG86IG51bWJlclxyXG4gIHJlYWRvbmx5IHF1ZXJ5OiBzdHJpbmdcclxufVxyXG5cclxuLyoqXHJcbiAqIEZpbmQgYW4gYWN0aXZlIHRyaWdnZXIgZW5kaW5nIGF0IHRoZSBjYXJldC4gVGhlIHNjYW4gY292ZXJzIHRoZSBjb250aWd1b3VzXHJcbiAqIHRleHQgcnVuIGJlZm9yZSB0aGUgY2FyZXQgKGlubGluZSBhdG9tcyBicmVhayBpdCkgYW5kIHJlcXVpcmVzIHRoZSB0cmlnZ2VyXHJcbiAqIGNoYXIgdG8gb3BlbiB0aGUgYmxvY2sgb3IgZm9sbG93IHdoaXRlc3BhY2UuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZmluZFRyaWdnZXIoc3RhdGU6IEVkaXRvclN0YXRlLCBvcHRpb25zOiBUcmlnZ2VyT3B0aW9ucyk6IFRyaWdnZXJNYXRjaCB8IG51bGwge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHx8ICFzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBudWxsXHJcbiAgY29uc3QgcGF0aCA9IHNlbGVjdGlvbi5oZWFkLnBhdGhcclxuICBjb25zdCBjYXJldCA9IHNlbGVjdGlvbi5oZWFkLm9mZnNldFxyXG4gIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBhdGgpXHJcbiAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2spIHJldHVybiBudWxsXHJcblxyXG4gIC8vIENvbnRpZ3VvdXMgdGV4dCBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGNhcmV0LlxyXG4gIGxldCB0ZXh0ID0gJydcclxuICBsZXQgb2Zmc2V0ID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgYmxvY2suY29udGVudC5jaGlsZHJlbikge1xyXG4gICAgaWYgKG9mZnNldCA+PSBjYXJldCkgYnJlYWtcclxuICAgIGNvbnN0IHNpemUgPSBpbmxpbmVTaXplKGNoaWxkKVxyXG4gICAgaWYgKGNoaWxkLmlzVGV4dCkge1xyXG4gICAgICB0ZXh0ICs9IChjaGlsZCBhcyBUZXh0Tm9kZSkudGV4dC5zbGljZSgwLCBNYXRoLm1heCgwLCBjYXJldCAtIG9mZnNldCkpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0ZXh0ID0gJycgLy8gYXRvbXMgdGVybWluYXRlIHRoZSBydW47IHJlc3RhcnQgYWZ0ZXIgdGhlbVxyXG4gICAgfVxyXG4gICAgb2Zmc2V0ICs9IHNpemVcclxuICB9XHJcbiAgY29uc3QgYmFzZSA9IGNhcmV0IC0gdGV4dC5sZW5ndGhcclxuXHJcbiAgY29uc3QgaW5kZXggPSB0ZXh0Lmxhc3RJbmRleE9mKG9wdGlvbnMuY2hhcilcclxuICBpZiAoaW5kZXggPCAwKSByZXR1cm4gbnVsbFxyXG4gIGlmIChvcHRpb25zLnN0YXJ0T2ZCbG9jayAmJiBiYXNlICsgaW5kZXggIT09IDApIHJldHVybiBudWxsXHJcbiAgY29uc3QgYmVmb3JlID0gaW5kZXggPiAwID8gdGV4dFtpbmRleCAtIDFdIDogdW5kZWZpbmVkXHJcbiAgaWYgKGJlZm9yZSAhPT0gdW5kZWZpbmVkICYmICEvXFxzLy50ZXN0KGJlZm9yZSkpIHJldHVybiBudWxsXHJcbiAgY29uc3QgcXVlcnkgPSB0ZXh0LnNsaWNlKGluZGV4ICsgb3B0aW9ucy5jaGFyLmxlbmd0aClcclxuICBpZiAoIW9wdGlvbnMuYWxsb3dTcGFjZXMgJiYgL1xccy8udGVzdChxdWVyeSkpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIHsgcGF0aCwgZnJvbTogYmFzZSArIGluZGV4LCB0bzogY2FyZXQsIHF1ZXJ5IH1cclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTdWdnZXN0aW9uT3B0aW9ucyBleHRlbmRzIFRyaWdnZXJPcHRpb25zIHtcclxuICAvKiogQSB0cmlnZ2VyIGJlY2FtZSBhY3RpdmUuICovXHJcbiAgcmVhZG9ubHkgb25TdGFydD86IChtYXRjaDogVHJpZ2dlck1hdGNoKSA9PiB2b2lkXHJcbiAgLyoqIFRoZSBxdWVyeSBvZiB0aGUgYWN0aXZlIHRyaWdnZXIgY2hhbmdlZC4gKi9cclxuICByZWFkb25seSBvblVwZGF0ZT86IChtYXRjaDogVHJpZ2dlck1hdGNoKSA9PiB2b2lkXHJcbiAgLyoqIFRoZSB0cmlnZ2VyIHdhcyBkaXNtaXNzZWQgKGRlbGV0ZWQsIGNhcmV0IGxlZnQsIGVkaXRvciBibHVycmVkIGl0KS4gKi9cclxuICByZWFkb25seSBvbkV4aXQ/OiAoKSA9PiB2b2lkXHJcbiAgLyoqIENvbnN1bWUga2V5cyB3aGlsZSBhY3RpdmUgKHBvcHVwIG5hdmlnYXRpb24pLiBSZXR1cm4gdHJ1ZSB3aGVuIGhhbmRsZWQuICovXHJcbiAgcmVhZG9ubHkgb25LZXlEb3duPzogKGV2ZW50OiBLZXlib2FyZEV2ZW50LCBtYXRjaDogVHJpZ2dlck1hdGNoKSA9PiBib29sZWFuXHJcbn1cclxuXHJcbi8qKiBQb3B1cCBzdGF0ZSBoYW5kZWQgdG8ge0BsaW5rIFN1Z2dlc3Rpb25MaXN0T3B0aW9ucy5vblN0YXRlfS4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBTdWdnZXN0aW9uTGlzdFN0YXRlPFQ+IHtcclxuICByZWFkb25seSBpdGVtczogcmVhZG9ubHkgVFtdXHJcbiAgcmVhZG9ubHkgc2VsZWN0ZWRJbmRleDogbnVtYmVyXHJcbiAgcmVhZG9ubHkgbWF0Y2g6IFRyaWdnZXJNYXRjaFxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFN1Z2dlc3Rpb25MaXN0T3B0aW9uczxUPiBleHRlbmRzIFRyaWdnZXJPcHRpb25zIHtcclxuICAvKiogSXRlbXMgZm9yIGEgcXVlcnk7IGFzeW5jIHByb3ZpZGVycyBhcmUgcmFjZWQgKHN0YWxlIHJlc3VsdHMgZHJvcHBlZCkuICovXHJcbiAgcmVhZG9ubHkgaXRlbXM6IChxdWVyeTogc3RyaW5nKSA9PiByZWFkb25seSBUW10gfCBQcm9taXNlPHJlYWRvbmx5IFRbXT5cclxuICAvKiogUmVuZGVyIGhvb2s6IHRoZSBjdXJyZW50IHBvcHVwIHN0YXRlLCBvciBudWxsIHdoZW4gY2xvc2VkLiAqL1xyXG4gIHJlYWRvbmx5IG9uU3RhdGU6IChzdGF0ZTogU3VnZ2VzdGlvbkxpc3RTdGF0ZTxUPiB8IG51bGwpID0+IHZvaWRcclxuICAvKiogQW4gaXRlbSB3YXMgY2hvc2VuIChFbnRlci9UYWIsIG9yIHByb2dyYW1tYXRpY2FsbHkgdmlhIGBzZWxlY3RgKS4gKi9cclxuICByZWFkb25seSBvblNlbGVjdDogKGl0ZW06IFQsIG1hdGNoOiBUcmlnZ2VyTWF0Y2gpID0+IHZvaWRcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTdWdnZXN0aW9uTGlzdEhhbmRsZSB7XHJcbiAgLyoqIENob29zZSBhbiBpdGVtIChtb3VzZSBjbGljayBpbiBhIHBvcHVwKS4gKi9cclxuICBzZWxlY3QoaW5kZXg6IG51bWJlcik6IHZvaWRcclxuICBkaXNwb3NlKCk6IHZvaWRcclxufVxyXG5cclxuLyoqXHJcbiAqIFRoZSBmdWxsIHBvcHVwIGRyaXZlciBzaGFyZWQgYnkgdGhlIHNsYXNoIGFuZCBlbW9qaSB0cmlnZ2VyczogdHJpZ2dlclxyXG4gKiB3YXRjaGluZywgaXRlbSBmZXRjaGluZywga2V5Ym9hcmQgbmF2aWdhdGlvbiAoYXJyb3dzLCBFbnRlci9UYWIsIEVzY2FwZSkuXHJcbiAqIFVJLWZyZWU6IHJlbmRlciB0aHJvdWdoIGBvblN0YXRlYC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzdWdnZXN0aW9uTGlzdDxUPihcclxuICBlZGl0b3I6IEVkaXRvcixcclxuICBvcHRpb25zOiBTdWdnZXN0aW9uTGlzdE9wdGlvbnM8VD4sXHJcbik6IFN1Z2dlc3Rpb25MaXN0SGFuZGxlIHtcclxuICBsZXQgc3RhdGU6IFN1Z2dlc3Rpb25MaXN0U3RhdGU8VD4gfCBudWxsID0gbnVsbFxyXG4gIGxldCBkaXNtaXNzZWQgPSBmYWxzZVxyXG4gIGxldCBmZXRjaElkID0gMFxyXG5cclxuICBjb25zdCBzZXRTdGF0ZSA9IChuZXh0OiBTdWdnZXN0aW9uTGlzdFN0YXRlPFQ+IHwgbnVsbCk6IHZvaWQgPT4ge1xyXG4gICAgc3RhdGUgPSBuZXh0XHJcbiAgICBvcHRpb25zLm9uU3RhdGUobmV4dClcclxuICB9XHJcblxyXG4gIGNvbnN0IGxvYWQgPSAobWF0Y2g6IFRyaWdnZXJNYXRjaCk6IHZvaWQgPT4ge1xyXG4gICAgY29uc3QgaWQgPSArK2ZldGNoSWRcclxuICAgIFByb21pc2UucmVzb2x2ZShvcHRpb25zLml0ZW1zKG1hdGNoLnF1ZXJ5KSkudGhlbihcclxuICAgICAgKGl0ZW1zKSA9PiB7XHJcbiAgICAgICAgaWYgKGlkICE9PSBmZXRjaElkIHx8IGRpc21pc3NlZCkgcmV0dXJuXHJcbiAgICAgICAgc2V0U3RhdGUoeyBpdGVtcywgc2VsZWN0ZWRJbmRleDogMCwgbWF0Y2ggfSlcclxuICAgICAgfSxcclxuICAgICAgKCkgPT4ge1xyXG4gICAgICAgIGlmIChpZCA9PT0gZmV0Y2hJZCkgc2V0U3RhdGUobnVsbClcclxuICAgICAgfSxcclxuICAgIClcclxuICB9XHJcblxyXG4gIGNvbnN0IHBpY2sgPSAoaW5kZXg6IG51bWJlcik6IHZvaWQgPT4ge1xyXG4gICAgY29uc3QgY3VycmVudCA9IHN0YXRlXHJcbiAgICBjb25zdCBpdGVtID0gY3VycmVudD8uaXRlbXNbaW5kZXhdXHJcbiAgICBpZiAoIWN1cnJlbnQgfHwgaXRlbSA9PT0gdW5kZWZpbmVkKSByZXR1cm5cclxuICAgIHNldFN0YXRlKG51bGwpXHJcbiAgICBkaXNtaXNzZWQgPSB0cnVlIC8vIHRoZSBpbnNlcnQgZWRpdHMgdGhlIGRvYzsgaWdub3JlIHVudGlsIHRoZSB0cmlnZ2VyIGV4aXRzXHJcbiAgICBvcHRpb25zLm9uU2VsZWN0KGl0ZW0sIGN1cnJlbnQubWF0Y2gpXHJcbiAgfVxyXG5cclxuICBjb25zdCBkaXNwb3NlID0gc3VnZ2VzdGlvbihlZGl0b3IsIHtcclxuICAgIGNoYXI6IG9wdGlvbnMuY2hhcixcclxuICAgIGFsbG93U3BhY2VzOiBvcHRpb25zLmFsbG93U3BhY2VzLFxyXG4gICAgc3RhcnRPZkJsb2NrOiBvcHRpb25zLnN0YXJ0T2ZCbG9jayxcclxuICAgIG9uU3RhcnQ6IChtYXRjaCkgPT4ge1xyXG4gICAgICBkaXNtaXNzZWQgPSBmYWxzZVxyXG4gICAgICBsb2FkKG1hdGNoKVxyXG4gICAgfSxcclxuICAgIG9uVXBkYXRlOiAobWF0Y2gpID0+IHtcclxuICAgICAgaWYgKCFkaXNtaXNzZWQpIGxvYWQobWF0Y2gpXHJcbiAgICB9LFxyXG4gICAgb25FeGl0OiAoKSA9PiB7XHJcbiAgICAgIGZldGNoSWQrK1xyXG4gICAgICBkaXNtaXNzZWQgPSBmYWxzZVxyXG4gICAgICBzZXRTdGF0ZShudWxsKVxyXG4gICAgfSxcclxuICAgIG9uS2V5RG93bjogKGV2ZW50KSA9PiB7XHJcbiAgICAgIGlmIChldmVudC5rZXkgPT09ICdFc2NhcGUnKSB7XHJcbiAgICAgICAgaWYgKCFzdGF0ZSAmJiBkaXNtaXNzZWQpIHJldHVybiBmYWxzZVxyXG4gICAgICAgIGZldGNoSWQrK1xyXG4gICAgICAgIGRpc21pc3NlZCA9IHRydWVcclxuICAgICAgICBzZXRTdGF0ZShudWxsKVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgIH1cclxuICAgICAgaWYgKCFzdGF0ZSB8fCBzdGF0ZS5pdGVtcy5sZW5ndGggPT09IDApIHJldHVybiBmYWxzZVxyXG4gICAgICBjb25zdCB7IGl0ZW1zLCBzZWxlY3RlZEluZGV4LCBtYXRjaCB9ID0gc3RhdGVcclxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93RG93bicgfHwgZXZlbnQua2V5ID09PSAnQXJyb3dVcCcpIHtcclxuICAgICAgICBjb25zdCBkZWx0YSA9IGV2ZW50LmtleSA9PT0gJ0Fycm93RG93bicgPyAxIDogLTFcclxuICAgICAgICBjb25zdCBuZXh0ID0gKHNlbGVjdGVkSW5kZXggKyBkZWx0YSArIGl0ZW1zLmxlbmd0aCkgJSBpdGVtcy5sZW5ndGhcclxuICAgICAgICBzZXRTdGF0ZSh7IGl0ZW1zLCBzZWxlY3RlZEluZGV4OiBuZXh0LCBtYXRjaCB9KVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgIH1cclxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VudGVyJyB8fCBldmVudC5rZXkgPT09ICdUYWInKSB7XHJcbiAgICAgICAgcGljayhzZWxlY3RlZEluZGV4KVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICB9LFxyXG4gIH0pXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBzZWxlY3Q6IHBpY2ssXHJcbiAgICBkaXNwb3NlOiAoKSA9PiB7XHJcbiAgICAgIGRpc3Bvc2UoKVxyXG4gICAgICBzZXRTdGF0ZShudWxsKVxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBXYXRjaCB0aGUgZWRpdG9yIGZvciBhIHRyaWdnZXIgY2hhcmFjdGVyIGFuZCBkcml2ZSBzdWdnZXN0aW9uLXBvcHVwXHJcbiAqIGNhbGxiYWNrcy4gS2V5Ym9hcmQgaW50ZXJjZXB0aW9uIGF0dGFjaGVzIG9uY2UgYSB2aWV3IGV4aXN0cy4gUmV0dXJucyBhXHJcbiAqIGRpc3Bvc2VyLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHN1Z2dlc3Rpb24oZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnM6IFN1Z2dlc3Rpb25PcHRpb25zKTogKCkgPT4gdm9pZCB7XHJcbiAgbGV0IGFjdGl2ZTogVHJpZ2dlck1hdGNoIHwgbnVsbCA9IG51bGxcclxuICBsZXQgZGV0YWNoS2V5czogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGxcclxuXHJcbiAgY29uc3QgYXR0YWNoS2V5cyA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmIChkZXRhY2hLZXlzIHx8ICFlZGl0b3IudmlldykgcmV0dXJuXHJcbiAgICBkZXRhY2hLZXlzID0gZWRpdG9yLnZpZXcuYWRkS2V5ZG93bkludGVyY2VwdG9yKChldmVudCkgPT4ge1xyXG4gICAgICBpZiAoIWFjdGl2ZSkgcmV0dXJuIGZhbHNlXHJcbiAgICAgIHJldHVybiBvcHRpb25zLm9uS2V5RG93bj8uKGV2ZW50LCBhY3RpdmUpID8/IGZhbHNlXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgY29uc3QgY2hlY2sgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBhdHRhY2hLZXlzKClcclxuICAgIGNvbnN0IG1hdGNoID0gZmluZFRyaWdnZXIoZWRpdG9yLnN0YXRlLCBvcHRpb25zKVxyXG4gICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgIGNvbnN0IHN0YXJ0ZWQgPSBhY3RpdmUgPT09IG51bGxcclxuICAgICAgYWN0aXZlID0gbWF0Y2hcclxuICAgICAgaWYgKHN0YXJ0ZWQpIG9wdGlvbnMub25TdGFydD8uKG1hdGNoKVxyXG4gICAgICBlbHNlIG9wdGlvbnMub25VcGRhdGU/LihtYXRjaClcclxuICAgIH0gZWxzZSBpZiAoYWN0aXZlKSB7XHJcbiAgICAgIGFjdGl2ZSA9IG51bGxcclxuICAgICAgb3B0aW9ucy5vbkV4aXQ/LigpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb25zdCB1bnN1YnNjcmliZSA9IGVkaXRvci5vbigndHJhbnNhY3Rpb24nLCBjaGVjaylcclxuICBhdHRhY2hLZXlzKClcclxuICByZXR1cm4gKCkgPT4ge1xyXG4gICAgdW5zdWJzY3JpYmUoKVxyXG4gICAgZGV0YWNoS2V5cz8uKClcclxuICAgIGlmIChhY3RpdmUpIHtcclxuICAgICAgYWN0aXZlID0gbnVsbFxyXG4gICAgICBvcHRpb25zLm9uRXhpdD8uKClcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7IHNldE1hcmssIHVuc2V0TWFyayB9IGZyb20gJy4uL2NvbW1hbmRzL2NvbW1hbmRzJ1xyXG5pbXBvcnQgdHlwZSB7IEF0dHJzIH0gZnJvbSAnLi4vbW9kZWwvYXR0cnMnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yLCBFZGl0b3JTbmFwc2hvdCB9IGZyb20gJy4vZWRpdG9yJ1xyXG5cclxuLyoqXHJcbiAqIEEgY2FwdHVyZWQgc2V0IG9mIGZvcm1hdHRpbmc6IHRoZSBpbmxpbmUgbWFya3Mgd2l0aCB0aGVpciBhdHRyaWJ1dGVzLCBhbmRcclxuICogb3B0aW9uYWxseSB0aGUgYmxvY2sgdHlwZSBhbmQgaXRzIGxheW91dC4gUGxhaW4gZGF0YSwgc28gYW4gYXBwbGljYXRpb24gY2FuXHJcbiAqIHN0b3JlIGl0LCBzaG93IGl0LCBvciBhcHBseSBpdCBsYXRlci5cclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ29waWVkRm9ybWF0IHtcclxuICAvKiogTWFyayBuYW1lIFx1MjE5MiBhdHRyaWJ1dGVzLCBmb3IgZXZlcnkgbWFyayBhY3RpdmUgYXQgdGhlIGNvcHkgcG9pbnQuICovXHJcbiAgcmVhZG9ubHkgbWFya3M6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIEF0dHJzPj5cclxuICAvKiogQmxvY2sgdHlwZSBuYW1lLCB3aGVuIGJsb2NrIGZvcm1hdHRpbmcgd2FzIGluY2x1ZGVkLiAqL1xyXG4gIHJlYWRvbmx5IGJsb2NrVHlwZTogc3RyaW5nIHwgbnVsbFxyXG4gIHJlYWRvbmx5IGJsb2NrQXR0cnM6IEF0dHJzIHwgbnVsbFxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEZvcm1hdFBhaW50ZXJPcHRpb25zIHtcclxuICAvKipcclxuICAgKiBDb3B5IHRoZSBibG9jayB0eXBlIGFuZCBhbGlnbm1lbnQgYXMgd2VsbCBhcyB0aGUgaW5saW5lIG1hcmtzLlxyXG4gICAqIE9uIGJ5IGRlZmF1bHQ6IGl0IGlzIHdoYXQgdXNlcnMgZXhwZWN0IGZyb20gYSBmb3JtYXQgcGFpbnRlci5cclxuICAgKi9cclxuICByZWFkb25seSBpbmNsdWRlQmxvY2s/OiBib29sZWFuXHJcbiAgLyoqIE5vdGlmaWVkIHdoZW5ldmVyIHRoZSBhcm1lZCBzdGF0ZSBjaGFuZ2VzLCBmb3IgYnV0dG9uIHN0eWxpbmcuICovXHJcbiAgcmVhZG9ubHkgb25DaGFuZ2U/OiAoc3RhdGU6IEZvcm1hdFBhaW50ZXJTdGF0ZSkgPT4gdm9pZFxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEZvcm1hdFBhaW50ZXJTdGF0ZSB7XHJcbiAgLyoqIFRoZSBjYXB0dXJlZCBmb3JtYXQsIG9yIG51bGwgd2hlbiBub3RoaW5nIGhhcyBiZWVuIGNvcGllZC4gKi9cclxuICByZWFkb25seSBmb3JtYXQ6IENvcGllZEZvcm1hdCB8IG51bGxcclxuICAvKiogVHJ1ZSB3aGlsZSB0aGUgcGFpbnRlciB3aWxsIGFwcGx5IHRvIHRoZSBuZXh0IHNlbGVjdGlvbi4gKi9cclxuICByZWFkb25seSBhcm1lZDogYm9vbGVhblxyXG4gIC8qKiBUcnVlIHdoZW4gYXJtZWQgdW50aWwgZXhwbGljaXRseSB0dXJuZWQgb2ZmLCByYXRoZXIgdGhhbiBmb3Igb25lIHVzZS4gKi9cclxuICByZWFkb25seSBsb2NrZWQ6IGJvb2xlYW5cclxufVxyXG5cclxuLyoqIE1hcmtzIHRoYXQgZGVzY3JpYmUgZm9ybWF0dGluZy4gTGlua3MgYW5kIHN1Z2dlc3Rpb25zIGFyZSBub3Qgc3R5bGluZy4gKi9cclxuY29uc3QgTk9OX0ZPUk1BVFRJTkcgPSBuZXcgU2V0KFsnbGluaycsICdpbnNlcnRpb24nLCAnZGVsZXRpb24nLCAnY29tbWVudCddKVxyXG5cclxuLyoqXHJcbiAqIENvcGllcyBmb3JtYXR0aW5nIGZyb20gb25lIHBsYWNlIGluIHRoZSBkb2N1bWVudCBhbmQgYXBwbGllcyBpdCB0byBhbm90aGVyOlxyXG4gKiB0aGUgXCJmb3JtYXQgcGFpbnRlclwiIGV2ZXJ5IHdvcmQgcHJvY2Vzc29yIGhhcy5cclxuICpcclxuICogU2luZ2xlLWFybSBhcHBsaWVzIG9uY2UgYW5kIGRpc2FybXM7IHtAbGluayBjb3B5QW5kTG9ja30gc3RheXMgYXJtZWQgdW50aWxcclxuICogdHVybmVkIG9mZiwgd2hpY2ggaXMgdGhlIGRvdWJsZS1jbGljayBiZWhhdmlvdXIgdXNlcnMgZXhwZWN0LlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIEZvcm1hdFBhaW50ZXIge1xyXG4gIHByaXZhdGUgZm9ybWF0OiBDb3BpZWRGb3JtYXQgfCBudWxsID0gbnVsbFxyXG4gIHByaXZhdGUgYXJtZWQgPSBmYWxzZVxyXG4gIHByaXZhdGUgbG9ja2VkID0gZmFsc2VcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogRWRpdG9yLFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBGb3JtYXRQYWludGVyT3B0aW9ucyA9IHt9LFxyXG4gICkge31cclxuXHJcbiAgZ2V0IHN0YXRlKCk6IEZvcm1hdFBhaW50ZXJTdGF0ZSB7XHJcbiAgICByZXR1cm4geyBmb3JtYXQ6IHRoaXMuZm9ybWF0LCBhcm1lZDogdGhpcy5hcm1lZCwgbG9ja2VkOiB0aGlzLmxvY2tlZCB9XHJcbiAgfVxyXG5cclxuICAvKiogQ2FwdHVyZSB0aGUgZm9ybWF0dGluZyBhdCB0aGUgY3VycmVudCBzZWxlY3Rpb24gYW5kIGFybSBmb3Igb25lIHVzZS4gKi9cclxuICBjb3B5KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuY2FwdHVyZShmYWxzZSlcclxuICB9XHJcblxyXG4gIC8qKiBDYXB0dXJlIGFuZCBzdGF5IGFybWVkIHVudGlsIHtAbGluayBjYW5jZWx9LCB0aGUgZG91YmxlLWNsaWNrIG1vZGUuICovXHJcbiAgY29weUFuZExvY2soKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5jYXB0dXJlKHRydWUpXHJcbiAgfVxyXG5cclxuICAvKiogRGlzYXJtIHdpdGhvdXQgY2xlYXJpbmcgd2hhdCB3YXMgY29waWVkLiAqL1xyXG4gIGNhbmNlbCgpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5hcm1lZCAmJiAhdGhpcy5sb2NrZWQpIHJldHVyblxyXG4gICAgdGhpcy5hcm1lZCA9IGZhbHNlXHJcbiAgICB0aGlzLmxvY2tlZCA9IGZhbHNlXHJcbiAgICB0aGlzLmVtaXQoKVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQXBwbHkgdGhlIGNhcHR1cmVkIGZvcm1hdHRpbmcgdG8gdGhlIGN1cnJlbnQgc2VsZWN0aW9uLiBEaXNhcm1zXHJcbiAgICogYWZ0ZXJ3YXJkcyB1bmxlc3MgbG9ja2VkLiBSZXR1cm5zIGZhbHNlIHdoZW4gbm90aGluZyB3YXMgYXBwbGllZC5cclxuICAgKi9cclxuICBhcHBseSgpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGZvcm1hdCA9IHRoaXMuZm9ybWF0XHJcbiAgICBpZiAoIWZvcm1hdCkgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgY29uc3Qgc25hcHNob3QgPSB0aGlzLmVkaXRvci5nZXRTbmFwc2hvdCgpXHJcbiAgICBjb25zdCBjaGFpbiA9IHRoaXMuZWRpdG9yLmNoYWluKClcclxuXHJcbiAgICAvLyBSZW1vdmUgdGhlIGZvcm1hdHRpbmcgYWxyZWFkeSB0aGVyZSwgc28gdGhlIHJlc3VsdCBpcyB0aGUgY29waWVkIHN0eWxlXHJcbiAgICAvLyByYXRoZXIgdGhhbiBhIG1lcmdlIG9mIHRoZSB0d28uXHJcbiAgICBmb3IgKGNvbnN0IG5hbWUgb2Ygc25hcHNob3QuYWN0aXZlTWFya3MpIHtcclxuICAgICAgaWYgKCFOT05fRk9STUFUVElORy5oYXMobmFtZSkgJiYgIShuYW1lIGluIGZvcm1hdC5tYXJrcykpIHtcclxuICAgICAgICBjaGFpbi5jb21tYW5kKHVuc2V0TWFyayhuYW1lKSlcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgZm9yIChjb25zdCBbbmFtZSwgYXR0cnNdIG9mIE9iamVjdC5lbnRyaWVzKGZvcm1hdC5tYXJrcykpIHtcclxuICAgICAgY2hhaW4uY29tbWFuZChzZXRNYXJrKG5hbWUsIGF0dHJzKSlcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZm9ybWF0LmJsb2NrVHlwZSkge1xyXG4gICAgICBjaGFpbi5zZXRCbG9ja1R5cGUoZm9ybWF0LmJsb2NrVHlwZSwgZm9ybWF0LmJsb2NrQXR0cnMgPz8gdW5kZWZpbmVkKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGFwcGxpZWQgPSBjaGFpbi5ydW4oKVxyXG4gICAgaWYgKCF0aGlzLmxvY2tlZCkge1xyXG4gICAgICB0aGlzLmFybWVkID0gZmFsc2VcclxuICAgICAgdGhpcy5lbWl0KClcclxuICAgIH1cclxuICAgIHJldHVybiBhcHBsaWVkXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhcHR1cmUobG9ja2VkOiBib29sZWFuKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBzbmFwc2hvdCA9IHRoaXMuZWRpdG9yLmdldFNuYXBzaG90KClcclxuICAgIHRoaXMuZm9ybWF0ID0gZm9ybWF0RnJvbVNuYXBzaG90KHNuYXBzaG90LCB0aGlzLm9wdGlvbnMuaW5jbHVkZUJsb2NrICE9PSBmYWxzZSlcclxuICAgIHRoaXMuYXJtZWQgPSB0cnVlXHJcbiAgICB0aGlzLmxvY2tlZCA9IGxvY2tlZFxyXG4gICAgdGhpcy5lbWl0KClcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGVtaXQoKTogdm9pZCB7XHJcbiAgICB0aGlzLm9wdGlvbnMub25DaGFuZ2U/Lih0aGlzLnN0YXRlKVxyXG4gIH1cclxufVxyXG5cclxuLyoqIEV4dHJhY3QgdGhlIGZvcm1hdHRpbmcgaGFsZiBvZiBhIHNuYXBzaG90LiBFeHBvcnRlZCBmb3IgdGVzdGluZyBhbmQgcmV1c2UuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRGcm9tU25hcHNob3Qoc25hcHNob3Q6IEVkaXRvclNuYXBzaG90LCBpbmNsdWRlQmxvY2sgPSB0cnVlKTogQ29waWVkRm9ybWF0IHtcclxuICBjb25zdCBtYXJrczogUmVjb3JkPHN0cmluZywgQXR0cnM+ID0ge31cclxuICBmb3IgKGNvbnN0IG5hbWUgb2Ygc25hcHNob3QuYWN0aXZlTWFya3MpIHtcclxuICAgIGlmIChOT05fRk9STUFUVElORy5oYXMobmFtZSkpIGNvbnRpbnVlXHJcbiAgICBtYXJrc1tuYW1lXSA9IHNuYXBzaG90Lm1hcmtBdHRyc1tuYW1lXSA/PyB7fVxyXG4gIH1cclxuXHJcbiAgaWYgKCFpbmNsdWRlQmxvY2spIHJldHVybiB7IG1hcmtzLCBibG9ja1R5cGU6IG51bGwsIGJsb2NrQXR0cnM6IG51bGwgfVxyXG5cclxuICAvLyBDYXJyeSB0aGUgbGF5b3V0IGF0dHJpYnV0ZXMsIGJ1dCBub3QgY29udGVudC1iZWFyaW5nIG9uZXMgbGlrZSBhIGNvZGVcclxuICAvLyBibG9jaydzIGxhbmd1YWdlLCBwYXN0aW5nIGEgc3R5bGUgc2hvdWxkIG5vdCBjaGFuZ2Ugd2hhdCBhIGJsb2NrIG1lYW5zLlxyXG4gIGNvbnN0IGJsb2NrQXR0cnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge31cclxuICBpZiAoc25hcHNob3QuYWxpZ24gIT09IG51bGwpIGJsb2NrQXR0cnMuYWxpZ24gPSBzbmFwc2hvdC5hbGlnblxyXG4gIGlmIChzbmFwc2hvdC5pbmRlbnQpIGJsb2NrQXR0cnMuaW5kZW50ID0gc25hcHNob3QuaW5kZW50XHJcbiAgY29uc3QgbGV2ZWwgPSBzbmFwc2hvdC5ibG9ja0F0dHJzPy5sZXZlbFxyXG4gIGlmICh0eXBlb2YgbGV2ZWwgPT09ICdudW1iZXInKSBibG9ja0F0dHJzLmxldmVsID0gbGV2ZWxcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIG1hcmtzLFxyXG4gICAgYmxvY2tUeXBlOiBzbmFwc2hvdC5ibG9ja1R5cGUsXHJcbiAgICBibG9ja0F0dHJzOiBPYmplY3Qua2V5cyhibG9ja0F0dHJzKS5sZW5ndGggPiAwID8gYmxvY2tBdHRycyA6IG51bGwsXHJcbiAgfVxyXG59XHJcblxyXG4vKiogQSBzaG9ydCBodW1hbi1yZWFkYWJsZSBkZXNjcmlwdGlvbiBvZiBhIGNvcGllZCBmb3JtYXQsIGZvciBhIHRvb2x0aXAuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBkZXNjcmliZUZvcm1hdChmb3JtYXQ6IENvcGllZEZvcm1hdCB8IG51bGwpOiBzdHJpbmcge1xyXG4gIGlmICghZm9ybWF0KSByZXR1cm4gJ05vdGhpbmcgY29waWVkJ1xyXG4gIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdXHJcbiAgaWYgKGZvcm1hdC5ibG9ja1R5cGUgJiYgZm9ybWF0LmJsb2NrVHlwZSAhPT0gJ3BhcmFncmFwaCcpIHBhcnRzLnB1c2goZm9ybWF0LmJsb2NrVHlwZSlcclxuICBwYXJ0cy5wdXNoKC4uLk9iamVjdC5rZXlzKGZvcm1hdC5tYXJrcykpXHJcbiAgcmV0dXJuIHBhcnRzLmxlbmd0aCA+IDAgPyBwYXJ0cy5qb2luKCcsICcpIDogJ1BsYWluIHRleHQnXHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRWRpdG9yIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvcidcclxuXHJcbi8qKlxyXG4gKiBUaGUgZG9jdW1lbnQgYSBwaWVjZSBvZiBmbG9hdGluZyBjaHJvbWUgc2hvdWxkIGJ1aWxkIGl0c2VsZiBpbnRvLlxyXG4gKlxyXG4gKiBFdmVyeSBkcm9wZG93biwgcG9wb3ZlciwgdG9vbGJhciBhbmQgaGFuZGxlIG5lZWRzIHRoZSBzYW1lIHRoaW5nIGFuZCB1c2VkIHRvXHJcbiAqIHdvcmsgaXQgb3V0IHRoZSBzYW1lIHRocmVlIGxpbmVzIGF0IGEgdGltZTogdGhlIHZpZXcncyBvd24gZWxlbWVudCBpZiB0aGVcclxuICogZWRpdG9yIGhhcyBhIHZpZXcsIG90aGVyd2lzZSB3aGF0ZXZlciBjb250YWluZXIgdGhlIGNhbGxlciB3YXMgZ2l2ZW4sIGFuZFxyXG4gKiB0aGUgZG9jdW1lbnQgdGhhdCBlbGVtZW50IGJlbG9uZ3MgdG8uXHJcbiAqXHJcbiAqIEl0IHRocm93cyByYXRoZXIgdGhhbiByZXR1cm5pbmcgbnVsbCBiZWNhdXNlIHRoZXJlIGlzIG5vdGhpbmcgdXNlZnVsIGFcclxuICogY29udHJvbCBjYW4gZG8gd2l0aG91dCBvbmUuIEl0IHdvdWxkIGhhdmUgdG8gYnVpbGQgaW50byBhIGRvY3VtZW50IGl0XHJcbiAqIGludmVudGVkLCB3aGljaCBubyBob3N0IHdvdWxkIGV2ZXIgc2VlLiBgY2FsbGVyYCBpcyBpbiB0aGUgbWVzc2FnZSBiZWNhdXNlXHJcbiAqIGEgaG9zdCB3aXJpbmcgc2l4IG9mIHRoZXNlIGluIGEgcm93IG5lZWRzIHRvIGtub3cgd2hpY2ggb2YgdGhlbSBpdCBjYWxsZWRcclxuICogYmVmb3JlIHRoZSBlZGl0b3IgaGFkIGEgdmlldy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBlZGl0b3JEb2N1bWVudChcclxuICBlZGl0b3I6IEVkaXRvcixcclxuICBjb250YWluZXI6IEVsZW1lbnQgfCBudWxsIHwgdW5kZWZpbmVkLFxyXG4gIGNhbGxlcjogc3RyaW5nLFxyXG4pOiBEb2N1bWVudCB7XHJcbiAgY29uc3QgaG9zdCA9IGVkaXRvci52aWV3Py5kb20gPz8gY29udGFpbmVyXHJcbiAgY29uc3QgZG9jdW1lbnQgPSBob3N0Py5vd25lckRvY3VtZW50XHJcbiAgaWYgKCFkb2N1bWVudCkgdGhyb3cgbmV3IEVycm9yKGAke2NhbGxlcn06IHRoZSBlZGl0b3IgbXVzdCBoYXZlIGEgdmlld2ApXHJcbiAgcmV0dXJuIGRvY3VtZW50XHJcbn1cclxuIiwgIi8qKlxyXG4gKiBFcnJvcnMgc2hhcmVkIGFjcm9zcyB0aGUgd29ya3NwYWNlLlxyXG4gKlxyXG4gKiBgVXBsb2FkRXJyb3JgIGxpdmVzIGhlcmUgcmF0aGVyIHRoYW4gaW4gdGhlIGV4dGVuc2lvbiB0aGF0IHJhaXNlcyBpdCBiZWNhdXNlXHJcbiAqIHR3byBvZiB0aGVtIGRvLCBgQHRyZXZpeGFsL2V4dGVuc2lvbi1pbWFnZWAgYW5kIGBAdHJldml4YWwvZXh0ZW5zaW9uLWVtYmVkYCxcclxuICogYW5kIGVhY2ggdXNlZCB0byBkZWNsYXJlIGl0cyBvd24uIFR3byBjbGFzc2VzIG9mIHRoZSBzYW1lIG5hbWUgYXJlIHR3b1xyXG4gKiBkaWZmZXJlbnQgY2xhc3NlcyBhdCBydW50aW1lOiBgY2F0Y2ggKGVycm9yKSB7IGVycm9yIGluc3RhbmNlb2YgVXBsb2FkRXJyb3IgfWBcclxuICogd3JpdHRlbiBhZ2FpbnN0IG9uZSBvZiB0aGVtIHNpbGVudGx5IHNraXBzIHRoZSBvdGhlcidzLiBDb3JlIGlzIHRoZSBvbmx5XHJcbiAqIHBhY2thZ2UgYm90aCBhbHJlYWR5IGRlcGVuZCBvbiwgc28gaXQgaXMgd2hlcmUgdGhlIG9uZSBkZWZpbml0aW9uIGNhbiBzaXQuXHJcbiAqL1xyXG5cclxuLyoqIEEgc3RvcmFnZSBiYWNrZW5kIHJlZnVzZWQgb3IgZmFpbGVkIGFuIHVwbG9hZC4gKi9cclxuZXhwb3J0IGNsYXNzIFVwbG9hZEVycm9yIGV4dGVuZHMgRXJyb3Ige1xyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgbWVzc2FnZTogc3RyaW5nLFxyXG4gICAgb3ZlcnJpZGUgcmVhZG9ubHkgY2F1c2U/OiB1bmtub3duLFxyXG4gICkge1xyXG4gICAgc3VwZXIobWVzc2FnZSlcclxuICAgIHRoaXMubmFtZSA9ICdVcGxvYWRFcnJvcidcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIGNhcGFiaWxpdHkgdGhpcyBjb2RlIG5lZWRzIGlzIG1pc3NpbmcgZnJvbSB0aGUgcnVudGltZSBpdCBpcyBpbi5cclxuICpcclxuICogTm90IGEgYnVnIGFuZCBub3QgYmFkIGlucHV0OiBXZWJDcnlwdG8gaXMgYWJzZW50IG9uIGFuIGluc2VjdXJlIG9yaWdpbixcclxuICogYERlY29tcHJlc3Npb25TdHJlYW1gIG9uIGFuIG9sZGVyIGJyb3dzZXIsIGEgY2FudmFzIG9uIGEgc2VydmVyLiBBIGhvc3QgdGhhdFxyXG4gKiBjYXRjaGVzIHRoaXMgY2FuIHNheSBcInRoaXMgYnJvd3NlciBjYW5ub3QgZG8gdGhhdFwiIGFuZCBkaXNhYmxlIHRoZSBidXR0b24sXHJcbiAqIHdoaWNoIGlzIGEgZGlmZmVyZW50IGFuc3dlciBmcm9tIFwidGhhdCBmaWxlIGlzIGJyb2tlblwiLCBzbyBpdCBpcyBhXHJcbiAqIGRpZmZlcmVudCBjbGFzcy5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBVbnN1cHBvcnRlZEVudmlyb25tZW50RXJyb3IgZXh0ZW5kcyBFcnJvciB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBtZXNzYWdlOiBzdHJpbmcsXHJcbiAgICBvdmVycmlkZSByZWFkb25seSBjYXVzZT86IHVua25vd24sXHJcbiAgKSB7XHJcbiAgICBzdXBlcihtZXNzYWdlKVxyXG4gICAgdGhpcy5uYW1lID0gJ1Vuc3VwcG9ydGVkRW52aXJvbm1lbnRFcnJvcidcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7XHJcbiAgdHlwZSBDYXNlTW9kZSxcclxuICB0eXBlIENvbW1hbmQsXHJcbiAgY2xlYXJBbGxGb3JtYXR0aW5nLFxyXG4gIGNsZWFyQmxvY2tGb3JtYXR0aW5nLFxyXG4gIGNsZWFyRm9ybWF0dGluZyxcclxuICBjb252ZXJ0Q2FzZSxcclxuICBkZWxldGVTZWxlY3Rpb24sXHJcbiAgaW5kZW50QmxvY2tzLFxyXG4gIGluc2VydEJsb2NrQWZ0ZXIsXHJcbiAgaW5zZXJ0SW5saW5lTm9kZSxcclxuICBpbnNlcnRUZXh0LFxyXG4gIGlzTWFya0FjdGl2ZSxcclxuICBqb2luQmFja3dhcmQsXHJcbiAgbGlmdCxcclxuICBzZWxlY3RBbGwsXHJcbiAgc2V0QmxvY2tBdHRycyxcclxuICBzZXRCbG9ja1R5cGUsXHJcbiAgc2V0TGV0dGVyU3BhY2luZyxcclxuICBzZXRMaW5lSGVpZ2h0LFxyXG4gIHNldE1hcmssXHJcbiAgc2V0UGFyYWdyYXBoU3BhY2luZyxcclxuICBzZXRUZXh0QWxpZ24sXHJcbiAgc3BsaXRCbG9jayxcclxuICB0b2dnbGVNYXJrLFxyXG4gIHRvZ2dsZVNtYWxsQ2FwcyxcclxuICB1bnNldE1hcmssXHJcbiAgd3JhcEluLFxyXG59IGZyb20gJy4uL2NvbW1hbmRzL2NvbW1hbmRzJ1xyXG5pbXBvcnQge1xyXG4gIGNvbnRpbnVlTnVtYmVyaW5nLFxyXG4gIGNvbnRpbnVlTnVtYmVyaW5nRnJvbVByZXZpb3VzLFxyXG4gIGxpZnRMaXN0SXRlbSxcclxuICByZXN0YXJ0TnVtYmVyaW5nLFxyXG4gIHNldExpc3RTdHlsZSxcclxuICBzaW5rTGlzdEl0ZW0sXHJcbiAgc3BsaXRMaXN0SXRlbSxcclxuICB0b2dnbGVMaXN0LFxyXG4gIHRvZ2dsZVRhc2tDaGVja2VkLFxyXG4gIHRvZ2dsZVRhc2tMaXN0LFxyXG59IGZyb20gJy4uL2NvbW1hbmRzL2xpc3RzJ1xyXG5pbXBvcnQgeyBBRERfVE9fSElTVE9SWSwgSGlzdG9yeSwgdHlwZSBIaXN0b3J5RW50cnksIHR5cGUgSGlzdG9yeU9wdGlvbnMgfSBmcm9tICcuLi9oaXN0b3J5L2hpc3RvcnknXHJcbmltcG9ydCB0eXBlIHsgSW5wdXRSdWxlIH0gZnJvbSAnLi4vaW5wdXQtcnVsZXMvaW5wdXQtcnVsZXMnXHJcbmltcG9ydCB7IHR5cGUgQXR0cnMsIGF0dHJzRXEgfSBmcm9tICcuLi9tb2RlbC9hdHRycydcclxuaW1wb3J0IHsgYmxvY2tzSW5SYW5nZSB9IGZyb20gJy4uL21vZGVsL2Jsb2NrcydcclxuaW1wb3J0IHsgY2hhcmFjdGVyQ291bnQsIHBhcmFncmFwaENvdW50LCBzZW50ZW5jZUNvdW50LCB3b3JkQ291bnQgfSBmcm9tICcuLi9tb2RlbC9jb3VudHMnXHJcbmltcG9ydCB7IG1hcmtzQXRJbmxpbmVPZmZzZXQsIHJhbmdlc1dpdGhNYXJrIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgeyB0eXBlIERvY0pTT04sIG5vZGVGcm9tSlNPTiB9IGZyb20gJy4uL21vZGVsL2pzb24nXHJcbmltcG9ydCB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBub3JtYWxpemVEb2MgfSBmcm9tICcuLi9tb2RlbC9ub3JtYWxpemUnXHJcbmltcG9ydCB7IHBvcyB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgdHlwZSB7IFNjaGVtYSB9IGZyb20gJy4uL21vZGVsL3NjaGVtYSdcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoIH0gZnJvbSAnLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHsgc2VyaWFsaXplVG9IVE1MLCBzZXJpYWxpemVUb1RleHQgfSBmcm9tICcuLi9zZXJpYWxpemUvaHRtbCdcclxuaW1wb3J0IHsgRWRpdG9yU3RhdGUgfSBmcm9tICcuLi9zdGF0ZS9lZGl0b3Itc3RhdGUnXHJcbmltcG9ydCB7IHR5cGUgU2VsZWN0aW9uLCBUZXh0U2VsZWN0aW9uLCBzZWxlY3Rpb25OZWFyIH0gZnJvbSAnLi4vc3RhdGUvc2VsZWN0aW9uJ1xyXG5pbXBvcnQgeyBSZXBsYWNlTm9kZXNTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1ub2RlcydcclxuaW1wb3J0IHR5cGUgeyBUcmFuc2FjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3RyYW5zYWN0aW9uJ1xyXG5pbXBvcnQgeyBFZGl0b3JWaWV3LCB0eXBlIE5vZGVWaWV3RmFjdG9yeSB9IGZyb20gJy4uL3ZpZXcvZWRpdG9yLXZpZXcnXHJcbmltcG9ydCB0eXBlIHsgS2V5bWFwIH0gZnJvbSAnLi4vdmlldy9rZXltYXAnXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRvckNoYW5nZSB7XHJcbiAgcmVhZG9ubHkgZWRpdG9yOiBFZGl0b3JcclxuICByZWFkb25seSBqc29uOiBEb2NKU09OXHJcbiAgcmVhZG9ubHkgaHRtbDogc3RyaW5nXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yT3B0aW9ucyB7XHJcbiAgcmVhZG9ubHkgc2NoZW1hOiBTY2hlbWFcclxuICAvKiogSW5pdGlhbCBjb250ZW50IGFzIGNhbm9uaWNhbCBKU09OLiAqL1xyXG4gIHJlYWRvbmx5IGNvbnRlbnQ/OiBEb2NKU09OXHJcbiAgcmVhZG9ubHkgZG9jPzogRWRpdG9yTm9kZVxyXG4gIC8qKiBNb3VudCBwb2ludCBmb3IgdGhlIGNvbnRlbnRlZGl0YWJsZSB2aWV3LiBPbWl0IGZvciBhIGhlYWRsZXNzIGVkaXRvci4gKi9cclxuICByZWFkb25seSBlbGVtZW50PzogSFRNTEVsZW1lbnQgfCBudWxsXHJcbiAgcmVhZG9ubHkgYXV0b2ZvY3VzPzogYm9vbGVhblxyXG4gIC8qKiBFeHRyYSBrZXkgYmluZGluZ3MgZm9yIHRoZSB2aWV3OyB0aGV5IHdpbiBvdmVyIHRoZSBiYXNlIGtleW1hcC4gKi9cclxuICByZWFkb25seSBrZXltYXA/OiBLZXltYXBcclxuICAvKiogVGV4dCBzaG93biB3aGlsZSB0aGUgZG9jdW1lbnQgaXMgZW1wdHkuICovXHJcbiAgcmVhZG9ubHkgcGxhY2Vob2xkZXI/OiBzdHJpbmdcclxuICAvKiogQWNjZXNzaWJsZSBuYW1lIGZvciB0aGUgc3VyZmFjZTsgc2VlIHtAbGluayBFZGl0b3JWaWV3T3B0aW9ucy5hcmlhTGFiZWx9LiAqL1xyXG4gIHJlYWRvbmx5IGFyaWFMYWJlbD86IHN0cmluZ1xyXG4gIC8qKiBTdGFydCByZWFkLW9ubHkuIEZsaXAgYXQgcnVudGltZSB3aXRoIHtAbGluayBFZGl0b3Iuc2V0RWRpdGFibGV9LiAqL1xyXG4gIHJlYWRvbmx5IGVkaXRhYmxlPzogYm9vbGVhblxyXG4gIC8qKlxyXG4gICAqIEJyb3dzZXIgc3BlbGwgY2hlY2tpbmcgb24gdGhlIGVkaXRpbmcgc3VyZmFjZS4gTGVmdCB0byB0aGUgYnJvd3NlcidzXHJcbiAgICogZGVmYXVsdCB3aGVuIG9taXR0ZWQ7IGZsaXAgYXQgcnVudGltZSB3aXRoIHtAbGluayBFZGl0b3Iuc2V0U3BlbGxjaGVja30uXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgc3BlbGxjaGVjaz86IGJvb2xlYW5cclxuICAvKiogUmVqZWN0IGVkaXRzIHRoYXQgd291bGQgcHVzaCB0aGUgY2hhcmFjdGVyIGNvdW50IHBhc3QgdGhpcyBsaW1pdC4gKi9cclxuICByZWFkb25seSBtYXhMZW5ndGg/OiBudW1iZXJcclxuICAvKiogUmVwbGFjZXMgdGhlIGRlZmF1bHQgbWFya2Rvd24tc3R5bGUgaW5wdXQgcnVsZXMgd2hlbiBwcm92aWRlZC4gKi9cclxuICByZWFkb25seSBpbnB1dFJ1bGVzPzogcmVhZG9ubHkgSW5wdXRSdWxlW11cclxuICAvKiogQ3VzdG9tIHJlbmRlcmVycyBwZXIgbm9kZSB0eXBlIChmcmFtZXdvcmsgY29tcG9uZW50cyBpbiB0aGUgZG9jdW1lbnQpLiAqL1xyXG4gIHJlYWRvbmx5IG5vZGVWaWV3cz86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIE5vZGVWaWV3RmFjdG9yeT4+XHJcbiAgLyoqXHJcbiAgICogQW5ub3VuY2Ugc3RydWN0dXJhbCBlZGl0cyB0byBhc3Npc3RpdmUgdGVjaG5vbG9neTsgc2VlXHJcbiAgICoge0BsaW5rIEVkaXRvclZpZXdPcHRpb25zLmFubm91bmNlfS4gT24gYnkgZGVmYXVsdC4gSWdub3JlZCB3aXRob3V0IGFuXHJcbiAgICogYGVsZW1lbnRgOiBhIGhlYWRsZXNzIGVkaXRvciBoYXMgbm8gbGl2ZSByZWdpb24gdG8gd3JpdGUgdG8uXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgYW5ub3VuY2U/OiBib29sZWFuXHJcbiAgcmVhZG9ubHkgb25DaGFuZ2U/OiAoY2hhbmdlOiBFZGl0b3JDaGFuZ2UpID0+IHZvaWRcclxuICByZWFkb25seSBoaXN0b3J5PzogSGlzdG9yeU9wdGlvbnNcclxufVxyXG5cclxuZXhwb3J0IHR5cGUgRWRpdG9yRXZlbnQgPSAndHJhbnNhY3Rpb24nIHwgJ3VwZGF0ZScgfCAnc2VsZWN0aW9uVXBkYXRlJ1xyXG5cclxuLyoqIFBheWxvYWQgZGVsaXZlcmVkIHRvIHtAbGluayBFZGl0b3Iub25UcmFuc2FjdGlvbn0gbGlzdGVuZXJzLiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zYWN0aW9uRXZlbnQge1xyXG4gIHJlYWRvbmx5IGVkaXRvcjogRWRpdG9yXHJcbiAgcmVhZG9ubHkgdHJhbnNhY3Rpb246IFRyYW5zYWN0aW9uXHJcbiAgLyoqIFN0YXRlIHRoZSB0cmFuc2FjdGlvbiB3YXMgYXBwbGllZCB0by4gKi9cclxuICByZWFkb25seSBiZWZvcmU6IEVkaXRvclN0YXRlXHJcbiAgLyoqIFN0YXRlIGFmdGVyIGFwcGx5aW5nIGl0ICg9PT0gYGVkaXRvci5zdGF0ZWAgYXQgZW1pdCB0aW1lKS4gKi9cclxuICByZWFkb25seSBzdGF0ZTogRWRpdG9yU3RhdGVcclxufVxyXG5cclxuLyoqXHJcbiAqIFJld3JpdGVzIGEgdHJhbnNhY3Rpb24gYmVmb3JlIGl0IGlzIGFwcGxpZWQgKHRyYWNrIGNoYW5nZXMgdHVybnMgZWRpdHNcclxuICogaW50byBzdWdnZXN0aW9ucykuIFJldHVybiBudWxsIHRvIGtlZXAgdGhlIHRyYW5zYWN0aW9uIGFzLWlzLiBUaGVcclxuICogcmVwbGFjZW1lbnQgbXVzdCBzdGFydCBmcm9tIHRoZSBzYW1lIHN0YXRlLlxyXG4gKi9cclxuZXhwb3J0IHR5cGUgRGlzcGF0Y2hUcmFuc2Zvcm0gPSAodHI6IFRyYW5zYWN0aW9uLCBzdGF0ZTogRWRpdG9yU3RhdGUpID0+IFRyYW5zYWN0aW9uIHwgbnVsbFxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTZXRDb250ZW50T3B0aW9ucyB7XHJcbiAgLyoqIFJlY29yZCB0aGUgcmVwbGFjZW1lbnQgYXMgYW4gdW5kb2FibGUgc3RlcCBpbnN0ZWFkIG9mIGNsZWFyaW5nIGhpc3RvcnkuICovXHJcbiAgcmVhZG9ubHkgYWRkVG9IaXN0b3J5PzogYm9vbGVhblxyXG59XHJcblxyXG4vKiogVG9vbGJhci1mYWNpbmcgc25hcHNob3Qgb2YgdGhlIGN1cnJlbnQgc3RhdGUuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yU25hcHNob3Qge1xyXG4gIHJlYWRvbmx5IGFjdGl2ZU1hcmtzOiByZWFkb25seSBzdHJpbmdbXVxyXG4gIC8qKiBBdHRyaWJ1dGVzIG9mIGVhY2ggYWN0aXZlIG1hcmssIGtleWVkIGJ5IG1hcmsgbmFtZSAoZm9udCBzaXplLCBjb2xvclx1MjAyNikuICovXHJcbiAgcmVhZG9ubHkgbWFya0F0dHJzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBBdHRycz4+XHJcbiAgcmVhZG9ubHkgYmxvY2tUeXBlOiBzdHJpbmcgfCBudWxsXHJcbiAgcmVhZG9ubHkgYmxvY2tBdHRyczogQXR0cnMgfCBudWxsXHJcbiAgLyoqIFR5cGUgbmFtZSBvZiB0aGUgbGlzdCB3cmFwcGluZyB0aGUgc2VsZWN0aW9uLCB3aGVuIGluc2lkZSBvbmUuICovXHJcbiAgcmVhZG9ubHkgbGlzdFR5cGU6IHN0cmluZyB8IG51bGxcclxuICAvKiogVGV4dCBhbGlnbm1lbnQgb2YgdGhlIGJsb2NrIGhvbGRpbmcgdGhlIHNlbGVjdGlvbiBoZWFkLiAqL1xyXG4gIHJlYWRvbmx5IGFsaWduOiBzdHJpbmcgfCBudWxsXHJcbiAgLyoqIEluZGVudCBsZXZlbCBvZiB0aGUgYmxvY2sgaG9sZGluZyB0aGUgc2VsZWN0aW9uIGhlYWQuICovXHJcbiAgcmVhZG9ubHkgaW5kZW50OiBudW1iZXJcclxuICByZWFkb25seSBjYW5VbmRvOiBib29sZWFuXHJcbiAgcmVhZG9ubHkgY2FuUmVkbzogYm9vbGVhblxyXG4gIHJlYWRvbmx5IHNlbGVjdGlvbkVtcHR5OiBib29sZWFuXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgaGVhZGxlc3MgZWRpdG9yOiBvd25zIHRoZSBzdGF0ZSwgZGlzcGF0Y2hlcyB0cmFuc2FjdGlvbnMsIHJlY29yZHNcclxuICogaGlzdG9yeSBhbmQgZXhwb3NlcyBjb21tYW5kcy4gQSBET00gdmlldyBhdHRhY2hlcyB0byBpdCB3aGVuIGFuIGVsZW1lbnRcclxuICogaXMgc3VwcGxpZWQuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgRWRpdG9yIHtcclxuICBzdGF0ZTogRWRpdG9yU3RhdGVcclxuICByZWFkb25seSBjb21tYW5kczogRWRpdG9yQ29tbWFuZHNcclxuICAvKiogVGhlIGF0dGFjaGVkIERPTSB2aWV3LCB3aGVuIGFuIGBlbGVtZW50YCB3YXMgc3VwcGxpZWQuICovXHJcbiAgdmlldzogRWRpdG9yVmlldyB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSByZWFkb25seSBoaXN0b3J5OiBIaXN0b3J5XHJcbiAgcHJpdmF0ZSByZWFkb25seSBvbkNoYW5nZT86IChjaGFuZ2U6IEVkaXRvckNoYW5nZSkgPT4gdm9pZFxyXG4gIHByaXZhdGUgcmVhZG9ubHkgbWF4TGVuZ3RoOiBudW1iZXIgfCBudWxsXHJcbiAgcHJpdmF0ZSBsaXN0ZW5lcnMgPSBuZXcgTWFwPEVkaXRvckV2ZW50LCBTZXQ8KCkgPT4gdm9pZD4+KClcclxuICBwcml2YXRlIHR4TGlzdGVuZXJzID0gbmV3IFNldDwoZXZlbnQ6IFRyYW5zYWN0aW9uRXZlbnQpID0+IHZvaWQ+KClcclxuICBwcml2YXRlIHRyYW5zZm9ybXM6IERpc3BhdGNoVHJhbnNmb3JtW10gPSBbXVxyXG4gIHByaXZhdGUgZGVzdHJveWVkID0gZmFsc2VcclxuICBwcml2YXRlIHNuYXBzaG90Q2FjaGU6IEVkaXRvclNuYXBzaG90IHwgbnVsbCA9IG51bGxcclxuICAvKiogVGhlIGxhc3Qgc25hcHNob3QgaGFuZGVkIG91dCwga2VwdCBzbyBhbiB1bmNoYW5nZWQgb25lIGNhbiBiZSByZXVzZWQuICovXHJcbiAgcHJpdmF0ZSBsYXN0U25hcHNob3Q6IEVkaXRvclNuYXBzaG90IHwgbnVsbCA9IG51bGxcclxuXHJcbiAgY29uc3RydWN0b3Iob3B0aW9uczogRWRpdG9yT3B0aW9ucykge1xyXG4gICAgdGhpcy5zdGF0ZSA9IEVkaXRvclN0YXRlLmNyZWF0ZSh7XHJcbiAgICAgIHNjaGVtYTogb3B0aW9ucy5zY2hlbWEsXHJcbiAgICAgIGRvYzogb3B0aW9ucy5kb2MsXHJcbiAgICAgIGNvbnRlbnQ6IG9wdGlvbnMuY29udGVudCxcclxuICAgIH0pXHJcbiAgICB0aGlzLmhpc3RvcnkgPSBuZXcgSGlzdG9yeShvcHRpb25zLmhpc3RvcnkpXHJcbiAgICB0aGlzLm9uQ2hhbmdlID0gb3B0aW9ucy5vbkNoYW5nZVxyXG4gICAgdGhpcy5tYXhMZW5ndGggPSBvcHRpb25zLm1heExlbmd0aCA/PyBudWxsXHJcbiAgICB0aGlzLmNvbW1hbmRzID0gbmV3IEVkaXRvckNvbW1hbmRzKHRoaXMpXHJcbiAgICBpZiAob3B0aW9ucy5lbGVtZW50KSB7XHJcbiAgICAgIHRoaXMudmlldyA9IG5ldyBFZGl0b3JWaWV3KHRoaXMsIG9wdGlvbnMuZWxlbWVudCwge1xyXG4gICAgICAgIGF1dG9mb2N1czogb3B0aW9ucy5hdXRvZm9jdXMsXHJcbiAgICAgICAga2V5bWFwOiBvcHRpb25zLmtleW1hcCxcclxuICAgICAgICBwbGFjZWhvbGRlcjogb3B0aW9ucy5wbGFjZWhvbGRlcixcclxuICAgICAgICBhcmlhTGFiZWw6IG9wdGlvbnMuYXJpYUxhYmVsLFxyXG4gICAgICAgIGVkaXRhYmxlOiBvcHRpb25zLmVkaXRhYmxlLFxyXG4gICAgICAgIHNwZWxsY2hlY2s6IG9wdGlvbnMuc3BlbGxjaGVjayxcclxuICAgICAgICBpbnB1dFJ1bGVzOiBvcHRpb25zLmlucHV0UnVsZXMsXHJcbiAgICAgICAgbm9kZVZpZXdzOiBvcHRpb25zLm5vZGVWaWV3cyxcclxuICAgICAgICBhbm5vdW5jZTogb3B0aW9ucy5hbm5vdW5jZSxcclxuICAgICAgfSlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGdldCBzY2hlbWEoKTogU2NoZW1hIHtcclxuICAgIHJldHVybiB0aGlzLnN0YXRlLnNjaGVtYVxyXG4gIH1cclxuXHJcbiAgZ2V0IGlzRGVzdHJveWVkKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZGVzdHJveWVkXHJcbiAgfVxyXG5cclxuICAvKiogUnVuIGEgY29tbWFuZCBhZ2FpbnN0IHRoZSBjdXJyZW50IHN0YXRlOyBkaXNwYXRjaGVzIHdoZW4gaXQgYXBwbGllcy4gKi9cclxuICBleGVjKGNvbW1hbmQ6IENvbW1hbmQpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCkgcmV0dXJuIGZhbHNlXHJcbiAgICAvLyBUaGUgYnJvd3NlciByZXBvcnRzIHNlbGVjdGlvbiBjaGFuZ2VzIGFzeW5jaHJvbm91c2x5LCBzbyBhIGNvbW1hbmRcclxuICAgIC8vIHRyaWdnZXJlZCBvdXRzaWRlIHRoZSBpbnB1dCBwaXBlbGluZSAoYSB0b29sYmFyIGNsaWNrKSBtdXN0IHNlZSB0aGVcclxuICAgIC8vIGxpdmUgc2VsZWN0aW9uIHJhdGhlciB0aGFuIHRoZSBsYXN0IG9uZSB0aGUgdmlldyBvYnNlcnZlZC5cclxuICAgIHRoaXMudmlldz8uc3luY1NlbGVjdGlvbkZyb21ET00oKVxyXG4gICAgY29uc3QgdHIgPSBjb21tYW5kKHRoaXMuc3RhdGUpXHJcbiAgICBpZiAoIXRyKSByZXR1cm4gZmFsc2VcclxuICAgIHRoaXMuZGlzcGF0Y2godHIpXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgZGlzcGF0Y2godHI6IFRyYW5zYWN0aW9uKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQpIHJldHVyblxyXG4gICAgY29uc3QgYmVmb3JlID0gdGhpcy5zdGF0ZVxyXG4gICAgbGV0IHRyYW5zYWN0aW9uID0gdHJcclxuICAgIGZvciAoY29uc3QgdHJhbnNmb3JtIG9mIHRoaXMudHJhbnNmb3Jtcykge1xyXG4gICAgICB0cmFuc2FjdGlvbiA9IHRyYW5zZm9ybSh0cmFuc2FjdGlvbiwgYmVmb3JlKSA/PyB0cmFuc2FjdGlvblxyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMubWF4TGVuZ3RoICE9PSBudWxsICYmIHRyYW5zYWN0aW9uLmRvY0NoYW5nZWQpIHtcclxuICAgICAgY29uc3QgbmV4dCA9IGNoYXJhY3RlckNvdW50KHRyYW5zYWN0aW9uLmRvYylcclxuICAgICAgaWYgKG5leHQgPiB0aGlzLm1heExlbmd0aCAmJiBuZXh0ID4gY2hhcmFjdGVyQ291bnQoYmVmb3JlLmRvYykpIHJldHVyblxyXG4gICAgfVxyXG4gICAgdGhpcy5oaXN0b3J5LnJlY29yZCh0cmFuc2FjdGlvbiwgYmVmb3JlLnNlbGVjdGlvbilcclxuICAgIHRoaXMuc3RhdGUgPSBiZWZvcmUuYXBwbHkodHJhbnNhY3Rpb24pXHJcbiAgICB0aGlzLnNuYXBzaG90Q2FjaGUgPSBudWxsXHJcbiAgICB0aGlzLmVtaXQoJ3RyYW5zYWN0aW9uJylcclxuICAgIGZvciAoY29uc3QgbGlzdGVuZXIgb2YgWy4uLnRoaXMudHhMaXN0ZW5lcnNdKSB7XHJcbiAgICAgIGxpc3RlbmVyKHsgZWRpdG9yOiB0aGlzLCB0cmFuc2FjdGlvbiwgYmVmb3JlLCBzdGF0ZTogdGhpcy5zdGF0ZSB9KVxyXG4gICAgfVxyXG4gICAgaWYgKHRyYW5zYWN0aW9uLmRvY0NoYW5nZWQpIHtcclxuICAgICAgdGhpcy5lbWl0KCd1cGRhdGUnKVxyXG4gICAgICB0aGlzLm9uQ2hhbmdlPy4oeyBlZGl0b3I6IHRoaXMsIGpzb246IHRoaXMuZ2V0SlNPTigpLCBodG1sOiB0aGlzLmdldEhUTUwoKSB9KVxyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLnN0YXRlLnNlbGVjdGlvbi5lcShiZWZvcmUuc2VsZWN0aW9uKSkgdGhpcy5lbWl0KCdzZWxlY3Rpb25VcGRhdGUnKVxyXG4gIH1cclxuXHJcbiAgLyoqIExpc3RlbiB0byBhcHBsaWVkIHRyYW5zYWN0aW9ucyB3aXRoIHRoZWlyIGJlZm9yZS9hZnRlciBzdGF0ZXMuICovXHJcbiAgb25UcmFuc2FjdGlvbihsaXN0ZW5lcjogKGV2ZW50OiBUcmFuc2FjdGlvbkV2ZW50KSA9PiB2b2lkKTogKCkgPT4gdm9pZCB7XHJcbiAgICB0aGlzLnR4TGlzdGVuZXJzLmFkZChsaXN0ZW5lcilcclxuICAgIHJldHVybiAoKSA9PiB0aGlzLnR4TGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcilcclxuICB9XHJcblxyXG4gIC8qKiBSZWdpc3RlciBhIHRyYW5zZm9ybSB0aGF0IGNhbiByZXdyaXRlIHRyYW5zYWN0aW9ucyBiZWZvcmUgdGhleSBhcHBseS4gKi9cclxuICBhZGREaXNwYXRjaFRyYW5zZm9ybSh0cmFuc2Zvcm06IERpc3BhdGNoVHJhbnNmb3JtKTogKCkgPT4gdm9pZCB7XHJcbiAgICB0aGlzLnRyYW5zZm9ybXMucHVzaCh0cmFuc2Zvcm0pXHJcbiAgICByZXR1cm4gKCkgPT4ge1xyXG4gICAgICB0aGlzLnRyYW5zZm9ybXMgPSB0aGlzLnRyYW5zZm9ybXMuZmlsdGVyKChlbnRyeSkgPT4gZW50cnkgIT09IHRyYW5zZm9ybSlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKiBTdGFydCBhIGNoYWluZWQgY29tbWFuZCBzZXF1ZW5jZTogYGVkaXRvci5jaGFpbigpLmZvY3VzKCkuc2V0SGVhZGluZygyKS5ydW4oKWAuICovXHJcbiAgY2hhaW4oKTogQ2hhaW4ge1xyXG4gICAgcmV0dXJuIG5ldyBDaGFpbih0aGlzKVxyXG4gIH1cclxuXHJcbiAgdW5kbygpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHRyID0gdGhpcy5oaXN0b3J5LnVuZG8odGhpcy5zdGF0ZSlcclxuICAgIGlmICghdHIpIHJldHVybiBmYWxzZVxyXG4gICAgdGhpcy5kaXNwYXRjaCh0cilcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICByZWRvKCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgdHIgPSB0aGlzLmhpc3RvcnkucmVkbyh0aGlzLnN0YXRlKVxyXG4gICAgaWYgKCF0cikgcmV0dXJuIGZhbHNlXHJcbiAgICB0aGlzLmRpc3BhdGNoKHRyKVxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcblxyXG4gIGdldCBjYW5VbmRvKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuaGlzdG9yeS5jYW5VbmRvXHJcbiAgfVxyXG5cclxuICBnZXQgY2FuUmVkbygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmhpc3RvcnkuY2FuUmVkb1xyXG4gIH1cclxuXHJcbiAgLyoqIFRoZSB1bmRvIGFuZCByZWRvIHN0YWNrcyBhcyBhIGhpc3RvcnkgcGFuZWwgbGlzdHMgdGhlbS4gKi9cclxuICBoaXN0b3J5RW50cmllcygpOiB7XHJcbiAgICByZWFkb25seSB1bmRvOiByZWFkb25seSBIaXN0b3J5RW50cnlbXVxyXG4gICAgcmVhZG9ubHkgcmVkbzogcmVhZG9ubHkgSGlzdG9yeUVudHJ5W11cclxuICB9IHtcclxuICAgIHJldHVybiB7IHVuZG86IHRoaXMuaGlzdG9yeS51bmRvRW50cmllcywgcmVkbzogdGhpcy5oaXN0b3J5LnJlZG9FbnRyaWVzIH1cclxuICB9XHJcblxyXG4gIC8qKiBGb3JnZXQgZXZlcnkgdW5kbyBhbmQgcmVkbyBncm91cC4gKi9cclxuICBjbGVhckhpc3RvcnkoKTogdm9pZCB7XHJcbiAgICB0aGlzLmhpc3RvcnkuY2xlYXIoKVxyXG4gICAgdGhpcy5zbmFwc2hvdENhY2hlID0gbnVsbFxyXG4gICAgdGhpcy5lbWl0KCd0cmFuc2FjdGlvbicpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZXBsYWNlIHRoZSB3aG9sZSBkb2N1bWVudDogbG9hZGluZyBhIHNhdmVkIGZpbGUsIHN3aXRjaGluZyBkb2N1bWVudHMsXHJcbiAgICogcmVzdG9yaW5nIGEgZHJhZnQuIFRoYXQgaXMgbm90IGFuIGVkaXQgb2YgdGhlIGN1cnJlbnQgdGV4dCwgc28gYnkgZGVmYXVsdFxyXG4gICAqIHRoZSBjaGFuZ2Ugc3RheXMgb3V0IG9mIHRoZSB1bmRvIGhpc3RvcnkgYW5kIHRoZSBoaXN0b3J5IGlzIGNsZWFyZWQ7XHJcbiAgICogcGFzcyBgYWRkVG9IaXN0b3J5OiB0cnVlYCB0byBtYWtlIHRoZSByZXBsYWNlbWVudCB1bmRvYWJsZSBpbnN0ZWFkLlxyXG4gICAqL1xyXG4gIHNldENvbnRlbnQoY29udGVudDogRG9jSlNPTiB8IEVkaXRvck5vZGUsIG9wdGlvbnM6IFNldENvbnRlbnRPcHRpb25zID0ge30pOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCkgcmV0dXJuXHJcbiAgICBjb25zdCBkb2MgPSBub3JtYWxpemVEb2MoXHJcbiAgICAgIGNvbnRlbnQgaW5zdGFuY2VvZiBFZGl0b3JOb2RlID8gY29udGVudCA6IG5vZGVGcm9tSlNPTih0aGlzLnNjaGVtYSwgY29udGVudCksXHJcbiAgICApXHJcbiAgICBjb25zdCB0ciA9IHRoaXMuc3RhdGUudHJcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAoW10sIDAsIHRoaXMuc3RhdGUuZG9jLmNoaWxkQ291bnQsIGRvYy5jb250ZW50KSlcclxuICAgIHRyLnNldFNlbGVjdGlvbihzZWxlY3Rpb25OZWFyKHRyLmRvYywgcG9zKFswXSwgMCkpKVxyXG4gICAgaWYgKG9wdGlvbnMuYWRkVG9IaXN0b3J5ICE9PSB0cnVlKSB0ci5zZXRNZXRhKEFERF9UT19ISVNUT1JZLCBmYWxzZSlcclxuICAgIHRoaXMuZGlzcGF0Y2godHIpXHJcbiAgICBpZiAob3B0aW9ucy5hZGRUb0hpc3RvcnkgIT09IHRydWUpIHRoaXMuaGlzdG9yeS5jbGVhcigpXHJcbiAgfVxyXG5cclxuICBnZXRKU09OKCk6IERvY0pTT04ge1xyXG4gICAgcmV0dXJuIHRoaXMuc3RhdGUuZG9jLnRvSlNPTigpXHJcbiAgfVxyXG5cclxuICBnZXRIVE1MKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gc2VyaWFsaXplVG9IVE1MKHRoaXMuc3RhdGUuZG9jKVxyXG4gIH1cclxuXHJcbiAgZ2V0VGV4dCgpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIHNlcmlhbGl6ZVRvVGV4dCh0aGlzLnN0YXRlLmRvYylcclxuICB9XHJcblxyXG4gIGdldENoYXJhY3RlckNvdW50KCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gY2hhcmFjdGVyQ291bnQodGhpcy5zdGF0ZS5kb2MpXHJcbiAgfVxyXG5cclxuICBnZXRXb3JkQ291bnQoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiB3b3JkQ291bnQodGhpcy5zdGF0ZS5kb2MpXHJcbiAgfVxyXG5cclxuICBnZXRTZW50ZW5jZUNvdW50KCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gc2VudGVuY2VDb3VudCh0aGlzLnN0YXRlLmRvYylcclxuICB9XHJcblxyXG4gIGdldFBhcmFncmFwaENvdW50KCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gcGFyYWdyYXBoQ291bnQodGhpcy5zdGF0ZS5kb2MpXHJcbiAgfVxyXG5cclxuICAvKiogVG9nZ2xlIHJlYWQtb25seSBtb2RlIG9uIHRoZSBhdHRhY2hlZCB2aWV3LiAqL1xyXG4gIHNldEVkaXRhYmxlKGVkaXRhYmxlOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICB0aGlzLnZpZXc/LnNldEVkaXRhYmxlKGVkaXRhYmxlKVxyXG4gIH1cclxuXHJcbiAgLyoqIFR1cm4gdGhlIGJyb3dzZXIncyBzcGVsbCBjaGVja2luZyBvZiB0aGUgZWRpdGluZyBzdXJmYWNlIG9uIG9yIG9mZi4gKi9cclxuICBzZXRTcGVsbGNoZWNrKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIHRoaXMudmlldz8uc2V0U3BlbGxjaGVjayhlbmFibGVkKVxyXG4gIH1cclxuXHJcbiAgZ2V0IGlzRWRpdGFibGUoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy52aWV3Py5pc0VkaXRhYmxlID8/IHRydWVcclxuICB9XHJcblxyXG4gIGlzQWN0aXZlKG1hcmtOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiBpc01hcmtBY3RpdmUodGhpcy5zdGF0ZSwgbWFya05hbWUpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUb29sYmFyLWZhY2luZyBzbmFwc2hvdC5cclxuICAgKlxyXG4gICAqIFJlZmVyZW5jZS1zdGFibGUgd2hpbGUgaXRzICpjb250ZW50cyogYXJlIHVuY2hhbmdlZCwgbm90IG1lcmVseSBiZXR3ZWVuXHJcbiAgICogdHJhbnNhY3Rpb25zLCBzbyB0eXBpbmcgYSBjaGFyYWN0ZXIgcmV0dXJucyB0aGUgdmVyeSBzYW1lIG9iamVjdCwgYW5kIGFcclxuICAgKiB0b29sYmFyIHN1YnNjcmliZWQgdGhyb3VnaCBgdXNlU3luY0V4dGVybmFsU3RvcmVgLCBhIHNpZ25hbCBvciBhIHN0b3JlXHJcbiAgICogZG9lcyBub3QgcmUtcmVuZGVyIG9uIGV2ZXJ5IGtleXN0cm9rZS4gSXQgY2hhbmdlcyBpZGVudGl0eSB3aGVuIHNvbWV0aGluZ1xyXG4gICAqIGEgdG9vbGJhciB3b3VsZCBhY3R1YWxseSBkcmF3IGRpZmZlcmVudGx5IGNoYW5nZXM6IGEgbWFyaywgdGhlIGJsb2NrXHJcbiAgICogdHlwZSwgd2hldGhlciB1bmRvIGlzIGF2YWlsYWJsZS5cclxuICAgKlxyXG4gICAqIFN1YnNjcmliZXJzIGFyZSBzdGlsbCBub3RpZmllZCBwZXIgdHJhbnNhY3Rpb247IHdoYXQgdGhpcyBkZWNpZGVzIGlzXHJcbiAgICogd2hldGhlciB0aGV5IGhhdmUgYW55dGhpbmcgbmV3IHRvIGxvb2sgYXQuXHJcbiAgICovXHJcbiAgZ2V0U25hcHNob3QoKTogRWRpdG9yU25hcHNob3Qge1xyXG4gICAgaWYgKHRoaXMuc25hcHNob3RDYWNoZSkgcmV0dXJuIHRoaXMuc25hcHNob3RDYWNoZVxyXG4gICAgY29uc3Qgc2VsZWN0aW9uOiBTZWxlY3Rpb24gPSB0aGlzLnN0YXRlLnNlbGVjdGlvblxyXG4gICAgbGV0IGJsb2NrID0gbm9kZUF0UGF0aCh0aGlzLnN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20ucGF0aClcclxuICAgIGlmIChibG9jayAmJiAhYmxvY2suaXNUZXh0YmxvY2spIHtcclxuICAgICAgLy8gRG9jLWxldmVsIHNlbGVjdGlvbjogZGVzY3JpYmUgdGhlIGZpcnN0IGNvdmVyZWQgY2hpbGQgaW5zdGVhZC5cclxuICAgICAgYmxvY2sgPSBibG9jay5jb250ZW50Lm1heWJlQ2hpbGQoc2VsZWN0aW9uLmZyb20ub2Zmc2V0KSA/PyBibG9ja1xyXG4gICAgfVxyXG4gICAgY29uc3QgdGV4dGJsb2NrID0gYmxvY2s/LmlzVGV4dGJsb2NrID8gYmxvY2sgOiBudWxsXHJcbiAgICBjb25zdCBhY3RpdmVNYXJrcyA9IE9iamVjdC5rZXlzKHRoaXMuc3RhdGUuc2NoZW1hLm1hcmtzKS5maWx0ZXIoKG5hbWUpID0+XHJcbiAgICAgIGlzTWFya0FjdGl2ZSh0aGlzLnN0YXRlLCBuYW1lKSxcclxuICAgIClcclxuICAgIGNvbnN0IG1hcmtBdHRyczogUmVjb3JkPHN0cmluZywgQXR0cnM+ID0ge31cclxuICAgIGZvciAoY29uc3QgbmFtZSBvZiBhY3RpdmVNYXJrcykge1xyXG4gICAgICBjb25zdCBhdHRycyA9IGFjdGl2ZU1hcmtBdHRycyh0aGlzLnN0YXRlLCBuYW1lKVxyXG4gICAgICBpZiAoYXR0cnMpIG1hcmtBdHRyc1tuYW1lXSA9IGF0dHJzXHJcbiAgICB9XHJcbiAgICBjb25zdCBpbmRlbnQgPSB0ZXh0YmxvY2s/LmF0dHJzLmluZGVudFxyXG4gICAgY29uc3QgbmV4dDogRWRpdG9yU25hcHNob3QgPSB7XHJcbiAgICAgIGFjdGl2ZU1hcmtzLFxyXG4gICAgICBtYXJrQXR0cnMsXHJcbiAgICAgIGJsb2NrVHlwZTogdGV4dGJsb2NrPy50eXBlLm5hbWUgPz8gbnVsbCxcclxuICAgICAgYmxvY2tBdHRyczogdGV4dGJsb2NrPy5hdHRycyA/PyBudWxsLFxyXG4gICAgICBsaXN0VHlwZTogZW5jbG9zaW5nTGlzdFR5cGUodGhpcy5zdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLnBhdGgpLFxyXG4gICAgICBhbGlnbjogdHlwZW9mIHRleHRibG9jaz8uYXR0cnMuYWxpZ24gPT09ICdzdHJpbmcnID8gdGV4dGJsb2NrLmF0dHJzLmFsaWduIDogbnVsbCxcclxuICAgICAgaW5kZW50OiB0eXBlb2YgaW5kZW50ID09PSAnbnVtYmVyJyA/IGluZGVudCA6IDAsXHJcbiAgICAgIGNhblVuZG86IHRoaXMuY2FuVW5kbyxcclxuICAgICAgY2FuUmVkbzogdGhpcy5jYW5SZWRvLFxyXG4gICAgICBzZWxlY3Rpb25FbXB0eTogc2VsZWN0aW9uLmVtcHR5LFxyXG4gICAgfVxyXG4gICAgLy8gSGFuZCBiYWNrIHRoZSBwcmV2aW91cyBvYmplY3Qgd2hlbiBub3RoaW5nIGEgdG9vbGJhciBkcmF3cyBoYXMgY2hhbmdlZC5cclxuICAgIC8vIFRoZSBjb21wYXJpc29uIGNvc3RzIGEgaGFuZGZ1bCBvZiBzY2FsYXIgY2hlY2tzOyB0aGUgYWx0ZXJuYXRpdmUgY29zdHNcclxuICAgIC8vIGEgcmUtcmVuZGVyIG9mIGV2ZXJ5IHN1YnNjcmliZXIsIG9uIGV2ZXJ5IGtleXN0cm9rZS5cclxuICAgIGNvbnN0IHJldXNhYmxlID0gdGhpcy5sYXN0U25hcHNob3QgJiYgc25hcHNob3RzRXF1YWwodGhpcy5sYXN0U25hcHNob3QsIG5leHQpXHJcbiAgICB0aGlzLnNuYXBzaG90Q2FjaGUgPSByZXVzYWJsZSA/ICh0aGlzLmxhc3RTbmFwc2hvdCBhcyBFZGl0b3JTbmFwc2hvdCkgOiBuZXh0XHJcbiAgICB0aGlzLmxhc3RTbmFwc2hvdCA9IHRoaXMuc25hcHNob3RDYWNoZVxyXG4gICAgcmV0dXJuIHRoaXMuc25hcHNob3RDYWNoZVxyXG4gIH1cclxuXHJcbiAgLyoqIFN1YnNjcmliZSB0byBzdGF0ZSBjaGFuZ2VzICh0aGUgY29udHJhY3QgZXh0ZXJuYWwgc3RvcmVzIGV4cGVjdCkuICovXHJcbiAgc3Vic2NyaWJlKGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogKCkgPT4gdm9pZCB7XHJcbiAgICByZXR1cm4gdGhpcy5vbigndHJhbnNhY3Rpb24nLCBsaXN0ZW5lcilcclxuICB9XHJcblxyXG4gIG9uKGV2ZW50OiBFZGl0b3JFdmVudCwgbGlzdGVuZXI6ICgpID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcclxuICAgIGxldCBzZXQgPSB0aGlzLmxpc3RlbmVycy5nZXQoZXZlbnQpXHJcbiAgICBpZiAoIXNldCkge1xyXG4gICAgICBzZXQgPSBuZXcgU2V0KClcclxuICAgICAgdGhpcy5saXN0ZW5lcnMuc2V0KGV2ZW50LCBzZXQpXHJcbiAgICB9XHJcbiAgICBzZXQuYWRkKGxpc3RlbmVyKVxyXG4gICAgcmV0dXJuICgpID0+IHNldC5kZWxldGUobGlzdGVuZXIpXHJcbiAgfVxyXG5cclxuICBkZXN0cm95KCk6IHZvaWQge1xyXG4gICAgdGhpcy52aWV3Py5kZXN0cm95KClcclxuICAgIHRoaXMudmlldyA9IG51bGxcclxuICAgIHRoaXMuZGVzdHJveWVkID0gdHJ1ZVxyXG4gICAgdGhpcy5saXN0ZW5lcnMuY2xlYXIoKVxyXG4gICAgdGhpcy50eExpc3RlbmVycy5jbGVhcigpXHJcbiAgICB0aGlzLnRyYW5zZm9ybXMgPSBbXVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBlbWl0KGV2ZW50OiBFZGl0b3JFdmVudCk6IHZvaWQge1xyXG4gICAgZm9yIChjb25zdCBsaXN0ZW5lciBvZiB0aGlzLmxpc3RlbmVycy5nZXQoZXZlbnQpID8/IFtdKSBsaXN0ZW5lcigpXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogTmFtZSBvZiB0aGUgbGlzdCB0eXBlIHdyYXBwaW5nIGEgYmxvY2ssIGlmIGFueS4gVGhlIGJsb2NrIGl0c2VsZiBpcyBhXHJcbiAqIHRleHRibG9jayBpbnNpZGUgYSBgbGlzdEl0ZW1gLCBzbyB0aGUgbGlzdCBpcyB0d28gbGV2ZWxzIHVwLlxyXG4gKi9cclxuZnVuY3Rpb24gZW5jbG9zaW5nTGlzdFR5cGUoZG9jOiBFZGl0b3JOb2RlLCBwYXRoOiBQYXRoKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHBhdGgubGVuZ3RoIDwgMykgcmV0dXJuIG51bGxcclxuICBjb25zdCBpdGVtID0gbm9kZUF0UGF0aChkb2MsIHBhdGguc2xpY2UoMCwgLTEpKVxyXG4gIGlmIChpdGVtPy50eXBlLm5hbWUgIT09ICdsaXN0SXRlbScgJiYgaXRlbT8udHlwZS5uYW1lICE9PSAndGFza0l0ZW0nKSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiBub2RlQXRQYXRoKGRvYywgcGF0aC5zbGljZSgwLCAtMikpPy50eXBlLm5hbWUgPz8gbnVsbFxyXG59XHJcblxyXG4vKiogQXR0cmlidXRlcyBvZiB0aGUgZmlyc3QgbWFyayBvZiBgbmFtZWAgY292ZXJpbmcgdGhlIHNlbGVjdGlvbiwgaWYgYW55LiAqL1xyXG5mdW5jdGlvbiBhY3RpdmVNYXJrQXR0cnMoc3RhdGU6IEVkaXRvclN0YXRlLCBuYW1lOiBzdHJpbmcpOiBBdHRycyB8IG51bGwge1xyXG4gIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubWFya3NbbmFtZV1cclxuICBpZiAoIXR5cGUpIHJldHVybiBudWxsXHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKHNlbGVjdGlvbi5lbXB0eSAmJiBzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSB7XHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBzZWxlY3Rpb24uaGVhZC5wYXRoKVxyXG4gICAgY29uc3QgbWFya3MgPVxyXG4gICAgICBzdGF0ZS5zdG9yZWRNYXJrcyA/P1xyXG4gICAgICAoYmxvY2s/LmlzVGV4dGJsb2NrID8gbWFya3NBdElubGluZU9mZnNldChibG9jay5jb250ZW50LCBzZWxlY3Rpb24uaGVhZC5vZmZzZXQpIDogW10pXHJcbiAgICByZXR1cm4gbWFya3MuZmluZCgobWFyaykgPT4gbWFyay50eXBlID09PSB0eXBlKT8uYXR0cnMgPz8gbnVsbFxyXG4gIH1cclxuICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKSkge1xyXG4gICAgaWYgKGJsb2NrLmZyb20gPj0gYmxvY2sudG8pIGNvbnRpbnVlXHJcbiAgICBjb25zdCBbcmFuZ2VdID0gcmFuZ2VzV2l0aE1hcmsoYmxvY2subm9kZS5jb250ZW50LCBibG9jay5mcm9tLCBibG9jay50bywgdHlwZSlcclxuICAgIGlmIChyYW5nZSkgcmV0dXJuIHJhbmdlLm1hcmsuYXR0cnNcclxuICB9XHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuLyoqIEJvdW5kLCBib29sZWFuLXJldHVybmluZyB2ZXJzaW9ucyBvZiB0aGUgcHVyZSBjb21tYW5kcy4gKi9cclxuLyoqIFdoZXRoZXIgdHdvIHNuYXBzaG90cyB3b3VsZCBtYWtlIGEgdG9vbGJhciBkcmF3IHRoZSBzYW1lIHRoaW5nLiAqL1xyXG5mdW5jdGlvbiBzbmFwc2hvdHNFcXVhbChhOiBFZGl0b3JTbmFwc2hvdCwgYjogRWRpdG9yU25hcHNob3QpOiBib29sZWFuIHtcclxuICByZXR1cm4gKFxyXG4gICAgYS5ibG9ja1R5cGUgPT09IGIuYmxvY2tUeXBlICYmXHJcbiAgICBhLmxpc3RUeXBlID09PSBiLmxpc3RUeXBlICYmXHJcbiAgICBhLmFsaWduID09PSBiLmFsaWduICYmXHJcbiAgICBhLmluZGVudCA9PT0gYi5pbmRlbnQgJiZcclxuICAgIGEuY2FuVW5kbyA9PT0gYi5jYW5VbmRvICYmXHJcbiAgICBhLmNhblJlZG8gPT09IGIuY2FuUmVkbyAmJlxyXG4gICAgYS5zZWxlY3Rpb25FbXB0eSA9PT0gYi5zZWxlY3Rpb25FbXB0eSAmJlxyXG4gICAgc2FtZVN0cmluZ3MoYS5hY3RpdmVNYXJrcywgYi5hY3RpdmVNYXJrcykgJiZcclxuICAgIHNhbWVBdHRycyhhLmJsb2NrQXR0cnMsIGIuYmxvY2tBdHRycykgJiZcclxuICAgIHNhbWVBdHRyTWFwKGEubWFya0F0dHJzLCBiLm1hcmtBdHRycylcclxuICApXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhbWVTdHJpbmdzKGE6IHJlYWRvbmx5IHN0cmluZ1tdLCBiOiByZWFkb25seSBzdHJpbmdbXSk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiBhLmxlbmd0aCA9PT0gYi5sZW5ndGggJiYgYS5ldmVyeSgodmFsdWUsIGluZGV4KSA9PiB2YWx1ZSA9PT0gYltpbmRleF0pXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhbWVBdHRycyhhOiBBdHRycyB8IG51bGwsIGI6IEF0dHJzIHwgbnVsbCk6IGJvb2xlYW4ge1xyXG4gIGlmIChhID09PSBiKSByZXR1cm4gdHJ1ZVxyXG4gIGlmICghYSB8fCAhYikgcmV0dXJuIGZhbHNlXHJcbiAgcmV0dXJuIGF0dHJzRXEoYSwgYilcclxufVxyXG5cclxuZnVuY3Rpb24gc2FtZUF0dHJNYXAoXHJcbiAgYTogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgQXR0cnM+PixcclxuICBiOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBBdHRycz4+LFxyXG4pOiBib29sZWFuIHtcclxuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoYSlcclxuICBpZiAoa2V5cy5sZW5ndGggIT09IE9iamVjdC5rZXlzKGIpLmxlbmd0aCkgcmV0dXJuIGZhbHNlXHJcbiAgcmV0dXJuIGtleXMuZXZlcnkoKGtleSkgPT4ge1xyXG4gICAgY29uc3Qgb3RoZXIgPSBiW2tleV1cclxuICAgIHJldHVybiBvdGhlciAhPT0gdW5kZWZpbmVkICYmIGF0dHJzRXEoYVtrZXldIGFzIEF0dHJzLCBvdGhlcilcclxuICB9KVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRWRpdG9yQ29tbWFuZHMge1xyXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBFZGl0b3IpIHt9XHJcblxyXG4gIGluc2VydFRleHQodGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhpbnNlcnRUZXh0KHRleHQpKVxyXG4gIH1cclxuXHJcbiAgZGVsZXRlU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoZGVsZXRlU2VsZWN0aW9uKVxyXG4gIH1cclxuXHJcbiAgdG9nZ2xlTWFyayhuYW1lOiBzdHJpbmcsIGF0dHJzPzogQXR0cnMpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHRvZ2dsZU1hcmsobmFtZSwgYXR0cnMpKVxyXG4gIH1cclxuXHJcbiAgLyoqIEFwcGx5IGEgbWFyayB3aXRoIGF0dHJpYnV0ZXMsIHJlcGxhY2luZyBhbnkgZXhpc3Rpbmcgb25lIG9mIGl0cyB0eXBlLiAqL1xyXG4gIHNldE1hcmsobmFtZTogc3RyaW5nLCBhdHRyczogQXR0cnMpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHNldE1hcmsobmFtZSwgYXR0cnMpKVxyXG4gIH1cclxuXHJcbiAgdW5zZXRNYXJrKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWModW5zZXRNYXJrKG5hbWUpKVxyXG4gIH1cclxuXHJcbiAgc2V0Rm9udEZhbWlseShmYW1pbHk6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuc2V0TWFyaygnZm9udEZhbWlseScsIHsgZmFtaWx5IH0pXHJcbiAgfVxyXG5cclxuICBzZXRGb250U2l6ZShzaXplOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnNldE1hcmsoJ2ZvbnRTaXplJywgeyBzaXplIH0pXHJcbiAgfVxyXG5cclxuICBzZXRUZXh0Q29sb3IoY29sb3I6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuc2V0TWFyaygndGV4dENvbG9yJywgeyBjb2xvciB9KVxyXG4gIH1cclxuXHJcbiAgc2V0QmFja2dyb3VuZENvbG9yKGNvbG9yOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnNldE1hcmsoJ2JhY2tncm91bmRDb2xvcicsIHsgY29sb3IgfSlcclxuICB9XHJcblxyXG4gIHNldExpbmsoaHJlZjogc3RyaW5nLCB0aXRsZT86IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuc2V0TWFyaygnbGluaycsIHRpdGxlID8geyBocmVmLCB0aXRsZSB9IDogeyBocmVmIH0pXHJcbiAgfVxyXG5cclxuICB1bnNldExpbmsoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy51bnNldE1hcmsoJ2xpbmsnKVxyXG4gIH1cclxuXHJcbiAgY2xlYXJGb3JtYXR0aW5nKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoY2xlYXJGb3JtYXR0aW5nKVxyXG4gIH1cclxuXHJcbiAgY2xlYXJCbG9ja0Zvcm1hdHRpbmcoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhjbGVhckJsb2NrRm9ybWF0dGluZylcclxuICB9XHJcblxyXG4gIGNsZWFyQWxsRm9ybWF0dGluZygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGNsZWFyQWxsRm9ybWF0dGluZylcclxuICB9XHJcblxyXG4gIHNldFRleHRBbGlnbihhbGlnbjogJ2xlZnQnIHwgJ2NlbnRlcicgfCAncmlnaHQnIHwgJ2p1c3RpZnknIHwgbnVsbCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoc2V0VGV4dEFsaWduKGFsaWduKSlcclxuICB9XHJcblxyXG4gIC8qKiBMaW5lIGhlaWdodCBvbiB0aGUgc2VsZWN0ZWQgYmxvY2tzOyBhIGJhcmUgbnVtYmVyIGlzIGEgbXVsdGlwbGllci4gKi9cclxuICBzZXRMaW5lSGVpZ2h0KHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBudWxsKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzZXRMaW5lSGVpZ2h0KHZhbHVlKSlcclxuICB9XHJcblxyXG4gIC8qKiBTcGFjZSBhYm92ZSBhbmQvb3IgYmVsb3cgdGhlIHNlbGVjdGVkIGJsb2Nrcy4gKi9cclxuICBzZXRQYXJhZ3JhcGhTcGFjaW5nKG9wdHM6IHsgYmVmb3JlPzogc3RyaW5nIHwgbnVsbDsgYWZ0ZXI/OiBzdHJpbmcgfCBudWxsIH0pOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHNldFBhcmFncmFwaFNwYWNpbmcob3B0cykpXHJcbiAgfVxyXG5cclxuICAvKiogTGV0dGVyIHNwYWNpbmcgb24gdGhlIHNlbGVjdGlvbjsgYG51bGxgIHJlbW92ZXMgaXQuICovXHJcbiAgc2V0TGV0dGVyU3BhY2luZyhzcGFjaW5nOiBzdHJpbmcgfCBudWxsKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzZXRMZXR0ZXJTcGFjaW5nKHNwYWNpbmcpKVxyXG4gIH1cclxuXHJcbiAgdG9nZ2xlU21hbGxDYXBzKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWModG9nZ2xlU21hbGxDYXBzKVxyXG4gIH1cclxuXHJcbiAgLyoqIFJld3JpdGUgdGhlIHNlbGVjdGVkIHRleHQgdG8gdXBwZXIsIGxvd2VyIG9yIHRpdGxlIGNhc2UuICovXHJcbiAgY29udmVydENhc2UobW9kZTogQ2FzZU1vZGUpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGNvbnZlcnRDYXNlKG1vZGUpKVxyXG4gIH1cclxuXHJcbiAgaW5kZW50KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoaW5kZW50QmxvY2tzKDEpKVxyXG4gIH1cclxuXHJcbiAgb3V0ZGVudCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGluZGVudEJsb2NrcygtMSkpXHJcbiAgfVxyXG5cclxuICBzZXRCbG9ja0F0dHJzKGF0dHJzOiBBdHRycyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoc2V0QmxvY2tBdHRycyhhdHRycykpXHJcbiAgfVxyXG5cclxuICBzZXRCbG9ja1R5cGUobmFtZTogc3RyaW5nLCBhdHRycz86IEF0dHJzKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzZXRCbG9ja1R5cGUobmFtZSwgYXR0cnMpKVxyXG4gIH1cclxuXHJcbiAgc2V0UGFyYWdyYXBoKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuc2V0QmxvY2tUeXBlKCdwYXJhZ3JhcGgnKVxyXG4gIH1cclxuXHJcbiAgc2V0SGVhZGluZyhsZXZlbDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zZXRCbG9ja1R5cGUoJ2hlYWRpbmcnLCB7IGxldmVsIH0pXHJcbiAgfVxyXG5cclxuICBzcGxpdEJsb2NrKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoc3BsaXRCbG9jaylcclxuICB9XHJcblxyXG4gIGpvaW5CYWNrd2FyZCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGpvaW5CYWNrd2FyZClcclxuICB9XHJcblxyXG4gIGluc2VydEhhcmRCcmVhaygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGluc2VydElubGluZU5vZGUoJ2hhcmRCcmVhaycpKVxyXG4gIH1cclxuXHJcbiAgaW5zZXJ0SG9yaXpvbnRhbFJ1bGUoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhpbnNlcnRCbG9ja0FmdGVyKCdob3Jpem9udGFsUnVsZScpKVxyXG4gIH1cclxuXHJcbiAgd3JhcEluKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMod3JhcEluKG5hbWUsIGF0dHJzKSlcclxuICB9XHJcblxyXG4gIHRvZ2dsZUJ1bGxldExpc3QoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyh0b2dnbGVMaXN0KCdidWxsZXRMaXN0JykpXHJcbiAgfVxyXG5cclxuICB0b2dnbGVPcmRlcmVkTGlzdCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHRvZ2dsZUxpc3QoJ29yZGVyZWRMaXN0JykpXHJcbiAgfVxyXG5cclxuICB0b2dnbGVUYXNrTGlzdCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHRvZ2dsZVRhc2tMaXN0KVxyXG4gIH1cclxuXHJcbiAgLyoqIEZsaXAgdGhlIGRvbmUgc3RhdGUgb2YgdGhlIHRhc2sgaXRlbSBob2xkaW5nIHRoZSBzZWxlY3Rpb24uICovXHJcbiAgdG9nZ2xlVGFza0NoZWNrZWQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyh0b2dnbGVUYXNrQ2hlY2tlZClcclxuICB9XHJcblxyXG4gIC8qKiBTZXQgdGhlIG1hcmtlciBzdHlsZSBvZiB0aGUgbGlzdCBhdCB0aGUgc2VsZWN0aW9uOyBgbnVsbGAgY2xlYXJzIGl0LiAqL1xyXG4gIHNldExpc3RTdHlsZShzdHlsZTogc3RyaW5nIHwgbnVsbCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoc2V0TGlzdFN0eWxlKHN0eWxlKSlcclxuICB9XHJcblxyXG4gIHJlc3RhcnROdW1iZXJpbmcoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhyZXN0YXJ0TnVtYmVyaW5nKVxyXG4gIH1cclxuXHJcbiAgY29udGludWVOdW1iZXJpbmcoc3RhcnQ6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoY29udGludWVOdW1iZXJpbmcoc3RhcnQpKVxyXG4gIH1cclxuXHJcbiAgY29udGludWVOdW1iZXJpbmdGcm9tUHJldmlvdXMoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhjb250aW51ZU51bWJlcmluZ0Zyb21QcmV2aW91cylcclxuICB9XHJcblxyXG4gIHNwbGl0TGlzdEl0ZW0oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzcGxpdExpc3RJdGVtKVxyXG4gIH1cclxuXHJcbiAgc2lua0xpc3RJdGVtKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoc2lua0xpc3RJdGVtKVxyXG4gIH1cclxuXHJcbiAgbGlmdExpc3RJdGVtKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMobGlmdExpc3RJdGVtKVxyXG4gIH1cclxuXHJcbiAgc2V0Q29kZUJsb2NrKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuc2V0QmxvY2tUeXBlKCdjb2RlQmxvY2snKVxyXG4gIH1cclxuXHJcbiAgbGlmdCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGxpZnQpXHJcbiAgfVxyXG5cclxuICBzZWxlY3RBbGwoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzZWxlY3RBbGwpXHJcbiAgfVxyXG5cclxuICB1bmRvKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLnVuZG8oKVxyXG4gIH1cclxuXHJcbiAgcmVkbygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5yZWRvKClcclxuICB9XHJcbn1cclxuXHJcbi8qKiBRdWV1ZWQgY29tbWFuZCBjaGFpbmluZy4gYHJ1bigpYCBleGVjdXRlcyBpbiBvcmRlciwgcmVwb3J0cyBvdmVyYWxsIHN1Y2Nlc3MuICovXHJcbmV4cG9ydCBjbGFzcyBDaGFpbiB7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBxdWV1ZTogKCgpID0+IGJvb2xlYW4pW10gPSBbXVxyXG5cclxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogRWRpdG9yKSB7fVxyXG5cclxuICAvKiogRm9jdXMgdGhlIGF0dGFjaGVkIHZpZXcgKG5vLW9wIGZvciBoZWFkbGVzcyBlZGl0b3JzKS4gKi9cclxuICBmb2N1cygpOiB0aGlzIHtcclxuICAgIHRoaXMucXVldWUucHVzaCgoKSA9PiB7XHJcbiAgICAgIHRoaXMuZWRpdG9yLnZpZXc/LmZvY3VzKClcclxuICAgICAgcmV0dXJuIHRydWVcclxuICAgIH0pXHJcbiAgICByZXR1cm4gdGhpc1xyXG4gIH1cclxuXHJcbiAgY29tbWFuZChjb21tYW5kOiBDb21tYW5kKTogdGhpcyB7XHJcbiAgICB0aGlzLnF1ZXVlLnB1c2goKCkgPT4gdGhpcy5lZGl0b3IuZXhlYyhjb21tYW5kKSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBpbnNlcnRUZXh0KHRleHQ6IHN0cmluZyk6IHRoaXMge1xyXG4gICAgdGhpcy5xdWV1ZS5wdXNoKCgpID0+IHRoaXMuZWRpdG9yLmNvbW1hbmRzLmluc2VydFRleHQodGV4dCkpXHJcbiAgICByZXR1cm4gdGhpc1xyXG4gIH1cclxuXHJcbiAgdG9nZ2xlTWFyayhuYW1lOiBzdHJpbmcsIGF0dHJzPzogQXR0cnMpOiB0aGlzIHtcclxuICAgIHRoaXMucXVldWUucHVzaCgoKSA9PiB0aGlzLmVkaXRvci5jb21tYW5kcy50b2dnbGVNYXJrKG5hbWUsIGF0dHJzKSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBzZXRCbG9ja1R5cGUobmFtZTogc3RyaW5nLCBhdHRycz86IEF0dHJzKTogdGhpcyB7XHJcbiAgICB0aGlzLnF1ZXVlLnB1c2goKCkgPT4gdGhpcy5lZGl0b3IuY29tbWFuZHMuc2V0QmxvY2tUeXBlKG5hbWUsIGF0dHJzKSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBzZXRIZWFkaW5nKGxldmVsOiBudW1iZXIpOiB0aGlzIHtcclxuICAgIHRoaXMucXVldWUucHVzaCgoKSA9PiB0aGlzLmVkaXRvci5jb21tYW5kcy5zZXRIZWFkaW5nKGxldmVsKSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBzZXRQYXJhZ3JhcGgoKTogdGhpcyB7XHJcbiAgICB0aGlzLnF1ZXVlLnB1c2goKCkgPT4gdGhpcy5lZGl0b3IuY29tbWFuZHMuc2V0UGFyYWdyYXBoKCkpXHJcbiAgICByZXR1cm4gdGhpc1xyXG4gIH1cclxuXHJcbiAgcnVuKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMucXVldWUucmVkdWNlKChvaywgc3RlcCkgPT4gc3RlcCgpICYmIG9rLCB0cnVlKVxyXG4gIH1cclxufVxyXG5cclxuLyoqIENyZWF0ZSBhbiBlZGl0b3I7IG9taXQgYGVsZW1lbnRgIGZvciBhIGhlYWRsZXNzIG9uZS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUVkaXRvcihvcHRpb25zOiBFZGl0b3JPcHRpb25zKTogRWRpdG9yIHtcclxuICByZXR1cm4gbmV3IEVkaXRvcihvcHRpb25zKVxyXG59XHJcbiIsICJpbXBvcnQge1xyXG4gIEFERF9UT19ISVNUT1JZLFxyXG4gIEFkZE1hcmtTdGVwLFxyXG4gIHR5cGUgRGlzcGF0Y2hUcmFuc2Zvcm0sXHJcbiAgdHlwZSBFZGl0b3IsXHJcbiAgdHlwZSBFZGl0b3JOb2RlLFxyXG4gIEZyYWdtZW50LFxyXG4gIHR5cGUgTWFyayxcclxuICB0eXBlIE1hcmtTcGVjLFxyXG4gIHR5cGUgTWFya1R5cGUsXHJcbiAgdHlwZSBQYXRoLFxyXG4gIHR5cGUgUG9zaXRpb24sXHJcbiAgUmVtb3ZlTWFya1N0ZXAsXHJcbiAgUmVwbGFjZUlubGluZVN0ZXAsXHJcbiAgdHlwZSBUZXh0Tm9kZSxcclxuICBUZXh0U2VsZWN0aW9uLFxyXG4gIHR5cGUgVHJhbnNhY3Rpb24sXHJcbiAgaW5saW5lTGVuZ3RoLFxyXG4gIGlubGluZVNpemUsXHJcbiAgbm9kZUF0UGF0aCxcclxuICBwYXRoc0VxdWFsLFxyXG4gIHBvcyxcclxuICByYW5nZXNXaXRoTWFyayxcclxuICB0ZXh0YmxvY2tzLFxyXG59IGZyb20gJ0B0cmV2aXhhbC9jb3JlJ1xyXG5cclxuLyoqIE1ldGEga2V5IG1hcmtpbmcgdHJhbnNhY3Rpb25zIHRoZSB0cmFuc2Zvcm0gbXVzdCBub3QgcmV3cml0ZS4gKi9cclxuZXhwb3J0IGNvbnN0IFRSQUNLX0NIQU5HRVNfTUVUQSA9ICd0cmFja0NoYW5nZXMkJ1xyXG5cclxuLyoqXHJcbiAqIFRoZSBgaW5zZXJ0aW9uYCAvIGBkZWxldGlvbmAgbWFyayBzcGVjcy4gTWVyZ2UgaW50byB5b3VyIHNjaGVtYTpcclxuICogYG1hcmtzOiB7IC4uLmRlZmF1bHRNYXJrcygpLCAuLi50cmFja0NoYW5nZXNNYXJrcygpIH1gLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHRyYWNrQ2hhbmdlc01hcmtzKCk6IFJlY29yZDxzdHJpbmcsIE1hcmtTcGVjPiB7XHJcbiAgY29uc3QgYXR0cnMgPSB7IGF1dGhvcjogeyBkZWZhdWx0OiAnJyB9LCB0aW1lc3RhbXA6IHsgZGVmYXVsdDogMCB9IH1cclxuICBjb25zdCBodG1sQXR0cnMgPSAobWFyazogTWFyaywgY2xhc3NOYW1lOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0+ICh7XHJcbiAgICBjbGFzczogY2xhc3NOYW1lLFxyXG4gICAgJ2RhdGEtdHJldml4YWwtYXV0aG9yJzogU3RyaW5nKG1hcmsuYXR0cnMuYXV0aG9yID8/ICcnKSxcclxuICAgICdkYXRhLXRyZXZpeGFsLXRpbWVzdGFtcCc6IFN0cmluZyhOdW1iZXIobWFyay5hdHRycy50aW1lc3RhbXAgPz8gMCkgfHwgMCksXHJcbiAgfSlcclxuICBjb25zdCBwYXJzZWRBdHRycyA9IChlbGVtZW50OiBIVE1MRWxlbWVudCkgPT4gKHtcclxuICAgIGF1dGhvcjogZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdHJldml4YWwtYXV0aG9yJykgPz8gJycsXHJcbiAgICB0aW1lc3RhbXA6IE51bWJlcihlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS10cmV2aXhhbC10aW1lc3RhbXAnKSA/PyAnMCcpIHx8IDAsXHJcbiAgfSlcclxuICByZXR1cm4ge1xyXG4gICAgaW5zZXJ0aW9uOiB7XHJcbiAgICAgIGF0dHJzLFxyXG4gICAgICBleGNsdWRlczogJ2RlbGV0aW9uJyxcclxuICAgICAgdG9IVE1MOiAobWFyaykgPT4gKHsgdGFnOiAnaW5zJywgYXR0cnM6IGh0bWxBdHRycyhtYXJrLCAndHJldml4YWwtaW5zZXJ0aW9uJykgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAnaW5zJywgZ2V0QXR0cnM6IHBhcnNlZEF0dHJzIH1dLFxyXG4gICAgfSxcclxuICAgIGRlbGV0aW9uOiB7XHJcbiAgICAgIGF0dHJzLFxyXG4gICAgICBleGNsdWRlczogJ2luc2VydGlvbicsXHJcbiAgICAgIHRvSFRNTDogKG1hcmspID0+ICh7IHRhZzogJ2RlbCcsIGF0dHJzOiBodG1sQXR0cnMobWFyaywgJ3RyZXZpeGFsLWRlbGV0aW9uJykgfSksXHJcbiAgICAgIC8vIGBkZWxgIGlzIGFsc28gdGhlIHN0cmlrZXRocm91Z2ggbWFyaydzIHRhZyBpbiB0aGUgZGVmYXVsdCBzY2hlbWEsIGFuZFxyXG4gICAgICAvLyBydWxlcyB0aGF0IHJlcXVpcmUgYW4gYXR0cmlidXRlIGFyZSB0cmllZCBmaXJzdCwgc28gYW4gYXR0cmlidXRlZFxyXG4gICAgICAvLyBgZGVsYCBwYXJzZXMgYmFjayBhcyBhIHN1Z2dlc3Rpb24gcmF0aGVyIHRoYW4gYXMgc3RydWNrLXRocm91Z2ggdGV4dC5cclxuICAgICAgcGFyc2VIVE1MOiBbXHJcbiAgICAgICAgeyB0YWc6ICdkZWwnLCBhdHRyaWJ1dGU6ICdkYXRhLXRyZXZpeGFsLWF1dGhvcicsIGdldEF0dHJzOiBwYXJzZWRBdHRycyB9LFxyXG4gICAgICAgIHsgdGFnOiAnZGVsJywgZ2V0QXR0cnM6IHBhcnNlZEF0dHJzIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTdWdnZXN0aW9uUmFuZ2Uge1xyXG4gIHJlYWRvbmx5IHBhdGg6IFBhdGhcclxuICByZWFkb25seSBmcm9tOiBudW1iZXJcclxuICByZWFkb25seSB0bzogbnVtYmVyXHJcbiAgcmVhZG9ubHkga2luZDogJ2luc2VydGlvbicgfCAnZGVsZXRpb24nXHJcbiAgcmVhZG9ubHkgYXV0aG9yOiBzdHJpbmdcclxuICByZWFkb25seSB0aW1lc3RhbXA6IG51bWJlclxyXG4gIHJlYWRvbmx5IG1hcms6IE1hcmtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUcmFja0NoYW5nZXNPcHRpb25zIHtcclxuICAvKiogQXR0cmlidXRlZCBhdXRob3IgZm9yIG5ldyBzdWdnZXN0aW9ucy4gKi9cclxuICByZWFkb25seSBhdXRob3I6IHN0cmluZ1xyXG4gIC8qKiBDbG9jayBvdmVycmlkZSBmb3IgZGV0ZXJtaW5pc3RpYyB0ZXN0cy4gKi9cclxuICByZWFkb25seSBub3c/OiAoKSA9PiBudW1iZXJcclxufVxyXG5cclxuLyoqIFRoZSB0d28gc3VnZ2VzdGlvbiBtYXJrIHR5cGVzIG9mIHRoZSBhY3RpdmUgc2NoZW1hLiAqL1xyXG5pbnRlcmZhY2UgU3VnZ2VzdGlvblR5cGVzIHtcclxuICByZWFkb25seSBpbnNlcnRpb246IE1hcmtUeXBlXHJcbiAgcmVhZG9ubHkgZGVsZXRpb246IE1hcmtUeXBlXHJcbn1cclxuXHJcbi8qKiBXaGF0IGRlbGV0aW5nIG9uZSBzdHJldGNoIG9mIGFuIGVkaXRlZCByYW5nZSBzaG91bGQgYWN0dWFsbHkgZG8gdG8gaXQuICovXHJcbnR5cGUgRGVsZXRpb25FZmZlY3QgPSAncmVtb3ZlJyB8ICdrZWVwJyB8ICdzdHJpa2UnXHJcblxyXG5pbnRlcmZhY2UgRGVsZXRpb25TZWdtZW50IHtcclxuICByZWFkb25seSBmcm9tOiBudW1iZXJcclxuICByZWFkb25seSB0bzogbnVtYmVyXHJcbiAgcmVhZG9ubHkgZWZmZWN0OiBEZWxldGlvbkVmZmVjdFxyXG59XHJcblxyXG4vKipcclxuICogRGVsZXRpbmcgbWVhbnMgZGlmZmVyZW50IHRoaW5ncyB0byBkaWZmZXJlbnQgdGV4dCBvbmNlIHRoZSByYW5nZSBhbHJlYWR5XHJcbiAqIGNhcnJpZXMgc3VnZ2VzdGlvbnMuIFRleHQgdGhpcyBhdXRob3Igb25seSBqdXN0IHN1Z2dlc3RlZCBuZXZlciByZWFjaGVkIHRoZVxyXG4gKiBkb2N1bWVudCwgc28gdGFraW5nIGl0IGJhY2sgbGVhdmVzIG5vdGhpbmcgYmVoaW5kLiBUZXh0IHNvbWVvbmUgaGFzIGFscmVhZHlcclxuICogc3RydWNrIGlzIHNwb2tlbiBmb3I6IHJlLW1hcmtpbmcgaXQgd291bGQgcmV3cml0ZSB0aGF0IGF1dGhvcidzIGF0dHJpYnV0aW9uXHJcbiAqIGFuZCwgYmVjYXVzZSBhIHN0cmlrZSBoYXMgdG8gc3RhcnQgc29tZXdoZXJlLCBwdXNoIHRoZSBkZWxldGlvbiBvdXQgcGFzdFxyXG4gKiB3aGF0IHdhcyBhY3R1YWxseSBkZWxldGVkLiBFdmVyeXRoaW5nIGVsc2UgaXMgb3JpZ2luYWwgdGV4dCwgd2hpY2ggaGFzIHRvXHJcbiAqIHN1cnZpdmUgdW5kZXIgYSBkZWxldGlvbiBtYXJrIHNvIGEgcmV2aWV3ZXIgY2FuIHN0aWxsIHJlc3RvcmUgaXQuXHJcbiAqL1xyXG5mdW5jdGlvbiBlZmZlY3RPZihub2RlOiBFZGl0b3JOb2RlLCB0eXBlczogU3VnZ2VzdGlvblR5cGVzLCBhdXRob3I6IHN0cmluZyk6IERlbGV0aW9uRWZmZWN0IHtcclxuICBpZiAoIW5vZGUuaXNUZXh0KSByZXR1cm4gJ3N0cmlrZSdcclxuICBjb25zdCBvd24gPSBub2RlLm1hcmtzLnNvbWUoXHJcbiAgICAobWFyaykgPT4gbWFyay50eXBlID09PSB0eXBlcy5pbnNlcnRpb24gJiYgbWFyay5hdHRycy5hdXRob3IgPT09IGF1dGhvcixcclxuICApXHJcbiAgaWYgKG93bikgcmV0dXJuICdyZW1vdmUnXHJcbiAgcmV0dXJuIG5vZGUubWFya3Muc29tZSgobWFyaykgPT4gbWFyay50eXBlID09PSB0eXBlcy5kZWxldGlvbikgPyAna2VlcCcgOiAnc3RyaWtlJ1xyXG59XHJcblxyXG4vKiogU3BsaXQgW2Zyb20sIHRvKSBpbnRvIG1heGltYWwgcnVucyB0aGF0IHNoYXJlIG9uZSB7QGxpbmsgRGVsZXRpb25FZmZlY3R9LiAqL1xyXG5mdW5jdGlvbiBjbGFzc2lmeURlbGV0aW9uKFxyXG4gIGJsb2NrOiBFZGl0b3JOb2RlLFxyXG4gIGZyb206IG51bWJlcixcclxuICB0bzogbnVtYmVyLFxyXG4gIHR5cGVzOiBTdWdnZXN0aW9uVHlwZXMsXHJcbiAgYXV0aG9yOiBzdHJpbmcsXHJcbik6IHJlYWRvbmx5IERlbGV0aW9uU2VnbWVudFtdIHtcclxuICBjb25zdCBzZWdtZW50czogRGVsZXRpb25TZWdtZW50W10gPSBbXVxyXG4gIGxldCBvZmZzZXQgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jb250ZW50LmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBzdGFydCA9IG9mZnNldFxyXG4gICAgb2Zmc2V0ICs9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBpZiAoc3RhcnQgPj0gdG8gfHwgb2Zmc2V0IDw9IGZyb20pIGNvbnRpbnVlXHJcbiAgICBjb25zdCBlZmZlY3QgPSBlZmZlY3RPZihjaGlsZCwgdHlwZXMsIGF1dGhvcilcclxuICAgIGNvbnN0IGNsaXBwZWQgPSB7IGZyb206IE1hdGgubWF4KHN0YXJ0LCBmcm9tKSwgdG86IE1hdGgubWluKG9mZnNldCwgdG8pLCBlZmZlY3QgfVxyXG4gICAgY29uc3QgbGFzdCA9IHNlZ21lbnRzW3NlZ21lbnRzLmxlbmd0aCAtIDFdXHJcbiAgICBpZiAobGFzdCAmJiBsYXN0LnRvID09PSBjbGlwcGVkLmZyb20gJiYgbGFzdC5lZmZlY3QgPT09IGVmZmVjdCkge1xyXG4gICAgICBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXSA9IHsgZnJvbTogbGFzdC5mcm9tLCB0bzogY2xpcHBlZC50bywgZWZmZWN0IH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHNlZ21lbnRzLnB1c2goY2xpcHBlZClcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIHNlZ21lbnRzXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBIYW5kIHRoZSBjYWxsZXIncyBtZXRhZGF0YSB0byB0aGUgdHJhbnNhY3Rpb24gdGhhdCByZXBsYWNlcyB0aGVpcnMuIFRoZVxyXG4gKiByZXdyaXRlIGRpc2NhcmRzIHRoZSBvcmlnaW5hbCB3aG9sZXNhbGUsIHNvIG1ldGEgbGVmdCBiZWhpbmQgaXMgbWV0YSBsb3N0OlxyXG4gKiBhbiBpbnB1dCBydWxlIHRoYXQgb3BlbnMgaXRzIG93biB1bmRvIGdyb3VwIGFuZCBsYWJlbHMgaXQgbXVzdCBzdGlsbCBkb1xyXG4gKiBib3RoIHdoZW4gc3VnZ2VzdGlvbiBtb2RlIHR1cm5zIGl0cyBlZGl0IGludG8gYSBzdWdnZXN0aW9uLlxyXG4gKlxyXG4gKiBFdmVyeXRoaW5nIGlzIGNhcnJpZWQsIG5vdCBhIGxpc3Qgb2Yga2V5cyB0aGlzIHBhY2thZ2UgaGFwcGVucyB0byBrbm93XHJcbiAqIGFib3V0LiBNZXRhIGlzIGhvdyBvbmUgZXh0ZW5zaW9uIHRlbGxzIHRoZSByZXN0IG9mIHRoZSBlZGl0b3Igd2hlcmUgYVxyXG4gKiB0cmFuc2FjdGlvbiBjYW1lIGZyb20sIGFuZCB0aGUga2V5cyBtb3N0IGV4cGVuc2l2ZSB0byBkcm9wIGFyZSB0aGUgb25lc1xyXG4gKiB3cml0dGVuIHNvbWV3aGVyZSBlbHNlOiBgd29ya3NwYWNlJG1pcnJvcmAgbWFya3MgYSB0cmFuc2FjdGlvbiByZXBsYXllZFxyXG4gKiBmcm9tIHRoZSBvdGhlciBwYW5lIG9mIGEgc3BsaXQgdmlldywgYW5kIGxvc2luZyBpdCBzZW5kcyB0aGUgcmV3cml0dGVuXHJcbiAqIGVkaXQgc3RyYWlnaHQgYmFjayBpbnRvIHRoZSBwYW5lIGl0IGNhbWUgZnJvbS4gT25seSB0aGlzIHBhY2thZ2UncyBvd25cclxuICogbWFya2VyIGlzIHdpdGhoZWxkLCBiZWNhdXNlIHRoZSByZXBsYWNlbWVudCBpcyBub3QgdGhlIGNhbGxlcidzXHJcbiAqIGFscmVhZHktdHJhY2tlZCB0cmFuc2FjdGlvbi4gSXQgaXMgdGhlIG9uZSBiZWluZyB0cmFja2VkIG5vdy5cclxuICovXHJcbmZ1bmN0aW9uIGNhcnJ5TWV0YShvdXQ6IFRyYW5zYWN0aW9uLCBzb3VyY2U6IFRyYW5zYWN0aW9uKTogVHJhbnNhY3Rpb24ge1xyXG4gIGZvciAoY29uc3Qga2V5IG9mIHNvdXJjZS5tZXRhS2V5cygpKSB7XHJcbiAgICBpZiAoa2V5ID09PSBUUkFDS19DSEFOR0VTX01FVEEpIGNvbnRpbnVlXHJcbiAgICBvdXQuc2V0TWV0YShrZXksIHNvdXJjZS5nZXRNZXRhKGtleSkpXHJcbiAgfVxyXG4gIHJldHVybiBvdXRcclxufVxyXG5cclxuLyoqIE1hcmtzIG9mIHRoZSBjaGFyYWN0ZXIgb2NjdXB5aW5nIFtpbmRleCwgaW5kZXgrMSksIGlmIGl0IGlzIHRleHQuICovXHJcbmZ1bmN0aW9uIG1hcmtzT2ZDaGFyQXQoYmxvY2s6IEVkaXRvck5vZGUsIGluZGV4OiBudW1iZXIpOiByZWFkb25seSBNYXJrW10gfCBudWxsIHtcclxuICBpZiAoaW5kZXggPCAwKSByZXR1cm4gbnVsbFxyXG4gIGxldCBvZmZzZXQgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jb250ZW50LmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBzaXplID0gaW5saW5lU2l6ZShjaGlsZClcclxuICAgIGlmIChpbmRleCA8IG9mZnNldCArIHNpemUpIHJldHVybiBjaGlsZC5pc1RleHQgPyBjaGlsZC5tYXJrcyA6IG51bGxcclxuICAgIG9mZnNldCArPSBzaXplXHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJhbmdlSXNBbGxUZXh0KGJsb2NrOiBFZGl0b3JOb2RlLCBmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiBib29sZWFuIHtcclxuICBsZXQgb2Zmc2V0ID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgYmxvY2suY29udGVudC5jaGlsZHJlbikge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBpZiAob2Zmc2V0IDwgdG8gJiYgb2Zmc2V0ICsgc2l6ZSA+IGZyb20gJiYgIWNoaWxkLmlzVGV4dCkgcmV0dXJuIGZhbHNlXHJcbiAgICBvZmZzZXQgKz0gc2l6ZVxyXG4gIH1cclxuICByZXR1cm4gdHJ1ZVxyXG59XHJcblxyXG4vKipcclxuICogU3VnZ2VzdGlvbiBtb2RlOiB3aGlsZSBlbmFibGVkLCBlZGl0cyBiZWNvbWUgYXR0cmlidXRlZCBzdWdnZXN0aW9uc1xyXG4gKiBpbnN0ZWFkIG9mIGRpcmVjdCBjaGFuZ2VzLCBkZWxldGVkIHRleHQgc3RheXMgd2l0aCBhIGBkZWxldGlvbmAgbWFyayxcclxuICogdHlwZWQgdGV4dCBjYXJyaWVzIGFuIGBpbnNlcnRpb25gIG1hcmsuIEFjY2VwdC9yZWplY3Qgb25lIG9yIGFsbC5cclxuICpcclxuICogdjAgc2NvcGUgKHNlZSBBRFItMDAwOCk6IHNpbmdsZS10ZXh0YmxvY2sgZWRpdHMgYXJlIHRyYWNrZWQ7IHN0cnVjdHVyYWxcclxuICogdHJhbnNhY3Rpb25zIChFbnRlciwgYmxvY2sgam9pbnMsIHdyYXBzKSBhcHBseSBkaXJlY3RseS5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBUcmFja0NoYW5nZXMge1xyXG4gIHByaXZhdGUgZGV0YWNoOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbFxyXG4gIHByaXZhdGUgcmVhZG9ubHkgbGlzdGVuZXJzID0gbmV3IFNldDwoZW5hYmxlZDogYm9vbGVhbikgPT4gdm9pZD4oKVxyXG5cclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBFZGl0b3IsXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IFRyYWNrQ2hhbmdlc09wdGlvbnMsXHJcbiAgKSB7fVxyXG5cclxuICBnZXQgaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZGV0YWNoICE9PSBudWxsXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdWJzY3JpYmUgdG8gc3VnZ2VzdGlvbiBtb2RlIGJlaW5nIHN3aXRjaGVkIG9uIG9yIG9mZi4gUmV0dXJucyBhIGRpc3Bvc2VyLlxyXG4gICAqXHJcbiAgICogU3dpdGNoaW5nIG1vZGVzIGNoYW5nZXMgbm8gZG9jdW1lbnQsIHNvIGl0IHJhaXNlcyBubyB0cmFuc2FjdGlvbiwgYW5kXHJcbiAgICogYW55dGhpbmcgd2F0Y2hpbmcgdGhlIGVkaXRvciBhbG9uZSBuZXZlciBoZWFycyBhYm91dCBpdC4gQSByZXZpZXcgYmFyXHJcbiAgICogYnVpbHQgdGhhdCB3YXkgc2l0cyByZWFkaW5nIFwib2ZmXCIgd2hpbGUgZXZlcnkga2V5c3Ryb2tlIGlzIGluIGZhY3QgYmVpbmdcclxuICAgKiByZWNvcmRlZCBhcyBhIHN1Z2dlc3Rpb24sIHdoaWNoIGlzIHRoZSB3b3JzdCB3YXkgZm9yIHRoaXMgZmVhdHVyZSB0byBiZVxyXG4gICAqIHdyb25nLCBiZWNhdXNlIHRoZSB1c2VyIGJlbGlldmVzIHRoZWlyIGVkaXRzIGFyZSBnb2luZyBpbiBkaXJlY3RseS5cclxuICAgKi9cclxuICBvbkVuYWJsZWRDaGFuZ2UobGlzdGVuZXI6IChlbmFibGVkOiBib29sZWFuKSA9PiB2b2lkKTogKCkgPT4gdm9pZCB7XHJcbiAgICB0aGlzLmxpc3RlbmVycy5hZGQobGlzdGVuZXIpXHJcbiAgICByZXR1cm4gKCkgPT4gdGhpcy5saXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhbm5vdW5jZSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IGVuYWJsZWQgPSB0aGlzLmlzRW5hYmxlZFxyXG4gICAgZm9yIChjb25zdCBsaXN0ZW5lciBvZiBbLi4udGhpcy5saXN0ZW5lcnNdKSBsaXN0ZW5lcihlbmFibGVkKVxyXG4gIH1cclxuXHJcbiAgZW5hYmxlKCk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuZGV0YWNoKSByZXR1cm5cclxuICAgIHRoaXMuZGV0YWNoID0gdGhpcy5lZGl0b3IuYWRkRGlzcGF0Y2hUcmFuc2Zvcm0odGhpcy50cmFuc2Zvcm0pXHJcbiAgICB0aGlzLmFubm91bmNlKClcclxuICB9XHJcblxyXG4gIGRpc2FibGUoKTogdm9pZCB7XHJcbiAgICBpZiAoIXRoaXMuZGV0YWNoKSByZXR1cm5cclxuICAgIHRoaXMuZGV0YWNoKClcclxuICAgIHRoaXMuZGV0YWNoID0gbnVsbFxyXG4gICAgdGhpcy5hbm5vdW5jZSgpXHJcbiAgfVxyXG5cclxuICAvKiogQWxsIHBlbmRpbmcgc3VnZ2VzdGlvbnMsIGluIGRvY3VtZW50IG9yZGVyLiAqL1xyXG4gIHN1Z2dlc3Rpb25zKCk6IHJlYWRvbmx5IFN1Z2dlc3Rpb25SYW5nZVtdIHtcclxuICAgIGNvbnN0IG91dDogU3VnZ2VzdGlvblJhbmdlW10gPSBbXVxyXG4gICAgY29uc3Qgc2NoZW1hID0gdGhpcy5lZGl0b3Iuc2NoZW1hXHJcbiAgICBmb3IgKGNvbnN0IHsgcGF0aCwgbm9kZSB9IG9mIHRleHRibG9ja3ModGhpcy5lZGl0b3Iuc3RhdGUuZG9jKSkge1xyXG4gICAgICBjb25zdCBsZW5ndGggPSBpbmxpbmVMZW5ndGgobm9kZS5jb250ZW50KVxyXG4gICAgICBmb3IgKGNvbnN0IGtpbmQgb2YgWydpbnNlcnRpb24nLCAnZGVsZXRpb24nXSBhcyBjb25zdCkge1xyXG4gICAgICAgIGNvbnN0IHR5cGUgPSBzY2hlbWEubWFya3Nba2luZF1cclxuICAgICAgICBpZiAoIXR5cGUpIGNvbnRpbnVlXHJcbiAgICAgICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhub2RlLmNvbnRlbnQsIDAsIGxlbmd0aCwgdHlwZSkpIHtcclxuICAgICAgICAgIG91dC5wdXNoKHtcclxuICAgICAgICAgICAgcGF0aCxcclxuICAgICAgICAgICAgZnJvbTogcmFuZ2UuZnJvbSxcclxuICAgICAgICAgICAgdG86IHJhbmdlLnRvLFxyXG4gICAgICAgICAgICBraW5kLFxyXG4gICAgICAgICAgICBhdXRob3I6IFN0cmluZyhyYW5nZS5tYXJrLmF0dHJzLmF1dGhvciA/PyAnJyksXHJcbiAgICAgICAgICAgIHRpbWVzdGFtcDogTnVtYmVyKHJhbmdlLm1hcmsuYXR0cnMudGltZXN0YW1wID8/IDApLFxyXG4gICAgICAgICAgICBtYXJrOiByYW5nZS5tYXJrLFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBvdXQuc29ydCgoYSwgYikgPT4gY29tcGFyZVBhdGhzKGEucGF0aCwgYi5wYXRoKSB8fCBhLmZyb20gLSBiLmZyb20pXHJcbiAgfVxyXG5cclxuICBnZXQgaGFzU3VnZ2VzdGlvbnMoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zdWdnZXN0aW9ucygpLmxlbmd0aCA+IDBcclxuICB9XHJcblxyXG4gIGFjY2VwdEFsbCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5KHRoaXMuc3VnZ2VzdGlvbnMoKSwgJ2FjY2VwdCcpXHJcbiAgfVxyXG5cclxuICByZWplY3RBbGwoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5hcHBseSh0aGlzLnN1Z2dlc3Rpb25zKCksICdyZWplY3QnKVxyXG4gIH1cclxuXHJcbiAgLyoqIEFjY2VwdCBhIHNwZWNpZmljIHNldCBvZiBzdWdnZXN0aW9uIHJhbmdlcyAoZS5nLiBvbmUgYXV0aG9yJ3MpLiAqL1xyXG4gIGFjY2VwdChzdWdnZXN0aW9uczogcmVhZG9ubHkgU3VnZ2VzdGlvblJhbmdlW10pOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5KHN1Z2dlc3Rpb25zLCAnYWNjZXB0JylcclxuICB9XHJcblxyXG4gIHJlamVjdChzdWdnZXN0aW9uczogcmVhZG9ubHkgU3VnZ2VzdGlvblJhbmdlW10pOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5KHN1Z2dlc3Rpb25zLCAncmVqZWN0JylcclxuICB9XHJcblxyXG4gIC8qKiBBY2NlcHQgdGhlIHN1Z2dlc3Rpb24gc3BhbiBjb250YWluaW5nIGBwb3NpdGlvbmAuICovXHJcbiAgYWNjZXB0QXQocG9zaXRpb246IFBvc2l0aW9uKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5hcHBseSh0aGlzLmF0KHBvc2l0aW9uKSwgJ2FjY2VwdCcpXHJcbiAgfVxyXG5cclxuICByZWplY3RBdChwb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5KHRoaXMuYXQocG9zaXRpb24pLCAncmVqZWN0JylcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXQocG9zaXRpb246IFBvc2l0aW9uKTogcmVhZG9ubHkgU3VnZ2VzdGlvblJhbmdlW10ge1xyXG4gICAgY29uc3QgZm91bmQgPSB0aGlzLnN1Z2dlc3Rpb25zKCkuZmluZChcclxuICAgICAgKHN1Z2dlc3Rpb24pID0+XHJcbiAgICAgICAgcGF0aHNFcXVhbChzdWdnZXN0aW9uLnBhdGgsIHBvc2l0aW9uLnBhdGgpICYmXHJcbiAgICAgICAgc3VnZ2VzdGlvbi5mcm9tIDw9IHBvc2l0aW9uLm9mZnNldCAmJlxyXG4gICAgICAgIHBvc2l0aW9uLm9mZnNldCA8PSBzdWdnZXN0aW9uLnRvLFxyXG4gICAgKVxyXG4gICAgcmV0dXJuIGZvdW5kID8gW2ZvdW5kXSA6IFtdXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFwcGx5KHN1Z2dlc3Rpb25zOiByZWFkb25seSBTdWdnZXN0aW9uUmFuZ2VbXSwgbW9kZTogJ2FjY2VwdCcgfCAncmVqZWN0Jyk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHN1Z2dlc3Rpb25zLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlXHJcbiAgICBjb25zdCB0ciA9IHRoaXMuZWRpdG9yLnN0YXRlLnRyLnNldE1ldGEoVFJBQ0tfQ0hBTkdFU19NRVRBLCB0cnVlKVxyXG4gICAgLy8gUGVyIGJsb2NrLCBiYWNrIHRvIGZyb250LCBzbyBlYXJsaWVyIG9mZnNldHMgc3RheSB2YWxpZCB3aGlsZSB3ZSBlZGl0LlxyXG4gICAgY29uc3Qgb3JkZXJlZCA9IFsuLi5zdWdnZXN0aW9uc10uc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICBjb25zdCBieVBhdGggPSBjb21wYXJlUGF0aHMoYi5wYXRoLCBhLnBhdGgpXHJcbiAgICAgIHJldHVybiBieVBhdGggIT09IDAgPyBieVBhdGggOiBiLmZyb20gLSBhLmZyb21cclxuICAgIH0pXHJcbiAgICBmb3IgKGNvbnN0IHN1Z2dlc3Rpb24gb2Ygb3JkZXJlZCkge1xyXG4gICAgICBjb25zdCBrZWVwVGV4dCA9IChzdWdnZXN0aW9uLmtpbmQgPT09ICdpbnNlcnRpb24nKSA9PT0gKG1vZGUgPT09ICdhY2NlcHQnKVxyXG4gICAgICBpZiAoa2VlcFRleHQpIHtcclxuICAgICAgICB0ci5zdGVwKFxyXG4gICAgICAgICAgbmV3IFJlbW92ZU1hcmtTdGVwKHN1Z2dlc3Rpb24ucGF0aCwgc3VnZ2VzdGlvbi5mcm9tLCBzdWdnZXN0aW9uLnRvLCBzdWdnZXN0aW9uLm1hcmspLFxyXG4gICAgICAgIClcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0ci5zdGVwKFxyXG4gICAgICAgICAgbmV3IFJlcGxhY2VJbmxpbmVTdGVwKHN1Z2dlc3Rpb24ucGF0aCwgc3VnZ2VzdGlvbi5mcm9tLCBzdWdnZXN0aW9uLnRvLCBGcmFnbWVudC5lbXB0eSksXHJcbiAgICAgICAgKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICB0aGlzLmVkaXRvci5kaXNwYXRjaCh0cilcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHRyYW5zZm9ybTogRGlzcGF0Y2hUcmFuc2Zvcm0gPSAodHIsIHN0YXRlKSA9PiB7XHJcbiAgICBpZiAoIXRyLmRvY0NoYW5nZWQgfHwgdHIuZ2V0TWV0YShBRERfVE9fSElTVE9SWSkgPT09IGZhbHNlKSByZXR1cm4gbnVsbFxyXG4gICAgaWYgKHRyLmdldE1ldGEoVFJBQ0tfQ0hBTkdFU19NRVRBKSkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHN0ZXAgPSBub3JtYWxpemVJbmxpbmVFZGl0KHRyLnN0ZXBzKVxyXG4gICAgaWYgKCFzdGVwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc2NoZW1hID0gc3RhdGUuc2NoZW1hXHJcbiAgICBjb25zdCBpbnNlcnRpb24gPSBzY2hlbWEubWFya3MuaW5zZXJ0aW9uXHJcbiAgICBjb25zdCBkZWxldGlvbiA9IHNjaGVtYS5tYXJrcy5kZWxldGlvblxyXG4gICAgaWYgKCFpbnNlcnRpb24gfHwgIWRlbGV0aW9uKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgc3RlcC5ibG9ja1BhdGgpXHJcbiAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jayB8fCAhYmxvY2sudHlwZS5hbGxvd3NNYXJrVHlwZShkZWxldGlvbikpIHJldHVybiBudWxsXHJcbiAgICBpZiAoc3RlcC5pbnNlcnQuY2hpbGRyZW4uc29tZSgoY2hpbGQpID0+ICFjaGlsZC5pc1RleHQpKSByZXR1cm4gbnVsbFxyXG4gICAgaWYgKHN0ZXAuZnJvbSA8IHN0ZXAudG8gJiYgIXJhbmdlSXNBbGxUZXh0KGJsb2NrLCBzdGVwLmZyb20sIHN0ZXAudG8pKSByZXR1cm4gbnVsbFxyXG5cclxuICAgIGNvbnN0IGF1dGhvciA9IHRoaXMub3B0aW9ucy5hdXRob3JcclxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHRoaXMub3B0aW9ucy5ub3c/LigpID8/IERhdGUubm93KClcclxuICAgIC8vIFJldXNlIHRoZSBhZGphY2VudCBzdWdnZXN0aW9uIG1hcmsgd2hlbiB0aGUgc2FtZSBhdXRob3Iga2VlcHMgZ29pbmcsXHJcbiAgICAvLyBzbyBjb25zZWN1dGl2ZSBrZXlzdHJva2VzIG1lcmdlIGludG8gb25lIHNwYW4gKG9uZSBzdWdnZXN0aW9uKS5cclxuICAgIGNvbnN0IHJldXNhYmxlID0gKGluZGV4OiBudW1iZXIsIHR5cGU6IE1hcmtUeXBlKTogTWFyayB8IG51bGwgPT5cclxuICAgICAgbWFya3NPZkNoYXJBdChibG9jaywgaW5kZXgpPy5maW5kKFxyXG4gICAgICAgIChtYXJrKSA9PiBtYXJrLnR5cGUgPT09IHR5cGUgJiYgbWFyay5hdHRycy5hdXRob3IgPT09IGF1dGhvcixcclxuICAgICAgKSA/PyBudWxsXHJcblxyXG4gICAgY29uc3Qgc2VnbWVudHMgPVxyXG4gICAgICBzdGVwLmZyb20gPCBzdGVwLnRvXHJcbiAgICAgICAgPyBjbGFzc2lmeURlbGV0aW9uKGJsb2NrLCBzdGVwLmZyb20sIHN0ZXAudG8sIHsgaW5zZXJ0aW9uLCBkZWxldGlvbiB9LCBhdXRob3IpXHJcbiAgICAgICAgOiBbXVxyXG4gICAgY29uc3QgdmFuaXNoaW5nID0gc2VnbWVudHMucmVkdWNlKFxyXG4gICAgICAodG90YWwsIHNlZ21lbnQpID0+XHJcbiAgICAgICAgc2VnbWVudC5lZmZlY3QgPT09ICdyZW1vdmUnID8gdG90YWwgKyAoc2VnbWVudC50byAtIHNlZ21lbnQuZnJvbSkgOiB0b3RhbCxcclxuICAgICAgMCxcclxuICAgIClcclxuICAgIC8vIFJlcGxhY2VtZW50IHRleHQgYmVsb25ncyB3aGVyZSB0aGUgZWRpdGVkIHJhbmdlIGVuZHMgb25jZSB0aGUgcGFydHMgb2ZcclxuICAgIC8vIGl0IHRoYXQgdmFuaXNoIGFyZSBnb25lLCBhZnRlciB0aGUgc3RydWNrIG9yaWdpbmFsLCBuZXZlciBiZWZvcmUgaXQuXHJcbiAgICBjb25zdCBpbnNlcnRBdCA9IHN0ZXAudG8gLSB2YW5pc2hpbmdcclxuXHJcbiAgICAvLyBNZXJnZSBpbnRvIGFuIGFkamFjZW50IHNwYW4gb2YgdGhpcyBhdXRob3IncyBvd24gc3VnZ2VzdGlvbiB3aGVuIHRoZXJlXHJcbiAgICAvLyBpcyBvbmUsIHNvIGNvbnNlY3V0aXZlIGVkaXRzIHJlYWQgYXMgb25lLiBPbmx5IHRoZSB0d28gZW5kcyBvZiB0aGVcclxuICAgIC8vIGVkaXRlZCByYW5nZSBjYW4gY2FycnkgaXQ6IGV2ZXJ5dGhpbmcgaW5zaWRlIHRoYXQgc3Vydml2ZWQgdGhlIGRlbGV0aW9uXHJcbiAgICAvLyBpcyBlaXRoZXIgb3JpZ2luYWwgdGV4dCBvciBzb21lb25lJ3Mgc3RyaWtlLCBhbmQgYSBjaGFyYWN0ZXIgb2YgdGhpc1xyXG4gICAgLy8gYXV0aG9yJ3Mgb3duIHBlbmRpbmcgaW5zZXJ0aW9uIGNsYXNzaWZpZXMgYXMgYHJlbW92ZWAgcmF0aGVyIHRoYW5cclxuICAgIC8vIHN1cnZpdmluZyBhdCBhbGwuXHJcbiAgICBjb25zdCBpbnNlcnRpb25NYXJrID1cclxuICAgICAgcmV1c2FibGUoc3RlcC5mcm9tIC0gMSwgaW5zZXJ0aW9uKSA/P1xyXG4gICAgICByZXVzYWJsZShzdGVwLnRvLCBpbnNlcnRpb24pID8/XHJcbiAgICAgIHNjaGVtYS5tYXJrKCdpbnNlcnRpb24nLCB7IGF1dGhvciwgdGltZXN0YW1wIH0pXHJcbiAgICBjb25zdCBtYXJrZWRJbnNlcnQgPSBGcmFnbWVudC5mcm9tKFxyXG4gICAgICBzdGVwLmluc2VydC5jaGlsZHJlbi5tYXAoKGNoaWxkKSA9PiB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IGNoaWxkIGFzIFRleHROb2RlXHJcbiAgICAgICAgcmV0dXJuIHNjaGVtYS50ZXh0KHRleHQudGV4dCwgaW5zZXJ0aW9uTWFyay5hZGRUb1NldCh0ZXh0Lm1hcmtzKSlcclxuICAgICAgfSksXHJcbiAgICApXHJcbiAgICBjb25zdCBvdXQgPSBjYXJyeU1ldGEoc3RhdGUudHIsIHRyKVxyXG4gICAgY29uc3QgY2FyZXRBdCA9IChvZmZzZXQ6IG51bWJlcik6IHZvaWQgPT4ge1xyXG4gICAgICBvdXQuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhzdGVwLmJsb2NrUGF0aCwgb2Zmc2V0KSkpXHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHVyZSBpbnNlcnRpb246IGtlZXAgaXQsIG1hcmtlZC5cclxuICAgIGlmIChzdGVwLmZyb20gPT09IHN0ZXAudG8pIHtcclxuICAgICAgaWYgKG1hcmtlZEluc2VydC5jaGlsZENvdW50ID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgICBvdXQuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAoc3RlcC5ibG9ja1BhdGgsIHN0ZXAuZnJvbSwgc3RlcC5mcm9tLCBtYXJrZWRJbnNlcnQpKVxyXG4gICAgICBjYXJldEF0KHN0ZXAuZnJvbSArIGlubGluZUxlbmd0aChtYXJrZWRJbnNlcnQpKVxyXG4gICAgICByZXR1cm4gb3V0XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaGVhZCA9XHJcbiAgICAgIHN0YXRlLnNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24gJiZcclxuICAgICAgcGF0aHNFcXVhbChzdGF0ZS5zZWxlY3Rpb24uaGVhZC5wYXRoLCBzdGVwLmJsb2NrUGF0aClcclxuICAgICAgICA/IHN0YXRlLnNlbGVjdGlvbi5oZWFkLm9mZnNldFxyXG4gICAgICAgIDogbnVsbFxyXG4gICAgY29uc3QgYmFja3dhcmQgPSBoZWFkID09PSBzdGVwLnRvXHJcblxyXG4gICAgLy8gQmFjayB0byBmcm9udCwgc28gZXZlcnkgc2VnbWVudCBzdGlsbCBhZGRyZXNzZXMgdGhlIGJsb2NrIHRoZVxyXG4gICAgLy8gY2xhc3NpZmljYXRpb24gd2FzIG1hZGUgYWdhaW5zdCB3aGlsZSBlYXJsaWVyIG9uZXMgYXJlIGJlaW5nIGVkaXRlZC5cclxuICAgIGZvciAobGV0IGluZGV4ID0gc2VnbWVudHMubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xyXG4gICAgICBjb25zdCBzZWdtZW50ID0gc2VnbWVudHNbaW5kZXhdIGFzIERlbGV0aW9uU2VnbWVudFxyXG4gICAgICBpZiAoc2VnbWVudC5lZmZlY3QgPT09ICdyZW1vdmUnKSB7XHJcbiAgICAgICAgb3V0LnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKHN0ZXAuYmxvY2tQYXRoLCBzZWdtZW50LmZyb20sIHNlZ21lbnQudG8sIEZyYWdtZW50LmVtcHR5KSlcclxuICAgICAgfSBlbHNlIGlmIChzZWdtZW50LmVmZmVjdCA9PT0gJ3N0cmlrZScpIHtcclxuICAgICAgICBjb25zdCBtYXJrID1cclxuICAgICAgICAgIHJldXNhYmxlKHNlZ21lbnQudG8sIGRlbGV0aW9uKSA/P1xyXG4gICAgICAgICAgcmV1c2FibGUoc2VnbWVudC5mcm9tIC0gMSwgZGVsZXRpb24pID8/XHJcbiAgICAgICAgICBzY2hlbWEubWFyaygnZGVsZXRpb24nLCB7IGF1dGhvciwgdGltZXN0YW1wIH0pXHJcbiAgICAgICAgb3V0LnN0ZXAobmV3IEFkZE1hcmtTdGVwKHN0ZXAuYmxvY2tQYXRoLCBzZWdtZW50LmZyb20sIHNlZ21lbnQudG8sIG1hcmspKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG1hcmtlZEluc2VydC5jaGlsZENvdW50ID4gMCkge1xyXG4gICAgICAvLyBSZXBsYWNlbWVudDogc3RydWNrIG9yaWdpbmFsLCBzdWdnZXN0ZWQgdGV4dCByaWdodCBhZnRlciBpdC5cclxuICAgICAgb3V0LnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKHN0ZXAuYmxvY2tQYXRoLCBpbnNlcnRBdCwgaW5zZXJ0QXQsIG1hcmtlZEluc2VydCkpXHJcbiAgICAgIGNhcmV0QXQoaW5zZXJ0QXQgKyBpbmxpbmVMZW5ndGgobWFya2VkSW5zZXJ0KSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIE5vdGhpbmcgaXMgcmUtc3RydWNrIG92ZXIgYSByYW5nZSB0aGF0IHdhcyBhbHJlYWR5IHN0cnVjaywgc28gdGhlXHJcbiAgICAgIC8vIGNhcmV0IHNpbXBseSBzdGVwcyBhY3Jvc3MgaXQsIGFzIGl0IHdvdWxkIGFjcm9zcyB0ZXh0IHJlYWxseSBnb25lLlxyXG4gICAgICBjYXJldEF0KGJhY2t3YXJkID8gc3RlcC5mcm9tIDogaW5zZXJ0QXQpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gb3V0XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUmVjb2duaXplIGEgdHJhbnNhY3Rpb24gYXMgb25lIGlubGluZSBlZGl0OiBlaXRoZXIgYSBzaW5nbGVcclxuICogUmVwbGFjZUlubGluZVN0ZXAsIG9yIHRoZSBkZWxldGUraW5zZXJ0IHBhaXIgY29tbWFuZHMgZW1pdCB3aGVuIHR5cGluZ1xyXG4gKiBvdmVyIGEgc2FtZS1ibG9jayBzZWxlY3Rpb24uXHJcbiAqL1xyXG5mdW5jdGlvbiBub3JtYWxpemVJbmxpbmVFZGl0KHN0ZXBzOiByZWFkb25seSB1bmtub3duW10pOiBSZXBsYWNlSW5saW5lU3RlcCB8IG51bGwge1xyXG4gIGlmIChzdGVwcy5sZW5ndGggPT09IDEpIHtcclxuICAgIHJldHVybiBzdGVwc1swXSBpbnN0YW5jZW9mIFJlcGxhY2VJbmxpbmVTdGVwID8gc3RlcHNbMF0gOiBudWxsXHJcbiAgfVxyXG4gIGlmIChzdGVwcy5sZW5ndGggPT09IDIpIHtcclxuICAgIGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IHN0ZXBzXHJcbiAgICBpZiAoXHJcbiAgICAgIGZpcnN0IGluc3RhbmNlb2YgUmVwbGFjZUlubGluZVN0ZXAgJiZcclxuICAgICAgc2Vjb25kIGluc3RhbmNlb2YgUmVwbGFjZUlubGluZVN0ZXAgJiZcclxuICAgICAgcGF0aHNFcXVhbChmaXJzdC5ibG9ja1BhdGgsIHNlY29uZC5ibG9ja1BhdGgpICYmXHJcbiAgICAgIGZpcnN0Lmluc2VydC5jaGlsZENvdW50ID09PSAwICYmXHJcbiAgICAgIGZpcnN0LmZyb20gPCBmaXJzdC50byAmJlxyXG4gICAgICBzZWNvbmQuZnJvbSA9PT0gc2Vjb25kLnRvICYmXHJcbiAgICAgIHNlY29uZC5mcm9tID09PSBmaXJzdC5mcm9tXHJcbiAgICApIHtcclxuICAgICAgcmV0dXJuIG5ldyBSZXBsYWNlSW5saW5lU3RlcChmaXJzdC5ibG9ja1BhdGgsIGZpcnN0LmZyb20sIGZpcnN0LnRvLCBzZWNvbmQuaW5zZXJ0KVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gbnVsbFxyXG59XHJcblxyXG5mdW5jdGlvbiBjb21wYXJlUGF0aHMoYTogUGF0aCwgYjogUGF0aCk6IG51bWJlciB7XHJcbiAgY29uc3QgbGVuZ3RoID0gTWF0aC5taW4oYS5sZW5ndGgsIGIubGVuZ3RoKVxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcclxuICAgIGNvbnN0IGRlbHRhID0gKGFbaV0gYXMgbnVtYmVyKSAtIChiW2ldIGFzIG51bWJlcilcclxuICAgIGlmIChkZWx0YSAhPT0gMCkgcmV0dXJuIGRlbHRhXHJcbiAgfVxyXG4gIHJldHVybiBhLmxlbmd0aCAtIGIubGVuZ3RoXHJcbn1cclxuXHJcbmV4cG9ydCB7XHJcbiAgdHlwZSBUcmFja0NoYW5nZXNCYXIsXHJcbiAgdHlwZSBUcmFja0NoYW5nZXNCYXJPcHRpb25zLFxyXG4gIGNyZWF0ZVRyYWNrQ2hhbmdlc0JhcixcclxuICBuZXh0U3VnZ2VzdGlvbixcclxuICBzdWdnZXN0aW9uQXQsXHJcbn0gZnJvbSAnLi91aSdcclxuIiwgImltcG9ydCB7XHJcbiAgdHlwZSBFZGl0b3IsXHJcbiAgdHlwZSBFZGl0b3JTdGF0ZSxcclxuICB0eXBlIFBvc2l0aW9uLFxyXG4gIFRleHRTZWxlY3Rpb24sXHJcbiAgY29tcGFyZVBvc2l0aW9ucyxcclxuICBkb21Qb2ludEZyb21Qb3NpdGlvbixcclxuICBwb3MsXHJcbn0gZnJvbSAnQHRyZXZpeGFsL2NvcmUnXHJcbmltcG9ydCB0eXBlIHsgU3VnZ2VzdGlvblJhbmdlLCBUcmFja0NoYW5nZXMgfSBmcm9tICcuL2luZGV4J1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUcmFja0NoYW5nZXNCYXJPcHRpb25zIHtcclxuICAvKiogV2hlcmUgdGhlIHRvb2xiYXIgaXMgYXBwZW5kZWQuICovXHJcbiAgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudFxyXG4gIC8qKiBTaG93biBuZXh0IHRvIHRoZSB0b2dnbGUgKFwiU3VnZ2VzdGluZyBhcyBhZGFcIikuICovXHJcbiAgcmVhZG9ubHkgYXV0aG9yPzogc3RyaW5nXHJcbiAgLyoqIENhbGxlZCBhZnRlciBhbnkgYWN0aW9uIHRha2VuIGZyb20gdGhlIGJhci4gKi9cclxuICByZWFkb25seSBvbkNoYW5nZT86IChzdGF0ZTogeyBlbmFibGVkOiBib29sZWFuOyBjb3VudDogbnVtYmVyIH0pID0+IHZvaWRcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUcmFja0NoYW5nZXNCYXIge1xyXG4gIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50XHJcbiAgcmVmcmVzaCgpOiB2b2lkXHJcbiAgZGVzdHJveSgpOiB2b2lkXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhcmV0T2Yoc3RhdGU6IEVkaXRvclN0YXRlKTogUG9zaXRpb24gfCBudWxsIHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICByZXR1cm4gc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbiA/IHNlbGVjdGlvbi5oZWFkIDogbnVsbFxyXG59XHJcblxyXG5jb25zdCBzdGFydCA9IChzdWdnZXN0aW9uOiBTdWdnZXN0aW9uUmFuZ2UpOiBQb3NpdGlvbiA9PiBwb3Moc3VnZ2VzdGlvbi5wYXRoLCBzdWdnZXN0aW9uLmZyb20pXHJcbmNvbnN0IGVuZCA9IChzdWdnZXN0aW9uOiBTdWdnZXN0aW9uUmFuZ2UpOiBQb3NpdGlvbiA9PiBwb3Moc3VnZ2VzdGlvbi5wYXRoLCBzdWdnZXN0aW9uLnRvKVxyXG5cclxuLyoqIFBlbmRpbmcgc3VnZ2VzdGlvbnMgaW4gZG9jdW1lbnQgb3JkZXIgKHRoZSB0cmFja2VyIGdyb3VwcyB0aGVtIHBlciBraW5kKS4gKi9cclxuZnVuY3Rpb24gb3JkZXJlZCh0cmFjazogVHJhY2tDaGFuZ2VzKTogcmVhZG9ubHkgU3VnZ2VzdGlvblJhbmdlW10ge1xyXG4gIHJldHVybiBbLi4udHJhY2suc3VnZ2VzdGlvbnMoKV0uc29ydCgoYSwgYikgPT4gY29tcGFyZVBvc2l0aW9ucyhzdGFydChhKSwgc3RhcnQoYikpKVxyXG59XHJcblxyXG4vKiogVGhlIHN1Z2dlc3Rpb24gd2hvc2Ugc3BhbiBjb250YWlucyB0aGUgY2FyZXQgKGVkZ2VzIGluY2x1c2l2ZSksIGlmIGFueS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHN1Z2dlc3Rpb25BdCh0cmFjazogVHJhY2tDaGFuZ2VzLCBzdGF0ZTogRWRpdG9yU3RhdGUpOiBTdWdnZXN0aW9uUmFuZ2UgfCBudWxsIHtcclxuICBjb25zdCBjYXJldCA9IGNhcmV0T2Yoc3RhdGUpXHJcbiAgaWYgKCFjYXJldCkgcmV0dXJuIG51bGxcclxuICByZXR1cm4gKFxyXG4gICAgdHJhY2tcclxuICAgICAgLnN1Z2dlc3Rpb25zKClcclxuICAgICAgLmZpbmQoXHJcbiAgICAgICAgKHN1Z2dlc3Rpb24pID0+XHJcbiAgICAgICAgICBjb21wYXJlUG9zaXRpb25zKHN0YXJ0KHN1Z2dlc3Rpb24pLCBjYXJldCkgPD0gMCAmJlxyXG4gICAgICAgICAgY29tcGFyZVBvc2l0aW9ucyhjYXJldCwgZW5kKHN1Z2dlc3Rpb24pKSA8PSAwLFxyXG4gICAgICApID8/IG51bGxcclxuICApXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgZmlyc3Qgc3VnZ2VzdGlvbiBzdGFydGluZyBhZnRlciB0aGUgY2FyZXQgKGAxYCkgb3IgdGhlIGxhc3Qgb25lIGVuZGluZ1xyXG4gKiBiZWZvcmUgaXQgKGAtMWApLiBBIHN1Z2dlc3Rpb24gdG91Y2hpbmcgdGhlIGNhcmV0IGNvdW50cyBhcyBjdXJyZW50IGFuZCBpc1xyXG4gKiBza2lwcGVkIGluIGJvdGggZGlyZWN0aW9ucy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBuZXh0U3VnZ2VzdGlvbihcclxuICB0cmFjazogVHJhY2tDaGFuZ2VzLFxyXG4gIHN0YXRlOiBFZGl0b3JTdGF0ZSxcclxuICBkaXJlY3Rpb246IDEgfCAtMSxcclxuKTogU3VnZ2VzdGlvblJhbmdlIHwgbnVsbCB7XHJcbiAgY29uc3QgY2FyZXQgPSBjYXJldE9mKHN0YXRlKVxyXG4gIGlmICghY2FyZXQpIHJldHVybiBudWxsXHJcbiAgY29uc3QgYWxsID0gb3JkZXJlZCh0cmFjaylcclxuICBpZiAoZGlyZWN0aW9uID09PSAxKSB7XHJcbiAgICByZXR1cm4gYWxsLmZpbmQoKHN1Z2dlc3Rpb24pID0+IGNvbXBhcmVQb3NpdGlvbnMoc3RhcnQoc3VnZ2VzdGlvbiksIGNhcmV0KSA+IDApID8/IG51bGxcclxuICB9XHJcbiAgZm9yIChsZXQgaW5kZXggPSBhbGwubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xyXG4gICAgY29uc3Qgc3VnZ2VzdGlvbiA9IGFsbFtpbmRleF0gYXMgU3VnZ2VzdGlvblJhbmdlXHJcbiAgICBpZiAoY29tcGFyZVBvc2l0aW9ucyhlbmQoc3VnZ2VzdGlvbiksIGNhcmV0KSA8IDApIHJldHVybiBzdWdnZXN0aW9uXHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvdW50TGFiZWwoY291bnQ6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgaWYgKGNvdW50ID09PSAwKSByZXR1cm4gJ05vIHN1Z2dlc3Rpb25zJ1xyXG4gIHJldHVybiBjb3VudCA9PT0gMSA/ICcxIHN1Z2dlc3Rpb24nIDogYCR7Y291bnR9IHN1Z2dlc3Rpb25zYFxyXG59XHJcblxyXG4vKipcclxuICogQSB0b29sYmFyIGZvciBzdWdnZXN0aW9uIG1vZGU6IHRvZ2dsZSBzdWdnZXN0aW5nLCBzZWUgaG93IG1hbnkgc3VnZ2VzdGlvbnNcclxuICogYXJlIHBlbmRpbmcsIHN0ZXAgdGhyb3VnaCB0aGVtLCBhbmQgYWNjZXB0IG9yIHJlamVjdCB0aGUgb25lIGF0IHRoZSBjYXJldFxyXG4gKiBvciBhbGwgb2YgdGhlbSBhdCBvbmNlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRyYWNrQ2hhbmdlc0JhcihcclxuICBlZGl0b3I6IEVkaXRvcixcclxuICB0cmFjazogVHJhY2tDaGFuZ2VzLFxyXG4gIG9wdGlvbnM6IFRyYWNrQ2hhbmdlc0Jhck9wdGlvbnMsXHJcbik6IFRyYWNrQ2hhbmdlc0JhciB7XHJcbiAgY29uc3QgZG9jID0gb3B0aW9ucy5jb250YWluZXIub3duZXJEb2N1bWVudFxyXG4gIGNvbnN0IGRpc3Bvc2VyczogKCgpID0+IHZvaWQpW10gPSBbXVxyXG5cclxuICBjb25zdCByb290ID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpXHJcbiAgcm9vdC5jbGFzc05hbWUgPSAndHJldml4YWwtdHJhY2tjaGFuZ2VzJ1xyXG4gIHJvb3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ3Rvb2xiYXInKVxyXG4gIHJvb3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ1RyYWNrIGNoYW5nZXMnKVxyXG5cclxuICBjb25zdCBjb250cm9sID0gKGNsYXNzTmFtZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBhY3Rpb246ICgpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCA9PiB7XHJcbiAgICBjb25zdCBlbGVtZW50ID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpXHJcbiAgICBlbGVtZW50LnR5cGUgPSAnYnV0dG9uJ1xyXG4gICAgZWxlbWVudC5jbGFzc05hbWUgPSBgdHJldml4YWwtdHJhY2tjaGFuZ2VzX19idXR0b24gJHtjbGFzc05hbWV9YFxyXG4gICAgZWxlbWVudC50ZXh0Q29udGVudCA9IGxhYmVsXHJcbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICBhY3Rpb24oKVxyXG4gICAgICByZWZyZXNoKClcclxuICAgICAgb3B0aW9ucy5vbkNoYW5nZT8uKHsgZW5hYmxlZDogdHJhY2suaXNFbmFibGVkLCBjb3VudDogdHJhY2suc3VnZ2VzdGlvbnMoKS5sZW5ndGggfSlcclxuICAgIH0pXHJcbiAgICByZXR1cm4gZWxlbWVudFxyXG4gIH1cclxuXHJcbiAgY29uc3QgdG9nZ2xlID0gY29udHJvbCgndHJldml4YWwtdHJhY2tjaGFuZ2VzX190b2dnbGUnLCAnU3VnZ2VzdGluZycsICgpID0+IHtcclxuICAgIGlmICh0cmFjay5pc0VuYWJsZWQpIHRyYWNrLmRpc2FibGUoKVxyXG4gICAgZWxzZSB0cmFjay5lbmFibGUoKVxyXG4gIH0pXHJcbiAgaWYgKG9wdGlvbnMuYXV0aG9yKSB0b2dnbGUudGl0bGUgPSBgU3VnZ2VzdGluZyBhcyAke29wdGlvbnMuYXV0aG9yfWBcclxuICByb290LmFwcGVuZENoaWxkKHRvZ2dsZSlcclxuICBpZiAob3B0aW9ucy5hdXRob3IpIHtcclxuICAgIGNvbnN0IGF1dGhvciA9IGRvYy5jcmVhdGVFbGVtZW50KCdzcGFuJylcclxuICAgIGF1dGhvci5jbGFzc05hbWUgPSAndHJldml4YWwtdHJhY2tjaGFuZ2VzX19hdXRob3InXHJcbiAgICBhdXRob3IudGV4dENvbnRlbnQgPSBgYXMgJHtvcHRpb25zLmF1dGhvcn1gXHJcbiAgICByb290LmFwcGVuZENoaWxkKGF1dGhvcilcclxuICB9XHJcblxyXG4gIGNvbnN0IGNvdW50ID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKVxyXG4gIGNvdW50LmNsYXNzTmFtZSA9ICd0cmV2aXhhbC10cmFja2NoYW5nZXNfX2NvdW50J1xyXG4gIGNvdW50LnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpXHJcbiAgcm9vdC5hcHBlbmRDaGlsZChjb3VudClcclxuXHJcbiAgY29uc3Qgc2VsZWN0ID0gKHN1Z2dlc3Rpb246IFN1Z2dlc3Rpb25SYW5nZSB8IG51bGwpOiB2b2lkID0+IHtcclxuICAgIGlmICghc3VnZ2VzdGlvbikgcmV0dXJuXHJcbiAgICBlZGl0b3IuZGlzcGF0Y2goXHJcbiAgICAgIGVkaXRvci5zdGF0ZS50ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24oc3RhcnQoc3VnZ2VzdGlvbiksIGVuZChzdWdnZXN0aW9uKSkpLFxyXG4gICAgKVxyXG4gICAgY29uc3QgdmlldyA9IGVkaXRvci52aWV3XHJcbiAgICBpZiAoIXZpZXcpIHJldHVyblxyXG4gICAgdmlldy5mb2N1cygpXHJcbiAgICBjb25zdCBwb2ludCA9IGRvbVBvaW50RnJvbVBvc2l0aW9uKHZpZXcuZG9tLCB2aWV3LnJlbmRlcmVyLCBzdGFydChzdWdnZXN0aW9uKSlcclxuICAgIGNvbnN0IG5vZGUgPSBwb2ludD8ubm9kZVxyXG4gICAgY29uc3QgZWxlbWVudCA9IG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50ID8gbm9kZSA6IG5vZGU/LnBhcmVudEVsZW1lbnRcclxuICAgIGVsZW1lbnQ/LnNjcm9sbEludG9WaWV3Py4oeyBibG9jazogJ25lYXJlc3QnIH0pXHJcbiAgfVxyXG5cclxuICBjb25zdCBjdXJyZW50ID0gKCk6IHJlYWRvbmx5IFN1Z2dlc3Rpb25SYW5nZVtdID0+IHtcclxuICAgIGNvbnN0IGZvdW5kID0gc3VnZ2VzdGlvbkF0KHRyYWNrLCBlZGl0b3Iuc3RhdGUpXHJcbiAgICByZXR1cm4gZm91bmQgPyBbZm91bmRdIDogW11cclxuICB9XHJcblxyXG4gIGNvbnN0IGdyb3VwID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ2RpdicpXHJcbiAgZ3JvdXAuY2xhc3NOYW1lID0gJ3RyZXZpeGFsLXRyYWNrY2hhbmdlc19fZ3JvdXAnXHJcbiAgY29uc3QgcHJldmlvdXMgPSBjb250cm9sKCd0cmV2aXhhbC10cmFja2NoYW5nZXNfX3ByZXZpb3VzJywgJ1ByZXZpb3VzJywgKCkgPT5cclxuICAgIHNlbGVjdChuZXh0U3VnZ2VzdGlvbih0cmFjaywgZWRpdG9yLnN0YXRlLCAtMSkpLFxyXG4gIClcclxuICBjb25zdCBuZXh0ID0gY29udHJvbCgndHJldml4YWwtdHJhY2tjaGFuZ2VzX19uZXh0JywgJ05leHQnLCAoKSA9PlxyXG4gICAgc2VsZWN0KG5leHRTdWdnZXN0aW9uKHRyYWNrLCBlZGl0b3Iuc3RhdGUsIDEpKSxcclxuICApXHJcbiAgY29uc3QgYWNjZXB0ID0gY29udHJvbCgndHJldml4YWwtdHJhY2tjaGFuZ2VzX19hY2NlcHQnLCAnQWNjZXB0JywgKCkgPT4gdHJhY2suYWNjZXB0KGN1cnJlbnQoKSkpXHJcbiAgY29uc3QgcmVqZWN0ID0gY29udHJvbCgndHJldml4YWwtdHJhY2tjaGFuZ2VzX19yZWplY3QnLCAnUmVqZWN0JywgKCkgPT4gdHJhY2sucmVqZWN0KGN1cnJlbnQoKSkpXHJcbiAgY29uc3QgYWNjZXB0QWxsID0gY29udHJvbCgndHJldml4YWwtdHJhY2tjaGFuZ2VzX19hY2NlcHQtYWxsJywgJ0FjY2VwdCBhbGwnLCAoKSA9PlxyXG4gICAgdHJhY2suYWNjZXB0QWxsKCksXHJcbiAgKVxyXG4gIGNvbnN0IHJlamVjdEFsbCA9IGNvbnRyb2woJ3RyZXZpeGFsLXRyYWNrY2hhbmdlc19fcmVqZWN0LWFsbCcsICdSZWplY3QgYWxsJywgKCkgPT5cclxuICAgIHRyYWNrLnJlamVjdEFsbCgpLFxyXG4gIClcclxuICBncm91cC5hcHBlbmQocHJldmlvdXMsIG5leHQsIGFjY2VwdCwgcmVqZWN0LCBhY2NlcHRBbGwsIHJlamVjdEFsbClcclxuICByb290LmFwcGVuZENoaWxkKGdyb3VwKVxyXG4gIG9wdGlvbnMuY29udGFpbmVyLmFwcGVuZENoaWxkKHJvb3QpXHJcblxyXG4gIGNvbnN0IHJlZnJlc2ggPSAoKTogdm9pZCA9PiB7XHJcbiAgICBjb25zdCB0b3RhbCA9IHRyYWNrLnN1Z2dlc3Rpb25zKCkubGVuZ3RoXHJcbiAgICB0b2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcodHJhY2suaXNFbmFibGVkKSlcclxuICAgIHRvZ2dsZS5jbGFzc0xpc3QudG9nZ2xlKCd0cmV2aXhhbC10cmFja2NoYW5nZXNfX3RvZ2dsZS0tb24nLCB0cmFjay5pc0VuYWJsZWQpXHJcbiAgICBjb3VudC50ZXh0Q29udGVudCA9IGNvdW50TGFiZWwodG90YWwpXHJcbiAgICBjb25zdCBhdENhcmV0ID0gc3VnZ2VzdGlvbkF0KHRyYWNrLCBlZGl0b3Iuc3RhdGUpICE9PSBudWxsXHJcbiAgICBhY2NlcHQuZGlzYWJsZWQgPSAhYXRDYXJldFxyXG4gICAgcmVqZWN0LmRpc2FibGVkID0gIWF0Q2FyZXRcclxuICAgIHByZXZpb3VzLmRpc2FibGVkID0gbmV4dFN1Z2dlc3Rpb24odHJhY2ssIGVkaXRvci5zdGF0ZSwgLTEpID09PSBudWxsXHJcbiAgICBuZXh0LmRpc2FibGVkID0gbmV4dFN1Z2dlc3Rpb24odHJhY2ssIGVkaXRvci5zdGF0ZSwgMSkgPT09IG51bGxcclxuICAgIGFjY2VwdEFsbC5kaXNhYmxlZCA9IHRvdGFsID09PSAwXHJcbiAgICByZWplY3RBbGwuZGlzYWJsZWQgPSB0b3RhbCA9PT0gMFxyXG4gIH1cclxuXHJcbiAgZGlzcG9zZXJzLnB1c2goZWRpdG9yLm9uKCd0cmFuc2FjdGlvbicsIHJlZnJlc2gpKVxyXG4gIGRpc3Bvc2Vycy5wdXNoKGVkaXRvci5vbignc2VsZWN0aW9uVXBkYXRlJywgcmVmcmVzaCkpXHJcbiAgLy8gU3dpdGNoaW5nIG1vZGVzIHJhaXNlcyBubyB0cmFuc2FjdGlvbiwgc28gdGhlIHR3byBzdWJzY3JpcHRpb25zIGFib3ZlXHJcbiAgLy8gbmV2ZXIgaGVhciBpdC4gVGhlIGJhciB3b3VsZCBrZWVwIHNheWluZyBcIm9mZlwiIHdoaWxlIHRoZSBtZW51IGhhZCBqdXN0XHJcbiAgLy8gdHVybmVkIGl0IG9uLCB1bnRpbCB0aGUgbmV4dCBrZXlzdHJva2UgaGFwcGVuZWQgdG8gcmVmcmVzaCBpdC5cclxuICBkaXNwb3NlcnMucHVzaCh0cmFjay5vbkVuYWJsZWRDaGFuZ2UocmVmcmVzaCkpXHJcbiAgcmVmcmVzaCgpXHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBlbGVtZW50OiByb290LFxyXG4gICAgcmVmcmVzaCxcclxuICAgIGRlc3Ryb3k6ICgpID0+IHtcclxuICAgICAgZm9yIChjb25zdCBkaXNwb3NlIG9mIGRpc3Bvc2VycykgZGlzcG9zZSgpXHJcbiAgICAgIHJvb3QucmVtb3ZlKClcclxuICAgIH0sXHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQge1xyXG4gIHR5cGUgRWRpdG9yLFxyXG4gIHR5cGUgUGF0aCxcclxuICBTY2hlbWEsXHJcbiAgVGV4dFNlbGVjdGlvbixcclxuICBjcmVhdGVFZGl0b3IsXHJcbiAgZGVmYXVsdE1hcmtzLFxyXG4gIGRlZmF1bHROb2RlcyxcclxuICBwb3MsXHJcbn0gZnJvbSAnQHRyZXZpeGFsL2NvcmUnXHJcbmltcG9ydCB7IFRyYWNrQ2hhbmdlcywgdHJhY2tDaGFuZ2VzTWFya3MgfSBmcm9tICdAdHJldml4YWwvZXh0ZW5zaW9uLXRyYWNrLWNoYW5nZXMnXHJcblxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgaW50ZXJmYWNlIFdpbmRvdyB7XHJcbiAgICB0cmFja0NoYW5nZXNQYWdlOiB7XHJcbiAgICAgIGVkaXRvcjogRWRpdG9yXHJcbiAgICAgIHNlbGVjdFJhbmdlKGZyb21QYXRoOiBQYXRoLCBmcm9tT2Zmc2V0OiBudW1iZXIsIHRvUGF0aDogUGF0aCwgdG9PZmZzZXQ6IG51bWJlcik6IHZvaWRcclxuICAgICAgdHJhY2s6IFRyYWNrQ2hhbmdlc1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYSh7XHJcbiAgbm9kZXM6IGRlZmF1bHROb2RlcygpLFxyXG4gIG1hcmtzOiB7IC4uLmRlZmF1bHRNYXJrcygpLCAuLi50cmFja0NoYW5nZXNNYXJrcygpIH0sXHJcbn0pXHJcblxyXG5mdW5jdGlvbiBtb3VudChpZDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZClcclxuICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihgbWlzc2luZyAjJHtpZH1gKVxyXG4gIHJldHVybiBlbGVtZW50XHJcbn1cclxuXHJcbmNvbnN0IGVkaXRvciA9IGNyZWF0ZUVkaXRvcih7IHNjaGVtYSwgZWxlbWVudDogbW91bnQoJ2VkaXRvcicpIH0pXHJcbmNvbnN0IHRyYWNrID0gbmV3IFRyYWNrQ2hhbmdlcyhlZGl0b3IsIHsgYXV0aG9yOiAnbWUnIH0pXHJcblxyXG4vLyAtLS0tIHBhZ2UgQVBJIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbndpbmRvdy50cmFja0NoYW5nZXNQYWdlID0ge1xyXG4gIGVkaXRvcixcclxuICAvLyBTZWxlY3Rpb25zIGEga2V5Ym9hcmQgY2Fubm90IHJlbGlhYmx5IG1ha2UgZnJvbSBQbGF5d3JpZ2h0OyB0aGUgc3BlYyBuZWVkc1xyXG4gIC8vIGFuIGV4YWN0IHJhbmdlLCBub3Qgd2hhdGV2ZXIgYSBkb3VibGUtY2xpY2sgaGFwcGVucyB0byBwaWNrLlxyXG4gIHNlbGVjdFJhbmdlOiAoZnJvbVBhdGgsIGZyb21PZmZzZXQsIHRvUGF0aCwgdG9PZmZzZXQpID0+IHtcclxuICAgIGVkaXRvci5kaXNwYXRjaChcclxuICAgICAgZWRpdG9yLnN0YXRlLnRyLnNldFNlbGVjdGlvbihcclxuICAgICAgICBuZXcgVGV4dFNlbGVjdGlvbihwb3MoZnJvbVBhdGgsIGZyb21PZmZzZXQpLCBwb3ModG9QYXRoLCB0b09mZnNldCkpLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gIH0sXHJcbiAgdHJhY2ssXHJcbn1cclxuXHJcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0Yy1lbmFibGUnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0cmFjay5lbmFibGUoKSlcclxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RjLWFjY2VwdCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRyYWNrLmFjY2VwdEFsbCgpKVxyXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndGMtcmVqZWN0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdHJhY2sucmVqZWN0QWxsKCkpXHJcbiJdLAogICJtYXBwaW5ncyI6ICI7OztBQUdPLE1BQU0sYUFBb0IsT0FBTyxPQUFPLENBQUEsQ0FBRTtBQUcxQyxXQUFTLFFBQVEsR0FBVSxHQUFtQjtBQUNuRCxRQUFJLE1BQU0sRUFBRyxRQUFPO0FBQ3BCLFVBQU0sUUFBUSxPQUFPLEtBQUssQ0FBQztBQUMzQixVQUFNLFFBQVEsT0FBTyxLQUFLLENBQUM7QUFDM0IsUUFBSSxNQUFNLFdBQVcsTUFBTSxPQUFRLFFBQU87QUFDMUMsV0FBTyxNQUFNLE1BQU0sQ0FBQyxRQUFRLEVBQUUsR0FBRyxNQUFNLEVBQUUsR0FBRyxDQUFDO0VBQy9DO0FBR08sV0FBUyxhQUNkLFdBQ0EsT0FDQSxPQUNPO0FBQ1AsUUFBSSxDQUFDLFVBQVcsUUFBTztBQUN2QixVQUFNLFNBQWtDLENBQUE7QUFDeEMsZUFBVyxDQUFDLE1BQU0sSUFBSSxLQUFLLE9BQU8sUUFBUSxTQUFTLEdBQUc7QUFDcEQsVUFBSSxTQUFTLFFBQVEsT0FBTztBQUMxQixlQUFPLElBQUksSUFBSSxNQUFNLElBQUk7TUFDM0IsV0FBVyxhQUFhLE1BQU07QUFDNUIsZUFBTyxJQUFJLElBQUksS0FBSztNQUN0QixPQUFPO0FBQ0wsY0FBTSxJQUFJLFdBQVcsK0JBQStCLElBQUksUUFBUSxLQUFLLEVBQUU7TUFDekU7SUFDRjtBQUNB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UyxhQUFhLEdBQVMsR0FBaUI7QUFDOUMsVUFBTSxTQUFTLEtBQUssSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNO0FBQzFDLGFBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxLQUFLO0FBQy9CLFlBQU0sUUFBUyxFQUFFLENBQUMsSUFBZ0IsRUFBRSxDQUFDO0FBQ3JDLFVBQUksVUFBVSxFQUFHLFFBQU87SUFDMUI7QUFDQSxXQUFPLEVBQUUsU0FBUyxFQUFFO0VBQ3RCOzs7QUV4YkEsTUFBTSxTQUFTLElBQUksT0FBTztBQUFBLElBQ3hCLE9BQU8sYUFBYTtBQUFBLElBQ3BCLE9BQU8sRUFBRSxHQUFHLGFBQWEsR0FBRyxHQUFHLGtCQUFrQixFQUFFO0FBQUEsRUFDckQsQ0FBQztBQUVELFdBQVMsTUFBTSxJQUF5QjtBQUN0QyxVQUFNLFVBQVUsU0FBUyxlQUFlLEVBQUU7QUFDMUMsUUFBSSxDQUFDLFFBQVMsT0FBTSxJQUFJLE1BQU0sWUFBWSxFQUFFLEVBQUU7QUFDOUMsV0FBTztBQUFBLEVBQ1Q7QUFFQSxNQUFNLFNBQVMsYUFBYSxFQUFFLFFBQVEsU0FBUyxNQUFNLFFBQVEsRUFBRSxDQUFDO0FBQ2hFLE1BQU0sUUFBUSxJQUFJLGFBQWEsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBSXZELFNBQU8sbUJBQW1CO0FBQUEsSUFDeEI7QUFBQTtBQUFBO0FBQUEsSUFHQSxhQUFhLENBQUMsVUFBVSxZQUFZLFFBQVEsYUFBYTtBQUN2RCxhQUFPO0FBQUEsUUFDTCxPQUFPLE1BQU0sR0FBRztBQUFBLFVBQ2QsSUFBSSxjQUFjLElBQUksVUFBVSxVQUFVLEdBQUcsSUFBSSxRQUFRLFFBQVEsQ0FBQztBQUFBLFFBQ3BFO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUVBLFdBQVMsZUFBZSxXQUFXLEdBQUcsaUJBQWlCLFNBQVMsTUFBTSxNQUFNLE9BQU8sQ0FBQztBQUNwRixXQUFTLGVBQWUsV0FBVyxHQUFHLGlCQUFpQixTQUFTLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFDdkYsV0FBUyxlQUFlLFdBQVcsR0FBRyxpQkFBaUIsU0FBUyxNQUFNLE1BQU0sVUFBVSxDQUFDOyIsCiAgIm5hbWVzIjogWyJjb3VudCIsICJzY2hlbWEiLCAicG9zIiwgInNjaGVtYSIsICJzY2hlbWEiLCAiY2hpbGRJbmRleCIsICJhY3RpdmUiLCAidHIiLCAiaXRlbVR5cGUiLCAiaXRlbXMiLCAic2NoZW1hIiwgImNvdW50IiwgInNjaGVtYSIsICJkb2N1bWVudCIsICJkb2N1bWVudCIsICJiZWZvcmUiLCAiY29udGVudCIsICJlZGl0b3IiLCAiZWxlbWVudCIsICJURVhUX05PREUiLCAic2NoZW1hIiwgIm5vZGVzIiwgInNhbWVBdHRycyIsICJlZGl0b3IiLCAic3RhcnQiLCAiZWRpdG9yIiwgInNjaGVtYSIsICJvcmRlcmVkIiwgImluc2VydEF0IiwgIlRleHRTZWxlY3Rpb24iLCAicG9zIl0KfQo=

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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vY29yZS9zcmMvbW9kZWwvYXR0cnMudHMiLCAiLi4vLi4vY29yZS9zcmMvbW9kZWwvbWFyay50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC9mcmFnbWVudC50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC9ub2RlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2NvbnRlbnQudHMiLCAiLi4vLi4vY29yZS9zcmMvbW9kZWwvc2NoZW1hLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2lubGluZS50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC90cmVlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL3Bvc2l0aW9uLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2Jsb2Nrcy50cyIsICIuLi8uLi9jb3JlL3NyYy9tb2RlbC9qc29uLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL25vcm1hbGl6ZS50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS9zdGVwLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3JlcGxhY2Utbm9kZXMudHMiLCAiLi4vLi4vY29yZS9zcmMvc3RhdGUvc3RlcHMvbWFyay1zdGVwcy50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS9zdGVwcy9hdHRycy1zdGVwLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3NwbGl0LWpvaW4udHMiLCAiLi4vLi4vY29yZS9zcmMvc3RhdGUvc3RlcHMvbW92ZS1ub2RlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3N0YXRlL3N0ZXBzL3dyYXAtbGlmdC50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS90cmFuc2FjdGlvbi50cyIsICIuLi8uLi9jb3JlL3NyYy9zdGF0ZS9zZWxlY3Rpb24udHMiLCAiLi4vLi4vY29yZS9zcmMvc3RhdGUvZWRpdG9yLXN0YXRlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3NjaGVtYS9iYXNpYy50cyIsICIuLi8uLi9jb3JlL3NyYy9jb21tYW5kcy9oZWxwZXJzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2NvbW1hbmRzL2NvbW1hbmRzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2NvbW1hbmRzL2xpc3RzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2NvbW1hbmRzL2xpbmtzLnRzIiwgIi4uLy4uL2NvcmUvc3JjL2hpc3RvcnkvaGlzdG9yeS50cyIsICIuLi8uLi9jb3JlL3NyYy9pbnB1dC1ydWxlcy9pbnB1dC1ydWxlcy50cyIsICIuLi8uLi9jb3JlL3NyYy9zZWFyY2gvZmluZC1yZXBsYWNlLnRzIiwgIi4uLy4uL2NvcmUvc3JjL21vZGVsL2NvdW50cy50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvaHRtbC50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvaHRtbC1kb2N1bWVudC50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvbWFya2Rvd24udHMiLCAiLi4vLi4vY29yZS9zcmMvc2VyaWFsaXplL3BhcnNlLWh0bWwudHMiLCAiLi4vLi4vY29yZS9zcmMvc2VyaWFsaXplL3Bhc3RlLXNvdXJjZS50cyIsICIuLi8uLi9jb3JlL3NyYy9zZXJpYWxpemUvcGFyc2UtbWFya2Rvd24udHMiLCAiLi4vLi4vY29yZS9zcmMvYTExeS9hbm5vdW5jZS50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L2RvbS1wb2ludC50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L2tleW1hcC50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L3JlbmRlcmVyLnRzIiwgIi4uLy4uL2NvcmUvc3JjL3ZpZXcvZWRpdG9yLXZpZXcudHMiLCAiLi4vLi4vY29yZS9zcmMvc3VnZ2VzdC9zdWdnZXN0LnRzIiwgIi4uLy4uL2NvcmUvc3JjL2VkaXRvci9mb3JtYXQtcGFpbnRlci50cyIsICIuLi8uLi9jb3JlL3NyYy92aWV3L2VkaXRvci1kb2N1bWVudC50cyIsICIuLi8uLi9jb3JlL3NyYy9lcnJvcnMudHMiLCAiLi4vLi4vY29yZS9zcmMvZWRpdG9yL2VkaXRvci50cyIsICIuLi8uLi9leHRlbnNpb24tdHJhY2stY2hhbmdlcy9zcmMvaW5kZXgudHMiLCAiLi4vLi4vZXh0ZW5zaW9uLXRyYWNrLWNoYW5nZXMvc3JjL3VpLnRzIiwgInRyYWNrLWNoYW5nZXMtZW50cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKiBBdHRyaWJ1dGUgYmFnIGF0dGFjaGVkIHRvIG5vZGVzIGFuZCBtYXJrcy4gVmFsdWVzIG11c3QgYmUgSlNPTi1zZXJpYWxpemFibGUuICovXHJcbmV4cG9ydCB0eXBlIEF0dHJzID0gUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+XHJcblxyXG5leHBvcnQgY29uc3QgZW1wdHlBdHRyczogQXR0cnMgPSBPYmplY3QuZnJlZXplKHt9KVxyXG5cclxuLyoqIFNoYWxsb3cgc3RydWN0dXJhbCBlcXVhbGl0eSBmb3IgYXR0cmlidXRlIGJhZ3MuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBhdHRyc0VxKGE6IEF0dHJzLCBiOiBBdHRycyk6IGJvb2xlYW4ge1xyXG4gIGlmIChhID09PSBiKSByZXR1cm4gdHJ1ZVxyXG4gIGNvbnN0IGFLZXlzID0gT2JqZWN0LmtleXMoYSlcclxuICBjb25zdCBiS2V5cyA9IE9iamVjdC5rZXlzKGIpXHJcbiAgaWYgKGFLZXlzLmxlbmd0aCAhPT0gYktleXMubGVuZ3RoKSByZXR1cm4gZmFsc2VcclxuICByZXR1cm4gYUtleXMuZXZlcnkoKGtleSkgPT4gYVtrZXldID09PSBiW2tleV0pXHJcbn1cclxuXHJcbi8qKiBGaWxsIG1pc3NpbmcgYXR0cmlidXRlcyBmcm9tIHRoZSBzcGVjJ3MgZGVjbGFyZWQgZGVmYXVsdHMuIFRocm93cyBvbiBtaXNzaW5nIHJlcXVpcmVkIGF0dHJzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUF0dHJzKFxyXG4gIHNwZWNBdHRyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9Pj4gfCB1bmRlZmluZWQsXHJcbiAgZ2l2ZW46IEF0dHJzIHwgdW5kZWZpbmVkLFxyXG4gIG93bmVyOiBzdHJpbmcsXHJcbik6IEF0dHJzIHtcclxuICBpZiAoIXNwZWNBdHRycykgcmV0dXJuIGVtcHR5QXR0cnNcclxuICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge31cclxuICBmb3IgKGNvbnN0IFtuYW1lLCBzcGVjXSBvZiBPYmplY3QuZW50cmllcyhzcGVjQXR0cnMpKSB7XHJcbiAgICBpZiAoZ2l2ZW4gJiYgbmFtZSBpbiBnaXZlbikge1xyXG4gICAgICByZXN1bHRbbmFtZV0gPSBnaXZlbltuYW1lXVxyXG4gICAgfSBlbHNlIGlmICgnZGVmYXVsdCcgaW4gc3BlYykge1xyXG4gICAgICByZXN1bHRbbmFtZV0gPSBzcGVjLmRlZmF1bHRcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBNaXNzaW5nIHJlcXVpcmVkIGF0dHJpYnV0ZSBcIiR7bmFtZX1cIiBvbiAke293bmVyfWApXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBPYmplY3QuZnJlZXplKHJlc3VsdClcclxufVxyXG4iLCAiaW1wb3J0IHsgdHlwZSBBdHRycywgYXR0cnNFcSB9IGZyb20gJy4vYXR0cnMnXHJcbmltcG9ydCB0eXBlIHsgTWFya1R5cGUgfSBmcm9tICcuL3NjaGVtYSdcclxuXHJcbi8qKiBKU09OIHNoYXBlIG9mIGEgc2VyaWFsaXplZCBtYXJrLiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtKU09OIHtcclxuICByZWFkb25seSB0eXBlOiBzdHJpbmdcclxuICByZWFkb25seSBhdHRycz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIHBpZWNlIG9mIGlubGluZSBmb3JtYXR0aW5nIChib2xkLCBsaW5rLCDigKYpLiBJbW11dGFibGU7IGlkZW50aWZpZWQgYnkgaXRzXHJcbiAqIHR5cGUgcGx1cyBhdHRyaWJ1dGVzLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIE1hcmsge1xyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcmVhZG9ubHkgdHlwZTogTWFya1R5cGUsXHJcbiAgICByZWFkb25seSBhdHRyczogQXR0cnMsXHJcbiAgKSB7fVxyXG5cclxuICBlcShvdGhlcjogTWFyayk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMgPT09IG90aGVyIHx8ICh0aGlzLnR5cGUgPT09IG90aGVyLnR5cGUgJiYgYXR0cnNFcSh0aGlzLmF0dHJzLCBvdGhlci5hdHRycykpXHJcbiAgfVxyXG5cclxuICBpc0luU2V0KHNldDogcmVhZG9ubHkgTWFya1tdKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gc2V0LnNvbWUoKG1hcmspID0+IG1hcmsuZXEodGhpcykpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBZGQgdGhpcyBtYXJrIHRvIGEgc2V0LCBob25vcmluZyBtYXJrLWV4Y2x1c2lvbiBydWxlcyBhbmQga2VlcGluZyB0aGUgc2V0XHJcbiAgICogb3JkZXJlZCBieSBzY2hlbWEgcmFuay4gUmV0dXJucyB0aGUgc2FtZSBhcnJheSB3aGVuIG5vdGhpbmcgY2hhbmdlcy5cclxuICAgKi9cclxuICBhZGRUb1NldChzZXQ6IHJlYWRvbmx5IE1hcmtbXSk6IHJlYWRvbmx5IE1hcmtbXSB7XHJcbiAgICBpZiAodGhpcy5pc0luU2V0KHNldCkpIHJldHVybiBzZXRcclxuICAgIGNvbnN0IGtlcHQgPSBzZXQuZmlsdGVyKFxyXG4gICAgICAobWFyaykgPT4gIW1hcmsudHlwZS5leGNsdWRlcyh0aGlzLnR5cGUpICYmICF0aGlzLnR5cGUuZXhjbHVkZXMobWFyay50eXBlKSxcclxuICAgIClcclxuICAgIGNvbnN0IHJlc3VsdCA9IFsuLi5rZXB0LCB0aGlzXS5zb3J0KChhLCBiKSA9PiBhLnR5cGUucmFuayAtIGIudHlwZS5yYW5rKVxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgcmVtb3ZlRnJvbVNldChzZXQ6IHJlYWRvbmx5IE1hcmtbXSk6IHJlYWRvbmx5IE1hcmtbXSB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBzZXQuZmlsdGVyKChtYXJrKSA9PiAhbWFyay5lcSh0aGlzKSlcclxuICAgIHJldHVybiByZXN1bHQubGVuZ3RoID09PSBzZXQubGVuZ3RoID8gc2V0IDogcmVzdWx0XHJcbiAgfVxyXG5cclxuICB0b0pTT04oKTogTWFya0pTT04ge1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuYXR0cnMpLmxlbmd0aCA+IDBcclxuICAgICAgPyB7IHR5cGU6IHRoaXMudHlwZS5uYW1lLCBhdHRyczogeyAuLi50aGlzLmF0dHJzIH0gfVxyXG4gICAgICA6IHsgdHlwZTogdGhpcy50eXBlLm5hbWUgfVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IG5vTWFya3M6IHJlYWRvbmx5IE1hcmtbXSA9IE9iamVjdC5mcmVlemUoW10pXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbWFya3NFcShhOiByZWFkb25seSBNYXJrW10sIGI6IHJlYWRvbmx5IE1hcmtbXSk6IGJvb2xlYW4ge1xyXG4gIGlmIChhID09PSBiKSByZXR1cm4gdHJ1ZVxyXG4gIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZVxyXG4gIHJldHVybiBhLmV2ZXJ5KChtYXJrLCBpKSA9PiBtYXJrLmVxKGJbaV0pKVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuL25vZGUnXHJcblxyXG4vKiogSW1tdXRhYmxlIG9yZGVyZWQgbGlzdCBvZiBjaGlsZCBub2Rlcy4gKi9cclxuZXhwb3J0IGNsYXNzIEZyYWdtZW50IHtcclxuICBwcml2YXRlIGNvbnN0cnVjdG9yKHJlYWRvbmx5IGNoaWxkcmVuOiByZWFkb25seSBFZGl0b3JOb2RlW10pIHt9XHJcblxyXG4gIHN0YXRpYyByZWFkb25seSBlbXB0eTogRnJhZ21lbnQgPSBuZXcgRnJhZ21lbnQoT2JqZWN0LmZyZWV6ZShbXSkpXHJcblxyXG4gIHN0YXRpYyBmcm9tKG5vZGVzOiByZWFkb25seSBFZGl0b3JOb2RlW10pOiBGcmFnbWVudCB7XHJcbiAgICByZXR1cm4gbm9kZXMubGVuZ3RoID09PSAwID8gRnJhZ21lbnQuZW1wdHkgOiBuZXcgRnJhZ21lbnQoT2JqZWN0LmZyZWV6ZShbLi4ubm9kZXNdKSlcclxuICB9XHJcblxyXG4gIHN0YXRpYyBvZiguLi5ub2RlczogRWRpdG9yTm9kZVtdKTogRnJhZ21lbnQge1xyXG4gICAgcmV0dXJuIEZyYWdtZW50LmZyb20obm9kZXMpXHJcbiAgfVxyXG5cclxuICBnZXQgY2hpbGRDb3VudCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW4ubGVuZ3RoXHJcbiAgfVxyXG5cclxuICBjaGlsZChpbmRleDogbnVtYmVyKTogRWRpdG9yTm9kZSB7XHJcbiAgICBjb25zdCBub2RlID0gdGhpcy5jaGlsZHJlbltpbmRleF1cclxuICAgIGlmICghbm9kZSkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYEZyYWdtZW50IGNoaWxkIGluZGV4ICR7aW5kZXh9IG91dCBvZiByYW5nZWApXHJcbiAgICByZXR1cm4gbm9kZVxyXG4gIH1cclxuXHJcbiAgbWF5YmVDaGlsZChpbmRleDogbnVtYmVyKTogRWRpdG9yTm9kZSB8IG51bGwge1xyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW5baW5kZXhdID8/IG51bGxcclxuICB9XHJcblxyXG4gIHJlcGxhY2VDaGlsZChpbmRleDogbnVtYmVyLCBub2RlOiBFZGl0b3JOb2RlKTogRnJhZ21lbnQge1xyXG4gICAgY29uc3QgbmV4dCA9IFsuLi50aGlzLmNoaWxkcmVuXVxyXG4gICAgbmV4dFtpbmRleF0gPSBub2RlXHJcbiAgICByZXR1cm4gRnJhZ21lbnQuZnJvbShuZXh0KVxyXG4gIH1cclxuXHJcbiAgLyoqIFJlcGxhY2UgY2hpbGRyZW4gaW4gW2Zyb20sIHRvKSB3aXRoIHRoZSBnaXZlbiBmcmFnbWVudCdzIGNoaWxkcmVuLiAqL1xyXG4gIHJlcGxhY2VSYW5nZShmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIsIGluc2VydDogRnJhZ21lbnQpOiBGcmFnbWVudCB7XHJcbiAgICByZXR1cm4gRnJhZ21lbnQuZnJvbShbXHJcbiAgICAgIC4uLnRoaXMuY2hpbGRyZW4uc2xpY2UoMCwgZnJvbSksXHJcbiAgICAgIC4uLmluc2VydC5jaGlsZHJlbixcclxuICAgICAgLi4udGhpcy5jaGlsZHJlbi5zbGljZSh0byksXHJcbiAgICBdKVxyXG4gIH1cclxuXHJcbiAgc2xpY2UoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyID0gdGhpcy5jaGlsZENvdW50KTogRnJhZ21lbnQge1xyXG4gICAgcmV0dXJuIEZyYWdtZW50LmZyb20odGhpcy5jaGlsZHJlbi5zbGljZShmcm9tLCB0bykpXHJcbiAgfVxyXG5cclxuICBhcHBlbmQob3RoZXI6IEZyYWdtZW50KTogRnJhZ21lbnQge1xyXG4gICAgaWYgKG90aGVyLmNoaWxkQ291bnQgPT09IDApIHJldHVybiB0aGlzXHJcbiAgICBpZiAodGhpcy5jaGlsZENvdW50ID09PSAwKSByZXR1cm4gb3RoZXJcclxuICAgIHJldHVybiBGcmFnbWVudC5mcm9tKFsuLi50aGlzLmNoaWxkcmVuLCAuLi5vdGhlci5jaGlsZHJlbl0pXHJcbiAgfVxyXG5cclxuICBlcShvdGhlcjogRnJhZ21lbnQpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzID09PSBvdGhlcikgcmV0dXJuIHRydWVcclxuICAgIGlmICh0aGlzLmNoaWxkQ291bnQgIT09IG90aGVyLmNoaWxkQ291bnQpIHJldHVybiBmYWxzZVxyXG4gICAgcmV0dXJuIHRoaXMuY2hpbGRyZW4uZXZlcnkoKGNoaWxkLCBpKSA9PiBjaGlsZC5lcShvdGhlci5jaGlsZHJlbltpXSkpXHJcbiAgfVxyXG5cclxuICB0b0pTT04oKTogdW5rbm93bltdIHtcclxuICAgIHJldHVybiB0aGlzLmNoaWxkcmVuLm1hcCgoY2hpbGQpID0+IGNoaWxkLnRvSlNPTigpKVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgdHlwZSBBdHRycywgYXR0cnNFcSwgZW1wdHlBdHRycyB9IGZyb20gJy4vYXR0cnMnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi9mcmFnbWVudCdcclxuaW1wb3J0IHsgdHlwZSBNYXJrLCB0eXBlIE1hcmtKU09OLCBtYXJrc0VxLCBub01hcmtzIH0gZnJvbSAnLi9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IE5vZGVUeXBlIH0gZnJvbSAnLi9zY2hlbWEnXHJcblxyXG4vKiogSlNPTiBzaGFwZSBvZiBhIHNlcmlhbGl6ZWQgbm9kZS4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBOb2RlSlNPTiB7XHJcbiAgcmVhZG9ubHkgdHlwZTogc3RyaW5nXHJcbiAgcmVhZG9ubHkgYXR0cnM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxyXG4gIHJlYWRvbmx5IGNvbnRlbnQ/OiByZWFkb25seSBOb2RlSlNPTltdXHJcbiAgcmVhZG9ubHkgbWFya3M/OiByZWFkb25seSBNYXJrSlNPTltdXHJcbiAgcmVhZG9ubHkgdGV4dD86IHN0cmluZ1xyXG59XHJcblxyXG4vKipcclxuICogQSBub2RlIGluIHRoZSBkb2N1bWVudCB0cmVlLiBJbW11dGFibGUuIEFsbCBcIm11dGF0b3JzXCIgcmV0dXJuIG5ldyBub2Rlcy5cclxuICogVGV4dCBsaXZlcyBpbiB0aGUge0BsaW5rIFRleHROb2RlfSBzdWJjbGFzcy5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3JOb2RlIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IHR5cGU6IE5vZGVUeXBlLFxyXG4gICAgcmVhZG9ubHkgYXR0cnM6IEF0dHJzID0gZW1wdHlBdHRycyxcclxuICAgIHJlYWRvbmx5IGNvbnRlbnQ6IEZyYWdtZW50ID0gRnJhZ21lbnQuZW1wdHksXHJcbiAgICByZWFkb25seSBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyxcclxuICApIHt9XHJcblxyXG4gIGdldCBpc1RleHQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gZmFsc2VcclxuICB9XHJcblxyXG4gIGdldCBpc0lubGluZSgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnR5cGUuaXNJbmxpbmVcclxuICB9XHJcblxyXG4gIGdldCBpc0Jsb2NrKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuICF0aGlzLnR5cGUuaXNJbmxpbmVcclxuICB9XHJcblxyXG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBub2RlIGhhcyBubyBlZGl0YWJsZSBjb250ZW50IG9mIGl0cyBvd24gKGltYWdlLCBociwg4oCmKS4gKi9cclxuICBnZXQgaXNBdG9tKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudHlwZS5pc0F0b21cclxuICB9XHJcblxyXG4gIC8qKiBUcnVlIHdoZW4gdGhpcyBub2RlIGRpcmVjdGx5IGNvbnRhaW5zIGlubGluZSBjb250ZW50IChwYXJhZ3JhcGgsIGhlYWRpbmcsIOKApikuICovXHJcbiAgZ2V0IGlzVGV4dGJsb2NrKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudHlwZS5pbmxpbmVDb250ZW50XHJcbiAgfVxyXG5cclxuICBnZXQgY2hpbGRDb3VudCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIHRoaXMuY29udGVudC5jaGlsZENvdW50XHJcbiAgfVxyXG5cclxuICBjaGlsZChpbmRleDogbnVtYmVyKTogRWRpdG9yTm9kZSB7XHJcbiAgICByZXR1cm4gdGhpcy5jb250ZW50LmNoaWxkKGluZGV4KVxyXG4gIH1cclxuXHJcbiAgZ2V0IHRleHRDb250ZW50KCk6IHN0cmluZyB7XHJcbiAgICBsZXQgdGV4dCA9ICcnXHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY29udGVudC5jaGlsZHJlbikge1xyXG4gICAgICB0ZXh0ICs9IGNoaWxkLmlzVGV4dCA/IChjaGlsZCBhcyBUZXh0Tm9kZSkudGV4dCA6IGNoaWxkLnRleHRDb250ZW50XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGV4dFxyXG4gIH1cclxuXHJcbiAgd2l0aENvbnRlbnQoY29udGVudDogRnJhZ21lbnQpOiBFZGl0b3JOb2RlIHtcclxuICAgIHJldHVybiBuZXcgRWRpdG9yTm9kZSh0aGlzLnR5cGUsIHRoaXMuYXR0cnMsIGNvbnRlbnQsIHRoaXMubWFya3MpXHJcbiAgfVxyXG5cclxuICB3aXRoQXR0cnMoYXR0cnM6IEF0dHJzKTogRWRpdG9yTm9kZSB7XHJcbiAgICByZXR1cm4gbmV3IEVkaXRvck5vZGUodGhpcy50eXBlLCBhdHRycywgdGhpcy5jb250ZW50LCB0aGlzLm1hcmtzKVxyXG4gIH1cclxuXHJcbiAgd2l0aE1hcmtzKG1hcmtzOiByZWFkb25seSBNYXJrW10pOiBFZGl0b3JOb2RlIHtcclxuICAgIHJldHVybiBuZXcgRWRpdG9yTm9kZSh0aGlzLnR5cGUsIHRoaXMuYXR0cnMsIHRoaXMuY29udGVudCwgbWFya3MpXHJcbiAgfVxyXG5cclxuICBlcShvdGhlcjogRWRpdG9yTm9kZSk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHRoaXMgPT09IG90aGVyKSByZXR1cm4gdHJ1ZVxyXG4gICAgcmV0dXJuIChcclxuICAgICAgdGhpcy50eXBlID09PSBvdGhlci50eXBlICYmXHJcbiAgICAgIGF0dHJzRXEodGhpcy5hdHRycywgb3RoZXIuYXR0cnMpICYmXHJcbiAgICAgIG1hcmtzRXEodGhpcy5tYXJrcywgb3RoZXIubWFya3MpICYmXHJcbiAgICAgIHRoaXMuY29udGVudC5lcShvdGhlci5jb250ZW50KVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgdG9KU09OKCk6IE5vZGVKU09OIHtcclxuICAgIGNvbnN0IGpzb246IHtcclxuICAgICAgdHlwZTogc3RyaW5nXHJcbiAgICAgIGF0dHJzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cclxuICAgICAgY29udGVudD86IE5vZGVKU09OW11cclxuICAgICAgbWFya3M/OiBNYXJrSlNPTltdXHJcbiAgICB9ID0geyB0eXBlOiB0aGlzLnR5cGUubmFtZSB9XHJcbiAgICBjb25zdCBhdHRycyA9IG5vbkRlZmF1bHRBdHRycyh0aGlzLnR5cGUuc3BlYy5hdHRycywgdGhpcy5hdHRycylcclxuICAgIGlmIChhdHRycykganNvbi5hdHRycyA9IGF0dHJzXHJcbiAgICBpZiAodGhpcy5jb250ZW50LmNoaWxkQ291bnQgPiAwKSBqc29uLmNvbnRlbnQgPSB0aGlzLmNvbnRlbnQuY2hpbGRyZW4ubWFwKChjKSA9PiBjLnRvSlNPTigpKVxyXG4gICAgaWYgKHRoaXMubWFya3MubGVuZ3RoID4gMCkganNvbi5tYXJrcyA9IHRoaXMubWFya3MubWFwKChtKSA9PiBtLnRvSlNPTigpKVxyXG4gICAgcmV0dXJuIGpzb25cclxuICB9XHJcbn1cclxuXHJcbi8qKiBBIHJ1biBvZiB0ZXh0IHdpdGggYSB1bmlmb3JtIG1hcmsgc2V0LiAqL1xyXG5leHBvcnQgY2xhc3MgVGV4dE5vZGUgZXh0ZW5kcyBFZGl0b3JOb2RlIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHR5cGU6IE5vZGVUeXBlLFxyXG4gICAgcmVhZG9ubHkgdGV4dDogc3RyaW5nLFxyXG4gICAgbWFya3M6IHJlYWRvbmx5IE1hcmtbXSA9IG5vTWFya3MsXHJcbiAgKSB7XHJcbiAgICBpZiAodGV4dC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdUZXh0Tm9kZSBtYXkgbm90IGJlIGVtcHR5JylcclxuICAgIHN1cGVyKHR5cGUsIGVtcHR5QXR0cnMsIEZyYWdtZW50LmVtcHR5LCBtYXJrcylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGdldCBpc1RleHQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZ2V0IHRleHRDb250ZW50KCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy50ZXh0XHJcbiAgfVxyXG5cclxuICB3aXRoVGV4dCh0ZXh0OiBzdHJpbmcpOiBUZXh0Tm9kZSB7XHJcbiAgICByZXR1cm4gbmV3IFRleHROb2RlKHRoaXMudHlwZSwgdGV4dCwgdGhpcy5tYXJrcylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHdpdGhNYXJrcyhtYXJrczogcmVhZG9ubHkgTWFya1tdKTogVGV4dE5vZGUge1xyXG4gICAgcmV0dXJuIG5ldyBUZXh0Tm9kZSh0aGlzLnR5cGUsIHRoaXMudGV4dCwgbWFya3MpXHJcbiAgfVxyXG5cclxuICBjdXQoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyID0gdGhpcy50ZXh0Lmxlbmd0aCk6IFRleHROb2RlIHtcclxuICAgIHJldHVybiB0aGlzLndpdGhUZXh0KHRoaXMudGV4dC5zbGljZShmcm9tLCB0bykpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBlcShvdGhlcjogRWRpdG9yTm9kZSk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHRoaXMgPT09IG90aGVyKSByZXR1cm4gdHJ1ZVxyXG4gICAgcmV0dXJuIChcclxuICAgICAgb3RoZXIuaXNUZXh0ICYmIChvdGhlciBhcyBUZXh0Tm9kZSkudGV4dCA9PT0gdGhpcy50ZXh0ICYmIG1hcmtzRXEodGhpcy5tYXJrcywgb3RoZXIubWFya3MpXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogTm9kZUpTT04ge1xyXG4gICAgY29uc3QganNvbjogeyB0eXBlOiBzdHJpbmc7IHRleHQ6IHN0cmluZzsgbWFya3M/OiBNYXJrSlNPTltdIH0gPSB7XHJcbiAgICAgIHR5cGU6IHRoaXMudHlwZS5uYW1lLFxyXG4gICAgICB0ZXh0OiB0aGlzLnRleHQsXHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tYXJrcy5sZW5ndGggPiAwKSBqc29uLm1hcmtzID0gdGhpcy5tYXJrcy5tYXAoKG0pID0+IG0udG9KU09OKCkpXHJcbiAgICByZXR1cm4ganNvblxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEF0dHJpYnV0ZXMgd29ydGggc2VyaWFsaXppbmc6IHZhbHVlcyBlcXVhbCB0byB0aGVpciBzY2hlbWEgZGVmYXVsdCBhcmVcclxuICogb21pdHRlZCwgc2luY2Uge0BsaW5rIGNvbXB1dGVBdHRyc30gcmVzdG9yZXMgdGhlbSBvbiBsb2FkLiBLZWVwcyBzdG9yZWRcclxuICogZG9jdW1lbnRzIGZyZWUgb2Ygbm9pc2UgbGlrZSAgb24gZXZlcnkgcGFyYWdyYXBoLlxyXG4gKi9cclxuZnVuY3Rpb24gbm9uRGVmYXVsdEF0dHJzKFxyXG4gIHNwZWNBdHRyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9Pj4gfCB1bmRlZmluZWQsXHJcbiAgYXR0cnM6IEF0dHJzLFxyXG4pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XHJcbiAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9XHJcbiAgZm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGF0dHJzKSkge1xyXG4gICAgY29uc3Qgc3BlYyA9IHNwZWNBdHRycz8uW25hbWVdXHJcbiAgICBpZiAoc3BlYyAmJiAnZGVmYXVsdCcgaW4gc3BlYyAmJiBzcGVjLmRlZmF1bHQgPT09IHZhbHVlKSBjb250aW51ZVxyXG4gICAgb3V0W25hbWVdID0gdmFsdWVcclxuICB9XHJcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG91dCkubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZFxyXG59XHJcbiIsICIvKipcclxuICogQ29udGVudCBleHByZXNzaW9ucyBkZXNjcmliZSB3aGF0IGNoaWxkcmVuIGEgbm9kZSBhbGxvd3MsIGUuZy4gYFwiYmxvY2srXCJgLFxyXG4gKiBgXCJpbmxpbmUqXCJgLCBgXCJsaXN0SXRlbStcImAsIG9yIHNlcXVlbmNlcyBsaWtlIGBcImhlYWRpbmcgYmxvY2sqXCJgLlxyXG4gKlxyXG4gKiBTdXBwb3J0ZWQgZ3JhbW1hciAoc2VlIEFEUi0wMDAyKTogd2hpdGVzcGFjZS1zZXBhcmF0ZWQgdGVybXMsIGVhY2ggYSBub2RlXHJcbiAqIG5hbWUgb3IgZ3JvdXAgbmFtZSB3aXRoIGFuIG9wdGlvbmFsIGA/YCwgYCpgIG9yIGArYCBxdWFudGlmaWVyLiBNYXRjaGluZyBpc1xyXG4gKiBncmVlZHkgYW5kIHNlcXVlbnRpYWwuXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIENvbnRlbnRUZXJtIHtcclxuICByZWFkb25seSBuYW1lczogUmVhZG9ubHlTZXQ8c3RyaW5nPlxyXG4gIHJlYWRvbmx5IG1pbjogbnVtYmVyXHJcbiAgcmVhZG9ubHkgbWF4OiBudW1iZXJcclxufVxyXG5cclxuY29uc3QgVEVSTV9QQVRURVJOID0gL14oW2EtekEtWl9dW1xcd10qKShbKyo/XSk/JC9cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvbnRlbnRFeHByKFxyXG4gIGV4cHI6IHN0cmluZyxcclxuICByZXNvbHZlTmFtZTogKG5hbWU6IHN0cmluZykgPT4gcmVhZG9ubHkgc3RyaW5nW10sXHJcbik6IHJlYWRvbmx5IENvbnRlbnRUZXJtW10ge1xyXG4gIGNvbnN0IHRyaW1tZWQgPSBleHByLnRyaW0oKVxyXG4gIGlmICh0cmltbWVkID09PSAnJykgcmV0dXJuIFtdXHJcbiAgcmV0dXJuIHRyaW1tZWQuc3BsaXQoL1xccysvKS5tYXAoKHRva2VuKSA9PiB7XHJcbiAgICBjb25zdCBtYXRjaCA9IFRFUk1fUEFUVEVSTi5leGVjKHRva2VuKVxyXG4gICAgaWYgKCFtYXRjaCkgdGhyb3cgbmV3IFN5bnRheEVycm9yKGBJbnZhbGlkIGNvbnRlbnQgZXhwcmVzc2lvbiB0ZXJtIFwiJHt0b2tlbn1cIiBpbiBcIiR7ZXhwcn1cImApXHJcbiAgICBjb25zdCBbLCBuYW1lLCBxdWFudGlmaWVyXSA9IG1hdGNoXHJcbiAgICBjb25zdCBuYW1lcyA9IHJlc29sdmVOYW1lKG5hbWUgYXMgc3RyaW5nKVxyXG4gICAgaWYgKG5hbWVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgVW5rbm93biBub2RlIG9yIGdyb3VwIFwiJHtuYW1lfVwiIGluIGNvbnRlbnQgZXhwcmVzc2lvbiBcIiR7ZXhwcn1cImApXHJcbiAgICB9XHJcbiAgICBzd2l0Y2ggKHF1YW50aWZpZXIpIHtcclxuICAgICAgY2FzZSAnKyc6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDEsIG1heDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIH1cclxuICAgICAgY2FzZSAnKic6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDAsIG1heDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIH1cclxuICAgICAgY2FzZSAnPyc6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDAsIG1heDogMSB9XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuIHsgbmFtZXM6IG5ldyBTZXQobmFtZXMpLCBtaW46IDEsIG1heDogMSB9XHJcbiAgICB9XHJcbiAgfSlcclxufVxyXG5cclxuLyoqIEdyZWVkeSBzZXF1ZW50aWFsIG1hdGNoIG9mIGNoaWxkIHR5cGUgbmFtZXMgYWdhaW5zdCB0aGUgcGFyc2VkIHRlcm1zLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hlc0NvbnRlbnQoXHJcbiAgdGVybXM6IHJlYWRvbmx5IENvbnRlbnRUZXJtW10sXHJcbiAgY2hpbGROYW1lczogcmVhZG9ubHkgc3RyaW5nW10sXHJcbik6IGJvb2xlYW4ge1xyXG4gIGxldCBpID0gMFxyXG4gIGZvciAoY29uc3QgdGVybSBvZiB0ZXJtcykge1xyXG4gICAgbGV0IGNvdW50ID0gMFxyXG4gICAgd2hpbGUgKGkgPCBjaGlsZE5hbWVzLmxlbmd0aCAmJiBjb3VudCA8IHRlcm0ubWF4ICYmIHRlcm0ubmFtZXMuaGFzKGNoaWxkTmFtZXNbaV0pKSB7XHJcbiAgICAgIGkrK1xyXG4gICAgICBjb3VudCsrXHJcbiAgICB9XHJcbiAgICBpZiAoY291bnQgPCB0ZXJtLm1pbikgcmV0dXJuIGZhbHNlXHJcbiAgfVxyXG4gIHJldHVybiBpID09PSBjaGlsZE5hbWVzLmxlbmd0aFxyXG59XHJcbiIsICJpbXBvcnQgeyB0eXBlIEF0dHJzLCBjb21wdXRlQXR0cnMgfSBmcm9tICcuL2F0dHJzJ1xyXG5pbXBvcnQgeyB0eXBlIENvbnRlbnRUZXJtLCBtYXRjaGVzQ29udGVudCwgcGFyc2VDb250ZW50RXhwciB9IGZyb20gJy4vY29udGVudCdcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuL2ZyYWdtZW50J1xyXG5pbXBvcnQgeyBNYXJrLCBub01hcmtzIH0gZnJvbSAnLi9tYXJrJ1xyXG5pbXBvcnQgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4vbm9kZSdcclxuXHJcbi8qKiBEZWNsYXJhdGl2ZSBIVE1MIG91dHB1dCBmb3IgYSBub2RlIG9yIG1hcmssIGNvbnN1bWVkIGJ5IHRoZSBIVE1MIHNlcmlhbGl6ZXIuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgSFRNTFNwZWMge1xyXG4gIHJlYWRvbmx5IHRhZzogc3RyaW5nXHJcbiAgcmVhZG9ubHkgYXR0cnM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PlxyXG4gIC8qKiBWb2lkIGVsZW1lbnRzIChiciwgaHIsIGltZykgcmVuZGVyIHdpdGhvdXQgY2hpbGRyZW4gb3IgYSBjbG9zaW5nIHRhZy4gKi9cclxuICByZWFkb25seSBpc1ZvaWQ/OiBib29sZWFuXHJcbiAgLyoqIE9wdGlvbmFsIGlubmVyIHdyYXBwZXIgdGFnIChlLmcuIHRoZSBgY29kZWAgaW4gYHByZSA+IGNvZGVgKS4gKi9cclxuICByZWFkb25seSBjaGlsZFRhZz86IHN0cmluZ1xyXG4gIC8qKiBMaXRlcmFsIHRleHQgY29udGVudCBmb3IgYXRvbSBub2RlcyAoYSBiYWRnZSdzIGxhYmVsLCBhIGZvb3Rub3RlIG1hcmtlcikuICovXHJcbiAgcmVhZG9ubHkgdGV4dD86IHN0cmluZ1xyXG4gIC8qKlxyXG4gICAqIFRydXN0ZWQgbWFya3VwIHJlbmRlcmVkIGluc2lkZSBhbiBhdG9tIGluIHBsYWNlIG9mIGB0ZXh0YCwgYSBmb3JtdWxhJ3NcclxuICAgKiBNYXRoTUwsIGEgbGluayBjYXJkJ3MgdGl0bGUgYW5kIGRlc2NyaXB0aW9uLiBJdCBpcyBpbnNlcnRlZCB2ZXJiYXRpbSBieVxyXG4gICAqIGJvdGggdGhlIHNlcmlhbGl6ZXIgYW5kIHRoZSBET00gcmVuZGVyZXIsIHNvIHRoZSBzcGVjIGF1dGhvciBidWlsZHMgaXRcclxuICAgKiBhbmQgbXVzdCBlc2NhcGUgZXZlcnkgZHluYW1pYyB2YWx1ZSBpdCBjYXJyaWVzLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IGlubmVySFRNTD86IHN0cmluZ1xyXG59XHJcblxyXG4vKipcclxuICogQSBydWxlIGZvciBpbXBvcnRpbmcgSFRNTDogd2hpY2ggdGFnIG1hcHMgdG8gdGhpcyBub2RlL21hcmssIGFuZCBob3cgaXRzXHJcbiAqIGF0dHJpYnV0ZXMgdHJhbnNsYXRlLiBgZ2V0QXR0cnNgIHJldHVybmluZyBgZmFsc2VgIHJlamVjdHMgdGhlIG1hdGNoICh0aGVcclxuICogZWxlbWVudCBpcyB0aGVuIHRyZWF0ZWQgYXMgdW5rbm93bjoga2VwdCBjb250ZW50LCBkcm9wcGVkIGZvcm1hdHRpbmcpLlxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBQYXJzZVJ1bGUge1xyXG4gIC8qKiBMb3dlcmNhc2UgdGFnIG5hbWUgdG8gbWF0Y2ggKGUuZy4gYFwiaDJcImAsIGBcInN0cm9uZ1wiYCkuICovXHJcbiAgcmVhZG9ubHkgdGFnOiBzdHJpbmdcclxuICAvKiogQXR0cmlidXRlIHRoYXQgbXVzdCBhZGRpdGlvbmFsbHkgYmUgcHJlc2VudCBvbiB0aGUgZWxlbWVudC4gKi9cclxuICByZWFkb25seSBhdHRyaWJ1dGU/OiBzdHJpbmdcclxuICByZWFkb25seSBnZXRBdHRycz86IChlbGVtZW50OiBIVE1MRWxlbWVudCkgPT4gQXR0cnMgfCBudWxsIHwgZmFsc2VcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBOb2RlU3BlYyB7XHJcbiAgLyoqIENvbnRlbnQgZXhwcmVzc2lvbiwgZS5nLiBgXCJibG9jaytcImAgb3IgYFwiaW5saW5lKlwiYC4gT21pdCBmb3IgbGVhZiBub2Rlcy4gKi9cclxuICByZWFkb25seSBjb250ZW50Pzogc3RyaW5nXHJcbiAgLyoqIFNwYWNlLXNlcGFyYXRlZCBncm91cCBuYW1lcyB0aGlzIG5vZGUgYmVsb25ncyB0byAoZS5nLiBgXCJibG9ja1wiYCkuICovXHJcbiAgcmVhZG9ubHkgZ3JvdXA/OiBzdHJpbmdcclxuICByZWFkb25seSBpbmxpbmU/OiBib29sZWFuXHJcbiAgcmVhZG9ubHkgYXRvbT86IGJvb2xlYW5cclxuICByZWFkb25seSBhdHRycz86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHsgZGVmYXVsdD86IHVua25vd24gfT4+XHJcbiAgLyoqXHJcbiAgICogTWFya3MgYWxsb3dlZCBvbiBpbmxpbmUgY29udGVudDogYFwiX1wiYCBmb3IgYWxsIChkZWZhdWx0IGZvciB0ZXh0YmxvY2tzKSxcclxuICAgKiBgXCJcImAgZm9yIG5vbmUsIG9yIHNwYWNlLXNlcGFyYXRlZCBtYXJrIG5hbWVzLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IG1hcmtzPzogc3RyaW5nXHJcbiAgLyoqIFByZXNlcnZlIHdoaXRlc3BhY2UgdmVyYmF0aW0gd2hlbiBwYXJzaW5nIGludG8gdGhpcyBub2RlIChjb2RlIGJsb2NrcykuICovXHJcbiAgcmVhZG9ubHkgcHJlc2VydmVXaGl0ZXNwYWNlPzogYm9vbGVhblxyXG4gIHJlYWRvbmx5IHRvSFRNTD86IChub2RlOiBFZGl0b3JOb2RlKSA9PiBIVE1MU3BlY1xyXG4gIHJlYWRvbmx5IHBhcnNlSFRNTD86IHJlYWRvbmx5IFBhcnNlUnVsZVtdXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTWFya1NwZWMge1xyXG4gIHJlYWRvbmx5IGF0dHJzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9Pj5cclxuICAvKiogU3BhY2Utc2VwYXJhdGVkIG1hcmsgbmFtZXMgdGhpcyBtYXJrIGV4Y2x1ZGVzLCBvciBgXCJfXCJgIGZvciBhbGwuIEFsd2F5cyBleGNsdWRlcyBpdHNlbGYuICovXHJcbiAgcmVhZG9ubHkgZXhjbHVkZXM/OiBzdHJpbmdcclxuICByZWFkb25seSB0b0hUTUw/OiAobWFyazogTWFyaykgPT4gSFRNTFNwZWNcclxuICByZWFkb25seSBwYXJzZUhUTUw/OiByZWFkb25seSBQYXJzZVJ1bGVbXVxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNjaGVtYVNwZWMge1xyXG4gIHJlYWRvbmx5IG5vZGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBOb2RlU3BlYz4+XHJcbiAgcmVhZG9ubHkgbWFya3M/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBNYXJrU3BlYz4+XHJcbiAgLyoqIE5hbWUgb2YgdGhlIHRvcC1sZXZlbCBub2RlIHR5cGUuIERlZmF1bHRzIHRvIGBcImRvY1wiYC4gKi9cclxuICByZWFkb25seSB0b3BOb2RlPzogc3RyaW5nXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBOb2RlVHlwZSB7XHJcbiAgcHJpdmF0ZSBjb250ZW50VGVybXM6IHJlYWRvbmx5IENvbnRlbnRUZXJtW10gPSBbXVxyXG4gIHByaXZhdGUgYWxsb3dlZE1hcmtzOiAnYWxsJyB8ICdub25lJyB8IFJlYWRvbmx5U2V0PHN0cmluZz4gPSAnbm9uZSdcclxuICAvKiogV2hldGhlciB0aGlzIG5vZGUncyBjb250ZW50IGV4cHJlc3Npb24gYWRtaXRzIGlubGluZSBjaGlsZHJlbi4gKi9cclxuICBpbmxpbmVDb250ZW50ID0gZmFsc2VcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBuYW1lOiBzdHJpbmcsXHJcbiAgICByZWFkb25seSBzY2hlbWE6IFNjaGVtYSxcclxuICAgIHJlYWRvbmx5IHNwZWM6IE5vZGVTcGVjLFxyXG4gICkge31cclxuXHJcbiAgZ2V0IGlzVGV4dCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLm5hbWUgPT09ICd0ZXh0J1xyXG4gIH1cclxuXHJcbiAgZ2V0IGlzSW5saW5lKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuaXNUZXh0IHx8IHRoaXMuc3BlYy5pbmxpbmUgPT09IHRydWVcclxuICB9XHJcblxyXG4gIGdldCBpc0F0b20oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zcGVjLmF0b20gPT09IHRydWVcclxuICB9XHJcblxyXG4gIGdldCBncm91cHMoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIHRoaXMuc3BlYy5ncm91cCA/IHRoaXMuc3BlYy5ncm91cC5zcGxpdCgvXFxzKy8pIDogW11cclxuICB9XHJcblxyXG4gIC8qKiBAaW50ZXJuYWwgUmVzb2x2ZSBjb250ZW50IGV4cHJlc3Npb24gYW5kIG1hcmsgcnVsZXM7IGNhbGxlZCBvbmNlIGJ5IFNjaGVtYS4gKi9cclxuICByZXNvbHZlKHJlc29sdmVOYW1lOiAobmFtZTogc3RyaW5nKSA9PiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xyXG4gICAgdGhpcy5jb250ZW50VGVybXMgPSB0aGlzLnNwZWMuY29udGVudCA/IHBhcnNlQ29udGVudEV4cHIodGhpcy5zcGVjLmNvbnRlbnQsIHJlc29sdmVOYW1lKSA6IFtdXHJcbiAgICBjb25zdCBjaGlsZE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KClcclxuICAgIGZvciAoY29uc3QgdGVybSBvZiB0aGlzLmNvbnRlbnRUZXJtcykge1xyXG4gICAgICBmb3IgKGNvbnN0IG5hbWUgb2YgdGVybS5uYW1lcykgY2hpbGROYW1lcy5hZGQobmFtZSlcclxuICAgIH1cclxuICAgIGNvbnN0IGNoaWxkVHlwZXMgPSBbLi4uY2hpbGROYW1lc10ubWFwKChuYW1lKSA9PiB0aGlzLnNjaGVtYS5ub2RlVHlwZShuYW1lKSlcclxuICAgIGNvbnN0IGhhc0lubGluZSA9IGNoaWxkVHlwZXMuc29tZSgodHlwZSkgPT4gdHlwZS5pc0lubGluZSlcclxuICAgIGNvbnN0IGhhc0Jsb2NrID0gY2hpbGRUeXBlcy5zb21lKCh0eXBlKSA9PiAhdHlwZS5pc0lubGluZSlcclxuICAgIGlmIChoYXNJbmxpbmUgJiYgaGFzQmxvY2spIHtcclxuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYE5vZGUgXCIke3RoaXMubmFtZX1cIiBtaXhlcyBpbmxpbmUgYW5kIGJsb2NrIGNvbnRlbnRgKVxyXG4gICAgfVxyXG4gICAgdGhpcy5pbmxpbmVDb250ZW50ID0gaGFzSW5saW5lXHJcbiAgICBjb25zdCBtYXJrcyA9IHRoaXMuc3BlYy5tYXJrc1xyXG4gICAgaWYgKG1hcmtzID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5hbGxvd2VkTWFya3MgPSB0aGlzLmlubGluZUNvbnRlbnQgPyAnYWxsJyA6ICdub25lJ1xyXG4gICAgfSBlbHNlIGlmIChtYXJrcyA9PT0gJ18nKSB7XHJcbiAgICAgIHRoaXMuYWxsb3dlZE1hcmtzID0gJ2FsbCdcclxuICAgIH0gZWxzZSBpZiAobWFya3MudHJpbSgpID09PSAnJykge1xyXG4gICAgICB0aGlzLmFsbG93ZWRNYXJrcyA9ICdub25lJ1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5hbGxvd2VkTWFya3MgPSBuZXcgU2V0KG1hcmtzLnRyaW0oKS5zcGxpdCgvXFxzKy8pKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdmFsaWRDb250ZW50KGNvbnRlbnQ6IEZyYWdtZW50KTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gbWF0Y2hlc0NvbnRlbnQoXHJcbiAgICAgIHRoaXMuY29udGVudFRlcm1zLFxyXG4gICAgICBjb250ZW50LmNoaWxkcmVuLm1hcCgoY2hpbGQpID0+IGNoaWxkLnR5cGUubmFtZSksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBhbGxvd3NNYXJrVHlwZShtYXJrVHlwZTogTWFya1R5cGUpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzLmFsbG93ZWRNYXJrcyA9PT0gJ2FsbCcpIHJldHVybiB0cnVlXHJcbiAgICBpZiAodGhpcy5hbGxvd2VkTWFya3MgPT09ICdub25lJykgcmV0dXJuIGZhbHNlXHJcbiAgICByZXR1cm4gdGhpcy5hbGxvd2VkTWFya3MuaGFzKG1hcmtUeXBlLm5hbWUpXHJcbiAgfVxyXG5cclxuICAvKiogVHJ1ZSB3aGVuIHRoaXMgdHlwZSBjYW4gaG9sZCBhbiBlbXB0eSBmcmFnbWVudCBhcyBjb250ZW50LiAqL1xyXG4gIGdldCBhbGxvd3NFbXB0eUNvbnRlbnQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gbWF0Y2hlc0NvbnRlbnQodGhpcy5jb250ZW50VGVybXMsIFtdKVxyXG4gIH1cclxuXHJcbiAgY3JlYXRlKFxyXG4gICAgYXR0cnM/OiBBdHRycyxcclxuICAgIGNvbnRlbnQ6IEZyYWdtZW50ID0gRnJhZ21lbnQuZW1wdHksXHJcbiAgICBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyxcclxuICApOiBFZGl0b3JOb2RlIHtcclxuICAgIGlmICh0aGlzLmlzVGV4dCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1VzZSBzY2hlbWEudGV4dCgpIHRvIGNyZWF0ZSB0ZXh0IG5vZGVzJylcclxuICAgIHJldHVybiBuZXcgRWRpdG9yTm9kZShcclxuICAgICAgdGhpcyxcclxuICAgICAgY29tcHV0ZUF0dHJzKHRoaXMuc3BlYy5hdHRycywgYXR0cnMsIGBub2RlIFwiJHt0aGlzLm5hbWV9XCJgKSxcclxuICAgICAgY29udGVudCxcclxuICAgICAgbWFya3MsXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICAvKiogTGlrZSB7QGxpbmsgY3JlYXRlfSBidXQgdmFsaWRhdGVzIHRoZSBjb250ZW50IGFnYWluc3QgdGhpcyB0eXBlJ3MgZXhwcmVzc2lvbi4gKi9cclxuICBjcmVhdGVDaGVja2VkKFxyXG4gICAgYXR0cnM/OiBBdHRycyxcclxuICAgIGNvbnRlbnQ6IEZyYWdtZW50ID0gRnJhZ21lbnQuZW1wdHksXHJcbiAgICBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyxcclxuICApOiBFZGl0b3JOb2RlIHtcclxuICAgIGlmICghdGhpcy52YWxpZENvbnRlbnQoY29udGVudCkpIHtcclxuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYEludmFsaWQgY29udGVudCBmb3Igbm9kZSB0eXBlIFwiJHt0aGlzLm5hbWV9XCJgKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlKGF0dHJzLCBjb250ZW50LCBtYXJrcylcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXJrVHlwZSB7XHJcbiAgcHJpdmF0ZSBleGNsdWRlZDogJ2FsbCcgfCBSZWFkb25seVNldDxzdHJpbmc+XHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxyXG4gICAgcmVhZG9ubHkgcmFuazogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgc3BlYzogTWFya1NwZWMsXHJcbiAgKSB7XHJcbiAgICBjb25zdCBleGNsdWRlcyA9IHNwZWMuZXhjbHVkZXNcclxuICAgIGlmIChleGNsdWRlcyA9PT0gJ18nKSB7XHJcbiAgICAgIHRoaXMuZXhjbHVkZWQgPSAnYWxsJ1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc3QgbmFtZXMgPSBleGNsdWRlcyA/IGV4Y2x1ZGVzLnRyaW0oKS5zcGxpdCgvXFxzKy8pLmZpbHRlcihCb29sZWFuKSA6IFtdXHJcbiAgICAgIHRoaXMuZXhjbHVkZWQgPSBuZXcgU2V0KG5hbWVzKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXRoZXIgYWRkaW5nIHRoaXMgbWFyayBzaG91bGQgZGlzcGxhY2UgbWFya3Mgb2YgYG90aGVyYCdzIHR5cGUuICovXHJcbiAgZXhjbHVkZXMob3RoZXI6IE1hcmtUeXBlKTogYm9vbGVhbiB7XHJcbiAgICBpZiAob3RoZXIgPT09IHRoaXMpIHJldHVybiB0cnVlXHJcbiAgICBpZiAodGhpcy5leGNsdWRlZCA9PT0gJ2FsbCcpIHJldHVybiB0cnVlXHJcbiAgICByZXR1cm4gdGhpcy5leGNsdWRlZC5oYXMob3RoZXIubmFtZSlcclxuICB9XHJcblxyXG4gIGNyZWF0ZShhdHRycz86IEF0dHJzKTogTWFyayB7XHJcbiAgICByZXR1cm4gbmV3IE1hcmsodGhpcywgY29tcHV0ZUF0dHJzKHRoaXMuc3BlYy5hdHRycywgYXR0cnMsIGBtYXJrIFwiJHt0aGlzLm5hbWV9XCJgKSlcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgc2V0IG9mIG5vZGUgYW5kIG1hcmsgdHlwZXMgYSBkb2N1bWVudCBtYXkgY29udGFpbiwgcGx1cyBmYWN0b3J5IGhlbHBlcnMuXHJcbiAqIFJlcXVpcmVzIGEgYHRleHRgIG5vZGUgdHlwZSBhbmQgYSB0b3AtbGV2ZWwgdHlwZSAoZGVmYXVsdCBgXCJkb2NcImApLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFNjaGVtYSB7XHJcbiAgcmVhZG9ubHkgbm9kZXM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIE5vZGVUeXBlPj5cclxuICByZWFkb25seSBtYXJrczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgTWFya1R5cGU+PlxyXG4gIHJlYWRvbmx5IHRvcFR5cGU6IE5vZGVUeXBlXHJcbiAgcmVhZG9ubHkgdGV4dFR5cGU6IE5vZGVUeXBlXHJcblxyXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHNwZWM6IFNjaGVtYVNwZWMpIHtcclxuICAgIGNvbnN0IG5vZGVzOiBSZWNvcmQ8c3RyaW5nLCBOb2RlVHlwZT4gPSB7fVxyXG4gICAgZm9yIChjb25zdCBbbmFtZSwgbm9kZVNwZWNdIG9mIE9iamVjdC5lbnRyaWVzKHNwZWMubm9kZXMpKSB7XHJcbiAgICAgIG5vZGVzW25hbWVdID0gbmV3IE5vZGVUeXBlKG5hbWUsIHRoaXMsIG5vZGVTcGVjKVxyXG4gICAgfVxyXG4gICAgY29uc3QgbWFya3M6IFJlY29yZDxzdHJpbmcsIE1hcmtUeXBlPiA9IHt9XHJcbiAgICBsZXQgcmFuayA9IDBcclxuICAgIGZvciAoY29uc3QgW25hbWUsIG1hcmtTcGVjXSBvZiBPYmplY3QuZW50cmllcyhzcGVjLm1hcmtzID8/IHt9KSkge1xyXG4gICAgICBtYXJrc1tuYW1lXSA9IG5ldyBNYXJrVHlwZShuYW1lLCByYW5rKyssIG1hcmtTcGVjKVxyXG4gICAgfVxyXG4gICAgdGhpcy5ub2RlcyA9IG5vZGVzXHJcbiAgICB0aGlzLm1hcmtzID0gbWFya3NcclxuXHJcbiAgICBjb25zdCB0b3BOYW1lID0gc3BlYy50b3BOb2RlID8/ICdkb2MnXHJcbiAgICBjb25zdCB0b3AgPSBub2Rlc1t0b3BOYW1lXVxyXG4gICAgaWYgKCF0b3ApIHRocm93IG5ldyBSYW5nZUVycm9yKGBTY2hlbWEgaXMgbWlzc2luZyBpdHMgdG9wIG5vZGUgdHlwZSBcIiR7dG9wTmFtZX1cImApXHJcbiAgICBjb25zdCB0ZXh0ID0gbm9kZXMudGV4dFxyXG4gICAgaWYgKCF0ZXh0KSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignU2NoZW1hIGlzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIFwidGV4dFwiIG5vZGUgdHlwZScpXHJcbiAgICB0aGlzLnRvcFR5cGUgPSB0b3BcclxuICAgIHRoaXMudGV4dFR5cGUgPSB0ZXh0XHJcblxyXG4gICAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpXHJcbiAgICBmb3IgKGNvbnN0IHR5cGUgb2YgT2JqZWN0LnZhbHVlcyhub2RlcykpIHtcclxuICAgICAgZm9yIChjb25zdCBncm91cCBvZiB0eXBlLmdyb3Vwcykge1xyXG4gICAgICAgIGNvbnN0IG1lbWJlcnMgPSBncm91cHMuZ2V0KGdyb3VwKSA/PyBbXVxyXG4gICAgICAgIG1lbWJlcnMucHVzaCh0eXBlLm5hbWUpXHJcbiAgICAgICAgZ3JvdXBzLnNldChncm91cCwgbWVtYmVycylcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgY29uc3QgcmVzb2x2ZU5hbWUgPSAobmFtZTogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10gPT4ge1xyXG4gICAgICBpZiAobm9kZXNbbmFtZV0pIHJldHVybiBbbmFtZV1cclxuICAgICAgcmV0dXJuIGdyb3Vwcy5nZXQobmFtZSkgPz8gW11cclxuICAgIH1cclxuICAgIGZvciAoY29uc3QgdHlwZSBvZiBPYmplY3QudmFsdWVzKG5vZGVzKSkgdHlwZS5yZXNvbHZlKHJlc29sdmVOYW1lKVxyXG4gIH1cclxuXHJcbiAgbm9kZVR5cGUobmFtZTogc3RyaW5nKTogTm9kZVR5cGUge1xyXG4gICAgY29uc3QgdHlwZSA9IHRoaXMubm9kZXNbbmFtZV1cclxuICAgIGlmICghdHlwZSkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYFVua25vd24gbm9kZSB0eXBlIFwiJHtuYW1lfVwiYClcclxuICAgIHJldHVybiB0eXBlXHJcbiAgfVxyXG5cclxuICBtYXJrVHlwZShuYW1lOiBzdHJpbmcpOiBNYXJrVHlwZSB7XHJcbiAgICBjb25zdCB0eXBlID0gdGhpcy5tYXJrc1tuYW1lXVxyXG4gICAgaWYgKCF0eXBlKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgVW5rbm93biBtYXJrIHR5cGUgXCIke25hbWV9XCJgKVxyXG4gICAgcmV0dXJuIHR5cGVcclxuICB9XHJcblxyXG4gIG5vZGUoXHJcbiAgICBuYW1lOiBzdHJpbmcsXHJcbiAgICBhdHRycz86IEF0dHJzLFxyXG4gICAgY29udGVudD86IEZyYWdtZW50IHwgcmVhZG9ubHkgRWRpdG9yTm9kZVtdLFxyXG4gICAgbWFya3M/OiByZWFkb25seSBNYXJrW10sXHJcbiAgKTogRWRpdG9yTm9kZSB7XHJcbiAgICBjb25zdCBmcmFnbWVudCA9IGNvbnRlbnQgaW5zdGFuY2VvZiBGcmFnbWVudCA/IGNvbnRlbnQgOiBGcmFnbWVudC5mcm9tKGNvbnRlbnQgPz8gW10pXHJcbiAgICByZXR1cm4gdGhpcy5ub2RlVHlwZShuYW1lKS5jcmVhdGUoYXR0cnMsIGZyYWdtZW50LCBtYXJrcylcclxuICB9XHJcblxyXG4gIHRleHQodGV4dDogc3RyaW5nLCBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gbm9NYXJrcyk6IFRleHROb2RlIHtcclxuICAgIHJldHVybiBuZXcgVGV4dE5vZGUodGhpcy50ZXh0VHlwZSwgdGV4dCwgbWFya3MpXHJcbiAgfVxyXG5cclxuICBtYXJrKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IE1hcmsge1xyXG4gICAgcmV0dXJuIHRoaXMubWFya1R5cGUobmFtZSkuY3JlYXRlKGF0dHJzKVxyXG4gIH1cclxuXHJcbiAgLyoqIEZpcnN0IG5vbi10ZXh0IG5vZGUgdHlwZSB3aXRoIGlubGluZSBjb250ZW50LCB1c2VkIGFzIHRoZSBkZWZhdWx0IGJsb2NrLiAqL1xyXG4gIGZpcnN0VGV4dGJsb2NrVHlwZSgpOiBOb2RlVHlwZSB7XHJcbiAgICBmb3IgKGNvbnN0IHR5cGUgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLm5vZGVzKSkge1xyXG4gICAgICBpZiAoIXR5cGUuaXNUZXh0ICYmIHR5cGUuaW5saW5lQ29udGVudCAmJiAhdHlwZS5pc0lubGluZSkgcmV0dXJuIHR5cGVcclxuICAgIH1cclxuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdTY2hlbWEgaGFzIG5vIHRleHRibG9jayBub2RlIHR5cGUnKVxyXG4gIH1cclxufVxyXG5cclxuLyoqIENvbnZlbmllbmNlIGZhY3RvcnkgbWF0Y2hpbmcgdGhlIGRvY3VtZW50ZWQgQVBJOiBgc2NoZW1hKHsgbm9kZXMsIG1hcmtzIH0pYC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNjaGVtYShzcGVjOiBTY2hlbWFTcGVjKTogU2NoZW1hIHtcclxuICByZXR1cm4gbmV3IFNjaGVtYShzcGVjKVxyXG59XHJcbiIsICJpbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4vZnJhZ21lbnQnXHJcbmltcG9ydCB7IHR5cGUgTWFyaywgbWFya3NFcSB9IGZyb20gJy4vbWFyaydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4vbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBNYXJrVHlwZSwgTm9kZVR5cGUgfSBmcm9tICcuL3NjaGVtYSdcclxuXHJcbi8qKlxyXG4gKiBJbmxpbmUgY29udGVudCBhZGRyZXNzaW5nOiBjaGFyYWN0ZXIgb2Zmc2V0cyB3aXRoaW4gYSB0ZXh0YmxvY2suIFRleHQgbm9kZXNcclxuICogY29udHJpYnV0ZSB0aGVpciBsZW5ndGg7IGlubGluZSBhdG9tcyAoaGFyZCBicmVhaywgZm9vdG5vdGUgbWFya2VyLCDigKYpIGNvdW50IGFzIDEuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5saW5lU2l6ZShub2RlOiBFZGl0b3JOb2RlKTogbnVtYmVyIHtcclxuICByZXR1cm4gbm9kZS5pc1RleHQgPyAobm9kZSBhcyBUZXh0Tm9kZSkudGV4dC5sZW5ndGggOiAxXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpbmxpbmVMZW5ndGgoZnJhZzogRnJhZ21lbnQpOiBudW1iZXIge1xyXG4gIHJldHVybiBmcmFnLmNoaWxkcmVuLnJlZHVjZSgoc3VtLCBjaGlsZCkgPT4gc3VtICsgaW5saW5lU2l6ZShjaGlsZCksIDApXHJcbn1cclxuXHJcbi8qKiBMYXN0IGdyYXBoZW1lIGxlbmd0aCBvZiBhIHN0cmluZyAoc3Vycm9nYXRlL1pXSiBhd2FyZSB3aGVyZSBzdXBwb3J0ZWQpLiAqL1xyXG5mdW5jdGlvbiBsYXN0R3JhcGhlbWVMZW5ndGgodGV4dDogc3RyaW5nKTogbnVtYmVyIHtcclxuICBpZiAodGV4dC5sZW5ndGggPT09IDApIHJldHVybiAwXHJcbiAgaWYgKHR5cGVvZiBJbnRsICE9PSAndW5kZWZpbmVkJyAmJiAnU2VnbWVudGVyJyBpbiBJbnRsKSB7XHJcbiAgICBsZXQgbGFzdCA9ICcnXHJcbiAgICBmb3IgKGNvbnN0IHsgc2VnbWVudCB9IG9mIG5ldyBJbnRsLlNlZ21lbnRlcigpLnNlZ21lbnQodGV4dCkpIGxhc3QgPSBzZWdtZW50XHJcbiAgICByZXR1cm4gbGFzdC5sZW5ndGhcclxuICB9XHJcbiAgY29uc3QgY29kZVBvaW50ID0gdGV4dC5jb2RlUG9pbnRBdCh0ZXh0Lmxlbmd0aCAtIDIpXHJcbiAgcmV0dXJuIGNvZGVQb2ludCAhPT0gdW5kZWZpbmVkICYmIGNvZGVQb2ludCA+IDB4ZmZmZiA/IDIgOiAxXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpcnN0R3JhcGhlbWVMZW5ndGgodGV4dDogc3RyaW5nKTogbnVtYmVyIHtcclxuICBpZiAodGV4dC5sZW5ndGggPT09IDApIHJldHVybiAwXHJcbiAgaWYgKHR5cGVvZiBJbnRsICE9PSAndW5kZWZpbmVkJyAmJiAnU2VnbWVudGVyJyBpbiBJbnRsKSB7XHJcbiAgICBmb3IgKGNvbnN0IHsgc2VnbWVudCB9IG9mIG5ldyBJbnRsLlNlZ21lbnRlcigpLnNlZ21lbnQodGV4dCkpIHJldHVybiBzZWdtZW50Lmxlbmd0aFxyXG4gIH1cclxuICBjb25zdCBjb2RlUG9pbnQgPSB0ZXh0LmNvZGVQb2ludEF0KDApXHJcbiAgcmV0dXJuIGNvZGVQb2ludCAhPT0gdW5kZWZpbmVkICYmIGNvZGVQb2ludCA+IDB4ZmZmZiA/IDIgOiAxXHJcbn1cclxuXHJcbi8qKiBUaGUgb2Zmc2V0IG9uZSBkZWxldGlvbiB1bml0IChncmFwaGVtZSBvciBhdG9tKSBiZWZvcmUgYG9mZnNldGAsIG9yIC0xIGF0IHRoZSBzdGFydC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHByZXZpb3VzSW5saW5lQm91bmRhcnkoZnJhZzogRnJhZ21lbnQsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcclxuICBpZiAob2Zmc2V0IDw9IDApIHJldHVybiAtMVxyXG4gIGxldCBwb3MgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBmcmFnLmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBzaXplID0gaW5saW5lU2l6ZShjaGlsZClcclxuICAgIGNvbnN0IGVuZCA9IHBvcyArIHNpemVcclxuICAgIGlmIChvZmZzZXQgPiBwb3MgJiYgb2Zmc2V0IDw9IGVuZCkge1xyXG4gICAgICBpZiAoIWNoaWxkLmlzVGV4dCkgcmV0dXJuIHBvc1xyXG4gICAgICBjb25zdCBsb2NhbCA9IG9mZnNldCAtIHBvc1xyXG4gICAgICByZXR1cm4gb2Zmc2V0IC0gbGFzdEdyYXBoZW1lTGVuZ3RoKChjaGlsZCBhcyBUZXh0Tm9kZSkudGV4dC5zbGljZSgwLCBsb2NhbCkpXHJcbiAgICB9XHJcbiAgICBwb3MgPSBlbmRcclxuICB9XHJcbiAgcmV0dXJuIC0xXHJcbn1cclxuXHJcbi8qKiBUaGUgb2Zmc2V0IG9uZSBkZWxldGlvbiB1bml0IChncmFwaGVtZSBvciBhdG9tKSBhZnRlciBgb2Zmc2V0YCwgb3IgLTEgYXQgdGhlIGVuZC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG5leHRJbmxpbmVCb3VuZGFyeShmcmFnOiBGcmFnbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xyXG4gIGlmIChvZmZzZXQgPj0gaW5saW5lTGVuZ3RoKGZyYWcpKSByZXR1cm4gLTFcclxuICBsZXQgcG9zID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgZnJhZy5jaGlsZHJlbikge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBjb25zdCBlbmQgPSBwb3MgKyBzaXplXHJcbiAgICBpZiAob2Zmc2V0ID49IHBvcyAmJiBvZmZzZXQgPCBlbmQpIHtcclxuICAgICAgaWYgKCFjaGlsZC5pc1RleHQpIHJldHVybiBlbmRcclxuICAgICAgY29uc3QgbG9jYWwgPSBvZmZzZXQgLSBwb3NcclxuICAgICAgcmV0dXJuIG9mZnNldCArIGZpcnN0R3JhcGhlbWVMZW5ndGgoKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0LnNsaWNlKGxvY2FsKSlcclxuICAgIH1cclxuICAgIHBvcyA9IGVuZFxyXG4gIH1cclxuICByZXR1cm4gLTFcclxufVxyXG5cclxuLyoqIEN1dCB0aGUgaW5saW5lIGNvbnRlbnQgYmV0d2VlbiB0d28gY2hhcmFjdGVyIG9mZnNldHMuIEF0b21zIGFyZSBrZXB0IG9ubHkgd2hlbiBmdWxseSBpbnNpZGUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzbGljZUlubGluZShmcmFnOiBGcmFnbWVudCwgZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogRnJhZ21lbnQge1xyXG4gIGlmIChmcm9tID49IHRvKSByZXR1cm4gRnJhZ21lbnQuZW1wdHlcclxuICBjb25zdCBvdXQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgbGV0IHBvcyA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZyYWcuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IHNpemUgPSBpbmxpbmVTaXplKGNoaWxkKVxyXG4gICAgY29uc3Qgc3RhcnQgPSBwb3NcclxuICAgIGNvbnN0IGVuZCA9IHBvcyArIHNpemVcclxuICAgIHBvcyA9IGVuZFxyXG4gICAgaWYgKGVuZCA8PSBmcm9tKSBjb250aW51ZVxyXG4gICAgaWYgKHN0YXJ0ID49IHRvKSBicmVha1xyXG4gICAgaWYgKGNoaWxkLmlzVGV4dCkge1xyXG4gICAgICBjb25zdCBjdXRGcm9tID0gTWF0aC5tYXgoZnJvbSAtIHN0YXJ0LCAwKVxyXG4gICAgICBjb25zdCBjdXRUbyA9IE1hdGgubWluKHRvIC0gc3RhcnQsIHNpemUpXHJcbiAgICAgIG91dC5wdXNoKGN1dEZyb20gPT09IDAgJiYgY3V0VG8gPT09IHNpemUgPyBjaGlsZCA6IChjaGlsZCBhcyBUZXh0Tm9kZSkuY3V0KGN1dEZyb20sIGN1dFRvKSlcclxuICAgIH0gZWxzZSBpZiAoc3RhcnQgPj0gZnJvbSAmJiBlbmQgPD0gdG8pIHtcclxuICAgICAgb3V0LnB1c2goY2hpbGQpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBGcmFnbWVudC5mcm9tKG91dClcclxufVxyXG5cclxuLyoqIE1lcmdlIGFkamFjZW50IHRleHQgbm9kZXMgdGhhdCBzaGFyZSBhbiBpZGVudGljYWwgbWFyayBzZXQuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUlubGluZShmcmFnOiBGcmFnbWVudCk6IEZyYWdtZW50IHtcclxuICBjb25zdCBvdXQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBmcmFnLmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBsYXN0ID0gb3V0W291dC5sZW5ndGggLSAxXVxyXG4gICAgaWYgKGxhc3Q/LmlzVGV4dCAmJiBjaGlsZC5pc1RleHQgJiYgbWFya3NFcShsYXN0Lm1hcmtzLCBjaGlsZC5tYXJrcykpIHtcclxuICAgICAgY29uc3QgbGFzdFRleHQgPSBsYXN0IGFzIFRleHROb2RlXHJcbiAgICAgIG91dFtvdXQubGVuZ3RoIC0gMV0gPSBsYXN0VGV4dC53aXRoVGV4dChsYXN0VGV4dC50ZXh0ICsgKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgb3V0LnB1c2goY2hpbGQpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBvdXQubGVuZ3RoID09PSBmcmFnLmNoaWxkQ291bnQgPyBmcmFnIDogRnJhZ21lbnQuZnJvbShvdXQpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBZGFwdCBpbmxpbmUgY29udGVudCB0byB3aGF0IGEgYmxvY2sgd2lsbCBhY3R1YWxseSBob2xkLiBNYXJrcyB0aGUgYmxvY2tcclxuICogZm9yYmlkcyBhcmUgZHJvcHBlZCwgYW5kIGFuIGlubGluZSBub2RlIGl0IGNhbm5vdCBjb250YWluIGlzIHJlZHVjZWQgdG8gdGhlXHJcbiAqIHRleHQgaXQgc3RhbmRzIGZvci4gQSBoYXJkIGJyZWFrIGJlY29tZXMgYSBuZXdsaW5lLCB3aGljaCBpcyB0aGUgc2FtZSBsaW5lXHJcbiAqIGVuZGluZyB3cml0dGVuIGluIHRoZSBvbmx5IGZvcm0gYSBgdGV4dCpgIGJsb2NrIHN1Y2ggYXMgYSBjb2RlIGJsb2NrIGNhblxyXG4gKiBzdG9yZS4gV2l0aG91dCB0aGlzLCBwYXN0aW5nIGZvcm1hdHRlZCB0ZXh0IGludG8gYSBjb2RlIGJsb2NrIGJ1aWxkcyBhXHJcbiAqIGRvY3VtZW50IHRoZSBzY2hlbWEgd291bGQgcmVqZWN0LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvZXJjZUlubGluZUZvcih0eXBlOiBOb2RlVHlwZSwgbm9kZXM6IHJlYWRvbmx5IEVkaXRvck5vZGVbXSk6IEVkaXRvck5vZGVbXSB7XHJcbiAgY29uc3Qgb3V0OiBFZGl0b3JOb2RlW10gPSBbXVxyXG4gIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xyXG4gICAgaWYgKG5vZGUuaXNUZXh0KSB7XHJcbiAgICAgIGNvbnN0IGtlcHQgPSBub2RlLm1hcmtzLmZpbHRlcigobWFyaykgPT4gdHlwZS5hbGxvd3NNYXJrVHlwZShtYXJrLnR5cGUpKVxyXG4gICAgICBvdXQucHVzaChrZXB0Lmxlbmd0aCA9PT0gbm9kZS5tYXJrcy5sZW5ndGggPyBub2RlIDogbm9kZS53aXRoTWFya3Moa2VwdCkpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBpZiAodHlwZS52YWxpZENvbnRlbnQoRnJhZ21lbnQub2Yobm9kZSkpKSB7XHJcbiAgICAgIG91dC5wdXNoKG5vZGUpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBjb25zdCB0ZXh0ID0gbm9kZS50eXBlLm5hbWUgPT09ICdoYXJkQnJlYWsnID8gJ1xcbicgOiBub2RlLnRleHRDb250ZW50XHJcbiAgICBpZiAodGV4dC5sZW5ndGggPiAwKSBvdXQucHVzaChub2RlLnR5cGUuc2NoZW1hLnRleHQodGV4dCkpXHJcbiAgfVxyXG4gIHJldHVybiBtZXJnZUlubGluZShGcmFnbWVudC5mcm9tKG91dCkpLmNoaWxkcmVuIGFzIEVkaXRvck5vZGVbXVxyXG59XHJcblxyXG4vKipcclxuICogTWFwIGFuIG9mZnNldCBpbiBhIHRleHRibG9jaydzIHJlbmRlcmVkIHRleHQgYmFjayB0byBhbiBpbmxpbmUgb2Zmc2V0LiBUZXh0XHJcbiAqIGNvbnRyaWJ1dGVzIG9uZSBjaGFyYWN0ZXIgcGVyIHBvc2l0aW9uLCBidXQgYW4gaW5saW5lIGF0b20gY291bnRzIGFzIGFcclxuICogc2luZ2xlIHBvc2l0aW9uIHdoaWxlIHJlbmRlcmluZyBob3dldmVyIG1hbnkgY2hhcmFjdGVycyBpdCBsaWtlcywgbm9uZSBhdFxyXG4gKiBhbGwsIGZvciBhIGhhcmQgYnJlYWssIHNvIHRoZSB0d28gc2NhbGVzIGRyaWZ0IGFwYXJ0IHRoZSBtb21lbnQgYSBibG9ja1xyXG4gKiBob2xkcyBvbmUuIEFuIG9mZnNldCBsYW5kaW5nIGluc2lkZSBhbiBhdG9tIHJlc29sdmVzIHRvIGl0cyBuZWFyZXIgZWRnZSxcclxuICogc2luY2UgYW4gYXRvbSBoYXMgbm8gcG9zaXRpb25zIHdpdGhpbiBpdC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpbmxpbmVPZmZzZXRGcm9tVGV4dChmcmFnOiBGcmFnbWVudCwgdGV4dE9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcclxuICBsZXQgY2hhcnMgPSAwXHJcbiAgbGV0IGlubGluZSA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZyYWcuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IGNoaWxkQ2hhcnMgPSBjaGlsZC50ZXh0Q29udGVudC5sZW5ndGhcclxuICAgIGlmIChjaGFycyArIGNoaWxkQ2hhcnMgPj0gdGV4dE9mZnNldCkge1xyXG4gICAgICBpZiAoY2hpbGQuaXNUZXh0KSByZXR1cm4gaW5saW5lICsgKHRleHRPZmZzZXQgLSBjaGFycylcclxuICAgICAgcmV0dXJuIHRleHRPZmZzZXQgPD0gY2hhcnMgPyBpbmxpbmUgOiBpbmxpbmUgKyAxXHJcbiAgICB9XHJcbiAgICBjaGFycyArPSBjaGlsZENoYXJzXHJcbiAgICBpbmxpbmUgKz0gaW5saW5lU2l6ZShjaGlsZClcclxuICB9XHJcbiAgcmV0dXJuIGlubGluZVxyXG59XHJcblxyXG4vKiogUmVwbGFjZSB0aGUgaW5saW5lIHJhbmdlIFtmcm9tLCB0bykgd2l0aCB0aGUgZ2l2ZW4gaW5saW5lIGZyYWdtZW50LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcmVwbGFjZUlubGluZShcclxuICBmcmFnOiBGcmFnbWVudCxcclxuICBmcm9tOiBudW1iZXIsXHJcbiAgdG86IG51bWJlcixcclxuICBpbnNlcnQ6IEZyYWdtZW50LFxyXG4pOiBGcmFnbWVudCB7XHJcbiAgY29uc3QgYmVmb3JlID0gc2xpY2VJbmxpbmUoZnJhZywgMCwgZnJvbSlcclxuICBjb25zdCBhZnRlciA9IHNsaWNlSW5saW5lKGZyYWcsIHRvLCBpbmxpbmVMZW5ndGgoZnJhZykpXHJcbiAgcmV0dXJuIG1lcmdlSW5saW5lKGJlZm9yZS5hcHBlbmQoaW5zZXJ0KS5hcHBlbmQoYWZ0ZXIpKVxyXG59XHJcblxyXG4vKiogQWRkIG9yIHJlbW92ZSBhIG1hcmsgYWNyb3NzIHRoZSBpbmxpbmUgcmFuZ2UgW2Zyb20sIHRvKS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5SW5saW5lTWFyayhcclxuICBmcmFnOiBGcmFnbWVudCxcclxuICBmcm9tOiBudW1iZXIsXHJcbiAgdG86IG51bWJlcixcclxuICBtYXJrOiBNYXJrLFxyXG4gIGFkZDogYm9vbGVhbixcclxuKTogRnJhZ21lbnQge1xyXG4gIGNvbnN0IG91dDogRWRpdG9yTm9kZVtdID0gW11cclxuICBsZXQgcG9zID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgZnJhZy5jaGlsZHJlbikge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBjb25zdCBzdGFydCA9IHBvc1xyXG4gICAgY29uc3QgZW5kID0gcG9zICsgc2l6ZVxyXG4gICAgcG9zID0gZW5kXHJcbiAgICBpZiAoZW5kIDw9IGZyb20gfHwgc3RhcnQgPj0gdG8pIHtcclxuICAgICAgb3V0LnB1c2goY2hpbGQpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBjb25zdCBhcHBseSA9IChub2RlOiBFZGl0b3JOb2RlKTogRWRpdG9yTm9kZSA9PlxyXG4gICAgICBub2RlLndpdGhNYXJrcyhhZGQgPyBtYXJrLmFkZFRvU2V0KG5vZGUubWFya3MpIDogbWFyay5yZW1vdmVGcm9tU2V0KG5vZGUubWFya3MpKVxyXG4gICAgaWYgKCFjaGlsZC5pc1RleHQpIHtcclxuICAgICAgb3V0LnB1c2goc3RhcnQgPj0gZnJvbSAmJiBlbmQgPD0gdG8gPyBhcHBseShjaGlsZCkgOiBjaGlsZClcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGNvbnN0IHRleHQgPSBjaGlsZCBhcyBUZXh0Tm9kZVxyXG4gICAgY29uc3QgY3V0RnJvbSA9IE1hdGgubWF4KGZyb20gLSBzdGFydCwgMClcclxuICAgIGNvbnN0IGN1dFRvID0gTWF0aC5taW4odG8gLSBzdGFydCwgc2l6ZSlcclxuICAgIGlmIChjdXRGcm9tID4gMCkgb3V0LnB1c2godGV4dC5jdXQoMCwgY3V0RnJvbSkpXHJcbiAgICBvdXQucHVzaChhcHBseSh0ZXh0LmN1dChjdXRGcm9tLCBjdXRUbykpKVxyXG4gICAgaWYgKGN1dFRvIDwgc2l6ZSkgb3V0LnB1c2godGV4dC5jdXQoY3V0VG8sIHNpemUpKVxyXG4gIH1cclxuICByZXR1cm4gbWVyZ2VJbmxpbmUoRnJhZ21lbnQuZnJvbShvdXQpKVxyXG59XHJcblxyXG4vKiogVHJ1ZSB3aGVuIGV2ZXJ5IG1hcmthYmxlIG5vZGUgb3ZlcmxhcHBpbmcgW2Zyb20sIHRvKSBjYXJyaWVzIGEgbWFyayBvZiB0aGlzIHR5cGUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByYW5nZUhhc01hcmsoXHJcbiAgZnJhZzogRnJhZ21lbnQsXHJcbiAgZnJvbTogbnVtYmVyLFxyXG4gIHRvOiBudW1iZXIsXHJcbiAgbWFya1R5cGU6IE1hcmtUeXBlLFxyXG4pOiBib29sZWFuIHtcclxuICBsZXQgc2F3Q29udGVudCA9IGZhbHNlXHJcbiAgbGV0IHBvcyA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZyYWcuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IHNpemUgPSBpbmxpbmVTaXplKGNoaWxkKVxyXG4gICAgY29uc3Qgc3RhcnQgPSBwb3NcclxuICAgIGNvbnN0IGVuZCA9IHBvcyArIHNpemVcclxuICAgIHBvcyA9IGVuZFxyXG4gICAgaWYgKGVuZCA8PSBmcm9tIHx8IHN0YXJ0ID49IHRvKSBjb250aW51ZVxyXG4gICAgaWYgKCFjaGlsZC5pc1RleHQpIGNvbnRpbnVlXHJcbiAgICBzYXdDb250ZW50ID0gdHJ1ZVxyXG4gICAgaWYgKCFjaGlsZC5tYXJrcy5zb21lKChtYXJrKSA9PiBtYXJrLnR5cGUgPT09IG1hcmtUeXBlKSkgcmV0dXJuIGZhbHNlXHJcbiAgfVxyXG4gIHJldHVybiBzYXdDb250ZW50XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDb250aWd1b3VzIHN1YnJhbmdlcyBvZiBbZnJvbSwgdG8pIHdoZXJlIGEgbWFyayBvZiB0aGlzIHR5cGUgaXMgcHJlc2VudCxcclxuICogd2l0aCB0aGUgZXhhY3QgbWFyayBpbnN0YW5jZSBwZXIgcmFuZ2UgKHJhbmdlcyBzcGxpdCB3aGVuIGF0dHJpYnV0ZXNcclxuICogY2hhbmdlKSwgdXNlZCB0byBidWlsZCBleGFjdGx5LWludmVydGlibGUgUmVtb3ZlTWFyayBzdGVwcy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByYW5nZXNXaXRoTWFyayhcclxuICBmcmFnOiBGcmFnbWVudCxcclxuICBmcm9tOiBudW1iZXIsXHJcbiAgdG86IG51bWJlcixcclxuICBtYXJrVHlwZTogTWFya1R5cGUsXHJcbik6IHJlYWRvbmx5IHsgZnJvbTogbnVtYmVyOyB0bzogbnVtYmVyOyBtYXJrOiBNYXJrIH1bXSB7XHJcbiAgY29uc3QgcmFuZ2VzOiB7IGZyb206IG51bWJlcjsgdG86IG51bWJlcjsgbWFyazogTWFyayB9W10gPSBbXVxyXG4gIGxldCBwb3MgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBmcmFnLmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBzaXplID0gaW5saW5lU2l6ZShjaGlsZClcclxuICAgIGNvbnN0IHN0YXJ0ID0gcG9zXHJcbiAgICBjb25zdCBlbmQgPSBwb3MgKyBzaXplXHJcbiAgICBwb3MgPSBlbmRcclxuICAgIGlmIChlbmQgPD0gZnJvbSB8fCBzdGFydCA+PSB0bykgY29udGludWVcclxuICAgIGNvbnN0IG1hcmsgPSBjaGlsZC5tYXJrcy5maW5kKChjYW5kaWRhdGUpID0+IGNhbmRpZGF0ZS50eXBlID09PSBtYXJrVHlwZSlcclxuICAgIGlmICghbWFyaykgY29udGludWVcclxuICAgIGNvbnN0IG92ZXJsYXBGcm9tID0gTWF0aC5tYXgoc3RhcnQsIGZyb20pXHJcbiAgICBjb25zdCBvdmVybGFwVG8gPSBNYXRoLm1pbihlbmQsIHRvKVxyXG4gICAgY29uc3QgbGFzdCA9IHJhbmdlc1tyYW5nZXMubGVuZ3RoIC0gMV1cclxuICAgIGlmIChsYXN0ICYmIGxhc3QudG8gPT09IG92ZXJsYXBGcm9tICYmIGxhc3QubWFyay5lcShtYXJrKSkge1xyXG4gICAgICBsYXN0LnRvID0gb3ZlcmxhcFRvXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByYW5nZXMucHVzaCh7IGZyb206IG92ZXJsYXBGcm9tLCB0bzogb3ZlcmxhcFRvLCBtYXJrIH0pXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiByYW5nZXNcclxufVxyXG5cclxuLyoqIFRoZSBtYXJrIHNldCBhZGphY2VudCB0byBhbiBpbmxpbmUgb2Zmc2V0OiB3aGF0IHR5cGluZyB0aGVyZSBzaG91bGQgaW5oZXJpdC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG1hcmtzQXRJbmxpbmVPZmZzZXQoZnJhZzogRnJhZ21lbnQsIG9mZnNldDogbnVtYmVyKTogcmVhZG9ubHkgTWFya1tdIHtcclxuICBsZXQgcG9zID0gMFxyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgZnJhZy5jaGlsZHJlbikge1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBjb25zdCBlbmQgPSBwb3MgKyBzaXplXHJcbiAgICAvLyBQcmVmZXIgdGhlIG5vZGUgZW5kaW5nIGF0IHRoZSBvZmZzZXQgKG1hcmtzIGNvbnRpbnVlIGZyb20gdGhlIGxlZnQpLlxyXG4gICAgaWYgKG9mZnNldCA+IHBvcyAmJiBvZmZzZXQgPD0gZW5kKSByZXR1cm4gY2hpbGQuaXNUZXh0ID8gY2hpbGQubWFya3MgOiBbXVxyXG4gICAgcG9zID0gZW5kXHJcbiAgfVxyXG4gIGNvbnN0IGZpcnN0ID0gZnJhZy5tYXliZUNoaWxkKDApXHJcbiAgcmV0dXJuIGZpcnN0Py5pc1RleHQgPyBmaXJzdC5tYXJrcyA6IFtdXHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4vbm9kZSdcclxuXHJcbi8qKiBBIHBhdGggYWRkcmVzc2VzIGEgbm9kZSBhcyBjaGlsZCBpbmRpY2VzIGZyb20gdGhlIGRvY3VtZW50IHJvb3QuICovXHJcbmV4cG9ydCB0eXBlIFBhdGggPSByZWFkb25seSBudW1iZXJbXVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHBhdGhzRXF1YWwoYTogUGF0aCwgYjogUGF0aCk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiBhLmxlbmd0aCA9PT0gYi5sZW5ndGggJiYgYS5ldmVyeSgoaW5kZXgsIGkpID0+IGluZGV4ID09PSBiW2ldKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcGF0aFN0YXJ0c1dpdGgocGF0aDogUGF0aCwgcHJlZml4OiBQYXRoKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIHByZWZpeC5sZW5ndGggPD0gcGF0aC5sZW5ndGggJiYgcHJlZml4LmV2ZXJ5KChpbmRleCwgaSkgPT4gaW5kZXggPT09IHBhdGhbaV0pXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJlbnRQYXRoT2YocGF0aDogUGF0aCk6IFBhdGgge1xyXG4gIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RoZSByb290IG5vZGUgaGFzIG5vIHBhcmVudCcpXHJcbiAgcmV0dXJuIHBhdGguc2xpY2UoMCwgLTEpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBsYXN0SW5kZXhPZlBhdGgocGF0aDogUGF0aCk6IG51bWJlciB7XHJcbiAgY29uc3QgaW5kZXggPSBwYXRoW3BhdGgubGVuZ3RoIC0gMV1cclxuICBpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RoZSByb290IG5vZGUgaGFzIG5vIGluZGV4JylcclxuICByZXR1cm4gaW5kZXhcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vZGVBdFBhdGgoZG9jOiBFZGl0b3JOb2RlLCBwYXRoOiBQYXRoKTogRWRpdG9yTm9kZSB8IG51bGwge1xyXG4gIGxldCBub2RlOiBFZGl0b3JOb2RlID0gZG9jXHJcbiAgZm9yIChjb25zdCBpbmRleCBvZiBwYXRoKSB7XHJcbiAgICBjb25zdCBjaGlsZCA9IG5vZGUuY29udGVudC5tYXliZUNoaWxkKGluZGV4KVxyXG4gICAgaWYgKCFjaGlsZCkgcmV0dXJuIG51bGxcclxuICAgIG5vZGUgPSBjaGlsZFxyXG4gIH1cclxuICByZXR1cm4gbm9kZVxyXG59XHJcblxyXG4vKipcclxuICogUmV0dXJuIGEgbmV3IGRvY3VtZW50IHdpdGggdGhlIG5vZGUgYXQgYHBhdGhgIHJlcGxhY2VkIGJ5IGBmbihub2RlKWAsXHJcbiAqIHJlYnVpbGRpbmcgdGhlIGFuY2VzdG9yIHNwaW5lIChzdHJ1Y3R1cmFsIHNoYXJpbmcgZXZlcnl3aGVyZSBlbHNlKS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVBdFBhdGgoXHJcbiAgZG9jOiBFZGl0b3JOb2RlLFxyXG4gIHBhdGg6IFBhdGgsXHJcbiAgZm46IChub2RlOiBFZGl0b3JOb2RlKSA9PiBFZGl0b3JOb2RlLFxyXG4pOiBFZGl0b3JOb2RlIHtcclxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHJldHVybiBmbihkb2MpXHJcbiAgY29uc3QgW2luZGV4LCAuLi5yZXN0XSA9IHBhdGggYXMgW251bWJlciwgLi4ubnVtYmVyW11dXHJcbiAgY29uc3QgY2hpbGQgPSBkb2MuY29udGVudC5tYXliZUNoaWxkKGluZGV4KVxyXG4gIGlmICghY2hpbGQpIHRocm93IG5ldyBSYW5nZUVycm9yKGBObyBub2RlIGF0IHBhdGggaW5kZXggJHtpbmRleH1gKVxyXG4gIHJldHVybiBkb2Mud2l0aENvbnRlbnQoZG9jLmNvbnRlbnQucmVwbGFjZUNoaWxkKGluZGV4LCB1cGRhdGVBdFBhdGgoY2hpbGQsIHJlc3QsIGZuKSkpXHJcbn1cclxuIiwgImltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4vaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuL25vZGUnXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCB9IGZyb20gJy4vdHJlZSdcclxuXHJcbi8qKlxyXG4gKiBBIHBvc2l0aW9uIGluIHRoZSBkb2N1bWVudDogYHBhdGhgIGFkZHJlc3NlcyB0aGUgY29udGFpbmluZyBub2RlLCBgb2Zmc2V0YFxyXG4gKiBpcyBhIGNoYXJhY3RlciBvZmZzZXQgd2l0aGluIGEgdGV4dGJsb2NrJ3MgaW5saW5lIGNvbnRlbnQsIG9yIGEgY2hpbGQgaW5kZXhcclxuICogd2l0aGluIGFuIGVsZW1lbnQgbm9kZS5cclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgUG9zaXRpb24ge1xyXG4gIHJlYWRvbmx5IHBhdGg6IFBhdGhcclxuICByZWFkb25seSBvZmZzZXQ6IG51bWJlclxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcG9zKHBhdGg6IFBhdGgsIG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24ge1xyXG4gIHJldHVybiB7IHBhdGgsIG9mZnNldCB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEb2N1bWVudC1vcmRlciBjb21wYXJpc29uLiBQb3NpdGlvbnMgY29tcGFyZSBieSB0aGVpciBmdWxsIHRyYWlsXHJcbiAqIChgWy4uLnBhdGgsIG9mZnNldF1gKSBsZXhpY29ncmFwaGljYWxseTsgYSBzaG9ydGVyIHByZWZpeCBzb3J0cyBmaXJzdC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlUG9zaXRpb25zKGE6IFBvc2l0aW9uLCBiOiBQb3NpdGlvbik6IC0xIHwgMCB8IDEge1xyXG4gIGNvbnN0IGFUcmFpbCA9IFsuLi5hLnBhdGgsIGEub2Zmc2V0XVxyXG4gIGNvbnN0IGJUcmFpbCA9IFsuLi5iLnBhdGgsIGIub2Zmc2V0XVxyXG4gIGNvbnN0IGxlbmd0aCA9IE1hdGgubWluKGFUcmFpbC5sZW5ndGgsIGJUcmFpbC5sZW5ndGgpXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3QgYXYgPSBhVHJhaWxbaV0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBidiA9IGJUcmFpbFtpXSBhcyBudW1iZXJcclxuICAgIGlmIChhdiAhPT0gYnYpIHJldHVybiBhdiA8IGJ2ID8gLTEgOiAxXHJcbiAgfVxyXG4gIGlmIChhVHJhaWwubGVuZ3RoID09PSBiVHJhaWwubGVuZ3RoKSByZXR1cm4gMFxyXG4gIHJldHVybiBhVHJhaWwubGVuZ3RoIDwgYlRyYWlsLmxlbmd0aCA/IC0xIDogMVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcG9zaXRpb25zRXF1YWwoYTogUG9zaXRpb24sIGI6IFBvc2l0aW9uKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIGEub2Zmc2V0ID09PSBiLm9mZnNldCAmJiBhLnBhdGgubGVuZ3RoID09PSBiLnBhdGgubGVuZ3RoICYmIGNvbXBhcmVQb3NpdGlvbnMoYSwgYikgPT09IDBcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1pblBvc2l0aW9uKGE6IFBvc2l0aW9uLCBiOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcclxuICByZXR1cm4gY29tcGFyZVBvc2l0aW9ucyhhLCBiKSA8PSAwID8gYSA6IGJcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1heFBvc2l0aW9uKGE6IFBvc2l0aW9uLCBiOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcclxuICByZXR1cm4gY29tcGFyZVBvc2l0aW9ucyhhLCBiKSA+PSAwID8gYSA6IGJcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBSZXNvbHZlZFBvc2l0aW9uIHtcclxuICAvKiogVGhlIG5vZGUgdGhlIHBvc2l0aW9uIGxpdmVzIGluLiAqL1xyXG4gIHJlYWRvbmx5IG5vZGU6IEVkaXRvck5vZGVcclxuICByZWFkb25seSBwYXJlbnQ6IEVkaXRvck5vZGUgfCBudWxsXHJcbiAgLyoqIFRoaXMgbm9kZSdzIGluZGV4IGluIGl0cyBwYXJlbnQuICovXHJcbiAgcmVhZG9ubHkgaW5kZXg6IG51bWJlciB8IG51bGxcclxufVxyXG5cclxuLyoqIFJlc29sdmUgYSBwb3NpdGlvbidzIGNvbnRhaW5pbmcgbm9kZS4gUmV0dXJucyBudWxsIHdoZW4gdGhlIHBhdGggaXMgaW52YWxpZC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQb3NpdGlvbihkb2M6IEVkaXRvck5vZGUsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFJlc29sdmVkUG9zaXRpb24gfCBudWxsIHtcclxuICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2MsIHBvc2l0aW9uLnBhdGgpXHJcbiAgaWYgKCFub2RlKSByZXR1cm4gbnVsbFxyXG4gIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHsgbm9kZSwgcGFyZW50OiBudWxsLCBpbmRleDogbnVsbCB9XHJcbiAgY29uc3QgcGFyZW50ID0gbm9kZUF0UGF0aChkb2MsIHBvc2l0aW9uLnBhdGguc2xpY2UoMCwgLTEpKVxyXG4gIGNvbnN0IGluZGV4ID0gcG9zaXRpb24ucGF0aFtwb3NpdGlvbi5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIHJldHVybiBwYXJlbnQgPyB7IG5vZGUsIHBhcmVudCwgaW5kZXggfSA6IG51bGxcclxufVxyXG5cclxuLyoqIENsYW1wIGEgcG9zaXRpb24gaW50byB0aGUgdmFsaWQgcmFuZ2UgZm9yIHRoZSBnaXZlbiBkb2N1bWVudC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wUG9zaXRpb24oZG9jOiBFZGl0b3JOb2RlLCBwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgY29uc3QgcGF0aDogbnVtYmVyW10gPSBbXVxyXG4gIGxldCBub2RlOiBFZGl0b3JOb2RlID0gZG9jXHJcbiAgZm9yIChjb25zdCByYXdJbmRleCBvZiBwb3NpdGlvbi5wYXRoKSB7XHJcbiAgICBpZiAobm9kZS5jaGlsZENvdW50ID09PSAwKSBicmVha1xyXG4gICAgY29uc3QgaW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyYXdJbmRleCwgbm9kZS5jaGlsZENvdW50IC0gMSkpXHJcbiAgICBwYXRoLnB1c2goaW5kZXgpXHJcbiAgICBub2RlID0gbm9kZS5jaGlsZChpbmRleClcclxuICB9XHJcbiAgY29uc3QgbWF4T2Zmc2V0ID0gbm9kZS5pc1RleHRibG9jayA/IGlubGluZUxlbmd0aChub2RlLmNvbnRlbnQpIDogbm9kZS5jaGlsZENvdW50XHJcbiAgY29uc3Qgb2Zmc2V0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4ocG9zaXRpb24ub2Zmc2V0LCBtYXhPZmZzZXQpKVxyXG4gIHJldHVybiB7IHBhdGgsIG9mZnNldCB9XHJcbn1cclxuIiwgImltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4vaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuL25vZGUnXHJcbmltcG9ydCB7IHR5cGUgUG9zaXRpb24sIGNvbXBhcmVQb3NpdGlvbnMsIHBvcyB9IGZyb20gJy4vcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgcGF0aHNFcXVhbCB9IGZyb20gJy4vdHJlZSdcclxuXHJcbi8qKiBBbGwgdGV4dGJsb2NrIG5vZGVzIGluIGRvY3VtZW50IG9yZGVyLCB3aXRoIHRoZWlyIHBhdGhzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdGV4dGJsb2Nrcyhkb2M6IEVkaXRvck5vZGUpOiByZWFkb25seSB7IHBhdGg6IFBhdGg7IG5vZGU6IEVkaXRvck5vZGUgfVtdIHtcclxuICBjb25zdCBmb3VuZDogeyBwYXRoOiBQYXRoOyBub2RlOiBFZGl0b3JOb2RlIH1bXSA9IFtdXHJcbiAgY29uc3Qgd2FsayA9IChub2RlOiBFZGl0b3JOb2RlLCBwYXRoOiBQYXRoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAobm9kZS5pc1RleHRibG9jaykge1xyXG4gICAgICBmb3VuZC5wdXNoKHsgcGF0aCwgbm9kZSB9KVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIG5vZGUuY29udGVudC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZCwgaW5kZXgpID0+IHtcclxuICAgICAgd2FsayhjaGlsZCwgWy4uLnBhdGgsIGluZGV4XSlcclxuICAgIH0pXHJcbiAgfVxyXG4gIHdhbGsoZG9jLCBbXSlcclxuICByZXR1cm4gZm91bmRcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZpcnN0VGV4dGJsb2NrUGF0aChkb2M6IEVkaXRvck5vZGUpOiBQYXRoIHwgbnVsbCB7XHJcbiAgcmV0dXJuIHRleHRibG9ja3MoZG9jKVswXT8ucGF0aCA/PyBudWxsXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQmxvY2tSYW5nZSB7XHJcbiAgcmVhZG9ubHkgcGF0aDogUGF0aFxyXG4gIHJlYWRvbmx5IG5vZGU6IEVkaXRvck5vZGVcclxuICAvKiogSW5saW5lIHJhbmdlIHdpdGhpbiB0aGlzIGJsb2NrIGNvdmVyZWQgYnkgdGhlIHNlbGVjdGlvbi4gKi9cclxuICByZWFkb25seSBmcm9tOiBudW1iZXJcclxuICByZWFkb25seSB0bzogbnVtYmVyXHJcbn1cclxuXHJcbi8qKiBUZXh0YmxvY2tzIGludGVyc2VjdGluZyB0aGUgcG9zaXRpb24gcmFuZ2UgW2Zyb20sIHRvXSwgd2l0aCBwZXItYmxvY2sgaW5saW5lIHJhbmdlcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGJsb2Nrc0luUmFuZ2UoXHJcbiAgZG9jOiBFZGl0b3JOb2RlLFxyXG4gIGZyb206IFBvc2l0aW9uLFxyXG4gIHRvOiBQb3NpdGlvbixcclxuKTogcmVhZG9ubHkgQmxvY2tSYW5nZVtdIHtcclxuICBjb25zdCByYW5nZXM6IEJsb2NrUmFuZ2VbXSA9IFtdXHJcbiAgZm9yIChjb25zdCB7IHBhdGgsIG5vZGUgfSBvZiB0ZXh0YmxvY2tzKGRvYykpIHtcclxuICAgIGNvbnN0IGxlbmd0aCA9IGlubGluZUxlbmd0aChub2RlLmNvbnRlbnQpXHJcbiAgICBpZiAoY29tcGFyZVBvc2l0aW9ucyhwb3MocGF0aCwgbGVuZ3RoKSwgZnJvbSkgPCAwKSBjb250aW51ZVxyXG4gICAgaWYgKGNvbXBhcmVQb3NpdGlvbnMocG9zKHBhdGgsIDApLCB0bykgPiAwKSBicmVha1xyXG4gICAgcmFuZ2VzLnB1c2goe1xyXG4gICAgICBwYXRoLFxyXG4gICAgICBub2RlLFxyXG4gICAgICBmcm9tOiBwYXRoc0VxdWFsKHBhdGgsIGZyb20ucGF0aCkgPyBmcm9tLm9mZnNldCA6IDAsXHJcbiAgICAgIHRvOiBwYXRoc0VxdWFsKHBhdGgsIHRvLnBhdGgpID8gdG8ub2Zmc2V0IDogbGVuZ3RoLFxyXG4gICAgfSlcclxuICB9XHJcbiAgcmV0dXJuIHJhbmdlc1xyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEF0dHJzIH0gZnJvbSAnLi9hdHRycydcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuL2ZyYWdtZW50J1xyXG5pbXBvcnQgdHlwZSB7IE1hcmssIE1hcmtKU09OIH0gZnJvbSAnLi9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUsIE5vZGVKU09OIH0gZnJvbSAnLi9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFNjaGVtYSB9IGZyb20gJy4vc2NoZW1hJ1xyXG5cclxuLyoqIENhbm9uaWNhbCBKU09OIGRvY3VtZW50IHNoYXBlIGFjY2VwdGVkIGJ5IHtAbGluayBub2RlRnJvbUpTT059LiAqL1xyXG5leHBvcnQgdHlwZSBEb2NKU09OID0gTm9kZUpTT05cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBtYXJrRnJvbUpTT04oc2NoZW1hOiBTY2hlbWEsIGpzb246IE1hcmtKU09OKTogTWFyayB7XHJcbiAgcmV0dXJuIHNjaGVtYS5tYXJrVHlwZShqc29uLnR5cGUpLmNyZWF0ZShqc29uLmF0dHJzIGFzIEF0dHJzIHwgdW5kZWZpbmVkKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbm9kZUZyb21KU09OKHNjaGVtYTogU2NoZW1hLCBqc29uOiBOb2RlSlNPTik6IEVkaXRvck5vZGUge1xyXG4gIGNvbnN0IG1hcmtzID0gKGpzb24ubWFya3MgPz8gW10pLm1hcCgobWFyaykgPT4gbWFya0Zyb21KU09OKHNjaGVtYSwgbWFyaykpXHJcbiAgaWYgKGpzb24udHlwZSA9PT0gJ3RleHQnKSB7XHJcbiAgICBpZiAodHlwZW9mIGpzb24udGV4dCAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RleHQgbm9kZSBKU09OIGlzIG1pc3NpbmcgaXRzIFwidGV4dFwiIHByb3BlcnR5JylcclxuICAgIH1cclxuICAgIHJldHVybiBzY2hlbWEudGV4dChqc29uLnRleHQsIG1hcmtzKVxyXG4gIH1cclxuICBjb25zdCBjb250ZW50ID0gRnJhZ21lbnQuZnJvbSgoanNvbi5jb250ZW50ID8/IFtdKS5tYXAoKGNoaWxkKSA9PiBub2RlRnJvbUpTT04oc2NoZW1hLCBjaGlsZCkpKVxyXG4gIHJldHVybiBzY2hlbWEubm9kZVR5cGUoanNvbi50eXBlKS5jcmVhdGUoanNvbi5hdHRycyBhcyBBdHRycyB8IHVuZGVmaW5lZCwgY29udGVudCwgbWFya3MpXHJcbn1cclxuIiwgImltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi9mcmFnbWVudCdcclxuaW1wb3J0IHsgbWVyZ2VJbmxpbmUgfSBmcm9tICcuL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi9ub2RlJ1xyXG5cclxuLyoqXHJcbiAqIERldGVybWluaXN0aWNhbGx5IHJlcGFpciBhIGRvY3VtZW50IHNvIGl0IGNvbmZvcm1zIHRvIGl0cyBzY2hlbWEgd2hlcmVcclxuICogcG9zc2libGU6IGRyb3BzIGNoaWxkcmVuIGZyb20gbGVhZiBub2Rlcywgd3JhcHMgc3RyYXkgaW5saW5lIGNvbnRlbnQgaW4gdGhlXHJcbiAqIHNjaGVtYSdzIGRlZmF1bHQgdGV4dGJsb2NrLCBzdHJpcHMgZGlzYWxsb3dlZCBtYXJrcywgbWVyZ2VzIGFkamFjZW50IHRleHRcclxuICogbm9kZXMsIGFuZCBndWFyYW50ZWVzIGEgbm9uLWVtcHR5IHRvcCBub2RlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZURvYyhkb2M6IEVkaXRvck5vZGUpOiBFZGl0b3JOb2RlIHtcclxuICBjb25zdCBzY2hlbWEgPSBkb2MudHlwZS5zY2hlbWFcclxuICBsZXQgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5vZGUoZG9jKVxyXG4gIGlmIChub3JtYWxpemVkLmNoaWxkQ291bnQgPT09IDAgJiYgIW5vcm1hbGl6ZWQudHlwZS5hbGxvd3NFbXB0eUNvbnRlbnQpIHtcclxuICAgIG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkLndpdGhDb250ZW50KEZyYWdtZW50Lm9mKHNjaGVtYS5maXJzdFRleHRibG9ja1R5cGUoKS5jcmVhdGUoKSkpXHJcbiAgfVxyXG4gIHJldHVybiBub3JtYWxpemVkXHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5vcm1hbGl6ZU5vZGUobm9kZTogRWRpdG9yTm9kZSk6IEVkaXRvck5vZGUge1xyXG4gIGlmIChub2RlLmlzVGV4dCkgcmV0dXJuIG5vZGVcclxuICBpZiAoIW5vZGUudHlwZS5zcGVjLmNvbnRlbnQpIHtcclxuICAgIC8vIExlYWYgbm9kZTogY29udGVudCBpcyBuZXZlciBhbGxvd2VkLlxyXG4gICAgcmV0dXJuIG5vZGUuY2hpbGRDb3VudCA9PT0gMCA/IG5vZGUgOiBub2RlLndpdGhDb250ZW50KEZyYWdtZW50LmVtcHR5KVxyXG4gIH1cclxuXHJcbiAgbGV0IGNoaWxkcmVuID0gbm9kZS5jb250ZW50LmNoaWxkcmVuLm1hcCgoY2hpbGQpID0+XHJcbiAgICBzdHJpcERpc2FsbG93ZWRNYXJrcyhub3JtYWxpemVOb2RlKGNoaWxkKSwgbm9kZSksXHJcbiAgKVxyXG5cclxuICBpZiAobm9kZS5pc1RleHRibG9jaykge1xyXG4gICAgLy8gSW5saW5lIGNvbnRleHQ6IGZsYXR0ZW4gYW55IHN0cmF5IGJsb2NrIGNoaWxkcmVuIGludG8gdGhlaXIgaW5saW5lIGNvbnRlbnQuXHJcbiAgICBjaGlsZHJlbiA9IGNoaWxkcmVuLmZsYXRNYXAoKGNoaWxkKSA9PlxyXG4gICAgICBjaGlsZC5pc0lubGluZSA/IFtjaGlsZF0gOiBjaGlsZC5jb250ZW50LmNoaWxkcmVuLmZpbHRlcigoaW5uZXIpID0+IGlubmVyLmlzSW5saW5lKSxcclxuICAgIClcclxuICAgIHJldHVybiBub2RlLndpdGhDb250ZW50KG1lcmdlSW5saW5lKEZyYWdtZW50LmZyb20oY2hpbGRyZW4pKSlcclxuICB9XHJcblxyXG4gIC8vIEJsb2NrIGNvbnRleHQ6IHdyYXAgcnVucyBvZiBzdHJheSBpbmxpbmUgY2hpbGRyZW4gaW4gdGhlIGRlZmF1bHQgdGV4dGJsb2NrLlxyXG4gIGNvbnN0IHNjaGVtYSA9IG5vZGUudHlwZS5zY2hlbWFcclxuICBjb25zdCB3cmFwcGVkOiBFZGl0b3JOb2RlW10gPSBbXVxyXG4gIGxldCBpbmxpbmVSdW46IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgY29uc3QgZmx1c2hSdW4gPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAoaW5saW5lUnVuLmxlbmd0aCA+IDApIHtcclxuICAgICAgd3JhcHBlZC5wdXNoKFxyXG4gICAgICAgIHNjaGVtYS5maXJzdFRleHRibG9ja1R5cGUoKS5jcmVhdGUodW5kZWZpbmVkLCBtZXJnZUlubGluZShGcmFnbWVudC5mcm9tKGlubGluZVJ1bikpKSxcclxuICAgICAgKVxyXG4gICAgICBpbmxpbmVSdW4gPSBbXVxyXG4gICAgfVxyXG4gIH1cclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XHJcbiAgICBpZiAoY2hpbGQuaXNJbmxpbmUpIHtcclxuICAgICAgaW5saW5lUnVuLnB1c2goY2hpbGQpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBmbHVzaFJ1bigpXHJcbiAgICAgIHdyYXBwZWQucHVzaChjaGlsZClcclxuICAgIH1cclxuICB9XHJcbiAgZmx1c2hSdW4oKVxyXG4gIHJldHVybiBub2RlLndpdGhDb250ZW50KEZyYWdtZW50LmZyb20od3JhcHBlZCkpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0cmlwRGlzYWxsb3dlZE1hcmtzKGNoaWxkOiBFZGl0b3JOb2RlLCBwYXJlbnQ6IEVkaXRvck5vZGUpOiBFZGl0b3JOb2RlIHtcclxuICBpZiAoY2hpbGQubWFya3MubGVuZ3RoID09PSAwKSByZXR1cm4gY2hpbGRcclxuICBjb25zdCBhbGxvd2VkID0gY2hpbGQubWFya3MuZmlsdGVyKChtYXJrKSA9PiBwYXJlbnQudHlwZS5hbGxvd3NNYXJrVHlwZShtYXJrLnR5cGUpKVxyXG4gIHJldHVybiBhbGxvd2VkLmxlbmd0aCA9PT0gY2hpbGQubWFya3MubGVuZ3RoID8gY2hpbGQgOiBjaGlsZC53aXRoTWFya3MoYWxsb3dlZClcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBQb3NpdGlvbiB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5cclxuLyoqIE1hcHBpbmcgYmlhczogd2hlcmUgYSBwb3NpdGlvbiBhdCBhIGNoYW5nZSBib3VuZGFyeSBzaG91bGQgbGFuZC4gKi9cclxuZXhwb3J0IHR5cGUgQmlhcyA9IC0xIHwgMVxyXG5cclxuLyoqIE1hcHMgcG9zaXRpb25zIGZyb20gYmVmb3JlIGEgY2hhbmdlIHRvIGFmdGVyIGl0LiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFBvc2l0aW9uTWFwcGVyIHtcclxuICBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGJpYXM/OiBCaWFzKTogUG9zaXRpb25cclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTdGVwUmVzdWx0IHtcclxuICByZWFkb25seSBkb2M6IEVkaXRvck5vZGUgfCBudWxsXHJcbiAgcmVhZG9ubHkgZmFpbGVkOiBzdHJpbmcgfCBudWxsXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzdGVwT2soZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgcmV0dXJuIHsgZG9jLCBmYWlsZWQ6IG51bGwgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc3RlcEZhaWwocmVhc29uOiBzdHJpbmcpOiBTdGVwUmVzdWx0IHtcclxuICByZXR1cm4geyBkb2M6IG51bGwsIGZhaWxlZDogcmVhc29uIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEFuIGF0b21pYywgaW52ZXJ0aWJsZSBkb2N1bWVudCBjaGFuZ2UuIFN0ZXBzIGFyZSB0aGUgb25seSB3YXkgZG9jdW1lbnRzXHJcbiAqIGNoYW5nZTsgZXZlcnkgc3RlcCBrbm93cyBob3cgdG8gdW5kbyBpdHNlbGYgYW5kIGhvdyB0byByZW1hcCBwb3NpdGlvbnNcclxuICogdGhyb3VnaCBpdHNlbGYuXHJcbiAqL1xyXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU3RlcCBpbXBsZW1lbnRzIFBvc2l0aW9uTWFwcGVyIHtcclxuICAvKiogQXBwbHkgdG8gYSBkb2N1bWVudC4gTmV2ZXIgdGhyb3dzLCByZXR1cm5zIGEgZmFpbHVyZSByZXN1bHQgaW5zdGVhZC4gKi9cclxuICBhYnN0cmFjdCBhcHBseShkb2M6IEVkaXRvck5vZGUpOiBTdGVwUmVzdWx0XHJcblxyXG4gIC8qKiBQcm9kdWNlIHRoZSBzdGVwIHRoYXQgdW5kb2VzIHRoaXMgb25lLCBnaXZlbiB0aGUgZG9jdW1lbnQgaXQgYXBwbGllZCB0by4gKi9cclxuICBhYnN0cmFjdCBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcFxyXG5cclxuICAvKiogUmVtYXAgYSBwcmUtc3RlcCBwb3NpdGlvbiB0byBpdHMgcG9zdC1zdGVwIGVxdWl2YWxlbnQuICovXHJcbiAgYWJzdHJhY3QgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBiaWFzPzogQmlhcyk6IFBvc2l0aW9uXHJcblxyXG4gIGFic3RyYWN0IHRvSlNPTigpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEZyYWdtZW50IH0gZnJvbSAnLi4vLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IGlubGluZUxlbmd0aCwgcmVwbGFjZUlubGluZSwgc2xpY2VJbmxpbmUgfSBmcm9tICcuLi8uLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCBwYXRoc0VxdWFsLCB1cGRhdGVBdFBhdGggfSBmcm9tICcuLi8uLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyB0eXBlIEJpYXMsIFN0ZXAsIHR5cGUgU3RlcFJlc3VsdCwgc3RlcEZhaWwsIHN0ZXBPayB9IGZyb20gJy4uL3N0ZXAnXHJcblxyXG4vKipcclxuICogUmVwbGFjZSB0aGUgaW5saW5lIHJhbmdlIFtmcm9tLCB0bykgaW5zaWRlIHRoZSB0ZXh0YmxvY2sgYXQgYGJsb2NrUGF0aGBcclxuICogd2l0aCBhbiBpbmxpbmUgZnJhZ21lbnQuIENvdmVycyB0ZXh0IGluc2VydGlvbiAoZnJvbSA9PT0gdG8pLCBkZWxldGlvblxyXG4gKiAoZW1wdHkgZnJhZ21lbnQpIGFuZCByZXBsYWNlbWVudC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBSZXBsYWNlSW5saW5lU3RlcCBleHRlbmRzIFN0ZXAge1xyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcmVhZG9ubHkgYmxvY2tQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICAgIHJlYWRvbmx5IGluc2VydDogRnJhZ21lbnQsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAoZnJvbSA+IHRvIHx8IGZyb20gPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgSW52YWxpZCBpbmxpbmUgcmFuZ2UgWyR7ZnJvbX0sICR7dG99KWApXHJcbiAgfVxyXG5cclxuICBnZXQgaW5zZXJ0TGVuZ3RoKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gaW5saW5lTGVuZ3RoKHRoaXMuaW5zZXJ0KVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoZG9jLCB0aGlzLmJsb2NrUGF0aClcclxuICAgIGlmICghYmxvY2spIHJldHVybiBzdGVwRmFpbCgnUmVwbGFjZUlubGluZVN0ZXA6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBpZiAoIWJsb2NrLmlzVGV4dGJsb2NrKSByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VJbmxpbmVTdGVwOiB0YXJnZXQgaXMgbm90IGEgdGV4dGJsb2NrJylcclxuICAgIGlmICh0aGlzLnRvID4gaW5saW5lTGVuZ3RoKGJsb2NrLmNvbnRlbnQpKVxyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VJbmxpbmVTdGVwOiByYW5nZSBvdXQgb2YgYm91bmRzJylcclxuICAgIGlmICh0aGlzLmluc2VydC5jaGlsZHJlbi5zb21lKChjaGlsZCkgPT4gIWNoaWxkLmlzSW5saW5lKSkge1xyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VJbmxpbmVTdGVwOiBmcmFnbWVudCBjb250YWlucyBub24taW5saW5lIG5vZGVzJylcclxuICAgIH1cclxuICAgIHJldHVybiBzdGVwT2soXHJcbiAgICAgIHVwZGF0ZUF0UGF0aChkb2MsIHRoaXMuYmxvY2tQYXRoLCAobm9kZSkgPT5cclxuICAgICAgICBub2RlLndpdGhDb250ZW50KHJlcGxhY2VJbmxpbmUobm9kZS5jb250ZW50LCB0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMuaW5zZXJ0KSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcCB7XHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoZG9jQmVmb3JlLCB0aGlzLmJsb2NrUGF0aClcclxuICAgIGlmICghYmxvY2spIHRocm93IG5ldyBSYW5nZUVycm9yKCdSZXBsYWNlSW5saW5lU3RlcC5pbnZlcnQ6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBjb25zdCByZW1vdmVkID0gc2xpY2VJbmxpbmUoYmxvY2suY29udGVudCwgdGhpcy5mcm9tLCB0aGlzLnRvKVxyXG4gICAgcmV0dXJuIG5ldyBSZXBsYWNlSW5saW5lU3RlcCh0aGlzLmJsb2NrUGF0aCwgdGhpcy5mcm9tLCB0aGlzLmZyb20gKyB0aGlzLmluc2VydExlbmd0aCwgcmVtb3ZlZClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIG1hcFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgYmlhczogQmlhcyA9IDEpOiBQb3NpdGlvbiB7XHJcbiAgICBpZiAoIXBhdGhzRXF1YWwocG9zaXRpb24ucGF0aCwgdGhpcy5ibG9ja1BhdGgpKSByZXR1cm4gcG9zaXRpb25cclxuICAgIGNvbnN0IHsgb2Zmc2V0IH0gPSBwb3NpdGlvblxyXG4gICAgaWYgKG9mZnNldCA8IHRoaXMuZnJvbSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBjb25zdCBkZWx0YSA9IHRoaXMuaW5zZXJ0TGVuZ3RoIC0gKHRoaXMudG8gLSB0aGlzLmZyb20pXHJcbiAgICBpZiAob2Zmc2V0ID4gdGhpcy50bykgcmV0dXJuIHsgcGF0aDogcG9zaXRpb24ucGF0aCwgb2Zmc2V0OiBvZmZzZXQgKyBkZWx0YSB9XHJcbiAgICAvLyBJbnNpZGUgKG9yIGF0IHRoZSBlZGdlIG9mKSB0aGUgcmVwbGFjZWQgcmFuZ2UuXHJcbiAgICBjb25zdCBtYXBwZWQgPSBiaWFzIDwgMCA/IHRoaXMuZnJvbSA6IHRoaXMuZnJvbSArIHRoaXMuaW5zZXJ0TGVuZ3RoXHJcbiAgICByZXR1cm4geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IG1hcHBlZCB9XHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RlcFR5cGU6ICdyZXBsYWNlSW5saW5lJyxcclxuICAgICAgYmxvY2tQYXRoOiBbLi4udGhpcy5ibG9ja1BhdGhdLFxyXG4gICAgICBmcm9tOiB0aGlzLmZyb20sXHJcbiAgICAgIHRvOiB0aGlzLnRvLFxyXG4gICAgICBpbnNlcnQ6IHRoaXMuaW5zZXJ0LnRvSlNPTigpLFxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBGcmFnbWVudCB9IGZyb20gJy4uLy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi8uLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCwgcGF0aFN0YXJ0c1dpdGgsIHVwZGF0ZUF0UGF0aCB9IGZyb20gJy4uLy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IHR5cGUgQmlhcywgU3RlcCwgdHlwZSBTdGVwUmVzdWx0LCBzdGVwRmFpbCwgc3RlcE9rIH0gZnJvbSAnLi4vc3RlcCdcclxuXHJcbi8qKlxyXG4gKiBSZXBsYWNlIHRoZSBjaGlsZHJlbiBbZnJvbSwgdG8pIG9mIHRoZSBlbGVtZW50IG5vZGUgYXQgYHBhcmVudFBhdGhgIHdpdGggYVxyXG4gKiBmcmFnbWVudC4gQ292ZXJzIG5vZGUgaW5zZXJ0aW9uIChmcm9tID09PSB0bykgYW5kIHJlbW92YWwgKGVtcHR5IGZyYWdtZW50KS5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBSZXBsYWNlTm9kZXNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICAgIHJlYWRvbmx5IGluc2VydDogRnJhZ21lbnQsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAoZnJvbSA+IHRvIHx8IGZyb20gPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgSW52YWxpZCBjaGlsZCByYW5nZSBbJHtmcm9tfSwgJHt0b30pYClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGFwcGx5KGRvYzogRWRpdG9yTm9kZSk6IFN0ZXBSZXN1bHQge1xyXG4gICAgY29uc3QgcGFyZW50ID0gbm9kZUF0UGF0aChkb2MsIHRoaXMucGFyZW50UGF0aClcclxuICAgIGlmICghcGFyZW50KSByZXR1cm4gc3RlcEZhaWwoJ1JlcGxhY2VOb2Rlc1N0ZXA6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBpZiAocGFyZW50LmlzVGV4dGJsb2NrIHx8IHBhcmVudC5pc1RleHQpIHtcclxuICAgICAgcmV0dXJuIHN0ZXBGYWlsKCdSZXBsYWNlTm9kZXNTdGVwOiB0YXJnZXQgY2hpbGRyZW4gYXJlIGlubGluZTsgdXNlIFJlcGxhY2VJbmxpbmVTdGVwJylcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnRvID4gcGFyZW50LmNoaWxkQ291bnQpIHJldHVybiBzdGVwRmFpbCgnUmVwbGFjZU5vZGVzU3RlcDogcmFuZ2Ugb3V0IG9mIGJvdW5kcycpXHJcbiAgICByZXR1cm4gc3RlcE9rKFxyXG4gICAgICB1cGRhdGVBdFBhdGgoZG9jLCB0aGlzLnBhcmVudFBhdGgsIChub2RlKSA9PlxyXG4gICAgICAgIG5vZGUud2l0aENvbnRlbnQobm9kZS5jb250ZW50LnJlcGxhY2VSYW5nZSh0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMuaW5zZXJ0KSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcCB7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvY0JlZm9yZSwgdGhpcy5wYXJlbnRQYXRoKVxyXG4gICAgaWYgKCFwYXJlbnQpIHRocm93IG5ldyBSYW5nZUVycm9yKCdSZXBsYWNlTm9kZXNTdGVwLmludmVydDogbm8gbm9kZSBhdCBwYXRoJylcclxuICAgIGNvbnN0IHJlbW92ZWQgPSBwYXJlbnQuY29udGVudC5zbGljZSh0aGlzLmZyb20sIHRoaXMudG8pXHJcbiAgICByZXR1cm4gbmV3IFJlcGxhY2VOb2Rlc1N0ZXAoXHJcbiAgICAgIHRoaXMucGFyZW50UGF0aCxcclxuICAgICAgdGhpcy5mcm9tLFxyXG4gICAgICB0aGlzLmZyb20gKyB0aGlzLmluc2VydC5jaGlsZENvdW50LFxyXG4gICAgICByZW1vdmVkLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBiaWFzOiBCaWFzID0gMSk6IFBvc2l0aW9uIHtcclxuICAgIGlmICghcGF0aFN0YXJ0c1dpdGgocG9zaXRpb24ucGF0aCwgdGhpcy5wYXJlbnRQYXRoKSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBjb25zdCBkZWx0YSA9IHRoaXMuaW5zZXJ0LmNoaWxkQ291bnQgLSAodGhpcy50byAtIHRoaXMuZnJvbSlcclxuICAgIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gdGhpcy5wYXJlbnRQYXRoLmxlbmd0aCkge1xyXG4gICAgICAvLyBUaGUgb2Zmc2V0IGlzIGEgY2hpbGQgaW5kZXggaW4gdGhlIHBhcmVudCBpdHNlbGYuXHJcbiAgICAgIGNvbnN0IGluZGV4ID0gcG9zaXRpb24ub2Zmc2V0XHJcbiAgICAgIGlmIChpbmRleCA8IHRoaXMuZnJvbSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICAgIGlmIChpbmRleCA+PSB0aGlzLnRvKSByZXR1cm4geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IGluZGV4ICsgZGVsdGEgfVxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHBhdGg6IHBvc2l0aW9uLnBhdGgsXHJcbiAgICAgICAgb2Zmc2V0OiBiaWFzIDwgMCA/IHRoaXMuZnJvbSA6IHRoaXMuZnJvbSArIHRoaXMuaW5zZXJ0LmNoaWxkQ291bnQsXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IGNoaWxkSW5kZXggPSBwb3NpdGlvbi5wYXRoW3RoaXMucGFyZW50UGF0aC5sZW5ndGhdIGFzIG51bWJlclxyXG4gICAgaWYgKGNoaWxkSW5kZXggPCB0aGlzLmZyb20pIHJldHVybiBwb3NpdGlvblxyXG4gICAgaWYgKGNoaWxkSW5kZXggPj0gdGhpcy50bykge1xyXG4gICAgICBjb25zdCBwYXRoID0gWy4uLnBvc2l0aW9uLnBhdGhdXHJcbiAgICAgIHBhdGhbdGhpcy5wYXJlbnRQYXRoLmxlbmd0aF0gPSBjaGlsZEluZGV4ICsgZGVsdGFcclxuICAgICAgcmV0dXJuIHsgcGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgLy8gVGhlIHBvc2l0aW9uIGxpdmVkIGluc2lkZSBhIHJlcGxhY2VkIG5vZGUsIGRlZ3JhZGUgdG8gYSBwYXJlbnQgaW5kZXguXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBwYXRoOiB0aGlzLnBhcmVudFBhdGgsXHJcbiAgICAgIG9mZnNldDogYmlhcyA8IDAgPyB0aGlzLmZyb20gOiB0aGlzLmZyb20gKyB0aGlzLmluc2VydC5jaGlsZENvdW50LFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0ZXBUeXBlOiAncmVwbGFjZU5vZGVzJyxcclxuICAgICAgcGFyZW50UGF0aDogWy4uLnRoaXMucGFyZW50UGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIGluc2VydDogdGhpcy5pbnNlcnQudG9KU09OKCksXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKiogQ29udmVuaWVuY2U6IHJlcGxhY2UgdGhlIHNpbmdsZSBub2RlIGF0IGBwYXRoYCB3aXRoIGEgZnJhZ21lbnQuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByZXBsYWNlTm9kZUF0KHBhdGg6IFBhdGgsIGluc2VydDogRnJhZ21lbnQpOiBSZXBsYWNlTm9kZXNTdGVwIHtcclxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3QgcmVwbGFjZSB0aGUgcm9vdCBub2RlJylcclxuICBjb25zdCBpbmRleCA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICByZXR1cm4gbmV3IFJlcGxhY2VOb2Rlc1N0ZXAocGF0aC5zbGljZSgwLCAtMSksIGluZGV4LCBpbmRleCArIDEsIGluc2VydClcclxufVxyXG4iLCAiaW1wb3J0IHsgYXBwbHlJbmxpbmVNYXJrLCBpbmxpbmVMZW5ndGggfSBmcm9tICcuLi8uLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgTWFyayB9IGZyb20gJy4uLy4uL21vZGVsL21hcmsnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCB1cGRhdGVBdFBhdGggfSBmcm9tICcuLi8uLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBTdGVwLCB0eXBlIFN0ZXBSZXN1bHQsIHN0ZXBGYWlsLCBzdGVwT2sgfSBmcm9tICcuLi9zdGVwJ1xyXG5cclxuYWJzdHJhY3QgY2xhc3MgTWFya1N0ZXAgZXh0ZW5kcyBTdGVwIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IGJsb2NrUGF0aDogUGF0aCxcclxuICAgIHJlYWRvbmx5IGZyb206IG51bWJlcixcclxuICAgIHJlYWRvbmx5IHRvOiBudW1iZXIsXHJcbiAgICByZWFkb25seSBtYXJrOiBNYXJrLFxyXG4gICkge1xyXG4gICAgc3VwZXIoKVxyXG4gICAgaWYgKGZyb20gPiB0byB8fCBmcm9tIDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoYEludmFsaWQgbWFyayByYW5nZSBbJHtmcm9tfSwgJHt0b30pYClcclxuICB9XHJcblxyXG4gIHByb3RlY3RlZCBhcHBseU1hcmsoZG9jOiBFZGl0b3JOb2RlLCBhZGQ6IGJvb2xlYW4sIG5hbWU6IHN0cmluZyk6IFN0ZXBSZXN1bHQge1xyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5ibG9ja1BhdGgpXHJcbiAgICBpZiAoIWJsb2NrKSByZXR1cm4gc3RlcEZhaWwoYCR7bmFtZX06IG5vIG5vZGUgYXQgcGF0aGApXHJcbiAgICBpZiAoIWJsb2NrLmlzVGV4dGJsb2NrKSByZXR1cm4gc3RlcEZhaWwoYCR7bmFtZX06IHRhcmdldCBpcyBub3QgYSB0ZXh0YmxvY2tgKVxyXG4gICAgaWYgKHRoaXMudG8gPiBpbmxpbmVMZW5ndGgoYmxvY2suY29udGVudCkpIHJldHVybiBzdGVwRmFpbChgJHtuYW1lfTogcmFuZ2Ugb3V0IG9mIGJvdW5kc2ApXHJcbiAgICBpZiAoIWJsb2NrLnR5cGUuYWxsb3dzTWFya1R5cGUodGhpcy5tYXJrLnR5cGUpKSB7XHJcbiAgICAgIHJldHVybiBzdGVwRmFpbChgJHtuYW1lfTogbWFyayBcIiR7dGhpcy5tYXJrLnR5cGUubmFtZX1cIiBub3QgYWxsb3dlZCBoZXJlYClcclxuICAgIH1cclxuICAgIHJldHVybiBzdGVwT2soXHJcbiAgICAgIHVwZGF0ZUF0UGF0aChkb2MsIHRoaXMuYmxvY2tQYXRoLCAobm9kZSkgPT5cclxuICAgICAgICBub2RlLndpdGhDb250ZW50KGFwcGx5SW5saW5lTWFyayhub2RlLmNvbnRlbnQsIHRoaXMuZnJvbSwgdGhpcy50bywgdGhpcy5tYXJrLCBhZGQpKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICB9XHJcblxyXG4gIC8qKiBNYXJrIHN0ZXBzIG5ldmVyIG1vdmUgY29udGVudC4gKi9cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgICByZXR1cm4gcG9zaXRpb25cclxuICB9XHJcbn1cclxuXHJcbi8qKiBBZGQgYSBtYXJrIGFjcm9zcyBhbiBpbmxpbmUgcmFuZ2UuICovXHJcbmV4cG9ydCBjbGFzcyBBZGRNYXJrU3RlcCBleHRlbmRzIE1hcmtTdGVwIHtcclxuICBvdmVycmlkZSBhcHBseShkb2M6IEVkaXRvck5vZGUpOiBTdGVwUmVzdWx0IHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5TWFyayhkb2MsIHRydWUsICdBZGRNYXJrU3RlcCcpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoKTogU3RlcCB7XHJcbiAgICByZXR1cm4gbmV3IFJlbW92ZU1hcmtTdGVwKHRoaXMuYmxvY2tQYXRoLCB0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMubWFyaylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHRvSlNPTigpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGVwVHlwZTogJ2FkZE1hcmsnLFxyXG4gICAgICBibG9ja1BhdGg6IFsuLi50aGlzLmJsb2NrUGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIG1hcms6IHRoaXMubWFyay50b0pTT04oKSxcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW1vdmUgYSBtYXJrIGFjcm9zcyBhbiBpbmxpbmUgcmFuZ2UuIEZvciBleGFjdCBpbnZlcnRpYmlsaXR5LCBlbWl0IHRoZXNlXHJcbiAqIG9ubHkgb3ZlciByYW5nZXMgd2hlcmUgdGhlIG1hcmsgaXMgYWN0dWFsbHkgcHJlc2VudCAoc2VlIGByYW5nZXNXaXRoTWFya2ApLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFJlbW92ZU1hcmtTdGVwIGV4dGVuZHMgTWFya1N0ZXAge1xyXG4gIG92ZXJyaWRlIGFwcGx5KGRvYzogRWRpdG9yTm9kZSk6IFN0ZXBSZXN1bHQge1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHlNYXJrKGRvYywgZmFsc2UsICdSZW1vdmVNYXJrU3RlcCcpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoKTogU3RlcCB7XHJcbiAgICByZXR1cm4gbmV3IEFkZE1hcmtTdGVwKHRoaXMuYmxvY2tQYXRoLCB0aGlzLmZyb20sIHRoaXMudG8sIHRoaXMubWFyaylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHRvSlNPTigpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGVwVHlwZTogJ3JlbW92ZU1hcmsnLFxyXG4gICAgICBibG9ja1BhdGg6IFsuLi50aGlzLmJsb2NrUGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIG1hcms6IHRoaXMubWFyay50b0pTT04oKSxcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgQXR0cnMgfSBmcm9tICcuLi8uLi9tb2RlbC9hdHRycydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgeyB0eXBlIFBhdGgsIG5vZGVBdFBhdGgsIHVwZGF0ZUF0UGF0aCB9IGZyb20gJy4uLy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IFN0ZXAsIHR5cGUgU3RlcFJlc3VsdCwgc3RlcEZhaWwsIHN0ZXBPayB9IGZyb20gJy4uL3N0ZXAnXHJcblxyXG4vKiogUmVwbGFjZSB0aGUgYXR0cmlidXRlcyBvZiB0aGUgbm9kZSBhdCBgcGF0aGAuICovXHJcbmV4cG9ydCBjbGFzcyBTZXROb2RlQXR0cnNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgYXR0cnM6IEF0dHJzLFxyXG4gICkge1xyXG4gICAgc3VwZXIoKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2MsIHRoaXMucGF0aClcclxuICAgIGlmICghbm9kZSkgcmV0dXJuIHN0ZXBGYWlsKCdTZXROb2RlQXR0cnNTdGVwOiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgaWYgKG5vZGUuaXNUZXh0KSByZXR1cm4gc3RlcEZhaWwoJ1NldE5vZGVBdHRyc1N0ZXA6IHRleHQgbm9kZXMgaGF2ZSBubyBhdHRyaWJ1dGVzJylcclxuICAgIHJldHVybiBzdGVwT2sodXBkYXRlQXRQYXRoKGRvYywgdGhpcy5wYXRoLCAodGFyZ2V0KSA9PiB0YXJnZXQud2l0aEF0dHJzKHRoaXMuYXR0cnMpKSlcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGludmVydChkb2NCZWZvcmU6IEVkaXRvck5vZGUpOiBTdGVwIHtcclxuICAgIGNvbnN0IG5vZGUgPSBub2RlQXRQYXRoKGRvY0JlZm9yZSwgdGhpcy5wYXRoKVxyXG4gICAgaWYgKCFub2RlKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignU2V0Tm9kZUF0dHJzU3RlcC5pbnZlcnQ6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICByZXR1cm4gbmV3IFNldE5vZGVBdHRyc1N0ZXAodGhpcy5wYXRoLCBub2RlLmF0dHJzKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvc2l0aW9uXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHsgc3RlcFR5cGU6ICdzZXROb2RlQXR0cnMnLCBwYXRoOiBbLi4udGhpcy5wYXRoXSwgYXR0cnM6IHsgLi4udGhpcy5hdHRycyB9IH1cclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgQXR0cnMgfSBmcm9tICcuLi8uLi9tb2RlbC9hdHRycydcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi8uLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgaW5saW5lTGVuZ3RoLCBtZXJnZUlubGluZSwgc2xpY2VJbmxpbmUgfSBmcm9tICcuLi8uLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCBwYXRoU3RhcnRzV2l0aCwgcGF0aHNFcXVhbCwgdXBkYXRlQXRQYXRoIH0gZnJvbSAnLi4vLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHsgdHlwZSBCaWFzLCBTdGVwLCB0eXBlIFN0ZXBSZXN1bHQsIHN0ZXBGYWlsLCBzdGVwT2sgfSBmcm9tICcuLi9zdGVwJ1xyXG5cclxuZnVuY3Rpb24gc2libGluZ1NoaWZ0KFxyXG4gIHBvc2l0aW9uOiBQb3NpdGlvbixcclxuICBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gIGZyb21JbmRleDogbnVtYmVyLFxyXG4gIGRlbHRhOiBudW1iZXIsXHJcbik6IFBvc2l0aW9uIHwgbnVsbCB7XHJcbiAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCBwYXJlbnRQYXRoKSkgcmV0dXJuIG51bGxcclxuICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHBhcmVudFBhdGgubGVuZ3RoKSB7XHJcbiAgICByZXR1cm4gcG9zaXRpb24ub2Zmc2V0ID4gZnJvbUluZGV4XHJcbiAgICAgID8geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IHBvc2l0aW9uLm9mZnNldCArIGRlbHRhIH1cclxuICAgICAgOiBwb3NpdGlvblxyXG4gIH1cclxuICBjb25zdCBpbmRleCA9IHBvc2l0aW9uLnBhdGhbcGFyZW50UGF0aC5sZW5ndGhdIGFzIG51bWJlclxyXG4gIGlmIChpbmRleCA8PSBmcm9tSW5kZXgpIHJldHVybiBwb3NpdGlvblxyXG4gIGNvbnN0IHBhdGggPSBbLi4ucG9zaXRpb24ucGF0aF1cclxuICBwYXRoW3BhcmVudFBhdGgubGVuZ3RoXSA9IGluZGV4ICsgZGVsdGFcclxuICByZXR1cm4geyBwYXRoLCBvZmZzZXQ6IHBvc2l0aW9uLm9mZnNldCB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTcGxpdCB0aGUgdGV4dGJsb2NrIGF0IGBwYXRoYCBhdCBpbmxpbmUgb2Zmc2V0IGBvZmZzZXRgLiBUaGUgc2Vjb25kIGhhbGZcclxuICogYmVjb21lcyB0aGUgbmV4dCBzaWJsaW5nLCBvZiB0eXBlIGBhZnRlclR5cGVgIChkZWZhdWx0cyB0byB0aGUgc2FtZSB0eXBlXHJcbiAqIGFuZCBhdHRyaWJ1dGVzKS5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBTcGxpdE5vZGVTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgb2Zmc2V0OiBudW1iZXIsXHJcbiAgICByZWFkb25seSBhZnRlclR5cGU/OiBzdHJpbmcsXHJcbiAgICByZWFkb25seSBhZnRlckF0dHJzPzogQXR0cnMsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3Qgc3BsaXQgdGhlIHJvb3Qgbm9kZScpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBhcHBseShkb2M6IEVkaXRvck5vZGUpOiBTdGVwUmVzdWx0IHtcclxuICAgIGNvbnN0IG5vZGUgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5wYXRoKVxyXG4gICAgaWYgKCFub2RlKSByZXR1cm4gc3RlcEZhaWwoJ1NwbGl0Tm9kZVN0ZXA6IG5vIG5vZGUgYXQgcGF0aCcpXHJcbiAgICBpZiAoIW5vZGUuaXNUZXh0YmxvY2spIHJldHVybiBzdGVwRmFpbCgnU3BsaXROb2RlU3RlcDogb25seSB0ZXh0YmxvY2tzIGNhbiBiZSBzcGxpdCcpXHJcbiAgICBjb25zdCBsZW5ndGggPSBpbmxpbmVMZW5ndGgobm9kZS5jb250ZW50KVxyXG4gICAgaWYgKHRoaXMub2Zmc2V0ID4gbGVuZ3RoKSByZXR1cm4gc3RlcEZhaWwoJ1NwbGl0Tm9kZVN0ZXA6IG9mZnNldCBvdXQgb2YgYm91bmRzJylcclxuICAgIGNvbnN0IGJlZm9yZSA9IHNsaWNlSW5saW5lKG5vZGUuY29udGVudCwgMCwgdGhpcy5vZmZzZXQpXHJcbiAgICBjb25zdCBhZnRlciA9IHNsaWNlSW5saW5lKG5vZGUuY29udGVudCwgdGhpcy5vZmZzZXQsIGxlbmd0aClcclxuICAgIGNvbnN0IHNjaGVtYSA9IG5vZGUudHlwZS5zY2hlbWFcclxuICAgIGNvbnN0IHNlY29uZFR5cGUgPSB0aGlzLmFmdGVyVHlwZSA/IHNjaGVtYS5ub2RlVHlwZSh0aGlzLmFmdGVyVHlwZSkgOiBub2RlLnR5cGVcclxuICAgIGNvbnN0IHNlY29uZEF0dHJzID0gdGhpcy5hZnRlclR5cGUgPyB0aGlzLmFmdGVyQXR0cnMgOiAodGhpcy5hZnRlckF0dHJzID8/IG5vZGUuYXR0cnMpXHJcbiAgICBjb25zdCBzZWNvbmQgPSBzZWNvbmRUeXBlLmNyZWF0ZShzZWNvbmRBdHRycywgYWZ0ZXIpXHJcbiAgICBjb25zdCBmaXJzdCA9IG5vZGUud2l0aENvbnRlbnQoYmVmb3JlKVxyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IHRoaXMucGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gdGhpcy5wYXRoW3RoaXMucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIHJldHVybiBzdGVwT2soXHJcbiAgICAgIHVwZGF0ZUF0UGF0aChkb2MsIHBhcmVudFBhdGgsIChwYXJlbnQpID0+XHJcbiAgICAgICAgcGFyZW50LndpdGhDb250ZW50KFxyXG4gICAgICAgICAgcGFyZW50LmNvbnRlbnQucmVwbGFjZVJhbmdlKGluZGV4LCBpbmRleCArIDEsIEZyYWdtZW50Lm9mKGZpcnN0LCBzZWNvbmQpKSxcclxuICAgICAgICApLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgaW52ZXJ0KCk6IFN0ZXAge1xyXG4gICAgcmV0dXJuIG5ldyBKb2luTm9kZXNTdGVwKHRoaXMucGF0aCwgdGhpcy5vZmZzZXQpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGJpYXM6IEJpYXMgPSAxKTogUG9zaXRpb24ge1xyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IHRoaXMucGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gdGhpcy5wYXRoW3RoaXMucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGlmIChwYXRoc0VxdWFsKHBvc2l0aW9uLnBhdGgsIHRoaXMucGF0aCkpIHtcclxuICAgICAgaWYgKHBvc2l0aW9uLm9mZnNldCA8IHRoaXMub2Zmc2V0KSByZXR1cm4gcG9zaXRpb25cclxuICAgICAgaWYgKHBvc2l0aW9uLm9mZnNldCA9PT0gdGhpcy5vZmZzZXQgJiYgYmlhcyA8IDApIHJldHVybiBwb3NpdGlvblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHBhdGg6IFsuLi5wYXJlbnRQYXRoLCBpbmRleCArIDFdLFxyXG4gICAgICAgIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0IC0gdGhpcy5vZmZzZXQsXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBzaWJsaW5nU2hpZnQocG9zaXRpb24sIHBhcmVudFBhdGgsIGluZGV4LCAxKSA/PyBwb3NpdGlvblxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0ZXBUeXBlOiAnc3BsaXROb2RlJyxcclxuICAgICAgcGF0aDogWy4uLnRoaXMucGF0aF0sXHJcbiAgICAgIG9mZnNldDogdGhpcy5vZmZzZXQsXHJcbiAgICAgIC4uLih0aGlzLmFmdGVyVHlwZSA/IHsgYWZ0ZXJUeXBlOiB0aGlzLmFmdGVyVHlwZSB9IDoge30pLFxyXG4gICAgICAuLi4odGhpcy5hZnRlckF0dHJzID8geyBhZnRlckF0dHJzOiB7IC4uLnRoaXMuYWZ0ZXJBdHRycyB9IH0gOiB7fSksXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogSm9pbiB0aGUgdGV4dGJsb2NrIGF0IGBwYXRoYCB3aXRoIGl0cyBuZXh0IHNpYmxpbmcsIGFic29yYmluZyB0aGUgc2libGluZydzXHJcbiAqIGlubGluZSBjb250ZW50LiBgam9pbk9mZnNldGAgbXVzdCBlcXVhbCB0aGUgZmlyc3QgYmxvY2sncyBpbmxpbmUgbGVuZ3RoLlxyXG4gKiBJdCBtYWtlcyBwb3NpdGlvbiBtYXBwaW5nIGRvY3VtZW50LWluZGVwZW5kZW50LlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIEpvaW5Ob2Rlc1N0ZXAgZXh0ZW5kcyBTdGVwIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IHBhdGg6IFBhdGgsXHJcbiAgICByZWFkb25seSBqb2luT2Zmc2V0OiBudW1iZXIsXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpXHJcbiAgICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3Qgam9pbiB0aGUgcm9vdCBub2RlJylcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGFwcGx5KGRvYzogRWRpdG9yTm9kZSk6IFN0ZXBSZXN1bHQge1xyXG4gICAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCB0aGlzLnBhdGgpXHJcbiAgICBpZiAoIW5vZGUpIHJldHVybiBzdGVwRmFpbCgnSm9pbk5vZGVzU3RlcDogbm8gbm9kZSBhdCBwYXRoJylcclxuICAgIGlmICghbm9kZS5pc1RleHRibG9jaykgcmV0dXJuIHN0ZXBGYWlsKCdKb2luTm9kZXNTdGVwOiBvbmx5IHRleHRibG9ja3MgY2FuIGJlIGpvaW5lZCcpXHJcbiAgICBpZiAoaW5saW5lTGVuZ3RoKG5vZGUuY29udGVudCkgIT09IHRoaXMuam9pbk9mZnNldCkge1xyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ0pvaW5Ob2Rlc1N0ZXA6IGpvaW5PZmZzZXQgZG9lcyBub3QgbWF0Y2ggdGhlIGJsb2NrIGxlbmd0aCcpXHJcbiAgICB9XHJcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gdGhpcy5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgY29uc3QgaW5kZXggPSB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgY29uc3QgcGFyZW50ID0gbm9kZUF0UGF0aChkb2MsIHBhcmVudFBhdGgpXHJcbiAgICBjb25zdCBuZXh0ID0gcGFyZW50Py5jb250ZW50Lm1heWJlQ2hpbGQoaW5kZXggKyAxKVxyXG4gICAgaWYgKCFuZXh0KSByZXR1cm4gc3RlcEZhaWwoJ0pvaW5Ob2Rlc1N0ZXA6IG5vIG5leHQgc2libGluZyB0byBqb2luIHdpdGgnKVxyXG4gICAgaWYgKCFuZXh0LmlzVGV4dGJsb2NrKSByZXR1cm4gc3RlcEZhaWwoJ0pvaW5Ob2Rlc1N0ZXA6IG5leHQgc2libGluZyBpcyBub3QgYSB0ZXh0YmxvY2snKVxyXG4gICAgY29uc3Qgam9pbmVkID0gbm9kZS53aXRoQ29udGVudChtZXJnZUlubGluZShub2RlLmNvbnRlbnQuYXBwZW5kKG5leHQuY29udGVudCkpKVxyXG4gICAgcmV0dXJuIHN0ZXBPayhcclxuICAgICAgdXBkYXRlQXRQYXRoKGRvYywgcGFyZW50UGF0aCwgKHRhcmdldCkgPT5cclxuICAgICAgICB0YXJnZXQud2l0aENvbnRlbnQodGFyZ2V0LmNvbnRlbnQucmVwbGFjZVJhbmdlKGluZGV4LCBpbmRleCArIDIsIEZyYWdtZW50Lm9mKGpvaW5lZCkpKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGludmVydChkb2NCZWZvcmU6IEVkaXRvck5vZGUpOiBTdGVwIHtcclxuICAgIGNvbnN0IHBhcmVudFBhdGggPSB0aGlzLnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBjb25zdCBpbmRleCA9IHRoaXMucGF0aFt0aGlzLnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvY0JlZm9yZSwgcGFyZW50UGF0aClcclxuICAgIGNvbnN0IG5leHQgPSBwYXJlbnQ/LmNvbnRlbnQubWF5YmVDaGlsZChpbmRleCArIDEpXHJcbiAgICBpZiAoIW5leHQpIHRocm93IG5ldyBSYW5nZUVycm9yKCdKb2luTm9kZXNTdGVwLmludmVydDogbm8gbmV4dCBzaWJsaW5nJylcclxuICAgIHJldHVybiBuZXcgU3BsaXROb2RlU3RlcCh0aGlzLnBhdGgsIHRoaXMuam9pbk9mZnNldCwgbmV4dC50eXBlLm5hbWUsIG5leHQuYXR0cnMpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gdGhpcy5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgY29uc3QgaW5kZXggPSB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgY29uc3QgbmV4dFBhdGggPSBbLi4ucGFyZW50UGF0aCwgaW5kZXggKyAxXVxyXG4gICAgaWYgKHBhdGhzRXF1YWwocG9zaXRpb24ucGF0aCwgbmV4dFBhdGgpKSB7XHJcbiAgICAgIHJldHVybiB7IHBhdGg6IHRoaXMucGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgKyB0aGlzLmpvaW5PZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCBwYXJlbnRQYXRoKSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHBhcmVudFBhdGgubGVuZ3RoKSB7XHJcbiAgICAgIC8vIEEgY2hpbGQgaW5kZXggYXQgb3IgcGFzdCB0aGUgcmVtb3ZlZCBzaWJsaW5nIHNoaWZ0cyBsZWZ0IGJ5IG9uZS5cclxuICAgICAgcmV0dXJuIHBvc2l0aW9uLm9mZnNldCA+PSBpbmRleCArIDJcclxuICAgICAgICA/IHsgcGF0aDogcG9zaXRpb24ucGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgLSAxIH1cclxuICAgICAgICA6IHBvc2l0aW9uXHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGlsZEluZGV4ID0gcG9zaXRpb24ucGF0aFtwYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBpZiAoY2hpbGRJbmRleCA+PSBpbmRleCArIDIpIHtcclxuICAgICAgY29uc3QgcGF0aCA9IFsuLi5wb3NpdGlvbi5wYXRoXVxyXG4gICAgICBwYXRoW3BhcmVudFBhdGgubGVuZ3RoXSA9IGNoaWxkSW5kZXggLSAxXHJcbiAgICAgIHJldHVybiB7IHBhdGgsIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0IH1cclxuICAgIH1cclxuICAgIHJldHVybiBwb3NpdGlvblxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7IHN0ZXBUeXBlOiAnam9pbk5vZGVzJywgcGF0aDogWy4uLnRoaXMucGF0aF0sIGpvaW5PZmZzZXQ6IHRoaXMuam9pbk9mZnNldCB9XHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4uLy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi8uLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCwgcGF0aFN0YXJ0c1dpdGgsIHVwZGF0ZUF0UGF0aCB9IGZyb20gJy4uLy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IFN0ZXAsIHR5cGUgU3RlcFJlc3VsdCwgc3RlcEZhaWwsIHN0ZXBPayB9IGZyb20gJy4uL3N0ZXAnXHJcblxyXG4vKipcclxuICogTW92ZSBvbmUgY2hpbGQgb2YgYW4gZWxlbWVudCBub2RlIHRvIGFub3RoZXIgaW5kZXggYW1vbmcgaXRzIHNpYmxpbmdzLlxyXG4gKlxyXG4gKiBDb21wb3NpbmcgYSBtb3ZlIG91dCBvZiBhIHJlbW92ZSBhbmQgYW4gaW5zZXJ0IHByb2R1Y2VzIHRoZSBzYW1lIGRvY3VtZW50LFxyXG4gKiBidXQgbm90IHRoZSBzYW1lICpwb3NpdGlvbnMqOiBldmVyeSBwb3NpdGlvbiBpbnNpZGUgdGhlIG1vdmVkIG5vZGUgaXNcclxuICogbWFwcGVkIHRocm91Z2ggYSByZXBsYWNlbWVudCB0aGF0IG5vIGxvbmdlciBjb250YWlucyBpdCwgYW5kIGNvbGxhcHNlcyB0b1xyXG4gKiB0aGUgcGFyZW50LiBUaGF0IGlzIHdoeSBhIGNhcmV0IGhhcyB0byBiZSByZXN0b3JlZCBieSBoYW5kIGFmdGVyIGFcclxuICogcmVidWlsZC10aGUtd2hvbGUtdGFibGUgbW92ZS4gSGVyZSB0aGUgc3VidHJlZSBrZWVwcyBpdHMgaWRlbnRpdHksIHNvIGFcclxuICogc2VsZWN0aW9uLCBhIGRlY29yYXRpb24gb3IgYSBwZW5kaW5nIHVwbG9hZCBwbGFjZWhvbGRlciBpbnNpZGUgdGhlIG1vdmVkXHJcbiAqIG5vZGUgdHJhdmVscyB3aXRoIGl0IGFuZCBuZWVkcyBubyByZXBhaXIuXHJcbiAqXHJcbiAqIEl0IGlzIGFsc28gb25lIHVuZG8gc3RlcCByYXRoZXIgdGhhbiB0d28sIGFuZCBpbnZlcnRzIHRvIGEgcGxhaW4gbW92ZSBiYWNrLlxyXG4gKlxyXG4gKiBgdG9gIGlzIHRoZSBpbmRleCB0aGUgbm9kZSBlbmRzIHVwIGF0LCB0aGUgd2F5IGBBcnJheS5wcm90b3R5cGUuc3BsaWNlYFxyXG4gKiBjb3VudHM6IHJlbW92ZWQgZmlyc3QsIHRoZW4gaW5zZXJ0ZWQuIE1vdmluZyBjaGlsZCAwIHRvIGluZGV4IDIgb2ZcclxuICogYFthLCBiLCBjXWAgZ2l2ZXMgYFtiLCBjLCBhXWAuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTW92ZU5vZGVTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChmcm9tIDwgMCB8fCB0byA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKGBJbnZhbGlkIG1vdmUgJHtmcm9tfSDihpIgJHt0b31gKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoKVxyXG4gICAgaWYgKCFwYXJlbnQpIHJldHVybiBzdGVwRmFpbCgnTW92ZU5vZGVTdGVwOiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgaWYgKHBhcmVudC5pc1RleHRibG9jayB8fCBwYXJlbnQuaXNUZXh0KSB7XHJcbiAgICAgIHJldHVybiBzdGVwRmFpbCgnTW92ZU5vZGVTdGVwOiBjaGlsZHJlbiBhcmUgaW5saW5lOyB1c2UgUmVwbGFjZUlubGluZVN0ZXAnKVxyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuZnJvbSA+PSBwYXJlbnQuY2hpbGRDb3VudCB8fCB0aGlzLnRvID49IHBhcmVudC5jaGlsZENvdW50KSB7XHJcbiAgICAgIHJldHVybiBzdGVwRmFpbCgnTW92ZU5vZGVTdGVwOiBpbmRleCBvdXQgb2YgYm91bmRzJylcclxuICAgIH1cclxuICAgIGlmICh0aGlzLmZyb20gPT09IHRoaXMudG8pIHJldHVybiBzdGVwT2soZG9jKVxyXG4gICAgcmV0dXJuIHN0ZXBPayhcclxuICAgICAgdXBkYXRlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoLCAobm9kZSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gWy4uLm5vZGUuY29udGVudC5jaGlsZHJlbl1cclxuICAgICAgICBjb25zdCBbbW92ZWRdID0gY2hpbGRyZW4uc3BsaWNlKHRoaXMuZnJvbSwgMSlcclxuICAgICAgICBpZiAoIW1vdmVkKSByZXR1cm4gbm9kZVxyXG4gICAgICAgIGNoaWxkcmVuLnNwbGljZSh0aGlzLnRvLCAwLCBtb3ZlZClcclxuICAgICAgICByZXR1cm4gbm9kZS53aXRoQ29udGVudChGcmFnbWVudC5mcm9tKGNoaWxkcmVuKSlcclxuICAgICAgfSksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBNb3ZpbmcgYmFjayBpcyBqdXN0IHRoZSBtb3ZlIHdpdGggaXRzIGVuZHMgc3dhcHBlZCwgdW5kZXIgc3BsaWNlXHJcbiAgICogc2VtYW50aWNzIHRoYXQgcmVzdG9yZXMgdGhlIG9yaWdpbmFsIG9yZGVyIGZvciBldmVyeSBlbGVtZW50LCBub3Qgb25seVxyXG4gICAqIHRoZSBvbmUgdGhhdCBtb3ZlZC5cclxuICAgKi9cclxuICBvdmVycmlkZSBpbnZlcnQoKTogU3RlcCB7XHJcbiAgICByZXR1cm4gbmV3IE1vdmVOb2RlU3RlcCh0aGlzLnBhcmVudFBhdGgsIHRoaXMudG8sIHRoaXMuZnJvbSlcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIG1hcFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uIHtcclxuICAgIGlmICh0aGlzLmZyb20gPT09IHRoaXMudG8pIHJldHVybiBwb3NpdGlvblxyXG4gICAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCB0aGlzLnBhcmVudFBhdGgpKSByZXR1cm4gcG9zaXRpb25cclxuXHJcbiAgICAvLyBBIHBvc2l0aW9uIGF0IHRoZSBwYXJlbnQncyBvd24gbGV2ZWwgYWRkcmVzc2VzIGEgZ2FwIGJldHdlZW4gY2hpbGRyZW4uXHJcbiAgICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHRoaXMucGFyZW50UGF0aC5sZW5ndGgpIHtcclxuICAgICAgcmV0dXJuIHsgcGF0aDogcG9zaXRpb24ucGF0aCwgb2Zmc2V0OiB0aGlzLm1hcEdhcChwb3NpdGlvbi5vZmZzZXQpIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpbmRleCA9IHBvc2l0aW9uLnBhdGhbdGhpcy5wYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCBtYXBwZWQgPSB0aGlzLm1hcEluZGV4KGluZGV4KVxyXG4gICAgaWYgKG1hcHBlZCA9PT0gaW5kZXgpIHJldHVybiBwb3NpdGlvblxyXG4gICAgY29uc3QgcGF0aCA9IFsuLi5wb3NpdGlvbi5wYXRoXVxyXG4gICAgcGF0aFt0aGlzLnBhcmVudFBhdGgubGVuZ3RoXSA9IG1hcHBlZFxyXG4gICAgcmV0dXJuIHsgcGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXJlIHRoZSBjaGlsZCB0aGF0IHdhcyBhdCBgaW5kZXhgIGVuZHMgdXAuICovXHJcbiAgcHJpdmF0ZSBtYXBJbmRleChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmIChpbmRleCA9PT0gdGhpcy5mcm9tKSByZXR1cm4gdGhpcy50b1xyXG4gICAgaWYgKHRoaXMuZnJvbSA8IHRoaXMudG8pIHJldHVybiBpbmRleCA+IHRoaXMuZnJvbSAmJiBpbmRleCA8PSB0aGlzLnRvID8gaW5kZXggLSAxIDogaW5kZXhcclxuICAgIHJldHVybiBpbmRleCA+PSB0aGlzLnRvICYmIGluZGV4IDwgdGhpcy5mcm9tID8gaW5kZXggKyAxIDogaW5kZXhcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFdoZXJlIGEgZ2FwIGJldHdlZW4gY2hpbGRyZW4gZW5kcyB1cC5cclxuICAgKlxyXG4gICAqIEEgZ2FwIGlzIG5vdCBhIGNoaWxkLCBzbyBpdCBjYW5ub3QgdHJhdmVsIHdpdGggdGhlIG1vdmVkIG5vZGU7IGl0IHN0YXlzXHJcbiAgICogd2hlcmUgaXQgaXMgaW4gdGhlIHNlcXVlbmNlIGFuZCBzaGlmdHMgb25seSBiZWNhdXNlIGl0cyBuZWlnaGJvdXJzIGRpZC5cclxuICAgKiBHYXBzIG91dHNpZGUgdGhlIHNwYW4gdGhlIG1vdmUgdG91Y2hlZCBhcmUgdW50b3VjaGVkLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgbWFwR2FwKG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLmZyb20gPCB0aGlzLnRvKSByZXR1cm4gb2Zmc2V0ID4gdGhpcy5mcm9tICYmIG9mZnNldCA8PSB0aGlzLnRvID8gb2Zmc2V0IC0gMSA6IG9mZnNldFxyXG4gICAgcmV0dXJuIG9mZnNldCA+PSB0aGlzLnRvICYmIG9mZnNldCA8PSB0aGlzLmZyb20gPyBvZmZzZXQgKyAxIDogb2Zmc2V0XHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RlcFR5cGU6ICdtb3ZlTm9kZScsXHJcbiAgICAgIHBhcmVudFBhdGg6IFsuLi50aGlzLnBhcmVudFBhdGhdLFxyXG4gICAgICBmcm9tOiB0aGlzLmZyb20sXHJcbiAgICAgIHRvOiB0aGlzLnRvLFxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqIE1vdmUgdGhlIG5vZGUgYXQgYHBhdGhgIHRvIGB0b2AgYW1vbmcgaXRzIHNpYmxpbmdzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbW92ZU5vZGVUbyhwYXRoOiBQYXRoLCB0bzogbnVtYmVyKTogTW92ZU5vZGVTdGVwIHtcclxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdDYW5ub3QgbW92ZSB0aGUgcm9vdCBub2RlJylcclxuICBjb25zdCBpbmRleCA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICByZXR1cm4gbmV3IE1vdmVOb2RlU3RlcChwYXRoLnNsaWNlKDAsIC0xKSwgaW5kZXgsIHRvKVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEF0dHJzIH0gZnJvbSAnLi4vLi4vbW9kZWwvYXR0cnMnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uLy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgdHlwZSBQYXRoLCBub2RlQXRQYXRoLCBwYXRoU3RhcnRzV2l0aCwgdXBkYXRlQXRQYXRoIH0gZnJvbSAnLi4vLi4vbW9kZWwvdHJlZSdcclxuaW1wb3J0IHsgU3RlcCwgdHlwZSBTdGVwUmVzdWx0LCBzdGVwRmFpbCwgc3RlcE9rIH0gZnJvbSAnLi4vc3RlcCdcclxuXHJcbi8qKlxyXG4gKiBXcmFwIHRoZSBjaGlsZHJlbiBbZnJvbSwgdG8pIG9mIHRoZSBub2RlIGF0IGBwYXJlbnRQYXRoYCBpbiBhIG5ldyBub2RlIG9mXHJcbiAqIHR5cGUgYHdyYXBwZXJUeXBlYCwgcGxhY2VkIGF0IGluZGV4IGBmcm9tYC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBXcmFwTm9kZXNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXJlbnRQYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgZnJvbTogbnVtYmVyLFxyXG4gICAgcmVhZG9ubHkgdG86IG51bWJlcixcclxuICAgIHJlYWRvbmx5IHdyYXBwZXJUeXBlOiBzdHJpbmcsXHJcbiAgICByZWFkb25seSB3cmFwcGVyQXR0cnM/OiBBdHRycyxcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChmcm9tID49IHRvIHx8IGZyb20gPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgSW52YWxpZCB3cmFwIHJhbmdlIFske2Zyb219LCAke3RvfSlgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoKVxyXG4gICAgaWYgKCFwYXJlbnQpIHJldHVybiBzdGVwRmFpbCgnV3JhcE5vZGVzU3RlcDogbm8gbm9kZSBhdCBwYXRoJylcclxuICAgIGlmIChwYXJlbnQuaXNUZXh0YmxvY2sgfHwgcGFyZW50LmlzVGV4dClcclxuICAgICAgcmV0dXJuIHN0ZXBGYWlsKCdXcmFwTm9kZXNTdGVwOiBjYW5ub3Qgd3JhcCBpbmxpbmUgY29udGVudCcpXHJcbiAgICBpZiAodGhpcy50byA+IHBhcmVudC5jaGlsZENvdW50KSByZXR1cm4gc3RlcEZhaWwoJ1dyYXBOb2Rlc1N0ZXA6IHJhbmdlIG91dCBvZiBib3VuZHMnKVxyXG4gICAgY29uc3Qgc2NoZW1hID0gcGFyZW50LnR5cGUuc2NoZW1hXHJcbiAgICBjb25zdCB3cmFwcGVyID0gc2NoZW1hXHJcbiAgICAgIC5ub2RlVHlwZSh0aGlzLndyYXBwZXJUeXBlKVxyXG4gICAgICAuY3JlYXRlKHRoaXMud3JhcHBlckF0dHJzLCBwYXJlbnQuY29udGVudC5zbGljZSh0aGlzLmZyb20sIHRoaXMudG8pKVxyXG4gICAgcmV0dXJuIHN0ZXBPayhcclxuICAgICAgdXBkYXRlQXRQYXRoKGRvYywgdGhpcy5wYXJlbnRQYXRoLCAobm9kZSkgPT5cclxuICAgICAgICBub2RlLndpdGhDb250ZW50KG5vZGUuY29udGVudC5yZXBsYWNlUmFuZ2UodGhpcy5mcm9tLCB0aGlzLnRvLCBGcmFnbWVudC5vZih3cmFwcGVyKSkpLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgaW52ZXJ0KCk6IFN0ZXAge1xyXG4gICAgcmV0dXJuIG5ldyBMaWZ0Tm9kZXNTdGVwKFsuLi50aGlzLnBhcmVudFBhdGgsIHRoaXMuZnJvbV0sIHRoaXMudG8gLSB0aGlzLmZyb20pXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXBQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XHJcbiAgICBpZiAoIXBhdGhTdGFydHNXaXRoKHBvc2l0aW9uLnBhdGgsIHRoaXMucGFyZW50UGF0aCkpIHJldHVybiBwb3NpdGlvblxyXG4gICAgY29uc3QgcmVtb3ZlZCA9IHRoaXMudG8gLSB0aGlzLmZyb21cclxuICAgIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gdGhpcy5wYXJlbnRQYXRoLmxlbmd0aCkge1xyXG4gICAgICBjb25zdCBpbmRleCA9IHBvc2l0aW9uLm9mZnNldFxyXG4gICAgICBpZiAoaW5kZXggPD0gdGhpcy5mcm9tKSByZXR1cm4gcG9zaXRpb25cclxuICAgICAgaWYgKGluZGV4ID49IHRoaXMudG8pIHJldHVybiB7IHBhdGg6IHBvc2l0aW9uLnBhdGgsIG9mZnNldDogaW5kZXggLSByZW1vdmVkICsgMSB9XHJcbiAgICAgIC8vIEJldHdlZW4gd3JhcHBlZCBjaGlsZHJlbjogbGFuZCBpbnNpZGUgdGhlIHdyYXBwZXIuXHJcbiAgICAgIHJldHVybiB7IHBhdGg6IFsuLi50aGlzLnBhcmVudFBhdGgsIHRoaXMuZnJvbV0sIG9mZnNldDogaW5kZXggLSB0aGlzLmZyb20gfVxyXG4gICAgfVxyXG4gICAgY29uc3QgY2hpbGRJbmRleCA9IHBvc2l0aW9uLnBhdGhbdGhpcy5wYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBjb25zdCByZXN0ID0gcG9zaXRpb24ucGF0aC5zbGljZSh0aGlzLnBhcmVudFBhdGgubGVuZ3RoICsgMSlcclxuICAgIGlmIChjaGlsZEluZGV4IDwgdGhpcy5mcm9tKSByZXR1cm4gcG9zaXRpb25cclxuICAgIGlmIChjaGlsZEluZGV4ID49IHRoaXMudG8pIHtcclxuICAgICAgY29uc3QgcGF0aCA9IFsuLi5wb3NpdGlvbi5wYXRoXVxyXG4gICAgICBwYXRoW3RoaXMucGFyZW50UGF0aC5sZW5ndGhdID0gY2hpbGRJbmRleCAtIHJlbW92ZWQgKyAxXHJcbiAgICAgIHJldHVybiB7IHBhdGgsIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0IH1cclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHBhdGg6IFsuLi50aGlzLnBhcmVudFBhdGgsIHRoaXMuZnJvbSwgY2hpbGRJbmRleCAtIHRoaXMuZnJvbSwgLi4ucmVzdF0sXHJcbiAgICAgIG9mZnNldDogcG9zaXRpb24ub2Zmc2V0LFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgdG9KU09OKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0ZXBUeXBlOiAnd3JhcE5vZGVzJyxcclxuICAgICAgcGFyZW50UGF0aDogWy4uLnRoaXMucGFyZW50UGF0aF0sXHJcbiAgICAgIGZyb206IHRoaXMuZnJvbSxcclxuICAgICAgdG86IHRoaXMudG8sXHJcbiAgICAgIHdyYXBwZXJUeXBlOiB0aGlzLndyYXBwZXJUeXBlLFxyXG4gICAgICAuLi4odGhpcy53cmFwcGVyQXR0cnMgPyB7IHdyYXBwZXJBdHRyczogeyAuLi50aGlzLndyYXBwZXJBdHRycyB9IH0gOiB7fSksXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUmVwbGFjZSB0aGUgbm9kZSBhdCBgcGF0aGAgd2l0aCBpdHMgb3duIGNoaWxkcmVuIChyZW1vdmUgb25lIHdyYXBwZXJcclxuICogbGV2ZWwpLiBgbGlmdGVkQ291bnRgIG11c3QgZXF1YWwgdGhlIG5vZGUncyBjaGlsZCBjb3VudC4gSXQgbWFrZXMgcG9zaXRpb25cclxuICogbWFwcGluZyBkb2N1bWVudC1pbmRlcGVuZGVudC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBMaWZ0Tm9kZXNTdGVwIGV4dGVuZHMgU3RlcCB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICByZWFkb25seSBwYXRoOiBQYXRoLFxyXG4gICAgcmVhZG9ubHkgbGlmdGVkQ291bnQ6IG51bWJlcixcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0Nhbm5vdCBsaWZ0IHRoZSByb290IG5vZGUnKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgYXBwbHkoZG9jOiBFZGl0b3JOb2RlKTogU3RlcFJlc3VsdCB7XHJcbiAgICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2MsIHRoaXMucGF0aClcclxuICAgIGlmICghbm9kZSkgcmV0dXJuIHN0ZXBGYWlsKCdMaWZ0Tm9kZXNTdGVwOiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgaWYgKG5vZGUuaXNUZXh0YmxvY2sgfHwgbm9kZS5pc1RleHQpXHJcbiAgICAgIHJldHVybiBzdGVwRmFpbCgnTGlmdE5vZGVzU3RlcDogY2Fubm90IGxpZnQgaW5saW5lIGNvbnRlbnQnKVxyXG4gICAgaWYgKG5vZGUuY2hpbGRDb3VudCAhPT0gdGhpcy5saWZ0ZWRDb3VudCkge1xyXG4gICAgICByZXR1cm4gc3RlcEZhaWwoJ0xpZnROb2Rlc1N0ZXA6IGxpZnRlZENvdW50IGRvZXMgbm90IG1hdGNoIHRoZSBub2RlJylcclxuICAgIH1cclxuICAgIGNvbnN0IHBhcmVudFBhdGggPSB0aGlzLnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBjb25zdCBpbmRleCA9IHRoaXMucGF0aFt0aGlzLnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICByZXR1cm4gc3RlcE9rKFxyXG4gICAgICB1cGRhdGVBdFBhdGgoZG9jLCBwYXJlbnRQYXRoLCAocGFyZW50KSA9PlxyXG4gICAgICAgIHBhcmVudC53aXRoQ29udGVudChwYXJlbnQuY29udGVudC5yZXBsYWNlUmFuZ2UoaW5kZXgsIGluZGV4ICsgMSwgbm9kZS5jb250ZW50KSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBpbnZlcnQoZG9jQmVmb3JlOiBFZGl0b3JOb2RlKTogU3RlcCB7XHJcbiAgICBjb25zdCBub2RlID0gbm9kZUF0UGF0aChkb2NCZWZvcmUsIHRoaXMucGF0aClcclxuICAgIGlmICghbm9kZSkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0xpZnROb2Rlc1N0ZXAuaW52ZXJ0OiBubyBub2RlIGF0IHBhdGgnKVxyXG4gICAgY29uc3QgaW5kZXggPSB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgcmV0dXJuIG5ldyBXcmFwTm9kZXNTdGVwKFxyXG4gICAgICB0aGlzLnBhdGguc2xpY2UoMCwgLTEpLFxyXG4gICAgICBpbmRleCxcclxuICAgICAgaW5kZXggKyBub2RlLmNoaWxkQ291bnQsXHJcbiAgICAgIG5vZGUudHlwZS5uYW1lLFxyXG4gICAgICBub2RlLmF0dHJzLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IHRoaXMucGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gdGhpcy5wYXRoW3RoaXMucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGlmIChwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCB0aGlzLnBhdGgpKSB7XHJcbiAgICAgIGlmIChwb3NpdGlvbi5wYXRoLmxlbmd0aCA9PT0gdGhpcy5wYXRoLmxlbmd0aCkge1xyXG4gICAgICAgIC8vIEEgY2hpbGQgaW5kZXggaW5zaWRlIHRoZSBsaWZ0ZWQgd3JhcHBlciBtYXBzIHRvIHRoZSBwYXJlbnQgbGV2ZWwuXHJcbiAgICAgICAgcmV0dXJuIHsgcGF0aDogcGFyZW50UGF0aCwgb2Zmc2V0OiBpbmRleCArIHBvc2l0aW9uLm9mZnNldCB9XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgY2hpbGRJbmRleCA9IHBvc2l0aW9uLnBhdGhbdGhpcy5wYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICAgIGNvbnN0IHJlc3QgPSBwb3NpdGlvbi5wYXRoLnNsaWNlKHRoaXMucGF0aC5sZW5ndGggKyAxKVxyXG4gICAgICByZXR1cm4geyBwYXRoOiBbLi4ucGFyZW50UGF0aCwgaW5kZXggKyBjaGlsZEluZGV4LCAuLi5yZXN0XSwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgaWYgKCFwYXRoU3RhcnRzV2l0aChwb3NpdGlvbi5wYXRoLCBwYXJlbnRQYXRoKSkgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBjb25zdCBkZWx0YSA9IHRoaXMubGlmdGVkQ291bnQgLSAxXHJcbiAgICBpZiAocG9zaXRpb24ucGF0aC5sZW5ndGggPT09IHBhcmVudFBhdGgubGVuZ3RoKSB7XHJcbiAgICAgIHJldHVybiBwb3NpdGlvbi5vZmZzZXQgPiBpbmRleFxyXG4gICAgICAgID8geyBwYXRoOiBwb3NpdGlvbi5wYXRoLCBvZmZzZXQ6IHBvc2l0aW9uLm9mZnNldCArIGRlbHRhIH1cclxuICAgICAgICA6IHBvc2l0aW9uXHJcbiAgICB9XHJcbiAgICBjb25zdCBjaGlsZEluZGV4ID0gcG9zaXRpb24ucGF0aFtwYXJlbnRQYXRoLmxlbmd0aF0gYXMgbnVtYmVyXHJcbiAgICBpZiAoY2hpbGRJbmRleCA+IGluZGV4KSB7XHJcbiAgICAgIGNvbnN0IHBhdGggPSBbLi4ucG9zaXRpb24ucGF0aF1cclxuICAgICAgcGF0aFtwYXJlbnRQYXRoLmxlbmd0aF0gPSBjaGlsZEluZGV4ICsgZGVsdGFcclxuICAgICAgcmV0dXJuIHsgcGF0aCwgb2Zmc2V0OiBwb3NpdGlvbi5vZmZzZXQgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBvc2l0aW9uXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gICAgcmV0dXJuIHsgc3RlcFR5cGU6ICdsaWZ0Tm9kZXMnLCBwYXRoOiBbLi4udGhpcy5wYXRoXSwgbGlmdGVkQ291bnQ6IHRoaXMubGlmdGVkQ291bnQgfVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBNYXJrIH0gZnJvbSAnLi4vbW9kZWwvbWFyaydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBQb3NpdGlvbiB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvclN0YXRlIH0gZnJvbSAnLi9lZGl0b3Itc3RhdGUnXHJcbmltcG9ydCB0eXBlIHsgU2VsZWN0aW9uIH0gZnJvbSAnLi9zZWxlY3Rpb24nXHJcbmltcG9ydCB0eXBlIHsgQmlhcywgUG9zaXRpb25NYXBwZXIsIFN0ZXAgfSBmcm9tICcuL3N0ZXAnXHJcblxyXG4vKipcclxuICogQW4gb3JkZXJlZCBsaXN0IG9mIHN0ZXBzIGFwcGxpZWQgdG8gYSBkb2N1bWVudCwgcGx1cyBzZWxlY3Rpb24sIHN0b3JlZFxyXG4gKiBtYXJrcyBhbmQgbWV0YWRhdGEuIEJ1aWxkIG9uZSB2aWEgYHN0YXRlLnRyYCwgdGhlbiBkaXNwYXRjaCBpdC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBUcmFuc2FjdGlvbiBpbXBsZW1lbnRzIFBvc2l0aW9uTWFwcGVyIHtcclxuICByZWFkb25seSBzdGVwczogU3RlcFtdID0gW11cclxuICAvKiogVGhlIGRvY3VtZW50IGJlZm9yZSBlYWNoIHN0ZXAsIHBhcmFsbGVsIHRvIHtAbGluayBzdGVwc30uICovXHJcbiAgcmVhZG9ubHkgZG9jczogRWRpdG9yTm9kZVtdID0gW11cclxuICAvKiogQ3JlYXRpb24gdGltZSwgdXNlZCBieSB0aGUgdW5kbyBoaXN0b3J5IGZvciBncm91cGluZy4gKi9cclxuICByZWFkb25seSB0aW1lOiBudW1iZXIgPSBEYXRlLm5vdygpXHJcblxyXG4gIHByaXZhdGUgY3VycmVudERvYzogRWRpdG9yTm9kZVxyXG4gIHByaXZhdGUgcmVhZG9ubHkgYmFzZVNlbGVjdGlvbjogU2VsZWN0aW9uXHJcbiAgcHJpdmF0ZSBleHBsaWNpdFNlbGVjdGlvbjogeyBzZWxlY3Rpb246IFNlbGVjdGlvbjsgYXRTdGVwOiBudW1iZXIgfSB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSBzdG9yZWQ6IHJlYWRvbmx5IE1hcmtbXSB8IG51bGxcclxuICBwcml2YXRlIG1ldGFkYXRhOiBNYXA8c3RyaW5nLCB1bmtub3duPiB8IG51bGwgPSBudWxsXHJcblxyXG4gIGNvbnN0cnVjdG9yKHN0YXRlOiBFZGl0b3JTdGF0ZSkge1xyXG4gICAgdGhpcy5jdXJyZW50RG9jID0gc3RhdGUuZG9jXHJcbiAgICB0aGlzLmJhc2VTZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIHRoaXMuc3RvcmVkID0gc3RhdGUuc3RvcmVkTWFya3NcclxuICB9XHJcblxyXG4gIGdldCBkb2MoKTogRWRpdG9yTm9kZSB7XHJcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50RG9jXHJcbiAgfVxyXG5cclxuICBnZXQgZG9jQ2hhbmdlZCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnN0ZXBzLmxlbmd0aCA+IDBcclxuICB9XHJcblxyXG4gIC8qKiBBcHBseSBhIHN0ZXA7IHJldHVybnMgZmFsc2UgKGxlYXZpbmcgdGhlIHRyYW5zYWN0aW9uIHVudG91Y2hlZCkgb24gZmFpbHVyZS4gKi9cclxuICBtYXliZVN0ZXAoc3RlcDogU3RlcCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudHJ5U3RlcChzdGVwKSA9PT0gbnVsbFxyXG4gIH1cclxuXHJcbiAgLyoqIEFwcGx5IGEgc3RlcDsgdGhyb3dzIG9uIGZhaWx1cmUuICovXHJcbiAgc3RlcChzdGVwOiBTdGVwKTogdGhpcyB7XHJcbiAgICBjb25zdCBmYWlsZWQgPSB0aGlzLnRyeVN0ZXAoc3RlcClcclxuICAgIGlmIChmYWlsZWQgIT09IG51bGwpIHRocm93IG5ldyBSYW5nZUVycm9yKGBTdGVwIGZhaWxlZDogJHtmYWlsZWR9YClcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHRyeVN0ZXAoc3RlcDogU3RlcCk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgY29uc3QgcmVzdWx0ID0gc3RlcC5hcHBseSh0aGlzLmN1cnJlbnREb2MpXHJcbiAgICBpZiAocmVzdWx0LmZhaWxlZCAhPT0gbnVsbCB8fCByZXN1bHQuZG9jID09PSBudWxsKSB7XHJcbiAgICAgIHJldHVybiByZXN1bHQuZmFpbGVkID8/ICd1bmtub3duIHN0ZXAgZmFpbHVyZSdcclxuICAgIH1cclxuICAgIHRoaXMuZG9jcy5wdXNoKHRoaXMuY3VycmVudERvYylcclxuICAgIHRoaXMuc3RlcHMucHVzaChzdGVwKVxyXG4gICAgdGhpcy5jdXJyZW50RG9jID0gcmVzdWx0LmRvY1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIC8qKiBNYXAgYSBwb3NpdGlvbiBmcm9tIGJlZm9yZSB0aGlzIHRyYW5zYWN0aW9uIHRvIGFmdGVyIGl0LiAqL1xyXG4gIG1hcFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgYmlhcz86IEJpYXMpOiBQb3NpdGlvbiB7XHJcbiAgICByZXR1cm4gdGhpcy5tYXBUaHJvdWdoKHBvc2l0aW9uLCAwLCBiaWFzKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBtYXBUaHJvdWdoKHBvc2l0aW9uOiBQb3NpdGlvbiwgZnJvbVN0ZXA6IG51bWJlciwgYmlhcz86IEJpYXMpOiBQb3NpdGlvbiB7XHJcbiAgICBsZXQgbWFwcGVkID0gcG9zaXRpb25cclxuICAgIGZvciAobGV0IGkgPSBmcm9tU3RlcDsgaSA8IHRoaXMuc3RlcHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgbWFwcGVkID0gKHRoaXMuc3RlcHNbaV0gYXMgU3RlcCkubWFwUG9zaXRpb24obWFwcGVkLCBiaWFzKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG1hcHBlZFxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGhlIHNlbGVjdGlvbiBhZnRlciB0aGlzIHRyYW5zYWN0aW9uOiB0aGUgZXhwbGljaXRseSBzZXQgb25lIChyZW1hcHBlZFxyXG4gICAqIHRocm91Z2ggYW55IGxhdGVyIHN0ZXBzKSwgb3IgdGhlIGlucHV0IHNlbGVjdGlvbiBtYXBwZWQgdGhyb3VnaCBhbGwgc3RlcHMuXHJcbiAgICovXHJcbiAgZ2V0IHNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xyXG4gICAgaWYgKHRoaXMuZXhwbGljaXRTZWxlY3Rpb24pIHtcclxuICAgICAgY29uc3QgeyBzZWxlY3Rpb24sIGF0U3RlcCB9ID0gdGhpcy5leHBsaWNpdFNlbGVjdGlvblxyXG4gICAgICByZXR1cm4gc2VsZWN0aW9uLm1hcCh0aGlzLmN1cnJlbnREb2MsIHtcclxuICAgICAgICBtYXBQb3NpdGlvbjogKHBvc2l0aW9uLCBiaWFzKSA9PiB0aGlzLm1hcFRocm91Z2gocG9zaXRpb24sIGF0U3RlcCwgYmlhcyksXHJcbiAgICAgIH0pXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcy5iYXNlU2VsZWN0aW9uLm1hcCh0aGlzLmN1cnJlbnREb2MsIHRoaXMpXHJcbiAgfVxyXG5cclxuICBzZXRTZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB0aGlzIHtcclxuICAgIHRoaXMuZXhwbGljaXRTZWxlY3Rpb24gPSB7IHNlbGVjdGlvbiwgYXRTdGVwOiB0aGlzLnN0ZXBzLmxlbmd0aCB9XHJcbiAgICB0aGlzLnN0b3JlZCA9IG51bGxcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBnZXQgc3RvcmVkTWFya3MoKTogcmVhZG9ubHkgTWFya1tdIHwgbnVsbCB7XHJcbiAgICByZXR1cm4gdGhpcy5zdG9yZWRcclxuICB9XHJcblxyXG4gIHNldFN0b3JlZE1hcmtzKG1hcmtzOiByZWFkb25seSBNYXJrW10gfCBudWxsKTogdGhpcyB7XHJcbiAgICB0aGlzLnN0b3JlZCA9IG1hcmtzXHJcbiAgICByZXR1cm4gdGhpc1xyXG4gIH1cclxuXHJcbiAgc2V0TWV0YShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB0aGlzIHtcclxuICAgIHRoaXMubWV0YWRhdGEgPz89IG5ldyBNYXAoKVxyXG4gICAgdGhpcy5tZXRhZGF0YS5zZXQoa2V5LCB2YWx1ZSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBnZXRNZXRhKGtleTogc3RyaW5nKTogdW5rbm93biB7XHJcbiAgICByZXR1cm4gdGhpcy5tZXRhZGF0YT8uZ2V0KGtleSlcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEV2ZXJ5IG1ldGFkYXRhIGtleSBzZXQgb24gdGhpcyB0cmFuc2FjdGlvbiwgaW4gdGhlIG9yZGVyIGl0IHdhcyBzZXQuXHJcbiAgICpcclxuICAgKiBGb3IgdGhlIG9uZSBjYWxsZXIgdGhhdCBoYXMgdG8gaGFuZCBhIHRyYW5zYWN0aW9uJ3Mgd2hvbGUgcHJvdmVuYW5jZSBvbjpcclxuICAgKiBhIGRpc3BhdGNoIHRyYW5zZm9ybSB0aGF0IHJlcGxhY2VzIGEgdHJhbnNhY3Rpb24gd2l0aCBhIGRpZmZlcmVudCBvbmVcclxuICAgKiAoc3VnZ2VzdGlvbiBtb2RlIHJld3JpdGluZyBhbiBlZGl0LCBzYXkpIGRyb3BzIGV2ZXJ5IGtleSB0aGUgb3JpZ2luYWxcclxuICAgKiBjYXJyaWVkIHVubGVzcyBpdCBjb3BpZXMgdGhlbSwgYW5kIHRoZSBrZXlzIGl0IGRvZXMgbm90IGtub3cgYWJvdXQgYXJlXHJcbiAgICogZXhhY3RseSB0aGUgb25lcyBpdCBjYW5ub3QgYWZmb3JkIHRvIGd1ZXNzIGF0LiBBIHJlcGxheSBndWFyZCBzaWxlbnRseVxyXG4gICAqIGxvc3QgaXMgYW4gZWRpdGluZyBsb29wLlxyXG4gICAqL1xyXG4gIG1ldGFLZXlzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcclxuICAgIHJldHVybiB0aGlzLm1ldGFkYXRhID8gWy4uLnRoaXMubWV0YWRhdGEua2V5cygpXSA6IFtdXHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgeyBmaXJzdFRleHRibG9ja1BhdGgsIHRleHRibG9ja3MgfSBmcm9tICcuLi9tb2RlbC9ibG9ja3MnXHJcbmltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHtcclxuICB0eXBlIFBvc2l0aW9uLFxyXG4gIGNsYW1wUG9zaXRpb24sXHJcbiAgY29tcGFyZVBvc2l0aW9ucyxcclxuICBtYXhQb3NpdGlvbixcclxuICBtaW5Qb3NpdGlvbixcclxuICBwb3MsXHJcbiAgcG9zaXRpb25zRXF1YWwsXHJcbn0gZnJvbSAnLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCwgcGF0aHNFcXVhbCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB0eXBlIHsgUG9zaXRpb25NYXBwZXIgfSBmcm9tICcuL3N0ZXAnXHJcblxyXG4vKiogSlNPTiBzaGFwZSBvZiBhIHNlcmlhbGl6ZWQgc2VsZWN0aW9uLiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbkpTT04ge1xyXG4gIHJlYWRvbmx5IHR5cGU6IHN0cmluZ1xyXG4gIHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd25cclxufVxyXG5cclxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFNlbGVjdGlvbiB7XHJcbiAgYWJzdHJhY3QgZ2V0IGZyb20oKTogUG9zaXRpb25cclxuICBhYnN0cmFjdCBnZXQgdG8oKTogUG9zaXRpb25cclxuXHJcbiAgZ2V0IGVtcHR5KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHBvc2l0aW9uc0VxdWFsKHRoaXMuZnJvbSwgdGhpcy50bylcclxuICB9XHJcblxyXG4gIGFic3RyYWN0IG1hcChkb2M6IEVkaXRvck5vZGUsIG1hcHBlcjogUG9zaXRpb25NYXBwZXIpOiBTZWxlY3Rpb25cclxuICBhYnN0cmFjdCBlcShvdGhlcjogU2VsZWN0aW9uKTogYm9vbGVhblxyXG4gIGFic3RyYWN0IHRvSlNPTigpOiBTZWxlY3Rpb25KU09OXHJcbn1cclxuXHJcbi8qKiBBIGN1cnNvciBvciB0ZXh0IHJhbmdlIGJldHdlZW4gdHdvIGlubGluZSBwb3NpdGlvbnMuICovXHJcbmV4cG9ydCBjbGFzcyBUZXh0U2VsZWN0aW9uIGV4dGVuZHMgU2VsZWN0aW9uIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IGFuY2hvcjogUG9zaXRpb24sXHJcbiAgICByZWFkb25seSBoZWFkOiBQb3NpdGlvbiA9IGFuY2hvcixcclxuICApIHtcclxuICAgIHN1cGVyKClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGdldCBmcm9tKCk6IFBvc2l0aW9uIHtcclxuICAgIHJldHVybiBtaW5Qb3NpdGlvbih0aGlzLmFuY2hvciwgdGhpcy5oZWFkKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZ2V0IHRvKCk6IFBvc2l0aW9uIHtcclxuICAgIHJldHVybiBtYXhQb3NpdGlvbih0aGlzLmFuY2hvciwgdGhpcy5oZWFkKVxyXG4gIH1cclxuXHJcbiAgZ2V0IGlzQ3Vyc29yKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHBvc2l0aW9uc0VxdWFsKHRoaXMuYW5jaG9yLCB0aGlzLmhlYWQpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBtYXAoZG9jOiBFZGl0b3JOb2RlLCBtYXBwZXI6IFBvc2l0aW9uTWFwcGVyKTogU2VsZWN0aW9uIHtcclxuICAgIGNvbnN0IGFuY2hvciA9IGNsYW1wUG9zaXRpb24oZG9jLCBtYXBwZXIubWFwUG9zaXRpb24odGhpcy5hbmNob3IsIC0xKSlcclxuICAgIGNvbnN0IGhlYWQgPSBjbGFtcFBvc2l0aW9uKGRvYywgbWFwcGVyLm1hcFBvc2l0aW9uKHRoaXMuaGVhZCwgLTEpKVxyXG4gICAgcmV0dXJuIG5ldyBUZXh0U2VsZWN0aW9uKGFuY2hvciwgaGVhZClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGVxKG90aGVyOiBTZWxlY3Rpb24pOiBib29sZWFuIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIG90aGVyIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbiAmJlxyXG4gICAgICBwb3NpdGlvbnNFcXVhbChvdGhlci5hbmNob3IsIHRoaXMuYW5jaG9yKSAmJlxyXG4gICAgICBwb3NpdGlvbnNFcXVhbChvdGhlci5oZWFkLCB0aGlzLmhlYWQpXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogU2VsZWN0aW9uSlNPTiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICB0eXBlOiAndGV4dCcsXHJcbiAgICAgIGFuY2hvcjogeyBwYXRoOiBbLi4udGhpcy5hbmNob3IucGF0aF0sIG9mZnNldDogdGhpcy5hbmNob3Iub2Zmc2V0IH0sXHJcbiAgICAgIGhlYWQ6IHsgcGF0aDogWy4uLnRoaXMuaGVhZC5wYXRoXSwgb2Zmc2V0OiB0aGlzLmhlYWQub2Zmc2V0IH0sXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKiogQ3Vyc29yIGF0IHRoZSBzdGFydCBvZiB0aGUgZG9jdW1lbnQncyBmaXJzdCB0ZXh0YmxvY2suICovXHJcbiAgc3RhdGljIGF0U3RhcnQoZG9jOiBFZGl0b3JOb2RlKTogVGV4dFNlbGVjdGlvbiB7XHJcbiAgICBjb25zdCBwYXRoID0gZmlyc3RUZXh0YmxvY2tQYXRoKGRvYylcclxuICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCA/PyBbXSwgMCkpXHJcbiAgfVxyXG5cclxuICAvKiogQ3Vyc29yIGF0IHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50J3MgbGFzdCB0ZXh0YmxvY2suICovXHJcbiAgc3RhdGljIGF0RW5kKGRvYzogRWRpdG9yTm9kZSk6IFRleHRTZWxlY3Rpb24ge1xyXG4gICAgY29uc3QgYmxvY2tzID0gdGV4dGJsb2Nrcyhkb2MpXHJcbiAgICBjb25zdCBsYXN0ID0gYmxvY2tzW2Jsb2Nrcy5sZW5ndGggLSAxXVxyXG4gICAgaWYgKCFsYXN0KSByZXR1cm4gbmV3IFRleHRTZWxlY3Rpb24ocG9zKFtdLCAwKSlcclxuICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihwb3MobGFzdC5wYXRoLCBpbmxpbmVMZW5ndGgobGFzdC5ub2RlLmNvbnRlbnQpKSlcclxuICB9XHJcbn1cclxuXHJcbi8qKiBBIHNpbmdsZSBub24tdGV4dCBub2RlIHNlbGVjdGVkIGFzIGEgd2hvbGUgKGltYWdlLCBociwg4oCmKS4gKi9cclxuZXhwb3J0IGNsYXNzIE5vZGVTZWxlY3Rpb24gZXh0ZW5kcyBTZWxlY3Rpb24ge1xyXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHBhdGg6IFBhdGgpIHtcclxuICAgIHN1cGVyKClcclxuICAgIGlmIChwYXRoLmxlbmd0aCA9PT0gMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0Nhbm5vdCBub2RlLXNlbGVjdCB0aGUgcm9vdCcpXHJcbiAgfVxyXG5cclxuICBnZXQgcGFyZW50UGF0aCgpOiBQYXRoIHtcclxuICAgIHJldHVybiB0aGlzLnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgfVxyXG5cclxuICBnZXQgaW5kZXgoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiB0aGlzLnBhdGhbdGhpcy5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZ2V0IGZyb20oKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvcyh0aGlzLnBhcmVudFBhdGgsIHRoaXMuaW5kZXgpXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBnZXQgdG8oKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvcyh0aGlzLnBhcmVudFBhdGgsIHRoaXMuaW5kZXggKyAxKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgbWFwKGRvYzogRWRpdG9yTm9kZSwgbWFwcGVyOiBQb3NpdGlvbk1hcHBlcik6IFNlbGVjdGlvbiB7XHJcbiAgICBjb25zdCBtYXBwZWQgPSBjbGFtcFBvc2l0aW9uKGRvYywgbWFwcGVyLm1hcFBvc2l0aW9uKHRoaXMuZnJvbSwgLTEpKVxyXG4gICAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBbLi4ubWFwcGVkLnBhdGgsIG1hcHBlZC5vZmZzZXRdKVxyXG4gICAgaWYgKG5vZGUgJiYgIW5vZGUuaXNUZXh0KSByZXR1cm4gbmV3IE5vZGVTZWxlY3Rpb24oWy4uLm1hcHBlZC5wYXRoLCBtYXBwZWQub2Zmc2V0XSlcclxuICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihtYXBwZWQpLm1hcChkb2MsIGlkZW50aXR5TWFwcGVyKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZXEob3RoZXI6IFNlbGVjdGlvbik6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgTm9kZVNlbGVjdGlvbiAmJiBwYXRoc0VxdWFsKG90aGVyLnBhdGgsIHRoaXMucGF0aClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIHRvSlNPTigpOiBTZWxlY3Rpb25KU09OIHtcclxuICAgIHJldHVybiB7IHR5cGU6ICdub2RlJywgcGF0aDogWy4uLnRoaXMucGF0aF0gfVxyXG4gIH1cclxufVxyXG5cclxuLyoqIFRoZSB3aG9sZSBkb2N1bWVudCBzZWxlY3RlZC4gKi9cclxuZXhwb3J0IGNsYXNzIEFsbFNlbGVjdGlvbiBleHRlbmRzIFNlbGVjdGlvbiB7XHJcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkb2M6IEVkaXRvck5vZGUpIHtcclxuICAgIHN1cGVyKClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIGdldCBmcm9tKCk6IFBvc2l0aW9uIHtcclxuICAgIHJldHVybiBwb3MoW10sIDApXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSBnZXQgdG8oKTogUG9zaXRpb24ge1xyXG4gICAgcmV0dXJuIHBvcyhbXSwgdGhpcy5kb2MuY2hpbGRDb3VudClcclxuICB9XHJcblxyXG4gIG92ZXJyaWRlIG1hcChkb2M6IEVkaXRvck5vZGUpOiBTZWxlY3Rpb24ge1xyXG4gICAgcmV0dXJuIG5ldyBBbGxTZWxlY3Rpb24oZG9jKVxyXG4gIH1cclxuXHJcbiAgb3ZlcnJpZGUgZXEob3RoZXI6IFNlbGVjdGlvbik6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgQWxsU2VsZWN0aW9uXHJcbiAgfVxyXG5cclxuICBvdmVycmlkZSB0b0pTT04oKTogU2VsZWN0aW9uSlNPTiB7XHJcbiAgICByZXR1cm4geyB0eXBlOiAnYWxsJyB9XHJcbiAgfVxyXG59XHJcblxyXG5jb25zdCBpZGVudGl0eU1hcHBlcjogUG9zaXRpb25NYXBwZXIgPSB7XHJcbiAgbWFwUG9zaXRpb246IChwb3NpdGlvbikgPT4gcG9zaXRpb24sXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgbmVhcmVzdCB2YWxpZCB0ZXh0IHNlbGVjdGlvbiBhdCBvciBhZnRlciBhIChwb3NzaWJseSBzdGFsZSkgcG9zaXRpb24sXHJcbiAqIHVzZWQgdG8gcmVwYWlyIHNlbGVjdGlvbnMgYWZ0ZXIgYXJiaXRyYXJ5IGRvY3VtZW50IGNoYW5nZXMuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2VsZWN0aW9uTmVhcihkb2M6IEVkaXRvck5vZGUsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFRleHRTZWxlY3Rpb24ge1xyXG4gIGNvbnN0IGNsYW1wZWQgPSBjbGFtcFBvc2l0aW9uKGRvYywgcG9zaXRpb24pXHJcbiAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBjbGFtcGVkLnBhdGgpXHJcbiAgaWYgKG5vZGU/LmlzVGV4dGJsb2NrKSByZXR1cm4gbmV3IFRleHRTZWxlY3Rpb24oY2xhbXBlZClcclxuICBmb3IgKGNvbnN0IHsgcGF0aCwgbm9kZTogYmxvY2sgfSBvZiB0ZXh0YmxvY2tzKGRvYykpIHtcclxuICAgIGlmIChjb21wYXJlUG9zaXRpb25zKHBvcyhwYXRoLCBpbmxpbmVMZW5ndGgoYmxvY2suY29udGVudCkpLCBjbGFtcGVkKSA+PSAwKSB7XHJcbiAgICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCwgMCkpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBUZXh0U2VsZWN0aW9uLmF0RW5kKGRvYylcclxufVxyXG4iLCAiaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgdHlwZSBEb2NKU09OLCBub2RlRnJvbUpTT04gfSBmcm9tICcuLi9tb2RlbC9qc29uJ1xyXG5pbXBvcnQgdHlwZSB7IE1hcmsgfSBmcm9tICcuLi9tb2RlbC9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBub3JtYWxpemVEb2MgfSBmcm9tICcuLi9tb2RlbC9ub3JtYWxpemUnXHJcbmltcG9ydCB7IGNsYW1wUG9zaXRpb24gfSBmcm9tICcuLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHR5cGUgeyBTY2hlbWEgfSBmcm9tICcuLi9tb2RlbC9zY2hlbWEnXHJcbmltcG9ydCB7IG5vZGVBdFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQge1xyXG4gIEFsbFNlbGVjdGlvbixcclxuICBOb2RlU2VsZWN0aW9uLFxyXG4gIHR5cGUgU2VsZWN0aW9uLFxyXG4gIFRleHRTZWxlY3Rpb24sXHJcbiAgc2VsZWN0aW9uTmVhcixcclxufSBmcm9tICcuL3NlbGVjdGlvbidcclxuaW1wb3J0IHsgVHJhbnNhY3Rpb24gfSBmcm9tICcuL3RyYW5zYWN0aW9uJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JTdGF0ZUNvbmZpZyB7XHJcbiAgcmVhZG9ubHkgc2NoZW1hOiBTY2hlbWFcclxuICAvKiogSW5pdGlhbCBkb2N1bWVudC4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIGBjb250ZW50YC4gKi9cclxuICByZWFkb25seSBkb2M/OiBFZGl0b3JOb2RlXHJcbiAgLyoqIEluaXRpYWwgZG9jdW1lbnQgYXMgY2Fub25pY2FsIEpTT04uICovXHJcbiAgcmVhZG9ubHkgY29udGVudD86IERvY0pTT05cclxuICByZWFkb25seSBzZWxlY3Rpb24/OiBTZWxlY3Rpb25cclxufVxyXG5cclxuLyoqXHJcbiAqIEltbXV0YWJsZSBlZGl0b3Igc3RhdGU6IHRoZSBkb2N1bWVudCwgc2VsZWN0aW9uIGFuZCBzdG9yZWQgbWFya3MuIFRoZSBET01cclxuICogaXMgbmV2ZXIgdGhlIHNvdXJjZSBvZiB0cnV0aCwgdGhpcyBpcy5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3JTdGF0ZSB7XHJcbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihcclxuICAgIHJlYWRvbmx5IHNjaGVtYTogU2NoZW1hLFxyXG4gICAgcmVhZG9ubHkgZG9jOiBFZGl0b3JOb2RlLFxyXG4gICAgcmVhZG9ubHkgc2VsZWN0aW9uOiBTZWxlY3Rpb24sXHJcbiAgICByZWFkb25seSBzdG9yZWRNYXJrczogcmVhZG9ubHkgTWFya1tdIHwgbnVsbCxcclxuICApIHt9XHJcblxyXG4gIHN0YXRpYyBjcmVhdGUoY29uZmlnOiBFZGl0b3JTdGF0ZUNvbmZpZyk6IEVkaXRvclN0YXRlIHtcclxuICAgIGNvbnN0IHsgc2NoZW1hIH0gPSBjb25maWdcclxuICAgIGNvbnN0IGluaXRpYWwgPVxyXG4gICAgICBjb25maWcuZG9jID8/XHJcbiAgICAgIChjb25maWcuY29udGVudFxyXG4gICAgICAgID8gbm9kZUZyb21KU09OKHNjaGVtYSwgY29uZmlnLmNvbnRlbnQpXHJcbiAgICAgICAgOiBzY2hlbWEudG9wVHlwZS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5vZihzY2hlbWEuZmlyc3RUZXh0YmxvY2tUeXBlKCkuY3JlYXRlKCkpKSlcclxuICAgIGNvbnN0IGRvYyA9IG5vcm1hbGl6ZURvYyhpbml0aWFsKVxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gY29uZmlnLnNlbGVjdGlvblxyXG4gICAgICA/IHZhbGlkYXRlU2VsZWN0aW9uKGRvYywgY29uZmlnLnNlbGVjdGlvbilcclxuICAgICAgOiBUZXh0U2VsZWN0aW9uLmF0U3RhcnQoZG9jKVxyXG4gICAgcmV0dXJuIG5ldyBFZGl0b3JTdGF0ZShzY2hlbWEsIGRvYywgc2VsZWN0aW9uLCBudWxsKVxyXG4gIH1cclxuXHJcbiAgLyoqIFN0YXJ0IGJ1aWxkaW5nIGEgdHJhbnNhY3Rpb24gZnJvbSB0aGlzIHN0YXRlLiAqL1xyXG4gIGdldCB0cigpOiBUcmFuc2FjdGlvbiB7XHJcbiAgICByZXR1cm4gbmV3IFRyYW5zYWN0aW9uKHRoaXMpXHJcbiAgfVxyXG5cclxuICBhcHBseSh0cjogVHJhbnNhY3Rpb24pOiBFZGl0b3JTdGF0ZSB7XHJcbiAgICByZXR1cm4gbmV3IEVkaXRvclN0YXRlKFxyXG4gICAgICB0aGlzLnNjaGVtYSxcclxuICAgICAgdHIuZG9jLFxyXG4gICAgICB2YWxpZGF0ZVNlbGVjdGlvbih0ci5kb2MsIHRyLnNlbGVjdGlvbiksXHJcbiAgICAgIHRyLnN0b3JlZE1hcmtzLFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgdG9KU09OKCk6IHsgZG9jOiBEb2NKU09OOyBzZWxlY3Rpb246IHVua25vd24gfSB7XHJcbiAgICByZXR1cm4geyBkb2M6IHRoaXMuZG9jLnRvSlNPTigpLCBzZWxlY3Rpb246IHRoaXMuc2VsZWN0aW9uLnRvSlNPTigpIH1cclxuICB9XHJcbn1cclxuXHJcbi8qKiBSZXBhaXIgYSBzZWxlY3Rpb24gc28gaXQgaXMgdmFsaWQgZm9yIHRoZSBnaXZlbiBkb2N1bWVudC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlU2VsZWN0aW9uKGRvYzogRWRpdG9yTm9kZSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiBTZWxlY3Rpb24ge1xyXG4gIGlmIChzZWxlY3Rpb24gaW5zdGFuY2VvZiBBbGxTZWxlY3Rpb24pIHJldHVybiBuZXcgQWxsU2VsZWN0aW9uKGRvYylcclxuICBpZiAoc2VsZWN0aW9uIGluc3RhbmNlb2YgTm9kZVNlbGVjdGlvbikge1xyXG4gICAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBzZWxlY3Rpb24ucGF0aClcclxuICAgIHJldHVybiBub2RlICYmICFub2RlLmlzVGV4dCA/IHNlbGVjdGlvbiA6IHNlbGVjdGlvbk5lYXIoZG9jLCBzZWxlY3Rpb24uZnJvbSlcclxuICB9XHJcbiAgaWYgKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgIGNvbnN0IGFuY2hvciA9IGNsYW1wUG9zaXRpb24oZG9jLCBzZWxlY3Rpb24uYW5jaG9yKVxyXG4gICAgY29uc3QgaGVhZCA9IGNsYW1wUG9zaXRpb24oZG9jLCBzZWxlY3Rpb24uaGVhZClcclxuICAgIGNvbnN0IGFuY2hvck5vZGUgPSBub2RlQXRQYXRoKGRvYywgYW5jaG9yLnBhdGgpXHJcbiAgICBjb25zdCBoZWFkTm9kZSA9IG5vZGVBdFBhdGgoZG9jLCBoZWFkLnBhdGgpXHJcbiAgICBpZiAoYW5jaG9yTm9kZT8uaXNUZXh0YmxvY2sgJiYgaGVhZE5vZGU/LmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihhbmNob3IsIGhlYWQpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gc2VsZWN0aW9uTmVhcihkb2MsIGFuY2hvcilcclxuICB9XHJcbiAgcmV0dXJuIHNlbGVjdGlvbk5lYXIoZG9jLCBzZWxlY3Rpb24uZnJvbSlcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBIVE1MU3BlYywgTWFya1NwZWMsIE5vZGVTcGVjIH0gZnJvbSAnLi4vbW9kZWwvc2NoZW1hJ1xyXG5cclxuY29uc3QgU0FGRV9QUk9UT0NPTFMgPSAvXig/Omh0dHBzP3xtYWlsdG98dGVsfGZ0cCk6L2lcclxuXHJcbi8qKiBBbGxvdyBvbmx5IHNhZmUgVVJMIHByb3RvY29scyAoYW5kIHJlbGF0aXZlIFVSTHMpIGluIHNlcmlhbGl6ZWQgbGlua3MuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzYWZlSHJlZihocmVmOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiBocmVmICE9PSAnc3RyaW5nJyB8fCBocmVmLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICBjb25zdCB0cmltbWVkID0gaHJlZi50cmltKClcclxuICAvLyBSZWplY3QgY29udHJvbCBjaGFyYWN0ZXJzIHRoYXQgY2FuIHNtdWdnbGUgXCJqYXZhXFx0c2NyaXB0OlwiIHN0eWxlIFVSTHMuXHJcbiAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0NvbnRyb2xDaGFyYWN0ZXJzSW5SZWdleDogcmVqZWN0aW5nIHRoZW0gaXMgdGhlIHBvaW50XHJcbiAgaWYgKC9bXFx1MDAwMC1cXHUwMDFmXFx1MDA3Zi1cXHUwMDlmXS8udGVzdCh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICBpZiAoL15bYS16XVthLXowLTkrLi1dKjovaS50ZXN0KHRyaW1tZWQpICYmICFTQUZFX1BST1RPQ09MUy50ZXN0KHRyaW1tZWQpKSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiB0cmltbWVkXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbWFnZSBzb3VyY2VzIGFsbG93IGV2ZXJ5dGhpbmcge0BsaW5rIHNhZmVIcmVmfSBkb2VzLCBwbHVzIHRoZSB0d28gc2NoZW1lc1xyXG4gKiB0aGF0IG9ubHkgZXZlciB5aWVsZCBpbmVydCBieXRlczogYGRhdGE6aW1hZ2UvKmAgYW5kIGBibG9iOmAuIEJvdGggYXJlXHJcbiAqIHByb2R1Y2VkIGJ5IHRoZSBidW5kbGVkIHN0b3JhZ2UgYWRhcHRlcnMsIGFuZCBuZWl0aGVyIGNhbiBleGVjdXRlLCB1bmxpa2VcclxuICogYSBgZGF0YTp0ZXh0L2h0bWxgIGhyZWYsIHdoaWNoIGlzIHdoeSBsaW5rcyBrZWVwIHRoZSBzdHJpY3RlciBydWxlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNhZmVJbWFnZVNyYyhzcmM6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcclxuICBpZiAodHlwZW9mIHNyYyAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHNyYy50cmltKClcclxuICBpZiAodHJpbW1lZC5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0NvbnRyb2xDaGFyYWN0ZXJzSW5SZWdleDogcmVqZWN0aW5nIHRoZW0gaXMgdGhlIHBvaW50XHJcbiAgaWYgKC9bXFx1MDAwMC1cXHUwMDFmXFx1MDA3Zi1cXHUwMDlmXS8udGVzdCh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICBpZiAoU0FGRV9JTUFHRV9TQ0hFTUVTLnRlc3QodHJpbW1lZCkpIHJldHVybiB0cmltbWVkXHJcbiAgcmV0dXJuIHNhZmVIcmVmKHRyaW1tZWQpXHJcbn1cclxuXHJcbi8qKiBgZGF0YTpgIHJlc3RyaWN0ZWQgdG8gaW1hZ2UgbWVkaWEgdHlwZXMsIHNvIG5vIG1hcmt1cCBjYW4gcmlkZSBhbG9uZy4gKi9cclxuY29uc3QgU0FGRV9JTUFHRV9TQ0hFTUVTID0gL14oPzpkYXRhOmltYWdlXFwvW2EtejAtOS4rLV0rWzssXXxibG9iOikvaVxyXG5cclxuY29uc3QgQ1NTX1VOU0FGRSA9IC9bPD5cIicoKTt7fV18dXJsXFwofGV4cHJlc3Npb258amF2YXNjcmlwdDp8QGltcG9ydC9pXHJcblxyXG4vKipcclxuICogQWxsb3cgb25seSBzaW1wbGUsIHNlbGYtY29udGFpbmVkIENTUyB2YWx1ZXMgaW4gc3R5bGUgYXR0cmlidXRlcy4gQW55dGhpbmdcclxuICogdGhhdCBjb3VsZCBvcGVuIGEgbmV3IGRlY2xhcmF0aW9uLCBjYWxsIHVybCgpIG9yIHNtdWdnbGUgc2NyaXB0IGlzXHJcbiAqIHJlamVjdGVkIG91dHJpZ2h0IHJhdGhlciB0aGFuIGVzY2FwZWQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2FmZUNTU1ZhbHVlKHZhbHVlOiB1bmtub3duLCBtYXhMZW5ndGggPSAxMjApOiBzdHJpbmcgfCBudWxsIHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGxcclxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpXHJcbiAgaWYgKHRyaW1tZWQubGVuZ3RoID09PSAwIHx8IHRyaW1tZWQubGVuZ3RoID4gbWF4TGVuZ3RoKSByZXR1cm4gbnVsbFxyXG4gIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IHJlamVjdGluZyB0aGVtIGlzIHRoZSBwb2ludFxyXG4gIGlmICgvW1xcdTAwMDAtXFx1MDAxZlxcdTAwN2YtXFx1MDA5Zl0vLnRlc3QodHJpbW1lZCkpIHJldHVybiBudWxsXHJcbiAgaWYgKENTU19VTlNBRkUudGVzdCh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICByZXR1cm4gdHJpbW1lZFxyXG59XHJcblxyXG4vKipcclxuICogQSBmb250IHN0YWNrLiBRdW90ZWQgZmFtaWx5IG5hbWVzIGFyZSBhbGxvd2VkLCB1bmxpa2Ugb3RoZXIgQ1NTIHZhbHVlcyxcclxuICogYnV0IG9ubHkgYXMgYmFsYW5jZWQgcXVvdGVzIGFyb3VuZCBwbGFpbiB3b3JkcywgbmV2ZXIgYXMgYSB3YXkgdG8gY2xvc2VcclxuICogdGhlIGRlY2xhcmF0aW9uIGFuZCBzdGFydCBhbm90aGVyLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNhZmVGb250RmFtaWx5KHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKVxyXG4gIGlmICh0cmltbWVkLmxlbmd0aCA9PT0gMCB8fCB0cmltbWVkLmxlbmd0aCA+IDIwMCkgcmV0dXJuIG51bGxcclxuICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQ29udHJvbENoYXJhY3RlcnNJblJlZ2V4OiByZWplY3RpbmcgdGhlbSBpcyB0aGUgcG9pbnRcclxuICBpZiAoL1tcXHUwMDAwLVxcdTAwMWZcXHUwMDdmLVxcdTAwOWZdLy50ZXN0KHRyaW1tZWQpKSByZXR1cm4gbnVsbFxyXG4gIGlmICgvWzw+KCk7e31dfHVybFxcKHxleHByZXNzaW9ufGphdmFzY3JpcHQ6fEBpbXBvcnQvaS50ZXN0KHRyaW1tZWQpKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGZhbWlsaWVzID0gdHJpbW1lZC5zcGxpdCgnLCcpLm1hcCgoZmFtaWx5KSA9PiBmYW1pbHkudHJpbSgpKVxyXG4gIGlmIChmYW1pbGllcy5sZW5ndGggPT09IDAgfHwgZmFtaWxpZXMubGVuZ3RoID4gMTIpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIGZhbWlsaWVzLmV2ZXJ5KChmYW1pbHkpID0+IEZPTlRfRkFNSUxZLnRlc3QoZmFtaWx5KSkgPyBmYW1pbGllcy5qb2luKCcsICcpIDogbnVsbFxyXG59XHJcblxyXG5jb25zdCBGT05UX0ZBTUlMWSA9IC9eKFwiW1xcdyBcXC1dK1wifCdbXFx3IFxcLV0rJ3xbXFx3LV0rKSQvXHJcblxyXG4vKipcclxuICogTmFtZWQsIGhleCwgcmdiKCkgYW5kIGhzbCgpIGNvbG9ycyBvbmx5LiBWYWxpZGF0ZWQgYWdhaW5zdCBhbiBleHBsaWNpdFxyXG4gKiBncmFtbWFyIHJhdGhlciB0aGFuIHRoZSBnZW5lcmFsIENTUyBzYW5pdGl6ZXIsIHdoaWNoIGZvcmJpZHMgdGhlXHJcbiAqIHBhcmVudGhlc2VzIHRoZXNlIGZ1bmN0aW9uYWwgbm90YXRpb25zIG5lZWQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2FmZUNvbG9yKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKVxyXG4gIGlmICh0cmltbWVkLmxlbmd0aCA9PT0gMCB8fCB0cmltbWVkLmxlbmd0aCA+IDY0KSByZXR1cm4gbnVsbFxyXG4gIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IHJlamVjdGluZyB0aGVtIGlzIHRoZSBwb2ludFxyXG4gIGlmICgvW1xcdTAwMDAtXFx1MDAxZlxcdTAwN2YtXFx1MDA5Zl0vLnRlc3QodHJpbW1lZCkpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIENPTE9SLnRlc3QodHJpbW1lZCkgPyB0cmltbWVkIDogbnVsbFxyXG59XHJcblxyXG5jb25zdCBDT0xPUiA9XHJcbiAgL14oI1swLTlhLWZdezMsOH18W2Etel0rfHJnYmE/XFwoICpcXGR7MSwzfSU/ICooLHwgKSAqXFxkezEsM30lPyAqKCx8ICkgKlxcZHsxLDN9JT8gKigoLHxcXC8pICpbXFxkLl0rJT8gKik/XFwpfGhzbGE/XFwoICpbXFxkLl0rKGRlZ3xyYWR8dHVybik/ICooLHwgKSAqW1xcZC5dKyU/ICooLHwgKSAqW1xcZC5dKyU/ICooKCx8XFwvKSAqW1xcZC5dKyU/ICopP1xcKSkkL2lcclxuXHJcbi8qKiBBIENTUyBsZW5ndGggd2l0aCBhbiBleHBsaWNpdCB1bml0LCBvciBhIGJhcmUgbnVtYmVyIHRyZWF0ZWQgYXMgcHguICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzYWZlTGVuZ3RoKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgY29uc3QgY3NzID0gc2FmZUNTU1ZhbHVlKHZhbHVlLCAzMilcclxuICBpZiAoIWNzcykgcmV0dXJuIG51bGxcclxuICBpZiAoL15cXGQrKFxcLlxcZCspPyQvLnRlc3QoY3NzKSkgcmV0dXJuIGAke2Nzc31weGBcclxuICByZXR1cm4gL15cXGQrKFxcLlxcZCspPyhweHxwdHxlbXxyZW18JXx2d3x2aHxjaCkkL2kudGVzdChjc3MpID8gY3NzIDogbnVsbFxyXG59XHJcblxyXG4vKiogQWxpZ25tZW50LCBpbmRlbnQgYW5kIHZlcnRpY2FsLXJoeXRobSBhdHRycyBzaGFyZWQgYnkgdGV4dGJsb2Nrcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGJsb2NrTGF5b3V0QXR0cnMoKTogUmVjb3JkPHN0cmluZywgeyBkZWZhdWx0PzogdW5rbm93biB9PiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGFsaWduOiB7IGRlZmF1bHQ6IG51bGwgfSxcclxuICAgIGluZGVudDogeyBkZWZhdWx0OiAwIH0sXHJcbiAgICBsaW5lSGVpZ2h0OiB7IGRlZmF1bHQ6IG51bGwgfSxcclxuICAgIHNwYWNlQmVmb3JlOiB7IGRlZmF1bHQ6IG51bGwgfSxcclxuICAgIHNwYWNlQWZ0ZXI6IHsgZGVmYXVsdDogbnVsbCB9LFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIExpbmUgaGVpZ2h0IGFjY2VwdHMgYSBiYXJlIG11bHRpcGxpZXIgKGAxLjVgKSBhcyB3ZWxsIGFzIGEgbGVuZ3RoLCBzbyBpdFxyXG4gKiBjYW5ub3QgZ28gdGhyb3VnaCB7QGxpbmsgc2FmZUxlbmd0aH0uIFRoYXQgaGVscGVyIHJld3JpdGVzIGEgdW5pdGxlc3NcclxuICogbnVtYmVyIGFzIHB4LCB3aGljaCBpcyBleGFjdGx5IHRoZSB3cm9uZyByZWFkaW5nIGhlcmUuIFVuaXRsZXNzIHZhbHVlcyBwYXNzXHJcbiAqIHRocm91Z2ggdGhlIGdlbmVyYWwgQ1NTIHNhbml0aXplciBhbmQgYXJlIHRoZW4gcmFuZ2UtY2hlY2tlZDsgYW55dGhpbmcgd2l0aFxyXG4gKiBhIHVuaXQgZmFsbHMgYmFjayB0byB7QGxpbmsgc2FmZUxlbmd0aH0uXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2FmZUxpbmVIZWlnaHQodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcclxuICBjb25zdCByYXcgPSB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInID8gU3RyaW5nKHZhbHVlKSA6IHZhbHVlXHJcbiAgY29uc3QgY3NzID0gc2FmZUNTU1ZhbHVlKHJhdywgMzIpXHJcbiAgaWYgKCFjc3MpIHJldHVybiBudWxsXHJcbiAgaWYgKC9eXFxkKyhcXC5cXGQrKT8kLy50ZXN0KGNzcykpIHJldHVybiBOdW1iZXIucGFyc2VGbG9hdChjc3MpIDw9IDEwID8gY3NzIDogbnVsbFxyXG4gIHJldHVybiBzYWZlTGVuZ3RoKGNzcylcclxufVxyXG5cclxuY29uc3QgQUxJR05NRU5UUyA9IG5ldyBTZXQoWydsZWZ0JywgJ2NlbnRlcicsICdyaWdodCcsICdqdXN0aWZ5J10pXHJcblxyXG4vKiogTWF4aW11bSBpbmRlbnQgc3RlcHM7IGVhY2ggc3RlcCBpcyBvbmUgMi41cmVtIG1hcmdpbi4gKi9cclxuZXhwb3J0IGNvbnN0IE1BWF9JTkRFTlQgPSA4XHJcblxyXG4vKipcclxuICogQW4gZWxlbWVudCBpZCBzYWZlIHRvIGVtaXQ6IGEgbGV0dGVyLCB0aGVuIHVwIHRvIDEyNyBsZXR0ZXJzLCBkaWdpdHMsIGAtYCxcclxuICogYF9gLCBgOmAgb3IgYC5gLiBJZHMgdGhlIGtpdCBnZW5lcmF0ZXMgZm9yIGl0cyBvd24gbmF2aWdhdGlvbiAoYHR2eC3igKZgKVxyXG4gKiBhcmUgcmVqZWN0ZWQgc28gdGhleSBjYW4gbmV2ZXIgbGVhayBmcm9tIHRoZSByZW5kZXJlZCBET00gaW50byBhIGRvY3VtZW50LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNhZmVFbGVtZW50SWQodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCBudWxsIHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGxcclxuICBpZiAoIS9eW0EtWmEtel1bXFx3Oi4tXXswLDEyN30kLy50ZXN0KHZhbHVlKSB8fCB2YWx1ZS5zdGFydHNXaXRoKCd0dngtJykpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIHZhbHVlXHJcbn1cclxuXHJcbi8qKiBSZW5kZXIgYWxpZ24vaW5kZW50L2xpbmUtaGVpZ2h0L3NwYWNpbmcgYXMgYSBzYW5pdGl6ZWQgc3R5bGUgYXR0cmlidXRlLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gYmxvY2tMYXlvdXRIVE1MKG5vZGU6IEVkaXRvck5vZGUpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcclxuICBjb25zdCBkZWNsYXJhdGlvbnM6IHN0cmluZ1tdID0gW11cclxuICBjb25zdCBhbGlnbiA9IHR5cGVvZiBub2RlLmF0dHJzLmFsaWduID09PSAnc3RyaW5nJyA/IG5vZGUuYXR0cnMuYWxpZ24gOiBudWxsXHJcbiAgaWYgKGFsaWduICYmIEFMSUdOTUVOVFMuaGFzKGFsaWduKSkgZGVjbGFyYXRpb25zLnB1c2goYHRleHQtYWxpZ246ICR7YWxpZ259YClcclxuICBjb25zdCBpbmRlbnQgPSB0eXBlb2Ygbm9kZS5hdHRycy5pbmRlbnQgPT09ICdudW1iZXInID8gbm9kZS5hdHRycy5pbmRlbnQgOiAwXHJcbiAgY29uc3Qgc3RlcHMgPSBNYXRoLm1pbihNQVhfSU5ERU5ULCBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKGluZGVudCkpKVxyXG4gIGlmIChzdGVwcyA+IDApIGRlY2xhcmF0aW9ucy5wdXNoKGBtYXJnaW4tbGVmdDogJHtzdGVwcyAqIDIuNX1yZW1gKVxyXG4gIGNvbnN0IGxpbmVIZWlnaHQgPSBzYWZlTGluZUhlaWdodChub2RlLmF0dHJzLmxpbmVIZWlnaHQpXHJcbiAgaWYgKGxpbmVIZWlnaHQpIGRlY2xhcmF0aW9ucy5wdXNoKGBsaW5lLWhlaWdodDogJHtsaW5lSGVpZ2h0fWApXHJcbiAgY29uc3QgYmVmb3JlID0gc2FmZUxlbmd0aChub2RlLmF0dHJzLnNwYWNlQmVmb3JlKVxyXG4gIGlmIChiZWZvcmUpIGRlY2xhcmF0aW9ucy5wdXNoKGBtYXJnaW4tdG9wOiAke2JlZm9yZX1gKVxyXG4gIGNvbnN0IGFmdGVyID0gc2FmZUxlbmd0aChub2RlLmF0dHJzLnNwYWNlQWZ0ZXIpXHJcbiAgaWYgKGFmdGVyKSBkZWNsYXJhdGlvbnMucHVzaChgbWFyZ2luLWJvdHRvbTogJHthZnRlcn1gKVxyXG4gIHJldHVybiBkZWNsYXJhdGlvbnMubGVuZ3RoID4gMCA/IHsgc3R5bGU6IGRlY2xhcmF0aW9ucy5qb2luKCc7ICcpIH0gOiB7fVxyXG59XHJcblxyXG4vKiogUmVhZCBhbGlnbi9pbmRlbnQvbGluZS1oZWlnaHQvc3BhY2luZyBiYWNrIGZyb20gaW1wb3J0ZWQgSFRNTC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQmxvY2tMYXlvdXQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgY29uc3QgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge31cclxuICBjb25zdCBhbGlnbiA9IGVsZW1lbnQuc3R5bGUudGV4dEFsaWduIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhbGlnbicpXHJcbiAgaWYgKGFsaWduICYmIEFMSUdOTUVOVFMuaGFzKGFsaWduKSkgYXR0cnMuYWxpZ24gPSBhbGlnblxyXG4gIGNvbnN0IG1hcmdpbiA9IE51bWJlci5wYXJzZUZsb2F0KGVsZW1lbnQuc3R5bGUubWFyZ2luTGVmdClcclxuICBpZiAoTnVtYmVyLmlzRmluaXRlKG1hcmdpbikgJiYgbWFyZ2luID4gMCkge1xyXG4gICAgYXR0cnMuaW5kZW50ID0gTWF0aC5taW4oTUFYX0lOREVOVCwgTWF0aC5yb3VuZChtYXJnaW4gLyAyLjUpKVxyXG4gIH1cclxuICBjb25zdCBsaW5lSGVpZ2h0ID0gc2FmZUxpbmVIZWlnaHQoZWxlbWVudC5zdHlsZS5saW5lSGVpZ2h0KVxyXG4gIGlmIChsaW5lSGVpZ2h0KSBhdHRycy5saW5lSGVpZ2h0ID0gbGluZUhlaWdodFxyXG4gIGNvbnN0IGJlZm9yZSA9IHNhZmVMZW5ndGgoZWxlbWVudC5zdHlsZS5tYXJnaW5Ub3ApXHJcbiAgaWYgKGJlZm9yZSkgYXR0cnMuc3BhY2VCZWZvcmUgPSBiZWZvcmVcclxuICBjb25zdCBhZnRlciA9IHNhZmVMZW5ndGgoZWxlbWVudC5zdHlsZS5tYXJnaW5Cb3R0b20pXHJcbiAgaWYgKGFmdGVyKSBhdHRycy5zcGFjZUFmdGVyID0gYWZ0ZXJcclxuICByZXR1cm4gYXR0cnNcclxufVxyXG5cclxuLyoqXHJcbiAqIGBsaXN0LXN0eWxlLXR5cGVgIHZhbHVlcyBlYWNoIGxpc3Qga2luZCBhY2NlcHRzLiBBbnl0aGluZyBvdXRzaWRlIHRoZXNlXHJcbiAqIHNldHMgaXMgZHJvcHBlZCByYXRoZXIgdGhhbiBlc2NhcGVkOiB0aGUgdmFsdWUgbGFuZHMgaW4gYSBgc3R5bGVgXHJcbiAqIGF0dHJpYnV0ZSwgc28gYW4gYWxsb3dsaXN0IGlzIHRoZSBvbmx5IHRydXN0d29ydGh5IGZpbHRlci5cclxuICovXHJcbmV4cG9ydCBjb25zdCBCVUxMRVRfTElTVF9TVFlMRVM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFsnZGlzYycsICdjaXJjbGUnLCAnc3F1YXJlJ10pXHJcblxyXG5leHBvcnQgY29uc3QgT1JERVJFRF9MSVNUX1NUWUxFUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW1xyXG4gICdkZWNpbWFsJyxcclxuICAnbG93ZXItYWxwaGEnLFxyXG4gICd1cHBlci1hbHBoYScsXHJcbiAgJ2xvd2VyLXJvbWFuJyxcclxuICAndXBwZXItcm9tYW4nLFxyXG5dKVxyXG5cclxuLyoqIEV2ZXJ5IG1hcmtlciB2YWx1ZSBhbnkgbGlzdCB0eXBlIGFsbG93cywgZm9yIGNvbW1hbmQtbGV2ZWwgdmFsaWRhdGlvbi4gKi9cclxuZXhwb3J0IGNvbnN0IExJU1RfU1RZTEVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXHJcbiAgLi4uQlVMTEVUX0xJU1RfU1RZTEVTLFxyXG4gIC4uLk9SREVSRURfTElTVF9TVFlMRVMsXHJcbl0pXHJcblxyXG4vKiogTWFya2VyIHZhbHVlcyBsZWdhbCBvbiBvbmUgbGlzdCB0eXBlOyB1bmtub3duIHR5cGVzIGFsbG93IG5vbmUuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBsaXN0U3R5bGVzRm9yKGxpc3RUeXBlTmFtZTogc3RyaW5nKTogUmVhZG9ubHlTZXQ8c3RyaW5nPiB7XHJcbiAgaWYgKGxpc3RUeXBlTmFtZSA9PT0gJ2J1bGxldExpc3QnKSByZXR1cm4gQlVMTEVUX0xJU1RfU1RZTEVTXHJcbiAgaWYgKGxpc3RUeXBlTmFtZSA9PT0gJ29yZGVyZWRMaXN0JykgcmV0dXJuIE9SREVSRURfTElTVF9TVFlMRVNcclxuICByZXR1cm4gRU1QVFlfU1RZTEVTXHJcbn1cclxuXHJcbmNvbnN0IEVNUFRZX1NUWUxFUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKVxyXG5cclxuLyoqIFJlbmRlciBhIHZhbGlkYXRlZCBgbGlzdFN0eWxlYCBhdHRyIGFzIGEgc3R5bGUgYXR0cmlidXRlLCBvciBub3RoaW5nLiAqL1xyXG5mdW5jdGlvbiBsaXN0U3R5bGVIVE1MKG5vZGU6IEVkaXRvck5vZGUsIGFsbG93ZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcclxuICBjb25zdCBzdHlsZSA9IG5vZGUuYXR0cnMubGlzdFN0eWxlXHJcbiAgaWYgKHR5cGVvZiBzdHlsZSAhPT0gJ3N0cmluZycgfHwgIWFsbG93ZWQuaGFzKHN0eWxlKSkgcmV0dXJuIHt9XHJcbiAgcmV0dXJuIHsgc3R5bGU6IGBsaXN0LXN0eWxlLXR5cGU6ICR7c3R5bGV9YCB9XHJcbn1cclxuXHJcbi8qKiBSZWFkIGEgYGxpc3Qtc3R5bGUtdHlwZWAgYmFjayBmcm9tIGltcG9ydGVkIEhUTUwsIGlmIGl0IGlzIGFsbG93ZWQuICovXHJcbmZ1bmN0aW9uIHBhcnNlTGlzdFN0eWxlKFxyXG4gIGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxyXG4gIGFsbG93ZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4sXHJcbik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICBjb25zdCBzdHlsZSA9IGVsZW1lbnQuc3R5bGUubGlzdFN0eWxlVHlwZVxyXG4gIHJldHVybiBhbGxvd2VkLmhhcyhzdHlsZSkgPyB7IGxpc3RTdHlsZTogc3R5bGUgfSA6IHt9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgYDxpbnB1dCB0eXBlPWNoZWNrYm94PmAgYSB0YXNrIGl0ZW0gY2FycmllcyBpbiBwYXN0ZWQgbWFya2Rvd24sIGxvb2tlZFxyXG4gKiB1cCBhbW9uZyB0aGUgZWxlbWVudCdzIG93biBjaGlsZHJlbiAob3Igb25lIHdyYXBwZXIgcGFyYWdyYXBoIGRlZXApLiBUaGVcclxuICogc2VhcmNoIGlzIGRlbGliZXJhdGVseSBub3QgYSBkZXNjZW5kYW50IG9uZTogYSBwbGFpbiBgPGxpPmAgaG9sZGluZyBhXHJcbiAqIG5lc3RlZCBjaGVja2JveCBsaXN0IG11c3Qgc3RheSBhIHBsYWluIGl0ZW0sIGFuZCBpdHMgbGlzdCBhIGJ1bGxldCBsaXN0LlxyXG4gKiBXcml0dGVuIGFzIGFuIGV4cGxpY2l0IHdhbGsgcmF0aGVyIHRoYW4gYSBgOnNjb3BlID5gIHNlbGVjdG9yLCB3aGljaCBub3RcclxuICogZXZlcnkgRE9NIGltcGxlbWVudGF0aW9uIHRoZSBwYXJzZXIgcnVucyBhZ2FpbnN0IHN1cHBvcnRzLlxyXG4gKi9cclxuZnVuY3Rpb24gb3duQ2hlY2tib3goZWxlbWVudDogRWxlbWVudCk6IEVsZW1lbnQgfCBudWxsIHtcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGVsZW1lbnQuY2hpbGRyZW4pIHtcclxuICAgIGlmIChpc0NoZWNrYm94KGNoaWxkKSkgcmV0dXJuIGNoaWxkXHJcbiAgICBpZiAoY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpICE9PSAncCcpIGNvbnRpbnVlXHJcbiAgICBmb3IgKGNvbnN0IGlubmVyIG9mIGNoaWxkLmNoaWxkcmVuKSB7XHJcbiAgICAgIGlmIChpc0NoZWNrYm94KGlubmVyKSkgcmV0dXJuIGlubmVyXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQ2hlY2tib3goZWxlbWVudDogRWxlbWVudCk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiAoXHJcbiAgICBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2lucHV0JyAmJlxyXG4gICAgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd0eXBlJykgPz8gJycpLnRvTG93ZXJDYXNlKCkgPT09ICdjaGVja2JveCdcclxuICApXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIGNvZGUgZmVuY2UncyBsYW5ndWFnZSBuYW1lLiBSZWFsIG5hbWVzIGFyZSBzaG9ydCBhbmQgbWFkZSBvZiBsZXR0ZXJzLFxyXG4gKiBkaWdpdHMgYW5kIGEgbGl0dGxlIHB1bmN0dWF0aW9uIChgYysrYCwgYGMjYCwgYG9iamVjdGl2ZS1jYCksIHNvIGFueXRoaW5nXHJcbiAqIGVsc2UsIGluY2x1ZGluZyB3aGF0ZXZlciBhIGhvc3RpbGUgZG9jdW1lbnQgcHV0IGluIHRoZSBhdHRyaWJ1dGUsIGlzXHJcbiAqIGRyb3BwZWQgcmF0aGVyIHRoYW4gd3JpdHRlbiBiYWNrIG91dC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzYWZlTGFuZ3VhZ2VOYW1lKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpXHJcbiAgcmV0dXJuIC9eW2EtejAtOV1bYS16MC05KyMuXy1dezAsMzF9JC8udGVzdCh0cmltbWVkKSA/IHRyaW1tZWQgOiBudWxsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgbGFuZ3VhZ2Ugb2YgYSBgPHByZT5gLCBmcm9tIG91ciBvd24gYXR0cmlidXRlIG9yIGZyb20gdGhlXHJcbiAqIGBsYW5ndWFnZS0qYCAvIGBsYW5nLSpgIGNsYXNzIGV2ZXJ5IG90aGVyIHJlbmRlcmVyIG1hcmtzIGNvZGUgd2l0aCwgd2hpY2hcclxuICogaXMgd2hhdCBhcnJpdmVzIHdoZW4gYSBibG9jayBpcyBwYXN0ZWQgZnJvbSBhIGRvY3Mgc2l0ZSBvciBhIHJlcG9zaXRvcnkuXHJcbiAqL1xyXG5mdW5jdGlvbiBsYW5ndWFnZU9mKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgY29uc3QgZGVjbGFyZWQgPSBzYWZlTGFuZ3VhZ2VOYW1lKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWxhbmd1YWdlJykpXHJcbiAgaWYgKGRlY2xhcmVkKSByZXR1cm4gZGVjbGFyZWRcclxuICBjb25zdCBjb2RlID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdjb2RlJylcclxuICBmb3IgKGNvbnN0IGhvc3Qgb2YgW2VsZW1lbnQsIGNvZGVdKSB7XHJcbiAgICBmb3IgKGNvbnN0IG5hbWUgb2YgaG9zdD8uY2xhc3NMaXN0ID8/IFtdKSB7XHJcbiAgICAgIGNvbnN0IG1hdGNoID0gL14oPzpsYW5ndWFnZXxsYW5nKS0oLispJC8uZXhlYyhuYW1lKVxyXG4gICAgICBjb25zdCBsYW5ndWFnZSA9IG1hdGNoID8gc2FmZUxhbmd1YWdlTmFtZShtYXRjaFsxXSkgOiBudWxsXHJcbiAgICAgIGlmIChsYW5ndWFnZSkgcmV0dXJuIGxhbmd1YWdlXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbi8qKiBUaGUgYnVpbHQtaW4gbm9kZSBzZXQ6IGRvYywgcGFyYWdyYXBoLCBoZWFkaW5ncywgcXVvdGUsIGNvZGUsIGxpc3RzLCDigKYgKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHROb2RlcygpOiBSZWNvcmQ8c3RyaW5nLCBOb2RlU3BlYz4ge1xyXG4gIHJldHVybiB7XHJcbiAgICBkb2M6IHsgY29udGVudDogJ2Jsb2NrKycgfSxcclxuICAgIHBhcmFncmFwaDoge1xyXG4gICAgICBjb250ZW50OiAnaW5saW5lKicsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICBhdHRyczogYmxvY2tMYXlvdXRBdHRycygpLFxyXG4gICAgICB0b0hUTUw6IChub2RlKSA9PiAoeyB0YWc6ICdwJywgYXR0cnM6IGJsb2NrTGF5b3V0SFRNTChub2RlKSB9KSxcclxuICAgICAgcGFyc2VIVE1MOiBbeyB0YWc6ICdwJywgZ2V0QXR0cnM6IHBhcnNlQmxvY2tMYXlvdXQgfV0sXHJcbiAgICB9LFxyXG4gICAgaGVhZGluZzoge1xyXG4gICAgICBjb250ZW50OiAnaW5saW5lKicsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICAvLyBgaWRgIG1ha2VzIGEgaGVhZGluZyBhIGxpbmsgdGFyZ2V0IHdpdGhpbiB0aGUgZG9jdW1lbnQ7IGl0IGlzIG51bGxcclxuICAgICAgLy8gdW50aWwgc29tZXRoaW5nICh0aGUgbGluayBkaWFsb2csIGFuIGltcG9ydCkgbmVlZHMgb25lLlxyXG4gICAgICBhdHRyczogeyBsZXZlbDogeyBkZWZhdWx0OiAxIH0sIGlkOiB7IGRlZmF1bHQ6IG51bGwgfSwgLi4uYmxvY2tMYXlvdXRBdHRycygpIH0sXHJcbiAgICAgIHRvSFRNTDogKG5vZGUpID0+IHtcclxuICAgICAgICBjb25zdCBhdHRycyA9IGJsb2NrTGF5b3V0SFRNTChub2RlKVxyXG4gICAgICAgIGNvbnN0IGlkID0gc2FmZUVsZW1lbnRJZChub2RlLmF0dHJzLmlkKVxyXG4gICAgICAgIHJldHVybiB7IHRhZzogYGgke2NsYW1wTGV2ZWwobm9kZS5hdHRycy5sZXZlbCl9YCwgYXR0cnM6IGlkID8geyAuLi5hdHRycywgaWQgfSA6IGF0dHJzIH1cclxuICAgICAgfSxcclxuICAgICAgcGFyc2VIVE1MOiBbMSwgMiwgMywgNCwgNSwgNl0ubWFwKChsZXZlbCkgPT4gKHtcclxuICAgICAgICB0YWc6IGBoJHtsZXZlbH1gLFxyXG4gICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4gKHtcclxuICAgICAgICAgIGxldmVsLFxyXG4gICAgICAgICAgaWQ6IHNhZmVFbGVtZW50SWQoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2lkJykpLFxyXG4gICAgICAgICAgLi4ucGFyc2VCbG9ja0xheW91dChlbGVtZW50KSxcclxuICAgICAgICB9KSxcclxuICAgICAgfSkpLFxyXG4gICAgfSxcclxuICAgIGJsb2NrcXVvdGU6IHtcclxuICAgICAgY29udGVudDogJ2Jsb2NrKycsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ2Jsb2NrcXVvdGUnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ2Jsb2NrcXVvdGUnIH1dLFxyXG4gICAgfSxcclxuICAgIGNvZGVCbG9jazoge1xyXG4gICAgICBjb250ZW50OiAndGV4dConLFxyXG4gICAgICBncm91cDogJ2Jsb2NrJyxcclxuICAgICAgbWFya3M6ICcnLFxyXG4gICAgICBhdHRyczogeyBsYW5ndWFnZTogeyBkZWZhdWx0OiBudWxsIH0gfSxcclxuICAgICAgcHJlc2VydmVXaGl0ZXNwYWNlOiB0cnVlLFxyXG4gICAgICB0b0hUTUw6IChub2RlKSA9PiB7XHJcbiAgICAgICAgY29uc3QgbGFuZ3VhZ2UgPSBzYWZlTGFuZ3VhZ2VOYW1lKG5vZGUuYXR0cnMubGFuZ3VhZ2UpXHJcbiAgICAgICAgY29uc3QgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fVxyXG4gICAgICAgIGlmIChsYW5ndWFnZSkgYXR0cnNbJ2RhdGEtbGFuZ3VhZ2UnXSA9IGxhbmd1YWdlXHJcbiAgICAgICAgcmV0dXJuIHsgdGFnOiAncHJlJywgYXR0cnMsIGNoaWxkVGFnOiAnY29kZScgfVxyXG4gICAgICB9LFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3ByZScsIGdldEF0dHJzOiAoZWxlbWVudCkgPT4gKHsgbGFuZ3VhZ2U6IGxhbmd1YWdlT2YoZWxlbWVudCkgfSkgfV0sXHJcbiAgICB9LFxyXG4gICAgaG9yaXpvbnRhbFJ1bGU6IHtcclxuICAgICAgZ3JvdXA6ICdibG9jaycsXHJcbiAgICAgIGF0b206IHRydWUsXHJcbiAgICAgIHRvSFRNTDogKCkgPT4gKHsgdGFnOiAnaHInLCBpc1ZvaWQ6IHRydWUgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAnaHInIH1dLFxyXG4gICAgfSxcclxuICAgIGhhcmRCcmVhazoge1xyXG4gICAgICBpbmxpbmU6IHRydWUsXHJcbiAgICAgIGF0b206IHRydWUsXHJcbiAgICAgIGdyb3VwOiAnaW5saW5lJyxcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdicicsIGlzVm9pZDogdHJ1ZSB9KSxcclxuICAgICAgcGFyc2VIVE1MOiBbeyB0YWc6ICdicicgfV0sXHJcbiAgICB9LFxyXG4gICAgdGFza0xpc3Q6IHtcclxuICAgICAgY29udGVudDogJ3Rhc2tJdGVtKycsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ3VsJywgYXR0cnM6IHsgJ2RhdGEtdHlwZSc6ICd0YXNrTGlzdCcgfSB9KSxcclxuICAgICAgLy8gUmVnaXN0ZXJlZCBiZWZvcmUgYnVsbGV0TGlzdCBzbyBib3RoIHJ1bGVzIGJlbG93IGFyZSBjb25zdWx0ZWQgZmlyc3RcclxuICAgICAgLy8gKFJ1bGVTZXQgdHJpZXMgYXR0cmlidXRlLWNvbnN0cmFpbmVkIHJ1bGVzIGFoZWFkIG9mIGJhcmUgb25lcywgYW5kXHJcbiAgICAgIC8vIG90aGVyd2lzZSBrZWVwcyByZWdpc3RyYXRpb24gb3JkZXIpLlxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICd1bCcsXHJcbiAgICAgICAgICBhdHRyaWJ1dGU6ICdkYXRhLXR5cGUnLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdHlwZScpID09PSAndGFza0xpc3QnID8ge30gOiBmYWxzZSksXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvLyBBIGJhcmUgYDx1bD5gIHdob3NlIGl0ZW1zIGNhcnJ5IGNoZWNrYm94ZXMsIEdpdEh1Yi1mbGF2b3VyZWRcclxuICAgICAgICAvLyBtYXJrZG93biwgYW5kIG1vc3QgbWFya2Rvd24gcmVuZGVyZXJzLiBUaGUgaXRlbXMgdGhlbXNlbHZlcyBwYXJzZVxyXG4gICAgICAgIC8vIGFzIGB0YXNrSXRlbWAsIHdoaWNoIG9ubHkgYSBgdGFza0xpc3RgIG1heSBjb250YWluLCBzbyB0aGlzIHJ1bGUgaXNcclxuICAgICAgICAvLyB3aGF0IGtlZXBzIHRoZSBwYXN0ZWQgbGlzdCBzY2hlbWEtdmFsaWQuXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdGFnOiAndWwnLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PlxyXG4gICAgICAgICAgICBbLi4uZWxlbWVudC5jaGlsZHJlbl0uc29tZShcclxuICAgICAgICAgICAgICAoY2hpbGQpID0+IGNoaWxkLnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2xpJyAmJiBvd25DaGVja2JveChjaGlsZCksXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICA/IHt9XHJcbiAgICAgICAgICAgICAgOiBmYWxzZSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIHRhc2tJdGVtOiB7XHJcbiAgICAgIGNvbnRlbnQ6ICdibG9jaysnLFxyXG4gICAgICBhdHRyczogeyBjaGVja2VkOiB7IGRlZmF1bHQ6IGZhbHNlIH0gfSxcclxuICAgICAgdG9IVE1MOiAobm9kZSkgPT4gKHtcclxuICAgICAgICB0YWc6ICdsaScsXHJcbiAgICAgICAgYXR0cnM6IHtcclxuICAgICAgICAgICdkYXRhLXR5cGUnOiAndGFza0l0ZW0nLFxyXG4gICAgICAgICAgJ2RhdGEtY2hlY2tlZCc6IG5vZGUuYXR0cnMuY2hlY2tlZCA9PT0gdHJ1ZSA/ICd0cnVlJyA6ICdmYWxzZScsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ2xpJyxcclxuICAgICAgICAgIGF0dHJpYnV0ZTogJ2RhdGEtY2hlY2tlZCcsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+ICh7IGNoZWNrZWQ6IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWNoZWNrZWQnKSA9PT0gJ3RydWUnIH0pLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy8gR2l0SHViLWZsYXZvdXJlZCBtYXJrZG93biBhbmQgb3RoZXIgZWRpdG9ycyBwYXN0ZSBhIGJhcmUgYDxsaT5gXHJcbiAgICAgICAgLy8gaG9sZGluZyBhbiBgPGlucHV0IHR5cGU9Y2hlY2tib3g+YC4gVGhlIHBhcnNlciBkcm9wcyB0aGUgaW5wdXRcclxuICAgICAgICAvLyBpdHNlbGYgKGl0IGlzIG9uIHRoZSBkYW5nZXJvdXMtdGFncyBsaXN0KSwgc28gdGhlIHN0YXRlIGhhcyB0byBiZVxyXG4gICAgICAgIC8vIHJlYWQgaGVyZSwgYmVmb3JlIHRoZSBlbGVtZW50J3MgY2hpbGRyZW4gYXJlIHdhbGtlZC4gTWF0Y2hpbmcgb25cclxuICAgICAgICAvLyB0aGUgaW5wdXQgaXMgYWxzbyB3aGF0IGRpc3Rpbmd1aXNoZXMgc3VjaCBhbiBgPGxpPmAgZnJvbSBhIHBsYWluXHJcbiAgICAgICAgLy8gb25lLCB3aGljaCBtdXN0IHN0YXkgYSBgbGlzdEl0ZW1gLlxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ2xpJyxcclxuICAgICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBib3ggPSBvd25DaGVja2JveChlbGVtZW50KVxyXG4gICAgICAgICAgICByZXR1cm4gYm94ID8geyBjaGVja2VkOiBib3guaGFzQXR0cmlidXRlKCdjaGVja2VkJykgfSA6IGZhbHNlXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gICAgYnVsbGV0TGlzdDoge1xyXG4gICAgICBjb250ZW50OiAnbGlzdEl0ZW0rJyxcclxuICAgICAgZ3JvdXA6ICdibG9jaycsXHJcbiAgICAgIGF0dHJzOiB7IGxpc3RTdHlsZTogeyBkZWZhdWx0OiBudWxsIH0gfSxcclxuICAgICAgdG9IVE1MOiAobm9kZSkgPT4gKHsgdGFnOiAndWwnLCBhdHRyczogbGlzdFN0eWxlSFRNTChub2RlLCBCVUxMRVRfTElTVF9TVFlMRVMpIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7IHRhZzogJ3VsJywgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiBwYXJzZUxpc3RTdHlsZShlbGVtZW50LCBCVUxMRVRfTElTVF9TVFlMRVMpIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gICAgb3JkZXJlZExpc3Q6IHtcclxuICAgICAgY29udGVudDogJ2xpc3RJdGVtKycsXHJcbiAgICAgIGdyb3VwOiAnYmxvY2snLFxyXG4gICAgICBhdHRyczogeyBzdGFydDogeyBkZWZhdWx0OiAxIH0sIGxpc3RTdHlsZTogeyBkZWZhdWx0OiBudWxsIH0gfSxcclxuICAgICAgdG9IVE1MOiAobm9kZSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gbGlzdFN0eWxlSFRNTChub2RlLCBPUkRFUkVEX0xJU1RfU1RZTEVTKVxyXG4gICAgICAgIGlmIChub2RlLmF0dHJzLnN0YXJ0ICE9PSAxKSBhdHRycy5zdGFydCA9IFN0cmluZyhub2RlLmF0dHJzLnN0YXJ0KVxyXG4gICAgICAgIHJldHVybiB7IHRhZzogJ29sJywgYXR0cnMgfVxyXG4gICAgICB9LFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICdvbCcsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBOdW1iZXIucGFyc2VJbnQoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3N0YXJ0JykgPz8gJzEnLCAxMClcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICBzdGFydDogTnVtYmVyLmlzTmFOKHN0YXJ0KSA/IDEgOiBzdGFydCxcclxuICAgICAgICAgICAgICAuLi5wYXJzZUxpc3RTdHlsZShlbGVtZW50LCBPUkRFUkVEX0xJU1RfU1RZTEVTKSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIGxpc3RJdGVtOiB7XHJcbiAgICAgIGNvbnRlbnQ6ICdibG9jaysnLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ2xpJyB9KSxcclxuICAgICAgcGFyc2VIVE1MOiBbeyB0YWc6ICdsaScgfV0sXHJcbiAgICB9LFxyXG4gICAgdGV4dDogeyBncm91cDogJ2lubGluZScgfSxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBUaGUgYnVpbHQtaW4gbWFyayBzZXQ6IGJvbGQsIGl0YWxpYywgdW5kZXJsaW5lLCBzdHJpa2UsIGNvZGUsIGxpbmssIOKApiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdE1hcmtzKCk6IFJlY29yZDxzdHJpbmcsIE1hcmtTcGVjPiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGJvbGQ6IHtcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdzdHJvbmcnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3N0cm9uZycgfSwgeyB0YWc6ICdiJyB9XSxcclxuICAgIH0sXHJcbiAgICBpdGFsaWM6IHtcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdlbScgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAnZW0nIH0sIHsgdGFnOiAnaScgfV0sXHJcbiAgICB9LFxyXG4gICAgdW5kZXJsaW5lOiB7XHJcbiAgICAgIHRvSFRNTDogKCkgPT4gKHsgdGFnOiAndScgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAndScgfV0sXHJcbiAgICB9LFxyXG4gICAgc3RyaWtldGhyb3VnaDoge1xyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ3MnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3MnIH0sIHsgdGFnOiAnc3RyaWtlJyB9LCB7IHRhZzogJ2RlbCcgfV0sXHJcbiAgICB9LFxyXG4gICAgY29kZToge1xyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ2NvZGUnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ2NvZGUnIH1dLFxyXG4gICAgfSxcclxuICAgIGxpbms6IHtcclxuICAgICAgYXR0cnM6IHsgaHJlZjoge30sIHRpdGxlOiB7IGRlZmF1bHQ6IG51bGwgfSwgdGFyZ2V0OiB7IGRlZmF1bHQ6IG51bGwgfSB9LFxyXG4gICAgICB0b0hUTUw6IChtYXJrKSA9PiB7XHJcbiAgICAgICAgY29uc3QgaHJlZiA9IHNhZmVIcmVmKG1hcmsuYXR0cnMuaHJlZilcclxuICAgICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IGhyZWYgPyB7IGhyZWYgfSA6IHt9XHJcbiAgICAgICAgaWYgKHR5cGVvZiBtYXJrLmF0dHJzLnRpdGxlID09PSAnc3RyaW5nJykgYXR0cnMudGl0bGUgPSBtYXJrLmF0dHJzLnRpdGxlXHJcbiAgICAgICAgLy8gQSBgdGFyZ2V0PV9ibGFua2AgbGluayB3aXRob3V0IHRoaXMgcmVsIGxldHMgdGhlIG9wZW5lZCBwYWdlIHJlYWNoXHJcbiAgICAgICAgLy8gYmFjayB0aHJvdWdoIGB3aW5kb3cub3BlbmVyYCBhbmQgcmV0YXJnZXQgdGhpcyBvbmUgKHJldmVyc2VcclxuICAgICAgICAvLyB0YWJuYWJiaW5nKSwgc28gdGhlIHR3byBhcmUgZW1pdHRlZCB0b2dldGhlciwgYWx3YXlzLlxyXG4gICAgICAgIGlmIChtYXJrLmF0dHJzLnRhcmdldCA9PT0gJ19ibGFuaycpIHtcclxuICAgICAgICAgIGF0dHJzLnRhcmdldCA9ICdfYmxhbmsnXHJcbiAgICAgICAgICBhdHRycy5yZWwgPSAnbm9vcGVuZXIgbm9yZWZlcnJlcidcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHsgdGFnOiAnYScsIGF0dHJzIH1cclxuICAgICAgfSxcclxuICAgICAgcGFyc2VIVE1MOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdGFnOiAnYScsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaHJlZiA9IHNhZmVIcmVmKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdocmVmJykpXHJcbiAgICAgICAgICAgIGlmICghaHJlZikgcmV0dXJuIGZhbHNlIC8vIHVuc2FmZSBvciBtaXNzaW5nIGxpbms6IGtlZXAgdGV4dCwgZHJvcCBtYXJrXHJcbiAgICAgICAgICAgIGNvbnN0IHRpdGxlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJylcclxuICAgICAgICAgICAgLy8gT25seSBgX2JsYW5rYCBpcyBtb2RlbGxlZDsgYW55IG90aGVyIHRhcmdldCBpcyBkcm9wcGVkIHJhdGhlclxyXG4gICAgICAgICAgICAvLyB0aGFuIHRydXN0ZWQsIHNpbmNlIGl0IGNhbiBuYW1lIGFuIGFyYml0cmFyeSBmcmFtZS5cclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3RhcmdldCcpID09PSAnX2JsYW5rJyA/ICdfYmxhbmsnIDogbnVsbFxyXG4gICAgICAgICAgICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IGhyZWYgfVxyXG4gICAgICAgICAgICBpZiAodGl0bGUpIGF0dHJzLnRpdGxlID0gdGl0bGVcclxuICAgICAgICAgICAgaWYgKHRhcmdldCkgYXR0cnMudGFyZ2V0ID0gdGFyZ2V0XHJcbiAgICAgICAgICAgIHJldHVybiBhdHRyc1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIGhpZ2hsaWdodDoge1xyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ21hcmsnIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ21hcmsnIH1dLFxyXG4gICAgfSxcclxuICAgIHN1YnNjcmlwdDoge1xyXG4gICAgICBleGNsdWRlczogJ3N1cGVyc2NyaXB0JyxcclxuICAgICAgdG9IVE1MOiAoKSA9PiAoeyB0YWc6ICdzdWInIH0pLFxyXG4gICAgICBwYXJzZUhUTUw6IFt7IHRhZzogJ3N1YicgfV0sXHJcbiAgICB9LFxyXG4gICAgc3VwZXJzY3JpcHQ6IHtcclxuICAgICAgZXhjbHVkZXM6ICdzdWJzY3JpcHQnLFxyXG4gICAgICB0b0hUTUw6ICgpID0+ICh7IHRhZzogJ3N1cCcgfSksXHJcbiAgICAgIHBhcnNlSFRNTDogW3sgdGFnOiAnc3VwJyB9XSxcclxuICAgIH0sXHJcbiAgICBmb250RmFtaWx5OiB7XHJcbiAgICAgIGF0dHJzOiB7IGZhbWlseToge30gfSxcclxuICAgICAgdG9IVE1MOiAobWFyaykgPT4gc3R5bGVTcGFuKCdmb250LWZhbWlseScsIHNhZmVGb250RmFtaWx5KG1hcmsuYXR0cnMuZmFtaWx5KSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ3NwYW4nLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZhbWlseSA9IHNhZmVGb250RmFtaWx5KGVsZW1lbnQuc3R5bGUuZm9udEZhbWlseSlcclxuICAgICAgICAgICAgcmV0dXJuIGZhbWlseSA/IHsgZmFtaWx5IH0gOiBmYWxzZVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ2ZvbnQnLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZhbWlseSA9IHNhZmVGb250RmFtaWx5KGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdmYWNlJykpXHJcbiAgICAgICAgICAgIHJldHVybiBmYW1pbHkgPyB7IGZhbWlseSB9IDogZmFsc2VcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0sXHJcbiAgICBmb250U2l6ZToge1xyXG4gICAgICBhdHRyczogeyBzaXplOiB7fSB9LFxyXG4gICAgICB0b0hUTUw6IChtYXJrKSA9PiBzdHlsZVNwYW4oJ2ZvbnQtc2l6ZScsIHNhZmVMZW5ndGgobWFyay5hdHRycy5zaXplKSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ3NwYW4nLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNpemUgPSBzYWZlTGVuZ3RoKGVsZW1lbnQuc3R5bGUuZm9udFNpemUpXHJcbiAgICAgICAgICAgIHJldHVybiBzaXplID8geyBzaXplIH0gOiBmYWxzZVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICAgIHRleHRDb2xvcjoge1xyXG4gICAgICBhdHRyczogeyBjb2xvcjoge30gfSxcclxuICAgICAgdG9IVE1MOiAobWFyaykgPT4gc3R5bGVTcGFuKCdjb2xvcicsIHNhZmVDb2xvcihtYXJrLmF0dHJzLmNvbG9yKSksXHJcbiAgICAgIHBhcnNlSFRNTDogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHRhZzogJ3NwYW4nLFxyXG4gICAgICAgICAgZ2V0QXR0cnM6IChlbGVtZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gc2FmZUNvbG9yKGVsZW1lbnQuc3R5bGUuY29sb3IpXHJcbiAgICAgICAgICAgIHJldHVybiBjb2xvciA/IHsgY29sb3IgfSA6IGZhbHNlXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICB9LFxyXG4gICAgYmFja2dyb3VuZENvbG9yOiB7XHJcbiAgICAgIGF0dHJzOiB7IGNvbG9yOiB7fSB9LFxyXG4gICAgICB0b0hUTUw6IChtYXJrKSA9PiBzdHlsZVNwYW4oJ2JhY2tncm91bmQtY29sb3InLCBzYWZlQ29sb3IobWFyay5hdHRycy5jb2xvcikpLFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICdzcGFuJyxcclxuICAgICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IHNhZmVDb2xvcihlbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvcilcclxuICAgICAgICAgICAgcmV0dXJuIGNvbG9yID8geyBjb2xvciB9IDogZmFsc2VcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0sXHJcbiAgICBzbWFsbENhcHM6IHtcclxuICAgICAgdG9IVE1MOiAoKSA9PiBzdHlsZVNwYW4oJ2ZvbnQtdmFyaWFudC1jYXBzJywgJ3NtYWxsLWNhcHMnKSxcclxuICAgICAgcGFyc2VIVE1MOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdGFnOiAnc3BhbicsXHJcbiAgICAgICAgICBnZXRBdHRyczogKGVsZW1lbnQpID0+IHtcclxuICAgICAgICAgICAgLy8gYGZvbnQtdmFyaWFudC1jYXBzYCBpcyB0aGUgbW9kZXJuIHByb3BlcnR5OyBoYXBweS1kb20gYW5kIG9sZGVyXHJcbiAgICAgICAgICAgIC8vIHBhc3RlZCBtYXJrdXAgb25seSBldmVyIHBvcHVsYXRlIHRoZSBgZm9udC12YXJpYW50YCBzaG9ydGhhbmQsXHJcbiAgICAgICAgICAgIC8vIHNvIGFjY2VwdCBzbWFsbC1jYXBzIGZyb20gZWl0aGVyIG9uZS5cclxuICAgICAgICAgICAgY29uc3QgY2FwcyA9IGVsZW1lbnQuc3R5bGUuZm9udFZhcmlhbnRDYXBzIHx8IGVsZW1lbnQuc3R5bGUuZm9udFZhcmlhbnQgfHwgJydcclxuICAgICAgICAgICAgcmV0dXJuIGNhcHMudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09ICdzbWFsbC1jYXBzJyA/IHt9IDogZmFsc2VcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0sXHJcbiAgICBsZXR0ZXJTcGFjaW5nOiB7XHJcbiAgICAgIGF0dHJzOiB7IHNwYWNpbmc6IHt9IH0sXHJcbiAgICAgIHRvSFRNTDogKG1hcmspID0+IHN0eWxlU3BhbignbGV0dGVyLXNwYWNpbmcnLCBzYWZlTGVuZ3RoKG1hcmsuYXR0cnMuc3BhY2luZykpLFxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICdzcGFuJyxcclxuICAgICAgICAgIGdldEF0dHJzOiAoZWxlbWVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBzcGFjaW5nID0gc2FmZUxlbmd0aChlbGVtZW50LnN0eWxlLmxldHRlclNwYWNpbmcpXHJcbiAgICAgICAgICAgIHJldHVybiBzcGFjaW5nID8geyBzcGFjaW5nIH0gOiBmYWxzZVxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBBIHNwYW4gY2Fycnlpbmcgb25lIHNhbml0aXplZCBkZWNsYXJhdGlvbjsgdW5zYWZlIHZhbHVlcyByZW5kZXIgYmFyZS4gKi9cclxuZnVuY3Rpb24gc3R5bGVTcGFuKHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCBudWxsKTogSFRNTFNwZWMge1xyXG4gIHJldHVybiB2YWx1ZSA/IHsgdGFnOiAnc3BhbicsIGF0dHJzOiB7IHN0eWxlOiBgJHtwcm9wZXJ0eX06ICR7dmFsdWV9YCB9IH0gOiB7IHRhZzogJ3NwYW4nIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2xhbXBMZXZlbChsZXZlbDogdW5rbm93bik6IG51bWJlciB7XHJcbiAgY29uc3QgdmFsdWUgPSB0eXBlb2YgbGV2ZWwgPT09ICdudW1iZXInID8gTWF0aC5yb3VuZChsZXZlbCkgOiAxXHJcbiAgcmV0dXJuIE1hdGgubWluKDYsIE1hdGgubWF4KDEsIHZhbHVlKSlcclxufVxyXG4iLCAiaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgaW5saW5lTGVuZ3RoIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IG5vZGVBdFBhdGgsIHBhdGhzRXF1YWwgfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBSZXBsYWNlSW5saW5lU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lJ1xyXG5pbXBvcnQgeyBSZXBsYWNlTm9kZXNTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1ub2RlcydcclxuaW1wb3J0IHsgSm9pbk5vZGVzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3NwbGl0LWpvaW4nXHJcbmltcG9ydCB0eXBlIHsgVHJhbnNhY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS90cmFuc2FjdGlvbidcclxuXHJcbi8qKlxyXG4gKiBEZWxldGUgdGhlIGNvbnRlbnQgYmV0d2VlbiB0d28gaW5saW5lIHBvc2l0aW9ucywgam9pbmluZyB0aGUgYm91bmRhcnlcclxuICogYmxvY2tzIHdoZW4gdGhleSBhcmUgZGlyZWN0IHNpYmxpbmdzLiBgZnJvbWAgcmVtYWlucyBhIHZhbGlkIHBvc2l0aW9uIGluXHJcbiAqIHRoZSByZXN1bHRpbmcgZG9jdW1lbnQgKHRoZSBjYWxsZXIgY2FuIHBsYWNlIHRoZSBjdXJzb3IgdGhlcmUpLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZVJhbmdlKHRyOiBUcmFuc2FjdGlvbiwgZnJvbTogUG9zaXRpb24sIHRvOiBQb3NpdGlvbik6IHZvaWQge1xyXG4gIGlmIChwYXRoc0VxdWFsKGZyb20ucGF0aCwgdG8ucGF0aCkpIHtcclxuICAgIGlmIChmcm9tLm9mZnNldCA8IHRvLm9mZnNldCkge1xyXG4gICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChmcm9tLnBhdGgsIGZyb20ub2Zmc2V0LCB0by5vZmZzZXQsIEZyYWdtZW50LmVtcHR5KSlcclxuICAgIH1cclxuICAgIHJldHVyblxyXG4gIH1cclxuXHJcbiAgY29uc3QgZmlyc3RCbG9jayA9IG5vZGVBdFBhdGgodHIuZG9jLCBmcm9tLnBhdGgpXHJcbiAgY29uc3QgbGFzdEJsb2NrID0gbm9kZUF0UGF0aCh0ci5kb2MsIHRvLnBhdGgpXHJcbiAgaWYgKCFmaXJzdEJsb2NrPy5pc1RleHRibG9jayB8fCAhbGFzdEJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuXHJcblxyXG4gIC8vIFRyaW0gdGhlIHRhaWwgb2YgdGhlIGZpcnN0IGJsb2NrIGFuZCB0aGUgaGVhZCBvZiB0aGUgbGFzdCBibG9jay5cclxuICBjb25zdCBmaXJzdExlbmd0aCA9IGlubGluZUxlbmd0aChmaXJzdEJsb2NrLmNvbnRlbnQpXHJcbiAgaWYgKGZyb20ub2Zmc2V0IDwgZmlyc3RMZW5ndGgpIHtcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKGZyb20ucGF0aCwgZnJvbS5vZmZzZXQsIGZpcnN0TGVuZ3RoLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgfVxyXG4gIGlmICh0by5vZmZzZXQgPiAwKSB7XHJcbiAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcCh0by5wYXRoLCAwLCB0by5vZmZzZXQsIEZyYWdtZW50LmVtcHR5KSlcclxuICB9XHJcblxyXG4gIC8vIFJlbW92ZSB3aG9sZSBub2RlcyBzdHJpY3RseSBiZXR3ZWVuIHRoZSB0d28gYm91bmRhcnkgYnJhbmNoZXMuXHJcbiAgbGV0IGRpdmVyZ2VuY2UgPSAwXHJcbiAgd2hpbGUgKGZyb20ucGF0aFtkaXZlcmdlbmNlXSA9PT0gdG8ucGF0aFtkaXZlcmdlbmNlXSkgZGl2ZXJnZW5jZSsrXHJcbiAgY29uc3QgY29tbW9uUGF0aCA9IGZyb20ucGF0aC5zbGljZSgwLCBkaXZlcmdlbmNlKVxyXG4gIGNvbnN0IGZpcnN0SW5kZXggPSBmcm9tLnBhdGhbZGl2ZXJnZW5jZV0gYXMgbnVtYmVyXHJcbiAgY29uc3QgbGFzdEluZGV4ID0gdG8ucGF0aFtkaXZlcmdlbmNlXSBhcyBudW1iZXJcclxuICBpZiAobGFzdEluZGV4ID4gZmlyc3RJbmRleCArIDEpIHtcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAoY29tbW9uUGF0aCwgZmlyc3RJbmRleCArIDEsIGxhc3RJbmRleCwgRnJhZ21lbnQuZW1wdHkpKVxyXG4gIH1cclxuXHJcbiAgLy8gSm9pbiB0aGUgYm91bmRhcnkgYmxvY2tzIHdoZW4gdGhleSBhcmUgZGlyZWN0IHNpYmxpbmdzLlxyXG4gIGNvbnN0IGRpcmVjdFNpYmxpbmdzID0gZnJvbS5wYXRoLmxlbmd0aCA9PT0gZGl2ZXJnZW5jZSArIDEgJiYgdG8ucGF0aC5sZW5ndGggPT09IGRpdmVyZ2VuY2UgKyAxXHJcbiAgaWYgKGRpcmVjdFNpYmxpbmdzKSB7XHJcbiAgICB0ci5zdGVwKG5ldyBKb2luTm9kZXNTdGVwKGZyb20ucGF0aCwgZnJvbS5vZmZzZXQpKVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBBdHRycyB9IGZyb20gJy4uL21vZGVsL2F0dHJzJ1xyXG5pbXBvcnQgeyBhdHRyc0VxIH0gZnJvbSAnLi4vbW9kZWwvYXR0cnMnXHJcbmltcG9ydCB7IGJsb2Nrc0luUmFuZ2UgfSBmcm9tICcuLi9tb2RlbC9ibG9ja3MnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7XHJcbiAgY29lcmNlSW5saW5lRm9yLFxyXG4gIGlubGluZUxlbmd0aCxcclxuICBtYXJrc0F0SW5saW5lT2Zmc2V0LFxyXG4gIG5leHRJbmxpbmVCb3VuZGFyeSxcclxuICBwcmV2aW91c0lubGluZUJvdW5kYXJ5LFxyXG4gIHJhbmdlSGFzTWFyayxcclxuICByYW5nZXNXaXRoTWFyayxcclxuICBzbGljZUlubGluZSxcclxufSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgTWFyayB9IGZyb20gJy4uL21vZGVsL21hcmsnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSwgVGV4dE5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgeyBwb3MgfSBmcm9tICcuLi9tb2RlbC9wb3NpdGlvbidcclxuaW1wb3J0IHsgbm9kZUF0UGF0aCwgcGF0aHNFcXVhbCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IE1BWF9JTkRFTlQsIGJsb2NrTGF5b3V0QXR0cnMgfSBmcm9tICcuLi9zY2hlbWEvYmFzaWMnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yU3RhdGUgfSBmcm9tICcuLi9zdGF0ZS9lZGl0b3Itc3RhdGUnXHJcbmltcG9ydCB7IEFsbFNlbGVjdGlvbiwgTm9kZVNlbGVjdGlvbiwgVGV4dFNlbGVjdGlvbiwgc2VsZWN0aW9uTmVhciB9IGZyb20gJy4uL3N0YXRlL3NlbGVjdGlvbidcclxuaW1wb3J0IHsgU2V0Tm9kZUF0dHJzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL2F0dHJzLXN0ZXAnXHJcbmltcG9ydCB7IEFkZE1hcmtTdGVwLCBSZW1vdmVNYXJrU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL21hcmstc3RlcHMnXHJcbmltcG9ydCB7IFJlcGxhY2VJbmxpbmVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1pbmxpbmUnXHJcbmltcG9ydCB7IFJlcGxhY2VOb2Rlc1N0ZXAsIHJlcGxhY2VOb2RlQXQgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9yZXBsYWNlLW5vZGVzJ1xyXG5pbXBvcnQgeyBKb2luTm9kZXNTdGVwLCBTcGxpdE5vZGVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvc3BsaXQtam9pbidcclxuaW1wb3J0IHsgTGlmdE5vZGVzU3RlcCwgV3JhcE5vZGVzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3dyYXAtbGlmdCdcclxuaW1wb3J0IHR5cGUgeyBUcmFuc2FjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3RyYW5zYWN0aW9uJ1xyXG5pbXBvcnQgeyBkZWxldGVSYW5nZSB9IGZyb20gJy4vaGVscGVycydcclxuXHJcbi8qKlxyXG4gKiBBIGNvbW1hbmQgaW5zcGVjdHMgYSBzdGF0ZSBhbmQgcHJvZHVjZXMgdGhlIHRyYW5zYWN0aW9uIHJlYWxpemluZyBpdCwgb3JcclxuICogbnVsbCB3aGVuIGl0IGRvZXMgbm90IGFwcGx5LiBQdXJlLCBkaXNwYXRjaGluZyBpcyB0aGUgY2FsbGVyJ3Mgam9iLlxyXG4gKi9cclxuZXhwb3J0IHR5cGUgQ29tbWFuZCA9IChzdGF0ZTogRWRpdG9yU3RhdGUpID0+IFRyYW5zYWN0aW9uIHwgbnVsbFxyXG5cclxuLyoqIFRyeSBjb21tYW5kcyBpbiBvcmRlcjsgdGhlIGZpcnN0IG9uZSB0aGF0IGFwcGxpZXMgd2lucy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNoYWluQ29tbWFuZHMoLi4uY29tbWFuZHM6IHJlYWRvbmx5IENvbW1hbmRbXSk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kcykge1xyXG4gICAgICBjb25zdCB0ciA9IGNvbW1hbmQoc3RhdGUpXHJcbiAgICAgIGlmICh0cikgcmV0dXJuIHRyXHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIEluc2VydCB0ZXh0IGF0IHRoZSBzZWxlY3Rpb24sIHJlcGxhY2luZyBpdCwgaW5oZXJpdGluZyBhZGphY2VudCBtYXJrcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGluc2VydFRleHQodGV4dDogc3RyaW5nKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgaWYgKHRleHQubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGlmICghc2VsZWN0aW9uLmVtcHR5KSBkZWxldGVSYW5nZSh0ciwgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICAgIGNvbnN0IHBvaW50ID0gc2VsZWN0aW9uLmZyb21cclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aCh0ci5kb2MsIHBvaW50LnBhdGgpXHJcbiAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IGluaGVyaXRlZCA9IHN0YXRlLnN0b3JlZE1hcmtzID8/IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgcG9pbnQub2Zmc2V0KVxyXG4gICAgY29uc3QgbWFya3MgPSBpbmhlcml0ZWQuZmlsdGVyKChtYXJrKSA9PiBibG9jay50eXBlLmFsbG93c01hcmtUeXBlKG1hcmsudHlwZSkpXHJcbiAgICB0ci5zdGVwKFxyXG4gICAgICBuZXcgUmVwbGFjZUlubGluZVN0ZXAoXHJcbiAgICAgICAgcG9pbnQucGF0aCxcclxuICAgICAgICBwb2ludC5vZmZzZXQsXHJcbiAgICAgICAgcG9pbnQub2Zmc2V0LFxyXG4gICAgICAgIEZyYWdtZW50Lm9mKHN0YXRlLnNjaGVtYS50ZXh0KHRleHQsIG1hcmtzKSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCArIHRleHQubGVuZ3RoKSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbn1cclxuXHJcbi8qKiBEZWxldGUgdGhlIHNlbGVjdGVkIGNvbnRlbnQuICovXHJcbmV4cG9ydCBjb25zdCBkZWxldGVTZWxlY3Rpb246IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoc2VsZWN0aW9uLmVtcHR5KSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICBpZiAoc2VsZWN0aW9uIGluc3RhbmNlb2YgQWxsU2VsZWN0aW9uKSB7XHJcbiAgICBjb25zdCBwYXJhZ3JhcGggPSBzdGF0ZS5zY2hlbWEuZmlyc3RUZXh0YmxvY2tUeXBlKCkuY3JlYXRlKClcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAoW10sIDAsIHN0YXRlLmRvYy5jaGlsZENvdW50LCBGcmFnbWVudC5vZihwYXJhZ3JhcGgpKSlcclxuICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoWzBdLCAwKSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbiAgaWYgKHNlbGVjdGlvbiBpbnN0YW5jZW9mIE5vZGVTZWxlY3Rpb24pIHtcclxuICAgIHRyLnN0ZXAoXHJcbiAgICAgIG5ldyBSZXBsYWNlTm9kZXNTdGVwKFxyXG4gICAgICAgIHNlbGVjdGlvbi5wYXJlbnRQYXRoLFxyXG4gICAgICAgIHNlbGVjdGlvbi5pbmRleCxcclxuICAgICAgICBzZWxlY3Rpb24uaW5kZXggKyAxLFxyXG4gICAgICAgIEZyYWdtZW50LmVtcHR5LFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gICAgdHIuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbk5lYXIodHIuZG9jLCBzZWxlY3Rpb24uZnJvbSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbiAgZGVsZXRlUmFuZ2UodHIsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHNlbGVjdGlvbi5mcm9tKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIFRvZ2dsZSBhIG1hcmsgb24gdGhlIHNlbGVjdGlvbiwgb3Igb24gdGhlIHN0b3JlZCBtYXJrcyBhdCBhIGN1cnNvci4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZU1hcmsobmFtZTogc3RyaW5nLCBhdHRycz86IEF0dHJzKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrVHlwZShuYW1lKVxyXG4gICAgY29uc3QgbWFyayA9IHR5cGUuY3JlYXRlKGF0dHJzKVxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcblxyXG4gICAgaWYgKHNlbGVjdGlvbi5lbXB0eSAmJiBzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSB7XHJcbiAgICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5oZWFkLnBhdGgpXHJcbiAgICAgIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrIHx8ICFibG9jay50eXBlLmFsbG93c01hcmtUeXBlKHR5cGUpKSByZXR1cm4gbnVsbFxyXG4gICAgICBjb25zdCBjdXJyZW50ID0gc3RhdGUuc3RvcmVkTWFya3MgPz8gbWFya3NBdElubGluZU9mZnNldChibG9jay5jb250ZW50LCBzZWxlY3Rpb24uaGVhZC5vZmZzZXQpXHJcbiAgICAgIGNvbnN0IGFjdGl2ZSA9IGN1cnJlbnQuc29tZSgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUudHlwZSA9PT0gdHlwZSlcclxuICAgICAgY29uc3QgbmV4dCA9IGFjdGl2ZVxyXG4gICAgICAgID8gY3VycmVudC5maWx0ZXIoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLnR5cGUgIT09IHR5cGUpXHJcbiAgICAgICAgOiBtYXJrLmFkZFRvU2V0KGN1cnJlbnQpXHJcbiAgICAgIHJldHVybiBzdGF0ZS50ci5zZXRTdG9yZWRNYXJrcyhuZXh0KVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGJsb2NrcyA9IGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKS5maWx0ZXIoXHJcbiAgICAgIChibG9jaykgPT4gYmxvY2suZnJvbSA8IGJsb2NrLnRvICYmIGJsb2NrLm5vZGUudHlwZS5hbGxvd3NNYXJrVHlwZSh0eXBlKSxcclxuICAgIClcclxuICAgIGlmIChibG9ja3MubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYWN0aXZlID0gYmxvY2tzLmV2ZXJ5KChibG9jaykgPT5cclxuICAgICAgcmFuZ2VIYXNNYXJrKGJsb2NrLm5vZGUuY29udGVudCwgYmxvY2suZnJvbSwgYmxvY2sudG8sIHR5cGUpLFxyXG4gICAgKVxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3MpIHtcclxuICAgICAgaWYgKGFjdGl2ZSkge1xyXG4gICAgICAgIGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzV2l0aE1hcmsoYmxvY2subm9kZS5jb250ZW50LCBibG9jay5mcm9tLCBibG9jay50bywgdHlwZSkpIHtcclxuICAgICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdHIuc3RlcChuZXcgQWRkTWFya1N0ZXAoYmxvY2sucGF0aCwgYmxvY2suZnJvbSwgYmxvY2sudG8sIG1hcmspKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIENoYW5nZSBldmVyeSB0ZXh0YmxvY2sgdG91Y2hlZCBieSB0aGUgc2VsZWN0aW9uIHRvIHRoZSBnaXZlbiB0eXBlLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0QmxvY2tUeXBlKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubm9kZVR5cGUobmFtZSlcclxuICAgIGlmICghdHlwZS5pbmxpbmVDb250ZW50KSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlXHJcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKSkge1xyXG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IHR5cGUuY3JlYXRlKGF0dHJzLCBibG9jay5ub2RlLmNvbnRlbnQpXHJcbiAgICAgIGlmIChibG9jay5ub2RlLnR5cGUgPT09IHR5cGUgJiYgYXR0cnNFcShibG9jay5ub2RlLmF0dHJzLCByZXBsYWNlbWVudC5hdHRycykpIGNvbnRpbnVlXHJcbiAgICAgIHRyLnN0ZXAocmVwbGFjZU5vZGVBdChibG9jay5wYXRoLCBGcmFnbWVudC5vZihyZXBsYWNlbWVudCkpKVxyXG4gICAgICBjaGFuZ2VkID0gdHJ1ZVxyXG4gICAgfVxyXG4gICAgaWYgKCFjaGFuZ2VkKSByZXR1cm4gbnVsbFxyXG4gICAgLy8gTm9kZSByZXBsYWNlbWVudCBkZWdyYWRlcyBpbnRlcmlvciBwb3NpdGlvbnM7IHRoZSBzaGFwZSBpcyB1bmNoYW5nZWQsXHJcbiAgICAvLyBzbyB0aGUgb3JpZ2luYWwgc2VsZWN0aW9uIGlzIHN0aWxsIHZhbGlkLCByZXN0YXRlIGl0IGV4cGxpY2l0bHkuXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogQXBwbHkgYSBtYXJrIHdpdGggc3BlY2lmaWMgYXR0cmlidXRlcywgcmVwbGFjaW5nIGFueSBleGlzdGluZyBtYXJrIG9mIHRoZVxyXG4gKiBzYW1lIHR5cGUgaW4gdGhlIHJhbmdlLiBVbmxpa2Uge0BsaW5rIHRvZ2dsZU1hcmt9IHRoaXMgaXMgaWRlbXBvdGVudCxcclxuICogcGlja2luZyB0aGUgc2FtZSBmb250IHNpemUgdHdpY2Uga2VlcHMgaXQgc2V0LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNldE1hcmsobmFtZTogc3RyaW5nLCBhdHRyczogQXR0cnMpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm1hcmtUeXBlKG5hbWUpXHJcbiAgICBjb25zdCBtYXJrID0gdHlwZS5jcmVhdGUoYXR0cnMpXHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuXHJcbiAgICBpZiAoc2VsZWN0aW9uLmVtcHR5ICYmIHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgc2VsZWN0aW9uLmhlYWQucGF0aClcclxuICAgICAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2sgfHwgIWJsb2NrLnR5cGUuYWxsb3dzTWFya1R5cGUodHlwZSkpIHJldHVybiBudWxsXHJcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZS5zdG9yZWRNYXJrcyA/PyBtYXJrc0F0SW5saW5lT2Zmc2V0KGJsb2NrLmNvbnRlbnQsIHNlbGVjdGlvbi5oZWFkLm9mZnNldClcclxuICAgICAgcmV0dXJuIHN0YXRlLnRyLnNldFN0b3JlZE1hcmtzKG1hcmsuYWRkVG9TZXQoY3VycmVudCkpXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYmxvY2tzID0gYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pLmZpbHRlcihcclxuICAgICAgKGJsb2NrKSA9PiBibG9jay5mcm9tIDwgYmxvY2sudG8gJiYgYmxvY2subm9kZS50eXBlLmFsbG93c01hcmtUeXBlKHR5cGUpLFxyXG4gICAgKVxyXG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrcykge1xyXG4gICAgICAvLyBDbGVhciB0aGUgb2xkIHZhbHVlIGZpcnN0IHNvIGF0dHJpYnV0ZXMgcmVwbGFjZSByYXRoZXIgdGhhbiBzdGFjay5cclxuICAgICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKSkge1xyXG4gICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgfVxyXG4gICAgICB0ci5zdGVwKG5ldyBBZGRNYXJrU3RlcChibG9jay5wYXRoLCBibG9jay5mcm9tLCBibG9jay50bywgbWFyaykpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIFJlbW92ZSBldmVyeSBtYXJrIG9mIGEgdHlwZSBmcm9tIHRoZSBzZWxlY3Rpb24gKG9yIHRoZSBzdG9yZWQgbWFya3MpLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdW5zZXRNYXJrKG5hbWU6IHN0cmluZyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubWFya1R5cGUobmFtZSlcclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG5cclxuICAgIGlmIChzZWxlY3Rpb24uZW1wdHkgJiYgc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikge1xyXG4gICAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBzZWxlY3Rpb24uaGVhZC5wYXRoKVxyXG4gICAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAgICAgY29uc3QgY3VycmVudCA9IHN0YXRlLnN0b3JlZE1hcmtzID8/IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgc2VsZWN0aW9uLmhlYWQub2Zmc2V0KVxyXG4gICAgICBjb25zdCBuZXh0ID0gY3VycmVudC5maWx0ZXIoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLnR5cGUgIT09IHR5cGUpXHJcbiAgICAgIHJldHVybiBuZXh0Lmxlbmd0aCA9PT0gY3VycmVudC5sZW5ndGggPyBudWxsIDogc3RhdGUudHIuc2V0U3RvcmVkTWFya3MobmV4dClcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKSkge1xyXG4gICAgICBpZiAoYmxvY2suZnJvbSA+PSBibG9jay50bykgY29udGludWVcclxuICAgICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKSkge1xyXG4gICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRyLmRvY0NoYW5nZWQgPyB0ciA6IG51bGxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBTdHJpcCBldmVyeSBtYXJrIGZyb20gdGhlIHNlbGVjdGlvbiAoXCJjbGVhciBmb3JtYXR0aW5nXCIpLiAqL1xyXG5leHBvcnQgY29uc3QgY2xlYXJGb3JtYXR0aW5nOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICBpZiAoYmxvY2suZnJvbSA+PSBibG9jay50bykgY29udGludWVcclxuICAgIGZvciAoY29uc3QgdHlwZSBvZiBPYmplY3QudmFsdWVzKHN0YXRlLnNjaGVtYS5tYXJrcykpIHtcclxuICAgICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKSkge1xyXG4gICAgICAgIHRyLnN0ZXAobmV3IFJlbW92ZU1hcmtTdGVwKGJsb2NrLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCByYW5nZS5tYXJrKSlcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG59XHJcblxyXG4vKipcclxuICogUmVzZXQgdGhlIHBhcmFncmFwaC1sZXZlbCBsYXlvdXQ6IGFsaWdubWVudCwgaW5kZW50LCBsaW5lIGhlaWdodCBhbmRcclxuICogc3BhY2luZywgb24gZXZlcnkgYmxvY2sgaW4gdGhlIHNlbGVjdGlvbiwgbGVhdmluZyB0aGUgdGV4dCBhbmQgaXRzIG1hcmtzXHJcbiAqIGFsb25lLiBUaGUgY291bnRlcnBhcnQgb2Yge0BsaW5rIGNsZWFyRm9ybWF0dGluZ30sIHdoaWNoIHN0cmlwcyBtYXJrcyBvbmx5LlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGNsZWFyQmxvY2tGb3JtYXR0aW5nOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGNvbnN0IGRlZmF1bHRzID0gYmxvY2tMYXlvdXRBdHRycygpXHJcbiAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3NJblJhbmdlKHN0YXRlLmRvYywgc3RhdGUuc2VsZWN0aW9uLmZyb20sIHN0YXRlLnNlbGVjdGlvbi50bykpIHtcclxuICAgIGNvbnN0IGF0dHJzID0gYmxvY2subm9kZS5hdHRyc1xyXG4gICAgY29uc3QgbmV4dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLmF0dHJzIH1cclxuICAgIGZvciAoY29uc3QgW25hbWUsIHNwZWNdIG9mIE9iamVjdC5lbnRyaWVzKGRlZmF1bHRzKSkge1xyXG4gICAgICBpZiAobmFtZSBpbiBuZXh0KSBuZXh0W25hbWVdID0gc3BlYy5kZWZhdWx0ID8/IG51bGxcclxuICAgIH1cclxuICAgIGlmIChhdHRyc0VxKGF0dHJzLCBuZXh0KSkgY29udGludWVcclxuICAgIHRyLnN0ZXAobmV3IFNldE5vZGVBdHRyc1N0ZXAoYmxvY2sucGF0aCwgbmV4dCkpXHJcbiAgfVxyXG4gIHJldHVybiB0ci5kb2NDaGFuZ2VkID8gdHIgOiBudWxsXHJcbn1cclxuXHJcbi8qKiBTdHJpcCBtYXJrcyBhbmQgcmVzZXQgYmxvY2sgbGF5b3V0IGluIG9uZSB1bmRvYWJsZSBzdGVwLiAqL1xyXG5leHBvcnQgY29uc3QgY2xlYXJBbGxGb3JtYXR0aW5nOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgbWFya3MgPSBjbGVhckZvcm1hdHRpbmcoc3RhdGUpXHJcbiAgY29uc3QgbGF5b3V0ID0gY2xlYXJCbG9ja0Zvcm1hdHRpbmcobWFya3MgPyBzdGF0ZS5hcHBseShtYXJrcykgOiBzdGF0ZSlcclxuICBpZiAoIW1hcmtzKSByZXR1cm4gbGF5b3V0XHJcbiAgaWYgKCFsYXlvdXQpIHJldHVybiBtYXJrc1xyXG4gIC8vIFJlbW92aW5nIG1hcmtzIGxlYXZlcyBldmVyeSBibG9jayB3aGVyZSBpdCB3YXMsIHNvIHRoZSBsYXlvdXQgc3RlcHNcclxuICAvLyBhcHBseSB1bmNoYW5nZWQgb24gdG9wIG9mIHRoZSBtYXJrIHN0ZXBzLlxyXG4gIGZvciAoY29uc3Qgc3RlcCBvZiBsYXlvdXQuc3RlcHMpIG1hcmtzLnN0ZXAoc3RlcClcclxuICByZXR1cm4gbWFya3NcclxufVxyXG5cclxuLyoqXHJcbiAqIE1lcmdlIGF0dHJpYnV0ZXMgaW50byBldmVyeSBibG9jayB0b3VjaGVkIGJ5IHRoZSBzZWxlY3Rpb24sIGtlZXBpbmcgZWFjaFxyXG4gKiBibG9jaydzIG93biB0eXBlIChhbGlnbm1lbnQgYW5kIGluZGVudCBhcHBseSB0byBoZWFkaW5ncyBhbmQgcGFyYWdyYXBoc1xyXG4gKiBhbGlrZSkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0QmxvY2tBdHRycyhhdHRyczogQXR0cnMpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICAgIGNvbnN0IG5leHQgPSB7IC4uLmJsb2NrLm5vZGUuYXR0cnMsIC4uLmF0dHJzIH1cclxuICAgICAgaWYgKGF0dHJzRXEoYmxvY2subm9kZS5hdHRycywgbmV4dCkpIGNvbnRpbnVlXHJcbiAgICAgIHRyLnN0ZXAobmV3IFNldE5vZGVBdHRyc1N0ZXAoYmxvY2sucGF0aCwgbmV4dCkpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxufVxyXG5cclxuLyoqIFNldCB0ZXh0IGFsaWdubWVudCBvbiB0aGUgc2VsZWN0ZWQgYmxvY2tzOyBgbnVsbGAgY2xlYXJzIGl0LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0VGV4dEFsaWduKGFsaWduOiAnbGVmdCcgfCAnY2VudGVyJyB8ICdyaWdodCcgfCAnanVzdGlmeScgfCBudWxsKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIHNldEJsb2NrQXR0cnMoeyBhbGlnbiB9KVxyXG59XHJcblxyXG4vKiogU3RlcCB0aGUgc2VsZWN0ZWQgYmxvY2tzJyBpbmRlbnQgYnkgYGRlbHRhYCwgY2xhbXBlZCB0byB0aGUgc2NoZW1hIHJhbmdlLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5kZW50QmxvY2tzKGRlbHRhOiBudW1iZXIpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnQgPSB0eXBlb2YgYmxvY2subm9kZS5hdHRycy5pbmRlbnQgPT09ICdudW1iZXInID8gYmxvY2subm9kZS5hdHRycy5pbmRlbnQgOiAwXHJcbiAgICAgIGNvbnN0IG5leHQgPSBNYXRoLm1pbihNQVhfSU5ERU5ULCBNYXRoLm1heCgwLCBjdXJyZW50ICsgZGVsdGEpKVxyXG4gICAgICBpZiAobmV4dCA9PT0gY3VycmVudCkgY29udGludWVcclxuICAgICAgdHIuc3RlcChuZXcgU2V0Tm9kZUF0dHJzU3RlcChibG9jay5wYXRoLCB7IC4uLmJsb2NrLm5vZGUuYXR0cnMsIGluZGVudDogbmV4dCB9KSlcclxuICAgIH1cclxuICAgIHJldHVybiB0ci5kb2NDaGFuZ2VkID8gdHIgOiBudWxsXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogU2V0IHRoZSBsaW5lIGhlaWdodCBvbiB0aGUgc2VsZWN0ZWQgYmxvY2tzOyBgbnVsbGAgY2xlYXJzIGl0LiBBIGJhcmUgbnVtYmVyXHJcbiAqIGlzIGEgbXVsdGlwbGllciBvZiB0aGUgZm9udCBzaXplLCB3aGljaCBpcyB3aHkgaXQgaXMgc3RvcmVkIGFzLWlzIHJhdGhlclxyXG4gKiB0aGFuIG5vcm1hbGl6ZWQgdG8gYSBsZW5ndGguXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0TGluZUhlaWdodCh2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgbnVsbCk6IENvbW1hbmQge1xyXG4gIHJldHVybiBzZXRCbG9ja0F0dHJzKHsgbGluZUhlaWdodDogdmFsdWUgPT09IG51bGwgPyBudWxsIDogU3RyaW5nKHZhbHVlKSB9KVxyXG59XHJcblxyXG4vKipcclxuICogU2V0IHRoZSBzcGFjZSBhYm92ZSBhbmQvb3IgYmVsb3cgdGhlIHNlbGVjdGVkIGJsb2Nrcy4gT25seSB0aGUga2V5cyBwcmVzZW50XHJcbiAqIGluIGBvcHRzYCBhcmUgdG91Y2hlZCwgc28gc3BhY2luZyBiZWZvcmUgYW5kIGFmdGVyIGNhbiBiZSBzZXQgaW5kZXBlbmRlbnRseS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRQYXJhZ3JhcGhTcGFjaW5nKG9wdHM6IHtcclxuICBiZWZvcmU/OiBzdHJpbmcgfCBudWxsXHJcbiAgYWZ0ZXI/OiBzdHJpbmcgfCBudWxsXHJcbn0pOiBDb21tYW5kIHtcclxuICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fVxyXG4gIGlmICgnYmVmb3JlJyBpbiBvcHRzKSBhdHRycy5zcGFjZUJlZm9yZSA9IG9wdHMuYmVmb3JlID8/IG51bGxcclxuICBpZiAoJ2FmdGVyJyBpbiBvcHRzKSBhdHRycy5zcGFjZUFmdGVyID0gb3B0cy5hZnRlciA/PyBudWxsXHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4gKE9iamVjdC5rZXlzKGF0dHJzKS5sZW5ndGggPT09IDAgPyBudWxsIDogc2V0QmxvY2tBdHRycyhhdHRycykoc3RhdGUpKVxyXG59XHJcblxyXG4vKiogQXBwbHkgbGV0dGVyIHNwYWNpbmcgdG8gdGhlIHNlbGVjdGlvbjsgYG51bGxgIHJlbW92ZXMgdGhlIG1hcmsuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRMZXR0ZXJTcGFjaW5nKHNwYWNpbmc6IHN0cmluZyB8IG51bGwpOiBDb21tYW5kIHtcclxuICByZXR1cm4gc3BhY2luZyA9PT0gbnVsbCA/IHVuc2V0TWFyaygnbGV0dGVyU3BhY2luZycpIDogc2V0TWFyaygnbGV0dGVyU3BhY2luZycsIHsgc3BhY2luZyB9KVxyXG59XHJcblxyXG4vKiogVG9nZ2xlIHNtYWxsIGNhcHMgb24gdGhlIHNlbGVjdGlvbi4gKi9cclxuZXhwb3J0IGNvbnN0IHRvZ2dsZVNtYWxsQ2FwczogQ29tbWFuZCA9IHRvZ2dsZU1hcmsoJ3NtYWxsQ2FwcycpXHJcblxyXG4vKiogSG93IHtAbGluayBjb252ZXJ0Q2FzZX0gcmV3cml0ZXMgdGhlIHNlbGVjdGVkIHRleHQuICovXHJcbmV4cG9ydCB0eXBlIENhc2VNb2RlID0gJ3VwcGVyJyB8ICdsb3dlcicgfCAndGl0bGUnXHJcblxyXG5jb25zdCBXT1JEX0NIQVJBQ1RFUiA9IC9bXFxwe0x9XFxwe059J10vdVxyXG5cclxuLyoqXHJcbiAqIFJld3JpdGUgdGhlIGNhc2Ugb2YgdGhlIHNlbGVjdGVkIHRleHQuIEVhY2ggdGV4dCBub2RlIGlzIHJlcGxhY2VkIHdpdGggYVxyXG4gKiBzYW1lLWxlbmd0aCBub2RlIGJ1aWx0IGJ5IHtAbGluayBUZXh0Tm9kZS53aXRoVGV4dH0sIHNvIGV2ZXJ5IG5vZGUga2VlcHNcclxuICogZXhhY3RseSB0aGUgbWFya3MgaXQgaGFkLiBBIGJvbGQgcnVuIHN0YXlzIGJvbGQuIFRpdGxlIGNhc2UgdGhyZWFkcyBhXHJcbiAqIFwibWlkLXdvcmRcIiBmbGFnIGFjcm9zcyBub2RlIGFuZCBibG9jayBib3VuZGFyaWVzIHNvIGEgd29yZCBzcGxpdCBieSBhIG1hcmtcclxuICogYm91bmRhcnkgaXMgbm90IGNhcGl0YWxpemVkIHR3aWNlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRDYXNlKG1vZGU6IENhc2VNb2RlKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBpZiAoc2VsZWN0aW9uLmVtcHR5KSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYmxvY2tzID0gYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pLmZpbHRlcihcclxuICAgICAgKGJsb2NrKSA9PiBibG9jay5mcm9tIDwgYmxvY2sudG8sXHJcbiAgICApXHJcbiAgICBpZiAoYmxvY2tzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAvLyBDYXJyaWVkIGFjcm9zcyB0aGUgdGV4dCBub2RlcyB3aXRoaW4gYSBibG9jazogd2FzIHRoZSBwcmV2aW91c1xyXG4gICAgLy8gY2hhcmFjdGVyIHBhcnQgb2YgYSB3b3JkPyBPbmx5IG1lYW5pbmdmdWwgZm9yIHRpdGxlIGNhc2UuIEl0IHJlc2V0cyBhdFxyXG4gICAgLy8gZXZlcnkgYmxvY2ssIHNpbmNlIGEgYmxvY2sgYm91bmRhcnkgYWx3YXlzIGVuZHMgYSB3b3JkLlxyXG4gICAgbGV0IGluV29yZCA9IGZhbHNlXHJcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlXHJcbiAgICAvLyBDYXNlIG1hcHBpbmcgaXMgYWxtb3N0IGFsd2F5cyBsZW5ndGgtcHJlc2VydmluZywgYnV0IG5vdCB1bml2ZXJzYWxseVxyXG4gICAgLy8gKEdlcm1hbiBcIsOfXCIgdXBwZXJjYXNlcyB0byBcIlNTXCIpLiBUcmFjayB0aGUgZHJpZnQgc28gdGhlIHNlbGVjdGlvbiBpc1xyXG4gICAgLy8gb25seSByZXN0YXRlZCB2ZXJiYXRpbSB3aGVuIGl0IHJlYWxseSBpcyBzdGlsbCB2YWxpZC5cclxuICAgIGxldCBsZW5ndGhEZWx0YSA9IDBcclxuXHJcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrcykge1xyXG4gICAgICBjb25zdCBzbGljZSA9IHNsaWNlSW5saW5lKGJsb2NrLm5vZGUuY29udGVudCwgYmxvY2suZnJvbSwgYmxvY2sudG8pXHJcbiAgICAgIGNvbnN0IG91dDogRWRpdG9yTm9kZVtdID0gW11cclxuICAgICAgbGV0IGJsb2NrQ2hhbmdlZCA9IGZhbHNlXHJcbiAgICAgIGluV29yZCA9IGZhbHNlXHJcbiAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygc2xpY2UuY2hpbGRyZW4pIHtcclxuICAgICAgICBpZiAoIWNoaWxkLmlzVGV4dCkge1xyXG4gICAgICAgICAgb3V0LnB1c2goY2hpbGQpXHJcbiAgICAgICAgICBpbldvcmQgPSBmYWxzZVxyXG4gICAgICAgICAgY29udGludWVcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3Qgbm9kZSA9IGNoaWxkIGFzIFRleHROb2RlXHJcbiAgICAgICAgY29uc3QgbmV4dCA9IGNvbnZlcnRUZXh0KG5vZGUudGV4dCwgbW9kZSwgaW5Xb3JkKVxyXG4gICAgICAgIGluV29yZCA9IG5leHQuaW5Xb3JkXHJcbiAgICAgICAgaWYgKG5leHQudGV4dCAhPT0gbm9kZS50ZXh0KSBibG9ja0NoYW5nZWQgPSB0cnVlXHJcbiAgICAgICAgb3V0LnB1c2gobm9kZS53aXRoVGV4dChuZXh0LnRleHQpKVxyXG4gICAgICAgIGxlbmd0aERlbHRhICs9IG5leHQudGV4dC5sZW5ndGggLSBub2RlLnRleHQubGVuZ3RoXHJcbiAgICAgIH1cclxuICAgICAgaWYgKCFibG9ja0NoYW5nZWQpIGNvbnRpbnVlXHJcbiAgICAgIGNoYW5nZWQgPSB0cnVlXHJcbiAgICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKGJsb2NrLnBhdGgsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCBGcmFnbWVudC5mcm9tKG91dCkpKVxyXG4gICAgfVxyXG4gICAgaWYgKCFjaGFuZ2VkKSByZXR1cm4gbnVsbFxyXG4gICAgLy8gTGVuZ3RoLWZvci1sZW5ndGggaW4gdGhlIGNvbW1vbiBjYXNlLCBzbyB0aGUgb3JpZ2luYWwgcmFuZ2Ugc3RpbGwgc3BhbnNcclxuICAgIC8vIGV4YWN0bHkgdGhlIHRleHQgdGhlIHVzZXIgaGFkIHNlbGVjdGVkLiBXaGVuIGEgY2FzZSBtYXBwaW5nIGRpZCBjaGFuZ2VcclxuICAgIC8vIHRoZSBsZW5ndGgsIGxldCB0aGUgc3RlcHMgbWFwIHRoZSBzZWxlY3Rpb24gaW5zdGVhZCBvZiBmb3JjaW5nIGEgcmFuZ2VcclxuICAgIC8vIHRoYXQgbm8gbG9uZ2VyIGV4aXN0cy5cclxuICAgIGlmIChsZW5ndGhEZWx0YSA9PT0gMCkgdHIuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbilcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxufVxyXG5cclxuLyoqIENhc2UtY29udmVydCBvbmUgcnVuLCByZXBvcnRpbmcgd2hldGhlciBpdCBlbmRlZCBtaWQtd29yZC4gKi9cclxuZnVuY3Rpb24gY29udmVydFRleHQoXHJcbiAgdGV4dDogc3RyaW5nLFxyXG4gIG1vZGU6IENhc2VNb2RlLFxyXG4gIHN0YXJ0c0luV29yZDogYm9vbGVhbixcclxuKTogeyB0ZXh0OiBzdHJpbmc7IGluV29yZDogYm9vbGVhbiB9IHtcclxuICBpZiAobW9kZSA9PT0gJ3VwcGVyJykgcmV0dXJuIHsgdGV4dDogdGV4dC50b1VwcGVyQ2FzZSgpLCBpbldvcmQ6IGZhbHNlIH1cclxuICBpZiAobW9kZSA9PT0gJ2xvd2VyJykgcmV0dXJuIHsgdGV4dDogdGV4dC50b0xvd2VyQ2FzZSgpLCBpbldvcmQ6IGZhbHNlIH1cclxuICBsZXQgaW5Xb3JkID0gc3RhcnRzSW5Xb3JkXHJcbiAgbGV0IG91dCA9ICcnXHJcbiAgZm9yIChjb25zdCBjaGFyYWN0ZXIgb2YgdGV4dCkge1xyXG4gICAgY29uc3QgaXNXb3JkID0gV09SRF9DSEFSQUNURVIudGVzdChjaGFyYWN0ZXIpXHJcbiAgICBvdXQgKz0gaXNXb3JkICYmICFpbldvcmQgPyBjaGFyYWN0ZXIudG9VcHBlckNhc2UoKSA6IGNoYXJhY3Rlci50b0xvd2VyQ2FzZSgpXHJcbiAgICBpbldvcmQgPSBpc1dvcmRcclxuICB9XHJcbiAgcmV0dXJuIHsgdGV4dDogb3V0LCBpbldvcmQgfVxyXG59XHJcblxyXG4vKiogU3BsaXQgdGhlIGN1cnJlbnQgdGV4dGJsb2NrIGF0IHRoZSBjdXJzb3IgKEVudGVyKS4gKi9cclxuLyoqXHJcbiAqIEVudGVyIGluc2lkZSBhIGJsb2NrIHRoYXQgcHJlc2VydmVzIHdoaXRlc3BhY2UsIGEgY29kZSBibG9jaywgaW5zZXJ0cyBhXHJcbiAqIG5ld2xpbmUgcmF0aGVyIHRoYW4gc3BsaXR0aW5nIGl0OyBob2xkaW5nIG11bHRpLWxpbmUgdGV4dCBpcyB0aGUgd2hvbGVcclxuICogcG9pbnQgb2Ygc3VjaCBhIGJsb2NrLiBUd28gdHJhaWxpbmcgbmV3bGluZXMgZXNjYXBlIGl0IGluc3RlYWQsIHNvIHRoZVxyXG4gKiB1c2VyIGlzIG5ldmVyIHRyYXBwZWQ6IHRoZSBibGFuayBsaW5lIGlzIGRyb3BwZWQgYW5kIGEgcGFyYWdyYXBoIGZvbGxvd3MuXHJcbiAqL1xyXG4vKiogVHdvIHNwYWNlczogbmFycm93IGVub3VnaCB0aGF0IGRlZXBseSBuZXN0ZWQgY29kZSBzdGlsbCBmaXRzIGEgY29sdW1uLiAqL1xyXG5jb25zdCBDT0RFX0lOREVOVCA9ICcgICdcclxuXHJcbi8qKiBCcmFja2V0cyB0aGUgZWRpdG9yIGNsb3NlcyBmb3IgeW91LCBhbmQgd2hhdCBjbG9zZXMgdGhlbS4gKi9cclxuY29uc3QgQ09ERV9CUkFDS0VUUzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcChbXHJcbiAgWycoJywgJyknXSxcclxuICBbJ1snLCAnXSddLFxyXG4gIFsneycsICd9J10sXHJcbl0pXHJcbmNvbnN0IENPREVfUVVPVEVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbJ1wiJywgXCInXCIsICdgJ10pXHJcbi8qKiBFdmVyeSBjaGFyYWN0ZXIgdGhhdCBvcGVucyBhIHBhaXIsIG1hcHBlZCB0byBpdHMgY2xvc2VyLiAqL1xyXG5jb25zdCBDT0RFX1BBSVJTOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKFtcclxuICAuLi5DT0RFX0JSQUNLRVRTLFxyXG4gIC4uLlsuLi5DT0RFX1FVT1RFU10ubWFwKChxdW90ZSk6IFtzdHJpbmcsIHN0cmluZ10gPT4gW3F1b3RlLCBxdW90ZV0pLFxyXG5dKVxyXG5jb25zdCBDT0RFX0NMT1NFUlM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KENPREVfUEFJUlMudmFsdWVzKCkpXHJcbi8qKlxyXG4gKiBBIHBhaXIgb25seSBjbG9zZXMgaXRzZWxmIGJlZm9yZSBvbmUgb2YgdGhlc2UsIG9yIGF0IHRoZSBlbmQgb2YgYSBsaW5lOiBpblxyXG4gKiB0aGUgbWlkZGxlIG9mIGEgd29yZCB0aGUgdXNlciBpcyBlZGl0aW5nIGV4aXN0aW5nIGNvZGUsIG5vdCBvcGVuaW5nIGEgZ3JvdXAuXHJcbiAqL1xyXG5jb25zdCBDTE9TRV9CRUZPUkU6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFtcclxuICAnOycsXHJcbiAgJzonLFxyXG4gICcuJyxcclxuICAnLCcsXHJcbiAgJz0nLFxyXG4gICcpJyxcclxuICAnXScsXHJcbiAgJ30nLFxyXG4gICc+JyxcclxuICAnICcsXHJcbiAgJ1xcdCcsXHJcbiAgJ1xcbicsXHJcbl0pXHJcbmNvbnN0IENPREVfV09SRCA9IC9bXFxwe0x9XFxwe059XyRdL3VcclxuXHJcbi8qKiBUaGUgd2hpdGVzcGFjZSBhIGxpbmUgYmVnaW5zIHdpdGgsIGluIGZ1bGwuICovXHJcbmZ1bmN0aW9uIGxpbmVJbmRlbnRhdGlvbih0ZXh0OiBzdHJpbmcsIGxpbmVTdGFydDogbnVtYmVyKTogc3RyaW5nIHtcclxuICBsZXQgZW5kID0gbGluZVN0YXJ0XHJcbiAgd2hpbGUgKGVuZCA8IHRleHQubGVuZ3RoICYmICh0ZXh0W2VuZF0gPT09ICcgJyB8fCB0ZXh0W2VuZF0gPT09ICdcXHQnKSkgZW5kKytcclxuICByZXR1cm4gdGV4dC5zbGljZShsaW5lU3RhcnQsIGVuZClcclxufVxyXG5cclxuLyoqIFRoZSBwcmVmb3JtYXR0ZWQgdGV4dGJsb2NrIGhvbGRpbmcgYSBzaW5nbGUtYmxvY2sgc2VsZWN0aW9uLCBvciBudWxsLiAqL1xyXG5mdW5jdGlvbiBwcmVmb3JtYXR0ZWRBdChzdGF0ZTogRWRpdG9yU3RhdGUpOiBFZGl0b3JOb2RlIHwgbnVsbCB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikpIHJldHVybiBudWxsXHJcbiAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20ucGF0aClcclxuICBpZiAoIWJsb2NrPy5pc1RleHRibG9jayB8fCAhYmxvY2sudHlwZS5zcGVjLnByZXNlcnZlV2hpdGVzcGFjZSkgcmV0dXJuIG51bGxcclxuICAvLyBBIHNlbGVjdGlvbiBzcGFubmluZyB0d28gYmxvY2tzIGlzIG5vdCBhbiBpbmRlbnQgZ2VzdHVyZS5cclxuICBpZiAoIXBhdGhzRXF1YWwoc2VsZWN0aW9uLmZyb20ucGF0aCwgc2VsZWN0aW9uLnRvLnBhdGgpKSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiBibG9ja1xyXG59XHJcblxyXG4vKiogSW5zZXJ0IGxpdGVyYWwgdGV4dCBhdCBhbiBvZmZzZXQgaW5zaWRlIG9uZSB0ZXh0YmxvY2suICovXHJcbmZ1bmN0aW9uIGluc2VydEF0KFxyXG4gIHRyOiBUcmFuc2FjdGlvbixcclxuICBzdGF0ZTogRWRpdG9yU3RhdGUsXHJcbiAgcGF0aDogcmVhZG9ubHkgbnVtYmVyW10sXHJcbiAgb2Zmc2V0OiBudW1iZXIsXHJcbiAgdGV4dDogc3RyaW5nLFxyXG4pOiB2b2lkIHtcclxuICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChwYXRoLCBvZmZzZXQsIG9mZnNldCwgRnJhZ21lbnQuZnJvbShbc3RhdGUuc2NoZW1hLnRleHQodGV4dCldKSkpXHJcbn1cclxuXHJcbi8qKiBPZmZzZXRzIG9mIGV2ZXJ5IGxpbmUgc3RhcnQgd2l0aGluIGBbZnJvbSwgdG9dYC4gKi9cclxuZnVuY3Rpb24gbGluZVN0YXJ0cyh0ZXh0OiBzdHJpbmcsIGZyb206IG51bWJlciwgdG86IG51bWJlcik6IG51bWJlcltdIHtcclxuICBjb25zdCBzdGFydHMgPSBbZnJvbV1cclxuICBmb3IgKGxldCBpbmRleCA9IGZyb207IGluZGV4IDwgdG87IGluZGV4KyspIHtcclxuICAgIGlmICh0ZXh0W2luZGV4XSA9PT0gJ1xcbicpIHN0YXJ0cy5wdXNoKGluZGV4ICsgMSlcclxuICB9XHJcbiAgcmV0dXJuIHN0YXJ0c1xyXG59XHJcblxyXG4vKiogSG93IG11Y2ggaW5kZW50IGEgbGluZSBiZWdpbnMgd2l0aCwgY2FwcGVkIGF0IG9uZSBsZXZlbC4gKi9cclxuZnVuY3Rpb24gbGVhZGluZ0luZGVudCh0ZXh0OiBzdHJpbmcsIHN0YXJ0OiBudW1iZXIpOiBudW1iZXIge1xyXG4gIGlmICh0ZXh0W3N0YXJ0XSA9PT0gJ1xcdCcpIHJldHVybiAxXHJcbiAgbGV0IHNwYWNlcyA9IDBcclxuICB3aGlsZSAoc3BhY2VzIDwgQ09ERV9JTkRFTlQubGVuZ3RoICYmIHRleHRbc3RhcnQgKyBzcGFjZXNdID09PSAnICcpIHNwYWNlcysrXHJcbiAgcmV0dXJuIHNwYWNlc1xyXG59XHJcblxyXG4vKipcclxuICogVGFiIGluc2lkZSBhIGNvZGUgYmxvY2s6IGluc2VydCBhbiBpbmRlbnQsIG9yIGluZGVudCBldmVyeSBsaW5lIHRoZVxyXG4gKiBzZWxlY3Rpb24gdG91Y2hlcy5cclxuICpcclxuICogRGVjbGluZXMgb3V0c2lkZSBhIHByZWZvcm1hdHRlZCBibG9jaywgc28gVGFiIGtlZXBzIGl0cyBsaXN0IGJlaGF2aW91ciBhbmRcclxuICogaXRzIGZvY3VzLW1vdmVtZW50IGZhbGxiYWNrIGV2ZXJ5d2hlcmUgZWxzZS5cclxuICovXHJcbmV4cG9ydCBjb25zdCBpbmRlbnRJblByZWZvcm1hdHRlZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IGJsb2NrID0gcHJlZm9ybWF0dGVkQXQoc3RhdGUpXHJcbiAgaWYgKCFibG9jaykgcmV0dXJuIG51bGxcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb24gYXMgVGV4dFNlbGVjdGlvblxyXG4gIGNvbnN0IHRleHQgPSBibG9jay50ZXh0Q29udGVudFxyXG4gIGNvbnN0IHBhdGggPSBzZWxlY3Rpb24uZnJvbS5wYXRoXHJcblxyXG4gIC8vIEEgY2FyZXQsIG9yIGEgc2VsZWN0aW9uIGluc2lkZSBvbmUgbGluZTogcGxhaW4gaW5zZXJ0aW9uLlxyXG4gIGlmICghdGV4dC5zbGljZShzZWxlY3Rpb24uZnJvbS5vZmZzZXQsIHNlbGVjdGlvbi50by5vZmZzZXQpLmluY2x1ZGVzKCdcXG4nKSkge1xyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIGRlbGV0ZVJhbmdlKHRyLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKVxyXG4gICAgY29uc3QgYXQgPSB0ci5tYXBQb3NpdGlvbihzZWxlY3Rpb24uZnJvbSwgLTEpXHJcbiAgICBpbnNlcnRBdCh0ciwgc3RhdGUsIGF0LnBhdGgsIGF0Lm9mZnNldCwgQ09ERV9JTkRFTlQpXHJcbiAgICByZXR1cm4gdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhhdC5wYXRoLCBhdC5vZmZzZXQgKyBDT0RFX0lOREVOVC5sZW5ndGgpKSlcclxuICB9XHJcblxyXG4gIC8vIE11bHRpLWxpbmU6IGluZGVudCBlYWNoIGxpbmUsIGJhY2sgdG8gZnJvbnQgc28gZWFybGllciBvZmZzZXRzIHN0YXkgdmFsaWQuXHJcbiAgY29uc3QgZmlyc3RMaW5lID0gdGV4dC5sYXN0SW5kZXhPZignXFxuJywgc2VsZWN0aW9uLmZyb20ub2Zmc2V0IC0gMSkgKyAxXHJcbiAgY29uc3QgbGFzdEJyZWFrID0gdGV4dC5pbmRleE9mKCdcXG4nLCBzZWxlY3Rpb24udG8ub2Zmc2V0KVxyXG4gIGNvbnN0IHN0YXJ0cyA9IGxpbmVTdGFydHModGV4dCwgZmlyc3RMaW5lLCBsYXN0QnJlYWsgPT09IC0xID8gdGV4dC5sZW5ndGggOiBsYXN0QnJlYWspXHJcblxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICBmb3IgKGNvbnN0IHN0YXJ0IG9mIFsuLi5zdGFydHNdLnJldmVyc2UoKSkgaW5zZXJ0QXQodHIsIHN0YXRlLCBwYXRoLCBzdGFydCwgQ09ERV9JTkRFTlQpXHJcblxyXG4gIHJldHVybiB0ci5zZXRTZWxlY3Rpb24oXHJcbiAgICBuZXcgVGV4dFNlbGVjdGlvbihcclxuICAgICAgcG9zKHBhdGgsIHNlbGVjdGlvbi5mcm9tLm9mZnNldCArIENPREVfSU5ERU5ULmxlbmd0aCksXHJcbiAgICAgIHBvcyhwYXRoLCBzZWxlY3Rpb24udG8ub2Zmc2V0ICsgQ09ERV9JTkRFTlQubGVuZ3RoICogc3RhcnRzLmxlbmd0aCksXHJcbiAgICApLFxyXG4gIClcclxufVxyXG5cclxuLyoqXHJcbiAqIFNoaWZ0LVRhYiBpbnNpZGUgYSBjb2RlIGJsb2NrOiByZW1vdmUgb25lIGluZGVudCBsZXZlbCBmcm9tIGV2ZXJ5IGxpbmUgdGhlXHJcbiAqIHNlbGVjdGlvbiB0b3VjaGVzLiBMaW5lcyB3aXRoIG5vIGxlYWRpbmcgd2hpdGVzcGFjZSBhcmUgbGVmdCBhbG9uZSByYXRoZXJcclxuICogdGhhbiBlYXRpbmcgaW50byB0aGVpciB0ZXh0LCBhbmQgYSBzZWxlY3Rpb24gd2l0aCBub3RoaW5nIHRvIG91dGRlbnRcclxuICogZGVjbGluZXMgc28gdGhlIGJpbmRpbmcgY2FuIGZhbGwgdGhyb3VnaC5cclxuICovXHJcbmV4cG9ydCBjb25zdCBvdXRkZW50SW5QcmVmb3JtYXR0ZWQ6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBibG9jayA9IHByZWZvcm1hdHRlZEF0KHN0YXRlKVxyXG4gIGlmICghYmxvY2spIHJldHVybiBudWxsXHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uIGFzIFRleHRTZWxlY3Rpb25cclxuICBjb25zdCB0ZXh0ID0gYmxvY2sudGV4dENvbnRlbnRcclxuICBjb25zdCBwYXRoID0gc2VsZWN0aW9uLmZyb20ucGF0aFxyXG5cclxuICBjb25zdCBmaXJzdExpbmUgPSB0ZXh0Lmxhc3RJbmRleE9mKCdcXG4nLCBzZWxlY3Rpb24uZnJvbS5vZmZzZXQgLSAxKSArIDFcclxuICBjb25zdCBsYXN0QnJlYWsgPSB0ZXh0LmluZGV4T2YoJ1xcbicsIHNlbGVjdGlvbi50by5vZmZzZXQpXHJcbiAgY29uc3Qgc3RhcnRzID0gbGluZVN0YXJ0cyh0ZXh0LCBmaXJzdExpbmUsIGxhc3RCcmVhayA9PT0gLTEgPyB0ZXh0Lmxlbmd0aCA6IGxhc3RCcmVhaylcclxuXHJcbiAgLy8gTWVhc3VyZWQgYmVmb3JlIGFueXRoaW5nIGlzIHJlbW92ZWQsIHNvIHRoZSBvZmZzZXRzIGFsbCByZWZlciB0byBvbmUgdGV4dC5cclxuICBjb25zdCBjdXRzID0gc3RhcnRzXHJcbiAgICAubWFwKChzdGFydCkgPT4gKHsgc3RhcnQsIGxlbmd0aDogbGVhZGluZ0luZGVudCh0ZXh0LCBzdGFydCkgfSkpXHJcbiAgICAuZmlsdGVyKChjdXQpID0+IGN1dC5sZW5ndGggPiAwKVxyXG4gIGlmIChjdXRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGZvciAoY29uc3QgY3V0IG9mIFsuLi5jdXRzXS5yZXZlcnNlKCkpIHtcclxuICAgIGRlbGV0ZVJhbmdlKHRyLCBwb3MocGF0aCwgY3V0LnN0YXJ0KSwgcG9zKHBhdGgsIGN1dC5zdGFydCArIGN1dC5sZW5ndGgpKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgcmVtb3ZlZEJlZm9yZSA9IGN1dHNcclxuICAgIC5maWx0ZXIoKGN1dCkgPT4gY3V0LnN0YXJ0IDwgc2VsZWN0aW9uLmZyb20ub2Zmc2V0KVxyXG4gICAgLnJlZHVjZSgodG90YWwsIGN1dCkgPT4gdG90YWwgKyBjdXQubGVuZ3RoLCAwKVxyXG4gIGNvbnN0IHJlbW92ZWRUb3RhbCA9IGN1dHMucmVkdWNlKCh0b3RhbCwgY3V0KSA9PiB0b3RhbCArIGN1dC5sZW5ndGgsIDApXHJcbiAgY29uc3QgZnJvbSA9IE1hdGgubWF4KGZpcnN0TGluZSwgc2VsZWN0aW9uLmZyb20ub2Zmc2V0IC0gcmVtb3ZlZEJlZm9yZSlcclxuICBjb25zdCB0byA9IE1hdGgubWF4KGZyb20sIHNlbGVjdGlvbi50by5vZmZzZXQgLSByZW1vdmVkVG90YWwpXHJcbiAgcmV0dXJuIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCwgZnJvbSksIHBvcyhwYXRoLCB0bykpKVxyXG59XHJcblxyXG4vKipcclxuICogV2hlcmUgdGhlIGxhc3QgbmV3bGluZSB0aGlzIGNvbW1hbmQgaW5zZXJ0ZWQgbGVmdCB0aGUgY2FyZXQuXHJcbiAqXHJcbiAqIERlbGliZXJhdGVseSBtb2R1bGUgc3RhdGUgcmF0aGVyIHRoYW4gZWRpdG9yIHN0YXRlOiBpdCBpcyBhIHRyYW5zaWVudFxyXG4gKiBrZXlib2FyZCBnZXN0dXJlLCBhbmQgbmVpdGhlciB0aGUgZG9jdW1lbnQgbm9yIHRoZSBoaXN0b3J5IHNob3VsZCBldmVyXHJcbiAqIHNlZSBpdC4gQSBjYXJldCB0aGF0IG1vdmVzIGZvciBhbnkgb3RoZXIgcmVhc29uIHN0cmFuZHMgdGhlIG1hcmtlcixcclxuICogd2hpY2ggaXMgZXhhY3RseSByaWdodC4gVGhlIGdlc3R1cmUgaGFzIGJlZW4gaW50ZXJydXB0ZWQuXHJcbiAqL1xyXG5sZXQgbGFzdE5ld2xpbmU6IHsgcGF0aDogcmVhZG9ubHkgbnVtYmVyW107IG9mZnNldDogbnVtYmVyIH0gfCBudWxsID0gbnVsbFxyXG5cclxuZXhwb3J0IGNvbnN0IHNwbGl0QmxvY2tJblByZWZvcm1hdHRlZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2sgfHwgIWJsb2NrLnR5cGUuc3BlYy5wcmVzZXJ2ZVdoaXRlc3BhY2UpIHJldHVybiBudWxsXHJcblxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICBpZiAoIXNlbGVjdGlvbi5lbXB0eSkgZGVsZXRlUmFuZ2UodHIsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pXHJcblxyXG4gIGNvbnN0IHBvaW50ID0gdHIubWFwUG9zaXRpb24oc2VsZWN0aW9uLmZyb20sIC0xKVxyXG4gIGNvbnN0IGN1cnJlbnQgPSBub2RlQXRQYXRoKHRyLmRvYywgcG9pbnQucGF0aClcclxuICBpZiAoIWN1cnJlbnQpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdGV4dCA9IGN1cnJlbnQudGV4dENvbnRlbnRcclxuICBjb25zdCBhdEVuZCA9IHBvaW50Lm9mZnNldCA9PT0gaW5saW5lTGVuZ3RoKGN1cnJlbnQuY29udGVudClcclxuXHJcbiAgLy8gRW50ZXIgYXQgdGhlIGVuZCBvZiBhIGJsYW5rIGxpbmUgdGhlIHVzZXIganVzdCBjcmVhdGVkIGxlYXZlcyB0aGUgYmxvY2suXHJcbiAgLy9cclxuICAvLyBUaGUgZG9jdW1lbnQgY2Fubm90IHRlbGwgXCJhcnJpdmVkIG9uIGEgYmxhbmsgbGluZVwiIGZyb20gXCJtYWRlIHRoaXMgYmxhbmtcclxuICAvLyBsaW5lXCIsIGJvdGggYXJlIGEgbmV3bGluZSBiZWZvcmUgdGhlIGNhcmV0LCBidXQgb25seSB0aGUgc2Vjb25kIGlzIGFcclxuICAvLyByZXF1ZXN0IHRvIGxlYXZlLiBTbyB0aGUgZ2VzdHVyZSBpcyB0d28gKmNvbnNlY3V0aXZlKiBFbnRlcnMsIHRyYWNrZWQgYnlcclxuICAvLyB3aGVyZSB0aGUgbGFzdCBvbmUgcHV0IHRoZSBjYXJldC4gQmxhbmsgbWVhbnMgbm90aGluZyBidXQgaW5kZW50YXRpb246XHJcbiAgLy8gdGhlIGF1dG8taW5kZW50IGJlbG93IGxlYXZlcyBzcGFjZXMgb24gYSBsaW5lIG5vYm9keSBoYXMgdHlwZWQgb24uXHJcbiAgY29uc3QgbGluZVN0YXJ0ID0gdGV4dC5sYXN0SW5kZXhPZignXFxuJywgcG9pbnQub2Zmc2V0IC0gMSkgKyAxXHJcbiAgY29uc3Qgb25CbGFua0xpbmUgPSBsaW5lU3RhcnQgPiAwICYmIC9eWyBcXHRdKiQvLnRlc3QodGV4dC5zbGljZShsaW5lU3RhcnQsIHBvaW50Lm9mZnNldCkpXHJcbiAgY29uc3QgY29uc2VjdXRpdmUgPVxyXG4gICAgbGFzdE5ld2xpbmUgIT09IG51bGwgJiZcclxuICAgIGxhc3ROZXdsaW5lLm9mZnNldCA9PT0gcG9pbnQub2Zmc2V0ICYmXHJcbiAgICBwYXRoc0VxdWFsKGxhc3ROZXdsaW5lLnBhdGgsIHBvaW50LnBhdGgpXHJcblxyXG4gIGlmIChhdEVuZCAmJiBvbkJsYW5rTGluZSAmJiBjb25zZWN1dGl2ZSkge1xyXG4gICAgY29uc3QgcGFyYWdyYXBoID0gc3RhdGUuc2NoZW1hLm5vZGVzLnBhcmFncmFwaFxyXG4gICAgaWYgKHBhcmFncmFwaCkge1xyXG4gICAgICAvLyBEcm9wIHRoZSBuZXdsaW5lIHRoYXQgb3BlbmVkIHRoZSBibGFuayBsaW5lLCBpbmRlbnRhdGlvbiBhbmQgYWxsLCBzb1xyXG4gICAgICAvLyBlc2NhcGluZyBsZWF2ZXMgdGhlIGNvZGUgZXhhY3RseSBhcyBpdCB3YXMuXHJcbiAgICAgIGRlbGV0ZVJhbmdlKHRyLCBwb3MocG9pbnQucGF0aCwgbGluZVN0YXJ0IC0gMSksIHBvaW50KVxyXG4gICAgICBjb25zdCBlbmQgPSB0ci5tYXBQb3NpdGlvbihwb2ludCwgLTEpXHJcbiAgICAgIHRyLnN0ZXAobmV3IFNwbGl0Tm9kZVN0ZXAoZW5kLnBhdGgsIGVuZC5vZmZzZXQsIHBhcmFncmFwaC5uYW1lKSlcclxuICAgICAgY29uc3QgcGFyZW50UGF0aCA9IGVuZC5wYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgICBjb25zdCBpbmRleCA9IGVuZC5wYXRoW2VuZC5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKFsuLi5wYXJlbnRQYXRoLCBpbmRleCArIDFdLCAwKSkpXHJcbiAgICAgIGxhc3ROZXdsaW5lID0gbnVsbFxyXG4gICAgICByZXR1cm4gdHJcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIFRoZSBuZXcgbGluZSBrZWVwcyB0aGUgY3VycmVudCBsaW5lJ3MgaW5kZW50YXRpb24sIHRoZSB3YXkgYSBjb2RlIGVkaXRvclxyXG4gIC8vIGRvZXMuIEFmdGVyIGFuIG9wZW5pbmcgYnJhY2tldCBpdCBnb2VzIG9uZSBsZXZlbCBkZWVwZXI7IGFuZCB3aXRoIHRoZVxyXG4gIC8vIGNhcmV0IGJldHdlZW4gYSBicmFja2V0IGFuZCBpdHMgY2xvc2VyLCB0aGUgY2xvc2VyIG1vdmVzIHRvIGEgbGluZSBvZiBpdHNcclxuICAvLyBvd24gYmVsb3csIHNvIGB7fH1gIG9wZW5zIGludG8gYSBibG9jayB3aXRoIHRoZSBjYXJldCBpbnNpZGUgaXQuXHJcbiAgY29uc3QgaW5kZW50ID0gbGluZUluZGVudGF0aW9uKHRleHQsIGxpbmVTdGFydClcclxuICBjb25zdCBiZWZvcmUgPSB0ZXh0W3BvaW50Lm9mZnNldCAtIDFdXHJcbiAgY29uc3QgY2xvc2VyID0gYmVmb3JlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBDT0RFX0JSQUNLRVRTLmdldChiZWZvcmUpXHJcbiAgY29uc3QgZGVlcGVyID0gY2xvc2VyICE9PSB1bmRlZmluZWRcclxuICBjb25zdCBvcGVuc0Jsb2NrID0gZGVlcGVyICYmIHRleHRbcG9pbnQub2Zmc2V0XSA9PT0gY2xvc2VyXHJcbiAgY29uc3QgaW5zZXJ0ZWQgPSBgXFxuJHtpbmRlbnR9JHtkZWVwZXIgPyBDT0RFX0lOREVOVCA6ICcnfWBcclxuICBjb25zdCB0cmFpbGluZyA9IG9wZW5zQmxvY2sgPyBgXFxuJHtpbmRlbnR9YCA6ICcnXHJcbiAgdHIuc3RlcChcclxuICAgIG5ldyBSZXBsYWNlSW5saW5lU3RlcChcclxuICAgICAgcG9pbnQucGF0aCxcclxuICAgICAgcG9pbnQub2Zmc2V0LFxyXG4gICAgICBwb2ludC5vZmZzZXQsXHJcbiAgICAgIEZyYWdtZW50LmZyb20oW3N0YXRlLnNjaGVtYS50ZXh0KGluc2VydGVkICsgdHJhaWxpbmcpXSksXHJcbiAgICApLFxyXG4gIClcclxuICBjb25zdCBjYXJldCA9IHBvaW50Lm9mZnNldCArIGluc2VydGVkLmxlbmd0aFxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocG9pbnQucGF0aCwgY2FyZXQpKSlcclxuICAvLyBSZW1lbWJlciB3aGVyZSB0aGlzIG5ld2xpbmUgbGVmdCB0aGUgY2FyZXQsIHNvIGFuIGltbWVkaWF0ZWx5IGZvbGxvd2luZ1xyXG4gIC8vIEVudGVyIGlzIHJlY29nbmlzZWQgYXMgdGhlIHNlY29uZCBoYWxmIG9mIHRoZSBlc2NhcGUgZ2VzdHVyZS5cclxuICBsYXN0TmV3bGluZSA9IHsgcGF0aDogcG9pbnQucGF0aCwgb2Zmc2V0OiBjYXJldCB9XHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNb2QtRW50ZXIgaW5zaWRlIGEgY29kZSBibG9jazogc3RhcnQgYSBwYXJhZ3JhcGggYWZ0ZXIgaXQgYW5kIG1vdmUgdGhlXHJcbiAqIGNhcmV0IHRoZXJlLiBUaGUgdHdvLUVudGVyIGdlc3R1cmUgb25seSB3b3JrcyBmcm9tIGEgYmxhbmsgbGFzdCBsaW5lOyB0aGlzXHJcbiAqIGxlYXZlcyBmcm9tIGFueXdoZXJlIGluIHRoZSBibG9jaywgd2l0aG91dCBodW50aW5nIGZvciBpdHMgZW5kLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGV4aXRQcmVmb3JtYXR0ZWQ6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBibG9jayA9IHByZWZvcm1hdHRlZEF0KHN0YXRlKVxyXG4gIGlmICghYmxvY2spIHJldHVybiBudWxsXHJcbiAgY29uc3QgcGFyYWdyYXBoID0gc3RhdGUuc2NoZW1hLm5vZGVzLnBhcmFncmFwaFxyXG4gIGlmICghcGFyYWdyYXBoKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHBhdGggPSAoc3RhdGUuc2VsZWN0aW9uIGFzIFRleHRTZWxlY3Rpb24pLmZyb20ucGF0aFxyXG4gIGNvbnN0IHBhcmVudFBhdGggPSBwYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IGluZGV4ID0gcGF0aFtwYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICB0ci5zdGVwKG5ldyBSZXBsYWNlTm9kZXNTdGVwKHBhcmVudFBhdGgsIGluZGV4ICsgMSwgaW5kZXggKyAxLCBGcmFnbWVudC5vZihwYXJhZ3JhcGguY3JlYXRlKCkpKSlcclxuICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKFsuLi5wYXJlbnRQYXRoLCBpbmRleCArIDFdLCAwKSkpXHJcbiAgbGFzdE5ld2xpbmUgPSBudWxsXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTaGlmdC1FbnRlciBpbnNpZGUgYSBjb2RlIGJsb2NrOiBhIHBsYWluIG5ld2xpbmUsIHdpdGggbm9uZSBvZiB0aGVcclxuICogaW5kZW50YXRpb24gRW50ZXIgYWRkcy4gQSBoYXJkIGJyZWFrIGlzIG5vdCBhbGxvd2VkIGluIGEgY29kZSBibG9jaywgc29cclxuICogd2l0aG91dCB0aGlzIHRoZSBrZXkgZGlkIG5vdGhpbmcgdGhlcmUuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgaW5zZXJ0TmV3bGluZUluUHJlZm9ybWF0dGVkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgaWYgKCFwcmVmb3JtYXR0ZWRBdChzdGF0ZSkpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIGluc2VydFRleHQoJ1xcbicpKHN0YXRlKVxyXG59XHJcblxyXG4vKipcclxuICogVHlwaW5nIGluc2lkZSBhIGNvZGUgYmxvY2ssIHdpdGggYSBjb2RlIGVkaXRvcidzIGJyYWNrZXQgYW5kIHF1b3RlXHJcbiAqIGJlaGF2aW91cjogYW4gb3BlbmluZyBicmFja2V0IGJyaW5ncyBpdHMgY2xvc2VyIGFsb25nIGFuZCBsZWF2ZXMgdGhlIGNhcmV0XHJcbiAqIGJldHdlZW4gdGhlIHR3bzsgdHlwaW5nIGEgY2xvc2VyIHRoYXQgaXMgYWxyZWFkeSB0aGVyZSBzdGVwcyBwYXN0IGl0OyBhbmRcclxuICogYSBicmFja2V0IG9yIHF1b3RlIHR5cGVkIG92ZXIgYSBzZWxlY3Rpb24gd3JhcHMgaXQuIERlY2xpbmVzIHdoZW5ldmVyIG5vbmVcclxuICogb2YgdGhhdCBhcHBsaWVzLCBzbyBvcmRpbmFyeSBpbnNlcnRpb24gcnVucy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiB0eXBlSW5QcmVmb3JtYXR0ZWQodGV4dDogc3RyaW5nKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3QgYmxvY2sgPSBwcmVmb3JtYXR0ZWRBdChzdGF0ZSlcclxuICAgIGlmICghYmxvY2sgfHwgdGV4dC5sZW5ndGggIT09IDEpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb24gYXMgVGV4dFNlbGVjdGlvblxyXG4gICAgY29uc3Qgc291cmNlID0gYmxvY2sudGV4dENvbnRlbnRcclxuICAgIGNvbnN0IHBhdGggPSBzZWxlY3Rpb24uZnJvbS5wYXRoXHJcbiAgICBjb25zdCBjbG9zZXIgPSBDT0RFX1BBSVJTLmdldCh0ZXh0KVxyXG5cclxuICAgIGlmICghc2VsZWN0aW9uLmVtcHR5KSB7XHJcbiAgICAgIGlmIChjbG9zZXIgPT09IHVuZGVmaW5lZCkgcmV0dXJuIG51bGxcclxuICAgICAgY29uc3QgaW5uZXIgPSBzb3VyY2Uuc2xpY2Uoc2VsZWN0aW9uLmZyb20ub2Zmc2V0LCBzZWxlY3Rpb24udG8ub2Zmc2V0KVxyXG4gICAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAgIHRyLnN0ZXAoXHJcbiAgICAgICAgbmV3IFJlcGxhY2VJbmxpbmVTdGVwKFxyXG4gICAgICAgICAgcGF0aCxcclxuICAgICAgICAgIHNlbGVjdGlvbi5mcm9tLm9mZnNldCxcclxuICAgICAgICAgIHNlbGVjdGlvbi50by5vZmZzZXQsXHJcbiAgICAgICAgICBGcmFnbWVudC5mcm9tKFtzdGF0ZS5zY2hlbWEudGV4dChgJHt0ZXh0fSR7aW5uZXJ9JHtjbG9zZXJ9YCldKSxcclxuICAgICAgICApLFxyXG4gICAgICApXHJcbiAgICAgIC8vIFRoZSB0ZXh0IHN0YXlzIHNlbGVjdGVkIGluc2lkZSB0aGUgcGFpciwgc28gYW5vdGhlciBicmFja2V0IG5lc3RzLlxyXG4gICAgICByZXR1cm4gdHIuc2V0U2VsZWN0aW9uKFxyXG4gICAgICAgIG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhwYXRoLCBzZWxlY3Rpb24uZnJvbS5vZmZzZXQgKyAxKSwgcG9zKHBhdGgsIHNlbGVjdGlvbi50by5vZmZzZXQgKyAxKSksXHJcbiAgICAgIClcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBvZmZzZXQgPSBzZWxlY3Rpb24uZnJvbS5vZmZzZXRcclxuICAgIGNvbnN0IGJlZm9yZSA9IHNvdXJjZVtvZmZzZXQgLSAxXVxyXG4gICAgY29uc3QgYWZ0ZXIgPSBzb3VyY2Vbb2Zmc2V0XVxyXG5cclxuICAgIC8vIFRoZSBjbG9zZXIgaXMgYWxyZWFkeSB0aGVyZTogdHlwaWNhbGx5IGJlY2F1c2UgdGhpcyBlZGl0b3IgcHV0IGl0XHJcbiAgICAvLyB0aGVyZSwgc28gdHlwaW5nIGl0IHN0ZXBzIG92ZXIgaXQgcmF0aGVyIHRoYW4gZG91YmxpbmcgaXQuXHJcbiAgICBpZiAoQ09ERV9DTE9TRVJTLmhhcyh0ZXh0KSAmJiBhZnRlciA9PT0gdGV4dCkge1xyXG4gICAgICByZXR1cm4gc3RhdGUudHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhwYXRoLCBvZmZzZXQgKyAxKSkpXHJcbiAgICB9XHJcbiAgICBpZiAoY2xvc2VyID09PSB1bmRlZmluZWQpIHJldHVybiBudWxsXHJcbiAgICBpZiAoYWZ0ZXIgIT09IHVuZGVmaW5lZCAmJiAhQ0xPU0VfQkVGT1JFLmhhcyhhZnRlcikpIHJldHVybiBudWxsXHJcbiAgICAvLyBBIHF1b3RlIGFmdGVyIGEgd29yZCBpcyBhbiBhcG9zdHJvcGhlIG9yIGEgY2xvc2luZyBxdW90ZSwgbm90IGFuXHJcbiAgICAvLyBvcGVuaW5nIG9uZTogYGRvbidgIG11c3Qgbm90IGJlY29tZSBgZG9uJydgLlxyXG4gICAgaWYgKFxyXG4gICAgICBDT0RFX1FVT1RFUy5oYXModGV4dCkgJiZcclxuICAgICAgYmVmb3JlICE9PSB1bmRlZmluZWQgJiZcclxuICAgICAgKENPREVfV09SRC50ZXN0KGJlZm9yZSkgfHwgYmVmb3JlID09PSB0ZXh0KVxyXG4gICAgKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgdHIuc3RlcChcclxuICAgICAgbmV3IFJlcGxhY2VJbmxpbmVTdGVwKFxyXG4gICAgICAgIHBhdGgsXHJcbiAgICAgICAgb2Zmc2V0LFxyXG4gICAgICAgIG9mZnNldCxcclxuICAgICAgICBGcmFnbWVudC5mcm9tKFtzdGF0ZS5zY2hlbWEudGV4dCh0ZXh0ICsgY2xvc2VyKV0pLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gICAgcmV0dXJuIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocGF0aCwgb2Zmc2V0ICsgMSkpKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEJhY2tzcGFjZSBpbnNpZGUgYSBjb2RlIGJsb2NrOiBiZXR3ZWVuIHRoZSB0d28gaGFsdmVzIG9mIGFuIGVtcHR5IHBhaXIgaXRcclxuICogcmVtb3ZlcyBib3RoLCBhbmQgaW5zaWRlIGEgbGluZSdzIGxlYWRpbmcgd2hpdGVzcGFjZSBpdCBzdGVwcyBiYWNrIHRvIHRoZVxyXG4gKiBwcmV2aW91cyBpbmRlbnQgc3RvcCByYXRoZXIgdGhhbiBvbmUgc3BhY2UuIERlY2xpbmVzIG90aGVyd2lzZSwgc28gdGhlXHJcbiAqIG9yZGluYXJ5IGRlbGV0ZSBydW5zLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGRlbGV0ZUJhY2t3YXJkSW5QcmVmb3JtYXR0ZWQ6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBibG9jayA9IHByZWZvcm1hdHRlZEF0KHN0YXRlKVxyXG4gIGlmICghYmxvY2spIHJldHVybiBudWxsXHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uIGFzIFRleHRTZWxlY3Rpb25cclxuICBpZiAoIXNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBzb3VyY2UgPSBibG9jay50ZXh0Q29udGVudFxyXG4gIGNvbnN0IHBhdGggPSBzZWxlY3Rpb24uZnJvbS5wYXRoXHJcbiAgY29uc3Qgb2Zmc2V0ID0gc2VsZWN0aW9uLmZyb20ub2Zmc2V0XHJcbiAgY29uc3QgYmVmb3JlID0gc291cmNlW29mZnNldCAtIDFdXHJcbiAgaWYgKGJlZm9yZSA9PT0gdW5kZWZpbmVkKSByZXR1cm4gbnVsbFxyXG5cclxuICBjb25zdCBjbG9zZXIgPSBDT0RFX1BBSVJTLmdldChiZWZvcmUpXHJcbiAgaWYgKGNsb3NlciAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZVtvZmZzZXRdID09PSBjbG9zZXIpIHtcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKHBhdGgsIG9mZnNldCAtIDEsIG9mZnNldCArIDEsIEZyYWdtZW50LmVtcHR5KSlcclxuICAgIHJldHVybiB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBhdGgsIG9mZnNldCAtIDEpKSlcclxuICB9XHJcblxyXG4gIGNvbnN0IGxpbmVTdGFydCA9IHNvdXJjZS5sYXN0SW5kZXhPZignXFxuJywgb2Zmc2V0IC0gMSkgKyAxXHJcbiAgY29uc3QgbGVhZGluZyA9IHNvdXJjZS5zbGljZShsaW5lU3RhcnQsIG9mZnNldClcclxuICBpZiAobGVhZGluZy5sZW5ndGggPiAxICYmIC9eICskLy50ZXN0KGxlYWRpbmcpKSB7XHJcbiAgICBjb25zdCByZW1vdmUgPSAoKGxlYWRpbmcubGVuZ3RoIC0gMSkgJSBDT0RFX0lOREVOVC5sZW5ndGgpICsgMVxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAocGF0aCwgb2Zmc2V0IC0gcmVtb3ZlLCBvZmZzZXQsIEZyYWdtZW50LmVtcHR5KSlcclxuICAgIHJldHVybiB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBhdGgsIG9mZnNldCAtIHJlbW92ZSkpKVxyXG4gIH1cclxuICByZXR1cm4gbnVsbFxyXG59XHJcblxyXG5leHBvcnQgY29uc3Qgc3BsaXRCbG9jazogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICBpZiAoIXNlbGVjdGlvbi5lbXB0eSkgZGVsZXRlUmFuZ2UodHIsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pXHJcbiAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uZnJvbVxyXG4gIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aCh0ci5kb2MsIHBvaW50LnBhdGgpXHJcbiAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2spIHJldHVybiBudWxsXHJcbiAgLy8gRW50ZXIgYXQgdGhlIGVuZCBvZiBhIG5vbi1wYXJhZ3JhcGggYmxvY2sgc3RhcnRzIGEgZnJlc2ggcGFyYWdyYXBoLlxyXG4gIGNvbnN0IHBhcmFncmFwaCA9IHN0YXRlLnNjaGVtYS5ub2Rlcy5wYXJhZ3JhcGhcclxuICBjb25zdCBhdEVuZCA9IHBvaW50Lm9mZnNldCA9PT0gaW5saW5lTGVuZ3RoKGJsb2NrLmNvbnRlbnQpXHJcbiAgY29uc3QgYWZ0ZXJUeXBlID0gYXRFbmQgJiYgcGFyYWdyYXBoICYmIGJsb2NrLnR5cGUgIT09IHBhcmFncmFwaCA/IHBhcmFncmFwaC5uYW1lIDogdW5kZWZpbmVkXHJcbiAgdHIuc3RlcChuZXcgU3BsaXROb2RlU3RlcChwb2ludC5wYXRoLCBwb2ludC5vZmZzZXQsIGFmdGVyVHlwZSkpXHJcbiAgY29uc3QgcGFyZW50UGF0aCA9IHBvaW50LnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgY29uc3QgaW5kZXggPSBwb2ludC5wYXRoW3BvaW50LnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhbLi4ucGFyZW50UGF0aCwgaW5kZXggKyAxXSwgMCkpKVxyXG4gIHJldHVybiB0clxyXG59XHJcblxyXG4vKipcclxuICogSW5zZXJ0IHBhcnNlZCBjb250ZW50IChwYXN0ZSk6IGlubGluZSBjb250ZW50IG1lcmdlcyBpbnRvIHRoZSBjdXJyZW50XHJcbiAqIGJsb2NrOyBibG9jayBjb250ZW50IGlzIHNwbGljZWQgaW4gYWZ0ZXIgc3BsaXR0aW5nIGF0IHRoZSBjdXJzb3IuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0Q29udGVudChub2RlczogcmVhZG9ubHkgRWRpdG9yTm9kZVtdKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgaWYgKG5vZGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gICAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBpZiAoIXNlbGVjdGlvbi5lbXB0eSkgZGVsZXRlUmFuZ2UodHIsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pXHJcbiAgICBjb25zdCBwb2ludCA9IHNlbGVjdGlvbi5mcm9tXHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgodHIuZG9jLCBwb2ludC5wYXRoKVxyXG4gICAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2spIHJldHVybiBudWxsXHJcblxyXG4gICAgY29uc3QgYWxsSW5saW5lID0gbm9kZXMuZXZlcnkoKG5vZGUpID0+IG5vZGUuaXNJbmxpbmUpXHJcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gcG9pbnQucGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gcG9pbnQucGF0aFtwb2ludC5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgY29uc3QgYmxvY2tFbXB0eSA9IGlubGluZUxlbmd0aChibG9jay5jb250ZW50KSA9PT0gMFxyXG5cclxuICAgIGlmICghYWxsSW5saW5lICYmIGJsb2NrRW1wdHkpIHtcclxuICAgICAgLy8gUGFzdGluZyBibG9ja3MgaW50byBhbiBlbXB0eSBibG9jayByZXBsYWNlcyBpdCB3aG9sZXNhbGUuXHJcbiAgICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAocGFyZW50UGF0aCwgaW5kZXgsIGluZGV4ICsgMSwgRnJhZ21lbnQuZnJvbShub2RlcykpKVxyXG4gICAgICB0ci5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uQWZ0ZXJCbG9ja3MocGFyZW50UGF0aCwgaW5kZXggLSAxLCBub2RlcykpXHJcbiAgICAgIHJldHVybiB0clxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHNpbmdsZSA9IG5vZGVzLmxlbmd0aCA9PT0gMSA/IG5vZGVzWzBdIDogbnVsbFxyXG4gICAgaWYgKGFsbElubGluZSB8fCBzaW5nbGU/LmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgIGNvbnN0IHNvdXJjZSA9IGFsbElubGluZSA/IG5vZGVzIDogKHNpbmdsZSBhcyBFZGl0b3JOb2RlKS5jb250ZW50LmNoaWxkcmVuXHJcbiAgICAgIC8vIFRoZSBwYXlsb2FkIGNhbWUgZnJvbSBzb21ld2hlcmUgZWxzZSAoYW5vdGhlciBibG9jaywgYW5vdGhlclxyXG4gICAgICAvLyBkb2N1bWVudCwgdGhlIGNsaXBib2FyZCkgc28gaXQgbWF5IGNhcnJ5IG1hcmtzIGFuZCBpbmxpbmUgbm9kZXMgdGhpc1xyXG4gICAgICAvLyBibG9jayBkb2VzIG5vdCB0YWtlLiBSZWR1Y2UgaXQgdG8gd2hhdCBmaXRzIHJhdGhlciB0aGFuIGJ1aWxkaW5nIGFcclxuICAgICAgLy8gZG9jdW1lbnQgdGhlIHNjaGVtYSB3b3VsZCByZWplY3QuXHJcbiAgICAgIGNvbnN0IGlubGluZSA9IEZyYWdtZW50LmZyb20oY29lcmNlSW5saW5lRm9yKGJsb2NrLnR5cGUsIHNvdXJjZSkpXHJcbiAgICAgIGlmIChpbmxpbmUuY2hpbGRDb3VudCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICAgICAgY29uc3QgbGVuZ3RoID0gaW5saW5lTGVuZ3RoKGlubGluZSlcclxuICAgICAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAocG9pbnQucGF0aCwgcG9pbnQub2Zmc2V0LCBwb2ludC5vZmZzZXQsIGlubGluZSkpXHJcbiAgICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocG9pbnQucGF0aCwgcG9pbnQub2Zmc2V0ICsgbGVuZ3RoKSkpXHJcbiAgICAgIHJldHVybiB0clxyXG4gICAgfVxyXG5cclxuICAgIC8vIE11bHRpLWJsb2NrIHBheWxvYWQ6IHNwbGl0IHRoZSBjdXJyZW50IGJsb2NrIGFuZCBzcGxpY2UgYmV0d2VlbiBoYWx2ZXMuXHJcbiAgICB0ci5zdGVwKG5ldyBTcGxpdE5vZGVTdGVwKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCkpXHJcbiAgICB0ci5zdGVwKG5ldyBSZXBsYWNlTm9kZXNTdGVwKHBhcmVudFBhdGgsIGluZGV4ICsgMSwgaW5kZXggKyAxLCBGcmFnbWVudC5mcm9tKG5vZGVzKSkpXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uQWZ0ZXJCbG9ja3MocGFyZW50UGF0aCwgaW5kZXgsIG5vZGVzKSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxufVxyXG5cclxuLyoqIEN1cnNvciBhdCB0aGUgZW5kIG9mIHRoZSBsYXN0IG9mIGBub2Rlc2AsIGluc2VydGVkIHN0YXJ0aW5nIGF0IGBpbmRleCArIDFgLiAqL1xyXG5mdW5jdGlvbiBzZWxlY3Rpb25BZnRlckJsb2NrcyhcclxuICBwYXJlbnRQYXRoOiByZWFkb25seSBudW1iZXJbXSxcclxuICBpbmRleDogbnVtYmVyLFxyXG4gIG5vZGVzOiByZWFkb25seSBFZGl0b3JOb2RlW10sXHJcbik6IFRleHRTZWxlY3Rpb24ge1xyXG4gIGNvbnN0IGxhc3ROb2RlID0gbm9kZXNbbm9kZXMubGVuZ3RoIC0gMV0gYXMgRWRpdG9yTm9kZVxyXG4gIGNvbnN0IGxhc3RQYXRoID0gWy4uLnBhcmVudFBhdGgsIGluZGV4ICsgbm9kZXMubGVuZ3RoXVxyXG4gIHJldHVybiBuZXcgVGV4dFNlbGVjdGlvbihcclxuICAgIGxhc3ROb2RlLmlzVGV4dGJsb2NrXHJcbiAgICAgID8gcG9zKGxhc3RQYXRoLCBpbmxpbmVMZW5ndGgobGFzdE5vZGUuY29udGVudCkpXHJcbiAgICAgIDogcG9zKHBhcmVudFBhdGgsIGluZGV4ICsgbm9kZXMubGVuZ3RoICsgMSksXHJcbiAgKVxyXG59XHJcblxyXG4vKiogQmFja3NwYWNlOiBkZWxldGUgdGhlIHNlbGVjdGlvbiwgb25lIHVuaXQgYmFjaywgb3Igam9pbiB3aXRoIHRoZSBwcmV2aW91cyBibG9jay4gKi9cclxuZXhwb3J0IGNvbnN0IGRlbGV0ZUNoYXJCYWNrd2FyZDogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIGlmICghc2VsZWN0aW9uLmVtcHR5KSByZXR1cm4gZGVsZXRlU2VsZWN0aW9uKHN0YXRlKVxyXG4gIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHBvaW50ID0gc2VsZWN0aW9uLmhlYWRcclxuICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBwb2ludC5wYXRoKVxyXG4gIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGJvdW5kYXJ5ID0gcHJldmlvdXNJbmxpbmVCb3VuZGFyeShibG9jay5jb250ZW50LCBwb2ludC5vZmZzZXQpXHJcbiAgaWYgKGJvdW5kYXJ5IDwgMCkgcmV0dXJuIGpvaW5CYWNrd2FyZChzdGF0ZSlcclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAocG9pbnQucGF0aCwgYm91bmRhcnksIHBvaW50Lm9mZnNldCwgRnJhZ21lbnQuZW1wdHkpKVxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MocG9pbnQucGF0aCwgYm91bmRhcnkpKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIERlbGV0ZTogcmVtb3ZlIHRoZSBzZWxlY3Rpb24sIG9uZSB1bml0IGZvcndhcmQsIG9yIGpvaW4gd2l0aCB0aGUgbmV4dCBibG9jay4gKi9cclxuZXhwb3J0IGNvbnN0IGRlbGV0ZUNoYXJGb3J3YXJkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIHJldHVybiBkZWxldGVTZWxlY3Rpb24oc3RhdGUpXHJcbiAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikpIHJldHVybiBudWxsXHJcbiAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uaGVhZFxyXG4gIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHBvaW50LnBhdGgpXHJcbiAgaWYgKCFibG9jaz8uaXNUZXh0YmxvY2spIHJldHVybiBudWxsXHJcbiAgY29uc3QgYm91bmRhcnkgPSBuZXh0SW5saW5lQm91bmRhcnkoYmxvY2suY29udGVudCwgcG9pbnQub2Zmc2V0KVxyXG4gIGlmIChib3VuZGFyeSA8IDApIHJldHVybiBqb2luRm9yd2FyZChzdGF0ZSlcclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAocG9pbnQucGF0aCwgcG9pbnQub2Zmc2V0LCBib3VuZGFyeSwgRnJhZ21lbnQuZW1wdHkpKVxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb2ludCkpXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKiBEZWxldGUgYXQgdGhlIGVuZCBvZiBhIGJsb2NrOiBqb2luIHRoZSBuZXh0IHNpYmxpbmcgaW50byB0aGlzIG9uZS4gKi9cclxuZXhwb3J0IGNvbnN0IGpvaW5Gb3J3YXJkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikgfHwgIXNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBwb2ludCA9IHNlbGVjdGlvbi5oZWFkXHJcbiAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcG9pbnQucGF0aClcclxuICBpZiAoIWJsb2NrPy5pc1RleHRibG9jayB8fCBwb2ludC5vZmZzZXQgIT09IGlubGluZUxlbmd0aChibG9jay5jb250ZW50KSkgcmV0dXJuIG51bGxcclxuICBpZiAocG9pbnQucGF0aC5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgY29uc3QgaW5kZXggPSBwb2ludC5wYXRoW3BvaW50LnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgY29uc3QgcGFyZW50UGF0aCA9IHBvaW50LnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgY29uc3QgbmV4dCA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBbLi4ucGFyZW50UGF0aCwgaW5kZXggKyAxXSlcclxuICBpZiAoIW5leHQpIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIGlmICghbmV4dC5pc1RleHRibG9jaykge1xyXG4gICAgaWYgKCFuZXh0LmlzQXRvbSkgcmV0dXJuIG51bGxcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAocGFyZW50UGF0aCwgaW5kZXggKyAxLCBpbmRleCArIDIsIEZyYWdtZW50LmVtcHR5KSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxuICB0ci5zdGVwKG5ldyBKb2luTm9kZXNTdGVwKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCkpXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvaW50KSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIEJhY2tzcGFjZSBhdCB0aGUgc3RhcnQgb2YgYSBibG9jazogam9pbiB3aXRoIHRoZSBwcmV2aW91cyBzaWJsaW5nLiAqL1xyXG5leHBvcnQgY29uc3Qgam9pbkJhY2t3YXJkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikgfHwgIXNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBwb2ludCA9IHNlbGVjdGlvbi5oZWFkXHJcbiAgaWYgKHBvaW50Lm9mZnNldCAhPT0gMCB8fCBwb2ludC5wYXRoLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICBjb25zdCBpbmRleCA9IHBvaW50LnBhdGhbcG9pbnQucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICBpZiAoaW5kZXggPT09IDApIHJldHVybiBudWxsXHJcbiAgY29uc3QgcGFyZW50UGF0aCA9IHBvaW50LnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgY29uc3QgcHJldmlvdXNQYXRoID0gWy4uLnBhcmVudFBhdGgsIGluZGV4IC0gMV1cclxuICBjb25zdCBwcmV2aW91cyA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBwcmV2aW91c1BhdGgpXHJcbiAgaWYgKCFwcmV2aW91cykgcmV0dXJuIG51bGxcclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgaWYgKCFwcmV2aW91cy5pc1RleHRibG9jaykge1xyXG4gICAgLy8gQmFja3NwYWNlIGludG8gYW4gYXRvbSBibG9jayAoaHIpOiBkZWxldGUgaXQuXHJcbiAgICBpZiAoIXByZXZpb3VzLmlzQXRvbSkgcmV0dXJuIG51bGxcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAocGFyZW50UGF0aCwgaW5kZXggLSAxLCBpbmRleCwgRnJhZ21lbnQuZW1wdHkpKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG4gIGNvbnN0IGpvaW5PZmZzZXQgPSBpbmxpbmVMZW5ndGgocHJldmlvdXMuY29udGVudClcclxuICB0ci5zdGVwKG5ldyBKb2luTm9kZXNTdGVwKHByZXZpb3VzUGF0aCwgam9pbk9mZnNldCkpXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhwcmV2aW91c1BhdGgsIGpvaW5PZmZzZXQpKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIEluc2VydCBhbiBpbmxpbmUgYXRvbSBub2RlIChoYXJkIGJyZWFrLCDigKYpIGF0IHRoZSBzZWxlY3Rpb24uICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRJbmxpbmVOb2RlKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubm9kZVR5cGUobmFtZSlcclxuICAgIGlmICghdHlwZS5pc0lubGluZSB8fCAhdHlwZS5pc0F0b20pIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIGRlbGV0ZVJhbmdlKHRyLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKVxyXG4gICAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uZnJvbVxyXG4gICAgdHIuc3RlcChcclxuICAgICAgbmV3IFJlcGxhY2VJbmxpbmVTdGVwKFxyXG4gICAgICAgIHBvaW50LnBhdGgsXHJcbiAgICAgICAgcG9pbnQub2Zmc2V0LFxyXG4gICAgICAgIHBvaW50Lm9mZnNldCxcclxuICAgICAgICBGcmFnbWVudC5vZih0eXBlLmNyZWF0ZShhdHRycykpLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhwb2ludC5wYXRoLCBwb2ludC5vZmZzZXQgKyAxKSkpXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbn1cclxuXHJcbi8qKiBJbnNlcnQgYSBibG9jayBub2RlIChob3Jpem9udGFsIHJ1bGUsIOKApikgYWZ0ZXIgdGhlIGN1cnJlbnQgYmxvY2suICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRCbG9ja0FmdGVyKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubm9kZVR5cGUobmFtZSlcclxuICAgIGlmICh0eXBlLmlzSW5saW5lIHx8IHR5cGUuaW5saW5lQ29udGVudCkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gICAgY29uc3QgYmxvY2tQYXRoID0gc2VsZWN0aW9uLnRvLnBhdGhcclxuICAgIGlmIChibG9ja1BhdGgubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IGJsb2NrUGF0aC5zbGljZSgwLCAtMSlcclxuICAgIGNvbnN0IGluZGV4ID0gYmxvY2tQYXRoW2Jsb2NrUGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VOb2Rlc1N0ZXAocGFyZW50UGF0aCwgaW5kZXggKyAxLCBpbmRleCArIDEsIEZyYWdtZW50Lm9mKHR5cGUuY3JlYXRlKGF0dHJzKSkpKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG4vKiogV3JhcCB0aGUgc2VsZWN0ZWQgYmxvY2tzIGluIGEgbm9kZSBvZiB0aGUgZ2l2ZW4gdHlwZSAoYmxvY2txdW90ZSwg4oCmKS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHdyYXBJbihuYW1lOiBzdHJpbmcsIGF0dHJzPzogQXR0cnMpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICAgIGNvbnN0IGJsb2NrcyA9IGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKVxyXG4gICAgY29uc3QgZmlyc3QgPSBibG9ja3NbMF1cclxuICAgIGNvbnN0IGxhc3QgPSBibG9ja3NbYmxvY2tzLmxlbmd0aCAtIDFdXHJcbiAgICBpZiAoIWZpcnN0IHx8ICFsYXN0KSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IGZpcnN0LnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBpZiAoIXBhdGhzRXF1YWwocGFyZW50UGF0aCwgbGFzdC5wYXRoLnNsaWNlKDAsIC0xKSkpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBmcm9tID0gZmlyc3QucGF0aFtmaXJzdC5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgY29uc3QgdG8gPSAobGFzdC5wYXRoW2xhc3QucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXIpICsgMVxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgdHIuc3RlcChuZXcgV3JhcE5vZGVzU3RlcChwYXJlbnRQYXRoLCBmcm9tLCB0bywgbmFtZSwgYXR0cnMpKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG4vKiogUmVtb3ZlIHRoZSB3cmFwcGVyIGFyb3VuZCB0aGUgYmxvY2sgYXQgdGhlIHNlbGVjdGlvbiAodW4tYmxvY2txdW90ZSwg4oCmKS4gKi9cclxuZXhwb3J0IGNvbnN0IGxpZnQ6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBjb25zdCBibG9ja1BhdGggPSBzZWxlY3Rpb24uZnJvbS5wYXRoXHJcbiAgaWYgKGJsb2NrUGF0aC5sZW5ndGggPCAyKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHdyYXBwZXJQYXRoID0gYmxvY2tQYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGNvbnN0IHdyYXBwZXIgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgd3JhcHBlclBhdGgpXHJcbiAgaWYgKCF3cmFwcGVyIHx8IHdyYXBwZXIuaXNUZXh0YmxvY2spIHJldHVybiBudWxsXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIHRyLnN0ZXAobmV3IExpZnROb2Rlc1N0ZXAod3JhcHBlclBhdGgsIHdyYXBwZXIuY2hpbGRDb3VudCkpXHJcbiAgcmV0dXJuIHRyXHJcbn1cclxuXHJcbi8qKiBTZWxlY3QgdGhlIHdob2xlIGRvY3VtZW50LiAqL1xyXG5leHBvcnQgY29uc3Qgc2VsZWN0QWxsOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgcmV0dXJuIHN0YXRlLnRyLnNldFNlbGVjdGlvbihuZXcgQWxsU2VsZWN0aW9uKHN0YXRlLmRvYykpXHJcbn1cclxuXHJcbi8qKiBTdG9yZWQtbWFyayBhd2FyZSBhY3RpdmUtbWFyayB0ZXN0LCBzaGFyZWQgYnkgdG9vbGJhcnMgYW5kIHRvZ2dsZU1hcmsuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpc01hcmtBY3RpdmUoc3RhdGU6IEVkaXRvclN0YXRlLCBuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm1hcmtzW25hbWVdXHJcbiAgaWYgKCF0eXBlKSByZXR1cm4gZmFsc2VcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoc2VsZWN0aW9uLmVtcHR5ICYmIHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5oZWFkLnBhdGgpXHJcbiAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIGZhbHNlXHJcbiAgICBjb25zdCBjdXJyZW50ID0gc3RhdGUuc3RvcmVkTWFya3MgPz8gbWFya3NBdElubGluZU9mZnNldChibG9jay5jb250ZW50LCBzZWxlY3Rpb24uaGVhZC5vZmZzZXQpXHJcbiAgICByZXR1cm4gY3VycmVudC5zb21lKChtYXJrOiBNYXJrKSA9PiBtYXJrLnR5cGUgPT09IHR5cGUpXHJcbiAgfVxyXG4gIGNvbnN0IGJsb2NrcyA9IGJsb2Nrc0luUmFuZ2Uoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKS5maWx0ZXIoXHJcbiAgICAoYmxvY2spID0+IGJsb2NrLmZyb20gPCBibG9jay50byxcclxuICApXHJcbiAgcmV0dXJuIChcclxuICAgIGJsb2Nrcy5sZW5ndGggPiAwICYmXHJcbiAgICBibG9ja3MuZXZlcnkoKGJsb2NrKSA9PiByYW5nZUhhc01hcmsoYmxvY2subm9kZS5jb250ZW50LCBibG9jay5mcm9tLCBibG9jay50bywgdHlwZSkpXHJcbiAgKVxyXG59XHJcbiIsICJpbXBvcnQgeyBhdHRyc0VxIH0gZnJvbSAnLi4vbW9kZWwvYXR0cnMnXHJcbmltcG9ydCB7IGJsb2Nrc0luUmFuZ2UgfSBmcm9tICcuLi9tb2RlbC9ibG9ja3MnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHsgdHlwZSBQb3NpdGlvbiwgcG9zIH0gZnJvbSAnLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IHR5cGUgUGF0aCwgbm9kZUF0UGF0aCwgcGF0aHNFcXVhbCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IGxpc3RTdHlsZXNGb3IgfSBmcm9tICcuLi9zY2hlbWEvYmFzaWMnXHJcbmltcG9ydCB7IFRleHRTZWxlY3Rpb24gfSBmcm9tICcuLi9zdGF0ZS9zZWxlY3Rpb24nXHJcbmltcG9ydCB7IFNldE5vZGVBdHRyc1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9hdHRycy1zdGVwJ1xyXG5pbXBvcnQgeyBSZXBsYWNlTm9kZXNTdGVwLCByZXBsYWNlTm9kZUF0IH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1ub2RlcydcclxuaW1wb3J0IHsgU3BsaXROb2RlU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3NwbGl0LWpvaW4nXHJcbmltcG9ydCB0eXBlIHsgQ29tbWFuZCB9IGZyb20gJy4vY29tbWFuZHMnXHJcbmltcG9ydCB7IGRlbGV0ZVJhbmdlIH0gZnJvbSAnLi9oZWxwZXJzJ1xyXG5cclxuLyoqXHJcbiAqIFRoZSBpdGVtIHR5cGVzIGEgbGlzdCBjYW4gaG9sZC4gVGFzayBsaXN0cyBhcmUgb3JkaW5hcnkgbGlzdHMgd2l0aCBhXHJcbiAqIGRpZmZlcmVudCBpdGVtIHR5cGUsIHNvIGV2ZXJ5IGxpc3QgY29tbWFuZCB3b3JrcyBvbiBib3RoIGJ5IGxvb2tpbmcgdGhlXHJcbiAqIGl0ZW0gdHlwZSB1cCBoZXJlIHJhdGhlciB0aGFuIGhhcmQtY29kaW5nIGBsaXN0SXRlbWAuXHJcbiAqL1xyXG5jb25zdCBJVEVNX1RZUEVTOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiA9IHtcclxuICBidWxsZXRMaXN0OiAnbGlzdEl0ZW0nLFxyXG4gIG9yZGVyZWRMaXN0OiAnbGlzdEl0ZW0nLFxyXG4gIHRhc2tMaXN0OiAndGFza0l0ZW0nLFxyXG59XHJcblxyXG5jb25zdCBJVEVNX1RZUEVfTkFNRVM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KE9iamVjdC52YWx1ZXMoSVRFTV9UWVBFUykpXHJcblxyXG4vKipcclxuICogV2hldGhlciBhIG5vZGUgdHlwZSBuYW1lcyBhIGxpc3QgaXRlbTogYGxpc3RJdGVtYCBvciBgdGFza0l0ZW1gLiBBbnl0aGluZ1xyXG4gKiBkZWNpZGluZyBcImFtIEkgaW5zaWRlIGEgbGlzdD9cIiBtdXN0IGFzayB0aGlzIHJhdGhlciB0aGFuIGNvbXBhcmUgYWdhaW5zdFxyXG4gKiBgbGlzdEl0ZW1gLCBvciB0YXNrIGxpc3RzIHF1aWV0bHkgdGFrZSB0aGUgd3JvbmcgYnJhbmNoLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGlzTGlzdEl0ZW1UeXBlTmFtZSh0eXBlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIHR5cGVOYW1lICE9PSB1bmRlZmluZWQgJiYgSVRFTV9UWVBFX05BTUVTLmhhcyh0eXBlTmFtZSlcclxufVxyXG5cclxuLyoqIEl0ZW0gdHlwZSBhIGxpc3QgdHlwZSBob2xkczsgYGxpc3RJdGVtYCBmb3IgYW55dGhpbmcgdW5yZWdpc3RlcmVkLiAqL1xyXG5mdW5jdGlvbiBpdGVtVHlwZU5hbWVGb3IobGlzdFR5cGVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIHJldHVybiBJVEVNX1RZUEVTW2xpc3RUeXBlTmFtZV0gPz8gJ2xpc3RJdGVtJ1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGlzdENvbnRleHQge1xyXG4gIHJlYWRvbmx5IGxpc3RQYXRoOiBQYXRoXHJcbiAgcmVhZG9ubHkgbGlzdDogRWRpdG9yTm9kZVxyXG4gIHJlYWRvbmx5IGl0ZW1QYXRoOiBQYXRoXHJcbiAgcmVhZG9ubHkgaXRlbTogRWRpdG9yTm9kZVxyXG4gIHJlYWRvbmx5IGl0ZW1JbmRleDogbnVtYmVyXHJcbn1cclxuXHJcbi8qKiBSZXNvbHZlIHRoZSBsaXN0IGl0ZW0gYW5kIGxpc3QgY29udGFpbmluZyB0aGUgdGV4dGJsb2NrIGF0IGBibG9ja1BhdGhgLiAqL1xyXG5mdW5jdGlvbiBsaXN0Q29udGV4dEF0KGRvYzogRWRpdG9yTm9kZSwgYmxvY2tQYXRoOiBQYXRoKTogTGlzdENvbnRleHQgfCBudWxsIHtcclxuICBpZiAoYmxvY2tQYXRoLmxlbmd0aCA8IDMpIHJldHVybiBudWxsXHJcbiAgY29uc3QgaXRlbVBhdGggPSBibG9ja1BhdGguc2xpY2UoMCwgLTEpXHJcbiAgY29uc3QgaXRlbSA9IG5vZGVBdFBhdGgoZG9jLCBpdGVtUGF0aClcclxuICBpZiAoIWl0ZW0gfHwgIUlURU1fVFlQRV9OQU1FUy5oYXMoaXRlbS50eXBlLm5hbWUpKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGxpc3RQYXRoID0gaXRlbVBhdGguc2xpY2UoMCwgLTEpXHJcbiAgY29uc3QgbGlzdCA9IG5vZGVBdFBhdGgoZG9jLCBsaXN0UGF0aClcclxuICBpZiAoIWxpc3QpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIHsgbGlzdFBhdGgsIGxpc3QsIGl0ZW1QYXRoLCBpdGVtLCBpdGVtSW5kZXg6IGl0ZW1QYXRoW2l0ZW1QYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlciB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUb2dnbGUgdGhlIGJsb2NrcyBpbiB0aGUgc2VsZWN0aW9uIGludG8vb3V0IG9mIGEgbGlzdCBvZiB0aGUgZ2l2ZW4gdHlwZS5cclxuICogSW5zaWRlIGEgc2FtZS10eXBlIGxpc3Q6IHVud3JhcC4gSW5zaWRlIGFub3RoZXIgbGlzdCB0eXBlOiByZXR5cGUgdGhlIGxpc3QuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlTGlzdChsaXN0VHlwZU5hbWU6IHN0cmluZyk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubm9kZVR5cGUobGlzdFR5cGVOYW1lKVxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBjb25zdCBibG9ja3MgPSBibG9ja3NJblJhbmdlKHN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICAgIGNvbnN0IGZpcnN0ID0gYmxvY2tzWzBdXHJcbiAgICBjb25zdCBsYXN0ID0gYmxvY2tzW2Jsb2Nrcy5sZW5ndGggLSAxXVxyXG4gICAgaWYgKCFmaXJzdCB8fCAhbGFzdCkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGNvbnN0IGNvbnRleHQgPSBsaXN0Q29udGV4dEF0KHN0YXRlLmRvYywgZmlyc3QucGF0aClcclxuXHJcbiAgICBpZiAoY29udGV4dCkge1xyXG4gICAgICBpZiAoY29udGV4dC5saXN0LnR5cGUgPT09IHR5cGUpIHtcclxuICAgICAgICAvLyBVbndyYXA6IHJlcGxhY2UgdGhlIHdob2xlIGxpc3Qgd2l0aCBpdHMgaXRlbXMnIGJsb2Nrcy5cclxuICAgICAgICBjb25zdCBmbGF0ID0gY29udGV4dC5saXN0LmNvbnRlbnQuY2hpbGRyZW4uZmxhdE1hcCgoaXRlbSkgPT4gaXRlbS5jb250ZW50LmNoaWxkcmVuKVxyXG4gICAgICAgIHRyLnN0ZXAocmVwbGFjZU5vZGVBdChjb250ZXh0Lmxpc3RQYXRoLCBGcmFnbWVudC5mcm9tKGZsYXQpKSlcclxuICAgICAgICB0ci5zZXRTZWxlY3Rpb24obWFwT3V0T2ZMaXN0KHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8sIGNvbnRleHQpKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFJldHlwZSBpbiBwbGFjZS4gQSBidWxsZXQg4oaUIHRhc2sgc3dpdGNoIGFsc28gY2hhbmdlcyB0aGUgaXRlbSB0eXBlLFxyXG4gICAgICAgIC8vIHNvIHJlYnVpbGQgdGhlIGl0ZW1zIHJhdGhlciB0aGFuIHJldXNpbmcgdGhlIG9sZCBmcmFnbWVudDsgdGhlXHJcbiAgICAgICAgLy8gYmxvY2sgY29udGVudCBpbnNpZGUgZWFjaCBpdGVtIGlzIHNoYXJlZCB1bnRvdWNoZWQuXHJcbiAgICAgICAgY29uc3QgaXRlbVR5cGUgPSBzdGF0ZS5zY2hlbWEubm9kZVR5cGUoaXRlbVR5cGVOYW1lRm9yKGxpc3RUeXBlTmFtZSkpXHJcbiAgICAgICAgY29uc3QgaXRlbXMgPSBjb250ZXh0Lmxpc3QuY29udGVudC5jaGlsZHJlbi5tYXAoKGl0ZW0pID0+XHJcbiAgICAgICAgICBpdGVtLnR5cGUgPT09IGl0ZW1UeXBlID8gaXRlbSA6IGl0ZW1UeXBlLmNyZWF0ZSh1bmRlZmluZWQsIGl0ZW0uY29udGVudCksXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHRyLnN0ZXAoXHJcbiAgICAgICAgICByZXBsYWNlTm9kZUF0KFxyXG4gICAgICAgICAgICBjb250ZXh0Lmxpc3RQYXRoLFxyXG4gICAgICAgICAgICBGcmFnbWVudC5vZih0eXBlLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50LmZyb20oaXRlbXMpKSksXHJcbiAgICAgICAgICApLFxyXG4gICAgICAgIClcclxuICAgICAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24oc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bykpXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRyXHJcbiAgICB9XHJcblxyXG4gICAgLy8gV3JhcDogdGhlIHNlbGVjdGVkIHNpYmxpbmcgYmxvY2tzIGVhY2ggYmVjb21lIGEgbGlzdCBpdGVtLlxyXG4gICAgY29uc3QgcGFyZW50UGF0aCA9IGZpcnN0LnBhdGguc2xpY2UoMCwgLTEpXHJcbiAgICBpZiAoIXBhdGhzRXF1YWwocGFyZW50UGF0aCwgbGFzdC5wYXRoLnNsaWNlKDAsIC0xKSkpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBwYXJlbnQgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcGFyZW50UGF0aClcclxuICAgIGlmICghcGFyZW50KSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgZnJvbUluZGV4ID0gZmlyc3QucGF0aFtmaXJzdC5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgY29uc3QgdG9JbmRleCA9IChsYXN0LnBhdGhbbGFzdC5wYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlcikgKyAxXHJcbiAgICBjb25zdCBpdGVtVHlwZSA9IHN0YXRlLnNjaGVtYS5ub2RlVHlwZShpdGVtVHlwZU5hbWVGb3IobGlzdFR5cGVOYW1lKSlcclxuICAgIGNvbnN0IGl0ZW1zID0gcGFyZW50LmNvbnRlbnQuY2hpbGRyZW5cclxuICAgICAgLnNsaWNlKGZyb21JbmRleCwgdG9JbmRleClcclxuICAgICAgLm1hcCgoYmxvY2spID0+IGl0ZW1UeXBlLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50Lm9mKGJsb2NrKSkpXHJcbiAgICB0ci5zdGVwKFxyXG4gICAgICBuZXcgUmVwbGFjZU5vZGVzU3RlcChcclxuICAgICAgICBwYXJlbnRQYXRoLFxyXG4gICAgICAgIGZyb21JbmRleCxcclxuICAgICAgICB0b0luZGV4LFxyXG4gICAgICAgIEZyYWdtZW50Lm9mKHR5cGUuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQuZnJvbShpdGVtcykpKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICAgIGNvbnN0IGludG9MaXN0ID0gKHBvc2l0aW9uOiBQb3NpdGlvbik6IFBvc2l0aW9uID0+IHtcclxuICAgICAgY29uc3QgaW5kZXggPSBwb3NpdGlvbi5wYXRoW3Bvc2l0aW9uLnBhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICAgIGlmIChcclxuICAgICAgICAhcGF0aHNFcXVhbChwb3NpdGlvbi5wYXRoLnNsaWNlKDAsIC0xKSwgcGFyZW50UGF0aCkgfHxcclxuICAgICAgICBpbmRleCA8IGZyb21JbmRleCB8fFxyXG4gICAgICAgIGluZGV4ID49IHRvSW5kZXhcclxuICAgICAgKSB7XHJcbiAgICAgICAgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHBvcyhbLi4ucGFyZW50UGF0aCwgZnJvbUluZGV4LCBpbmRleCAtIGZyb21JbmRleCwgMF0sIHBvc2l0aW9uLm9mZnNldClcclxuICAgIH1cclxuICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihpbnRvTGlzdChzZWxlY3Rpb24uZnJvbSksIGludG9MaXN0KHNlbGVjdGlvbi50bykpKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBtYXBPdXRPZkxpc3QoZnJvbTogUG9zaXRpb24sIHRvOiBQb3NpdGlvbiwgY29udGV4dDogTGlzdENvbnRleHQpOiBUZXh0U2VsZWN0aW9uIHtcclxuICBjb25zdCBtYXAgPSAocG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24gPT4ge1xyXG4gICAgLy8gWy4uLmxpc3RQYXRoLCBpdGVtSW5kZXgsIGJsb2NrSW5kZXhdIOKGkiBbLi4ubGlzdFBhcmVudCwgbGlzdEluZGV4ICsgZmxhdEluZGV4XVxyXG4gICAgaWYgKHBvc2l0aW9uLnBhdGgubGVuZ3RoICE9PSBjb250ZXh0Lmxpc3RQYXRoLmxlbmd0aCArIDIpIHJldHVybiBwb3NpdGlvblxyXG4gICAgaWYgKCFwYXRoc0VxdWFsKHBvc2l0aW9uLnBhdGguc2xpY2UoMCwgY29udGV4dC5saXN0UGF0aC5sZW5ndGgpLCBjb250ZXh0Lmxpc3RQYXRoKSlcclxuICAgICAgcmV0dXJuIHBvc2l0aW9uXHJcbiAgICBjb25zdCBpdGVtSW5kZXggPSBwb3NpdGlvbi5wYXRoW2NvbnRleHQubGlzdFBhdGgubGVuZ3RoXSBhcyBudW1iZXJcclxuICAgIGNvbnN0IGJsb2NrSW5kZXggPSBwb3NpdGlvbi5wYXRoW2NvbnRleHQubGlzdFBhdGgubGVuZ3RoICsgMV0gYXMgbnVtYmVyXHJcbiAgICBsZXQgZmxhdCA9IDBcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbUluZGV4OyBpKyspIGZsYXQgKz0gY29udGV4dC5saXN0LmNvbnRlbnQuY2hpbGQoaSkuY2hpbGRDb3VudFxyXG4gICAgY29uc3QgbGlzdEluZGV4ID0gY29udGV4dC5saXN0UGF0aFtjb250ZXh0Lmxpc3RQYXRoLmxlbmd0aCAtIDFdIGFzIG51bWJlclxyXG4gICAgcmV0dXJuIHBvcyhbLi4uY29udGV4dC5saXN0UGF0aC5zbGljZSgwLCAtMSksIGxpc3RJbmRleCArIGZsYXQgKyBibG9ja0luZGV4XSwgcG9zaXRpb24ub2Zmc2V0KVxyXG4gIH1cclxuICByZXR1cm4gbmV3IFRleHRTZWxlY3Rpb24obWFwKGZyb20pLCBtYXAodG8pKVxyXG59XHJcblxyXG4vKiogRW50ZXIgaW5zaWRlIGEgbGlzdCBpdGVtOiBzcGxpdCBpdDsgb24gYW4gZW1wdHkgaXRlbSwgbGlmdCBvdXQgaW5zdGVhZC4gKi9cclxuZXhwb3J0IGNvbnN0IHNwbGl0TGlzdEl0ZW06IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBjb250ZXh0ID0gbGlzdENvbnRleHRBdChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgaWYgKCFjb250ZXh0KSByZXR1cm4gbnVsbFxyXG5cclxuICBjb25zdCBwb2ludCA9IHNlbGVjdGlvbi5mcm9tXHJcbiAgY29uc3QgYmxvY2tJbmRleCA9IHBvaW50LnBhdGhbcG9pbnQucGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICBjb25zdCBjdXJyZW50QmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcG9pbnQucGF0aClcclxuICBpZiAoIWN1cnJlbnRCbG9jaykgcmV0dXJuIG51bGxcclxuXHJcbiAgLy8gRW50ZXIgb24gYW4gZW1wdHksIHNpbmdsZS1ibG9jayBpdGVtIGV4aXRzIHRoZSBsaXN0LlxyXG4gIGlmIChcclxuICAgIHNlbGVjdGlvbi5lbXB0eSAmJlxyXG4gICAgY29udGV4dC5pdGVtLmNoaWxkQ291bnQgPT09IDEgJiZcclxuICAgIGlubGluZUxlbmd0aChjdXJyZW50QmxvY2suY29udGVudCkgPT09IDBcclxuICApIHtcclxuICAgIHJldHVybiBsaWZ0TGlzdEl0ZW0oc3RhdGUpXHJcbiAgfVxyXG5cclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgaWYgKCFzZWxlY3Rpb24uZW1wdHkpIGRlbGV0ZVJhbmdlKHRyLCBzZWxlY3Rpb24uZnJvbSwgc2VsZWN0aW9uLnRvKVxyXG4gIHRyLnN0ZXAobmV3IFNwbGl0Tm9kZVN0ZXAocG9pbnQucGF0aCwgcG9pbnQub2Zmc2V0KSlcclxuXHJcbiAgLy8gTW92ZSB0aGUgc2Vjb25kIGhhbGYgKGFuZCBhbnkgbGF0ZXIgYmxvY2tzIG9mIHRoaXMgaXRlbSkgaW50byBhIG5ldyBpdGVtLlxyXG4gIGNvbnN0IGl0ZW0gPSBub2RlQXRQYXRoKHRyLmRvYywgY29udGV4dC5pdGVtUGF0aClcclxuICBpZiAoIWl0ZW0pIHJldHVybiBudWxsXHJcbiAgY29uc3QgbW92ZWQgPSBpdGVtLmNvbnRlbnQuc2xpY2UoYmxvY2tJbmRleCArIDEpXHJcbiAgdHIuc3RlcChuZXcgUmVwbGFjZU5vZGVzU3RlcChjb250ZXh0Lml0ZW1QYXRoLCBibG9ja0luZGV4ICsgMSwgaXRlbS5jaGlsZENvdW50LCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgLy8gVGhlIG5ldyBpdGVtIGluaGVyaXRzIHRoZSBvbGQgb25lJ3MgdHlwZSBidXQgbmV2ZXIgaXRzIGBjaGVja2VkYCBzdGF0ZTpcclxuICAvLyBzcGxpdHRpbmcgYSBmaW5pc2hlZCB0YXNrIHlpZWxkcyBhIGZyZXNoLCB1bmZpbmlzaGVkIG9uZS5cclxuICBjb25zdCBpdGVtVHlwZSA9IGNvbnRleHQuaXRlbS50eXBlXHJcbiAgY29uc3QgbmV3QXR0cnMgPSAnY2hlY2tlZCcgaW4gY29udGV4dC5pdGVtLmF0dHJzID8geyBjaGVja2VkOiBmYWxzZSB9IDogdW5kZWZpbmVkXHJcbiAgdHIuc3RlcChcclxuICAgIG5ldyBSZXBsYWNlTm9kZXNTdGVwKFxyXG4gICAgICBjb250ZXh0Lmxpc3RQYXRoLFxyXG4gICAgICBjb250ZXh0Lml0ZW1JbmRleCArIDEsXHJcbiAgICAgIGNvbnRleHQuaXRlbUluZGV4ICsgMSxcclxuICAgICAgRnJhZ21lbnQub2YoaXRlbVR5cGUuY3JlYXRlKG5ld0F0dHJzLCBtb3ZlZCkpLFxyXG4gICAgKSxcclxuICApXHJcbiAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhbLi4uY29udGV4dC5saXN0UGF0aCwgY29udGV4dC5pdGVtSW5kZXggKyAxLCAwXSwgMCkpKVxyXG4gIHJldHVybiB0clxyXG59XHJcblxyXG4vKiogVGFiOiBuZXN0IHRoZSBjdXJyZW50IGl0ZW0gdW5kZXIgaXRzIHByZXZpb3VzIHNpYmxpbmcuICovXHJcbmV4cG9ydCBjb25zdCBzaW5rTGlzdEl0ZW06IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBjb25zdCBjb250ZXh0ID0gbGlzdENvbnRleHRBdChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgaWYgKCFjb250ZXh0IHx8IGNvbnRleHQuaXRlbUluZGV4ID09PSAwKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHByZXZpb3VzID0gY29udGV4dC5saXN0LmNvbnRlbnQuY2hpbGQoY29udGV4dC5pdGVtSW5kZXggLSAxKVxyXG4gIGNvbnN0IGxhc3RDaGlsZCA9IHByZXZpb3VzLmNvbnRlbnQubWF5YmVDaGlsZChwcmV2aW91cy5jaGlsZENvdW50IC0gMSlcclxuICBjb25zdCByZXN0UGF0aCA9IHNlbGVjdGlvbi5mcm9tLnBhdGguc2xpY2UoY29udGV4dC5saXN0UGF0aC5sZW5ndGggKyAxKVxyXG5cclxuICBsZXQgcmVwbGFjZW1lbnQ6IEVkaXRvck5vZGVcclxuICBsZXQgbmV3QmxvY2tQYXRoOiBQYXRoXHJcbiAgaWYgKGxhc3RDaGlsZCAmJiBsYXN0Q2hpbGQudHlwZSA9PT0gY29udGV4dC5saXN0LnR5cGUpIHtcclxuICAgIC8vIFByZXZpb3VzIGl0ZW0gYWxyZWFkeSBlbmRzIGluIGEgc2FtZS10eXBlIG5lc3RlZCBsaXN0OiBhcHBlbmQgdGhlcmUuXHJcbiAgICBjb25zdCBuZXN0ZWQgPSBsYXN0Q2hpbGQud2l0aENvbnRlbnQobGFzdENoaWxkLmNvbnRlbnQuYXBwZW5kKEZyYWdtZW50Lm9mKGNvbnRleHQuaXRlbSkpKVxyXG4gICAgcmVwbGFjZW1lbnQgPSBwcmV2aW91cy53aXRoQ29udGVudChcclxuICAgICAgcHJldmlvdXMuY29udGVudC5yZXBsYWNlQ2hpbGQocHJldmlvdXMuY2hpbGRDb3VudCAtIDEsIG5lc3RlZCksXHJcbiAgICApXHJcbiAgICBuZXdCbG9ja1BhdGggPSBbXHJcbiAgICAgIC4uLmNvbnRleHQubGlzdFBhdGgsXHJcbiAgICAgIGNvbnRleHQuaXRlbUluZGV4IC0gMSxcclxuICAgICAgcHJldmlvdXMuY2hpbGRDb3VudCAtIDEsXHJcbiAgICAgIGxhc3RDaGlsZC5jaGlsZENvdW50LFxyXG4gICAgICAuLi5yZXN0UGF0aCxcclxuICAgIF1cclxuICB9IGVsc2Uge1xyXG4gICAgY29uc3QgbmVzdGVkID0gY29udGV4dC5saXN0LnR5cGUuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQub2YoY29udGV4dC5pdGVtKSlcclxuICAgIHJlcGxhY2VtZW50ID0gcHJldmlvdXMud2l0aENvbnRlbnQocHJldmlvdXMuY29udGVudC5hcHBlbmQoRnJhZ21lbnQub2YobmVzdGVkKSkpXHJcbiAgICBuZXdCbG9ja1BhdGggPSBbLi4uY29udGV4dC5saXN0UGF0aCwgY29udGV4dC5pdGVtSW5kZXggLSAxLCBwcmV2aW91cy5jaGlsZENvdW50LCAwLCAuLi5yZXN0UGF0aF1cclxuICB9XHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIHRyLnN0ZXAoXHJcbiAgICBuZXcgUmVwbGFjZU5vZGVzU3RlcChcclxuICAgICAgY29udGV4dC5saXN0UGF0aCxcclxuICAgICAgY29udGV4dC5pdGVtSW5kZXggLSAxLFxyXG4gICAgICBjb250ZXh0Lml0ZW1JbmRleCArIDEsXHJcbiAgICAgIEZyYWdtZW50Lm9mKHJlcGxhY2VtZW50KSxcclxuICAgICksXHJcbiAgKVxyXG4gIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MobmV3QmxvY2tQYXRoLCBzZWxlY3Rpb24uZnJvbS5vZmZzZXQpKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIFNoaWZ0LVRhYiAvIEVudGVyLW9uLWVtcHR5OiBsaWZ0IHRoZSBjdXJyZW50IGl0ZW0gb3V0IG9mIGl0cyBsaXN0LiAqL1xyXG5leHBvcnQgY29uc3QgbGlmdExpc3RJdGVtOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgY29uc3QgY29udGV4dCA9IGxpc3RDb250ZXh0QXQoc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gIGlmICghY29udGV4dCkgcmV0dXJuIG51bGxcclxuICBjb25zdCBpdGVtcyA9IGNvbnRleHQubGlzdC5jb250ZW50LmNoaWxkcmVuXHJcbiAgY29uc3QgYmVmb3JlID0gaXRlbXMuc2xpY2UoMCwgY29udGV4dC5pdGVtSW5kZXgpXHJcbiAgY29uc3QgYWZ0ZXIgPSBpdGVtcy5zbGljZShjb250ZXh0Lml0ZW1JbmRleCArIDEpXHJcbiAgY29uc3QgYmxvY2tJbmRleCA9IChzZWxlY3Rpb24uZnJvbS5wYXRoW2NvbnRleHQubGlzdFBhdGgubGVuZ3RoICsgMV0gYXMgbnVtYmVyIHwgdW5kZWZpbmVkKSA/PyAwXHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG5cclxuICAvLyBOZXN0ZWQgbGlzdCAodGhpcyBsaXN0IGxpdmVzIGluc2lkZSBhbm90aGVyIGxpc3QgaXRlbSk6IHRoZSBsaWZ0ZWQgaXRlbVxyXG4gIC8vIGJlY29tZXMgYSBzaWJsaW5nIG9mIGl0cyBwYXJlbnQgaXRlbSBpbiB0aGUgb3V0ZXIgbGlzdC5cclxuICBjb25zdCBwYXJlbnRJdGVtUGF0aCA9IGNvbnRleHQubGlzdFBhdGguc2xpY2UoMCwgLTEpXHJcbiAgY29uc3QgcGFyZW50SXRlbSA9IHBhcmVudEl0ZW1QYXRoLmxlbmd0aCA+IDAgPyBub2RlQXRQYXRoKHN0YXRlLmRvYywgcGFyZW50SXRlbVBhdGgpIDogbnVsbFxyXG4gIGlmIChwYXJlbnRJdGVtICYmIGlzTGlzdEl0ZW1UeXBlTmFtZShwYXJlbnRJdGVtLnR5cGUubmFtZSkpIHtcclxuICAgIGNvbnN0IGxpc3RJbmRleEluSXRlbSA9IGNvbnRleHQubGlzdFBhdGhbY29udGV4dC5saXN0UGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGNvbnN0IG91dGVyUGF0aCA9IHBhcmVudEl0ZW1QYXRoLnNsaWNlKDAsIC0xKVxyXG4gICAgY29uc3QgcGFyZW50SW5kZXggPSBwYXJlbnRJdGVtUGF0aFtwYXJlbnRJdGVtUGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICAgIGNvbnN0IGtlcHROZXN0ZWQgPSBiZWZvcmUubGVuZ3RoID4gMCA/IFtjb250ZXh0Lmxpc3Qud2l0aENvbnRlbnQoRnJhZ21lbnQuZnJvbShiZWZvcmUpKV0gOiBbXVxyXG4gICAgY29uc3QgbmV3UGFyZW50ID0gcGFyZW50SXRlbS53aXRoQ29udGVudChcclxuICAgICAgcGFyZW50SXRlbS5jb250ZW50LnJlcGxhY2VSYW5nZShcclxuICAgICAgICBsaXN0SW5kZXhJbkl0ZW0sXHJcbiAgICAgICAgbGlzdEluZGV4SW5JdGVtICsgMSxcclxuICAgICAgICBGcmFnbWVudC5mcm9tKGtlcHROZXN0ZWQpLFxyXG4gICAgICApLFxyXG4gICAgKVxyXG4gICAgY29uc3QgY2FycmllZCA9XHJcbiAgICAgIGFmdGVyLmxlbmd0aCA+IDAgPyBbY29udGV4dC5saXN0LnR5cGUuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQuZnJvbShhZnRlcikpXSA6IFtdXHJcbiAgICBjb25zdCBuZXdJdGVtID0gY29udGV4dC5pdGVtLndpdGhDb250ZW50KGNvbnRleHQuaXRlbS5jb250ZW50LmFwcGVuZChGcmFnbWVudC5mcm9tKGNhcnJpZWQpKSlcclxuICAgIHRyLnN0ZXAoXHJcbiAgICAgIG5ldyBSZXBsYWNlTm9kZXNTdGVwKFxyXG4gICAgICAgIG91dGVyUGF0aCxcclxuICAgICAgICBwYXJlbnRJbmRleCxcclxuICAgICAgICBwYXJlbnRJbmRleCArIDEsXHJcbiAgICAgICAgRnJhZ21lbnQub2YobmV3UGFyZW50LCBuZXdJdGVtKSxcclxuICAgICAgKSxcclxuICAgIClcclxuICAgIHRyLnNldFNlbGVjdGlvbihcclxuICAgICAgbmV3IFRleHRTZWxlY3Rpb24ocG9zKFsuLi5vdXRlclBhdGgsIHBhcmVudEluZGV4ICsgMSwgYmxvY2tJbmRleF0sIHNlbGVjdGlvbi5mcm9tLm9mZnNldCkpLFxyXG4gICAgKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG5cclxuICAvLyBUb3AtbGV2ZWwgbGlzdDogdGhlIGl0ZW0ncyBibG9ja3MgbGFuZCBiZXNpZGUgdGhlIChwb3NzaWJseSBzcGxpdCkgbGlzdC5cclxuICBjb25zdCByZXBsYWNlbWVudDogRWRpdG9yTm9kZVtdID0gW11cclxuICBpZiAoYmVmb3JlLmxlbmd0aCA+IDApIHJlcGxhY2VtZW50LnB1c2goY29udGV4dC5saXN0LndpdGhDb250ZW50KEZyYWdtZW50LmZyb20oYmVmb3JlKSkpXHJcbiAgcmVwbGFjZW1lbnQucHVzaCguLi5jb250ZXh0Lml0ZW0uY29udGVudC5jaGlsZHJlbilcclxuICBpZiAoYWZ0ZXIubGVuZ3RoID4gMCkge1xyXG4gICAgcmVwbGFjZW1lbnQucHVzaChjb250ZXh0Lmxpc3QudHlwZS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5mcm9tKGFmdGVyKSkpXHJcbiAgfVxyXG4gIHRyLnN0ZXAocmVwbGFjZU5vZGVBdChjb250ZXh0Lmxpc3RQYXRoLCBGcmFnbWVudC5mcm9tKHJlcGxhY2VtZW50KSkpXHJcblxyXG4gIGNvbnN0IGxpc3RJbmRleCA9IGNvbnRleHQubGlzdFBhdGhbY29udGV4dC5saXN0UGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICBjb25zdCBuZXdJbmRleCA9IGxpc3RJbmRleCArIChiZWZvcmUubGVuZ3RoID4gMCA/IDEgOiAwKSArIGJsb2NrSW5kZXhcclxuICB0ci5zZXRTZWxlY3Rpb24oXHJcbiAgICBuZXcgVGV4dFNlbGVjdGlvbihwb3MoWy4uLmNvbnRleHQubGlzdFBhdGguc2xpY2UoMCwgLTEpLCBuZXdJbmRleF0sIHNlbGVjdGlvbi5mcm9tLm9mZnNldCkpLFxyXG4gIClcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqIFRvZ2dsZSB0aGUgc2VsZWN0aW9uIGludG8vb3V0IG9mIGEgdGFzayBsaXN0LiAqL1xyXG5leHBvcnQgY29uc3QgdG9nZ2xlVGFza0xpc3Q6IENvbW1hbmQgPSB0b2dnbGVMaXN0KCd0YXNrTGlzdCcpXHJcblxyXG4vKiogRmxpcCB0aGUgYGNoZWNrZWRgIGF0dHJpYnV0ZSBvZiB0aGUgdGFzayBpdGVtIGhvbGRpbmcgdGhlIHNlbGVjdGlvbi4gKi9cclxuZXhwb3J0IGNvbnN0IHRvZ2dsZVRhc2tDaGVja2VkOiBDb21tYW5kID0gKHN0YXRlKSA9PiB7XHJcbiAgY29uc3QgY29udGV4dCA9IGxpc3RDb250ZXh0QXQoc3RhdGUuZG9jLCBzdGF0ZS5zZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gIGlmIChjb250ZXh0Py5pdGVtLnR5cGUubmFtZSAhPT0gJ3Rhc2tJdGVtJykgcmV0dXJuIG51bGxcclxuICByZXR1cm4gc3RhdGUudHIuc3RlcChcclxuICAgIG5ldyBTZXROb2RlQXR0cnNTdGVwKGNvbnRleHQuaXRlbVBhdGgsIHtcclxuICAgICAgLi4uY29udGV4dC5pdGVtLmF0dHJzLFxyXG4gICAgICBjaGVja2VkOiBjb250ZXh0Lml0ZW0uYXR0cnMuY2hlY2tlZCAhPT0gdHJ1ZSxcclxuICAgIH0pLFxyXG4gIClcclxufVxyXG5cclxuLyoqIFNldCBhbiBleHBsaWNpdCBgY2hlY2tlZGAgc3RhdGUgb24gdGhlIHRhc2sgaXRlbSBhdCBgaXRlbVBhdGhgLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0VGFza0NoZWNrZWQoaXRlbVBhdGg6IFBhdGgsIGNoZWNrZWQ6IGJvb2xlYW4pOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBpdGVtID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIGl0ZW1QYXRoKVxyXG4gICAgaWYgKGl0ZW0/LnR5cGUubmFtZSAhPT0gJ3Rhc2tJdGVtJyB8fCBpdGVtLmF0dHJzLmNoZWNrZWQgPT09IGNoZWNrZWQpIHJldHVybiBudWxsXHJcbiAgICByZXR1cm4gc3RhdGUudHIuc3RlcChuZXcgU2V0Tm9kZUF0dHJzU3RlcChpdGVtUGF0aCwgeyAuLi5pdGVtLmF0dHJzLCBjaGVja2VkIH0pKVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFNldCB0aGUgbWFya2VyIHN0eWxlIG9mIHRoZSBsaXN0IHdyYXBwaW5nIHRoZSBzZWxlY3Rpb24uIERlY2xpbmVzIG91dHNpZGUgYVxyXG4gKiBsaXN0LCBhbmQgZm9yIGEgdmFsdWUgdGhpcyBsaXN0IHR5cGUgZG9lcyBub3QgYWNjZXB0LiBUaGUgYXR0cmlidXRlIGlzXHJcbiAqIHNlcmlhbGl6ZWQgaW50byBhIGBzdHlsZWAgYXR0cmlidXRlLCBzbyB0aGUgYWxsb3dsaXN0IGlzIGxvYWQtYmVhcmluZy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRMaXN0U3R5bGUoc3R5bGU6IHN0cmluZyB8IG51bGwpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCBjb250ZXh0ID0gbGlzdENvbnRleHRBdChzdGF0ZS5kb2MsIHN0YXRlLnNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgICBpZiAoIWNvbnRleHQpIHJldHVybiBudWxsXHJcbiAgICBpZiAoc3R5bGUgIT09IG51bGwgJiYgIWxpc3RTdHlsZXNGb3IoY29udGV4dC5saXN0LnR5cGUubmFtZSkuaGFzKHN0eWxlKSkgcmV0dXJuIG51bGxcclxuICAgIGlmICghKCdsaXN0U3R5bGUnIGluIGNvbnRleHQubGlzdC5hdHRycykpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBhdHRycyA9IHsgLi4uY29udGV4dC5saXN0LmF0dHJzLCBsaXN0U3R5bGU6IHN0eWxlIH1cclxuICAgIGlmIChhdHRyc0VxKGNvbnRleHQubGlzdC5hdHRycywgYXR0cnMpKSByZXR1cm4gbnVsbFxyXG4gICAgcmV0dXJuIHN0YXRlLnRyLnN0ZXAobmV3IFNldE5vZGVBdHRyc1N0ZXAoY29udGV4dC5saXN0UGF0aCwgYXR0cnMpKVxyXG4gIH1cclxufVxyXG5cclxuLyoqIE51bWJlciB0aGUgb3JkZXJlZCBsaXN0IGF0IHRoZSBzZWxlY3Rpb24gZnJvbSAxIGFnYWluLiAqL1xyXG5leHBvcnQgY29uc3QgcmVzdGFydE51bWJlcmluZzogQ29tbWFuZCA9IGNvbnRpbnVlTnVtYmVyaW5nKDEpXHJcblxyXG4vKipcclxuICogTnVtYmVyIHRoZSBvcmRlcmVkIGxpc3QgYXQgdGhlIHNlbGVjdGlvbiBvbiBmcm9tIHdoZXJlIHRoZSBuZWFyZXN0IG9yZGVyZWRcclxuICogbGlzdCBhYm92ZSBpdCAoaW4gdGhlIHNhbWUgcGFyZW50KSBsZWZ0IG9mZiwgV29yZCdzIFwiQ29udGludWUgbnVtYmVyaW5nXCIuXHJcbiAqIERlY2xpbmVzIHdoZW4gbm8gZWFybGllciBvcmRlcmVkIGxpc3QgZXhpc3RzIHRvIGNvbnRpbnVlIGZyb20uXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgY29udGludWVOdW1iZXJpbmdGcm9tUHJldmlvdXM6IENvbW1hbmQgPSAoc3RhdGUpID0+IHtcclxuICBjb25zdCBjb250ZXh0ID0gbGlzdENvbnRleHRBdChzdGF0ZS5kb2MsIHN0YXRlLnNlbGVjdGlvbi5mcm9tLnBhdGgpXHJcbiAgaWYgKGNvbnRleHQ/Lmxpc3QudHlwZS5uYW1lICE9PSAnb3JkZXJlZExpc3QnKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHBhcmVudCA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBjb250ZXh0Lmxpc3RQYXRoLnNsaWNlKDAsIC0xKSlcclxuICBpZiAoIXBhcmVudCkgcmV0dXJuIG51bGxcclxuICBjb25zdCBpbmRleCA9IGNvbnRleHQubGlzdFBhdGhbY29udGV4dC5saXN0UGF0aC5sZW5ndGggLSAxXSBhcyBudW1iZXJcclxuICBmb3IgKGxldCBpID0gaW5kZXggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgY29uc3Qgc2libGluZyA9IHBhcmVudC5jaGlsZChpKVxyXG4gICAgaWYgKHNpYmxpbmcudHlwZS5uYW1lICE9PSAnb3JkZXJlZExpc3QnKSBjb250aW51ZVxyXG4gICAgY29uc3Qgc3RhcnQgPSB0eXBlb2Ygc2libGluZy5hdHRycy5zdGFydCA9PT0gJ251bWJlcicgPyBzaWJsaW5nLmF0dHJzLnN0YXJ0IDogMVxyXG4gICAgcmV0dXJuIGNvbnRpbnVlTnVtYmVyaW5nKHN0YXJ0ICsgc2libGluZy5jaGlsZENvdW50KShzdGF0ZSlcclxuICB9XHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuLyoqIE51bWJlciB0aGUgb3JkZXJlZCBsaXN0IGF0IHRoZSBzZWxlY3Rpb24gZnJvbSBgc3RhcnRgLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY29udGludWVOdW1iZXJpbmcoc3RhcnQ6IG51bWJlcik6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IGNvbnRleHQgPSBsaXN0Q29udGV4dEF0KHN0YXRlLmRvYywgc3RhdGUuc2VsZWN0aW9uLmZyb20ucGF0aClcclxuICAgIGlmIChjb250ZXh0Py5saXN0LnR5cGUubmFtZSAhPT0gJ29yZGVyZWRMaXN0JykgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHZhbHVlID0gTWF0aC5yb3VuZChzdGFydClcclxuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHZhbHVlKSB8fCBjb250ZXh0Lmxpc3QuYXR0cnMuc3RhcnQgPT09IHZhbHVlKSByZXR1cm4gbnVsbFxyXG4gICAgcmV0dXJuIHN0YXRlLnRyLnN0ZXAoXHJcbiAgICAgIG5ldyBTZXROb2RlQXR0cnNTdGVwKGNvbnRleHQubGlzdFBhdGgsIHsgLi4uY29udGV4dC5saXN0LmF0dHJzLCBzdGFydDogdmFsdWUgfSksXHJcbiAgICApXHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEF0dHJzIH0gZnJvbSAnLi4vbW9kZWwvYXR0cnMnXHJcbmltcG9ydCB7IGJsb2Nrc0luUmFuZ2UgfSBmcm9tICcuLi9tb2RlbC9ibG9ja3MnXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IGlubGluZUxlbmd0aCwgbWFya3NBdElubGluZU9mZnNldCwgcmFuZ2VzV2l0aE1hcmsgfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgTWFyayB9IGZyb20gJy4uL21vZGVsL21hcmsnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IHBvcyB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgdHlwZSB7IFNjaGVtYSB9IGZyb20gJy4uL21vZGVsL3NjaGVtYSdcclxuaW1wb3J0IHsgbm9kZUF0UGF0aCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IHNhZmVIcmVmIH0gZnJvbSAnLi4vc2NoZW1hL2Jhc2ljJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvclN0YXRlIH0gZnJvbSAnLi4vc3RhdGUvZWRpdG9yLXN0YXRlJ1xyXG5pbXBvcnQgeyBUZXh0U2VsZWN0aW9uIH0gZnJvbSAnLi4vc3RhdGUvc2VsZWN0aW9uJ1xyXG5pbXBvcnQgeyBBZGRNYXJrU3RlcCwgUmVtb3ZlTWFya1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9tYXJrLXN0ZXBzJ1xyXG5pbXBvcnQgeyBSZXBsYWNlSW5saW5lU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IFRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vc3RhdGUvdHJhbnNhY3Rpb24nXHJcbmltcG9ydCB0eXBlIHsgQ29tbWFuZCB9IGZyb20gJy4vY29tbWFuZHMnXHJcbmltcG9ydCB7IHNldE1hcmssIHVuc2V0TWFyayB9IGZyb20gJy4vY29tbWFuZHMnXHJcblxyXG4vKipcclxuICogQSBkZWxpYmVyYXRlbHkgY29uc2VydmF0aXZlIGVtYWlsIHBhdHRlcm46IG9uZSBgQGAsIGEgbm9uLWVtcHR5IGxvY2FsIHBhcnRcclxuICogd2l0aCBubyBzcGFjZXMgb3IgYW5nbGUgYnJhY2tldHMsIGFuZCBhIGRvdHRlZCBkb21haW4gd2hvc2UgVExEIGlzXHJcbiAqIGFscGhhYmV0aWMuIEl0IHJlamVjdHMgZmFyIG1vcmUgdGhhbiBSRkMgNTMyMiBhbGxvd3MsIHdoaWNoIGlzIHRoZSByaWdodFxyXG4gKiB0cmFkZSBmb3IgYSBVSSBhZmZvcmRhbmNlLiBBIGZhbHNlIGFjY2VwdCBwcm9kdWNlcyBhIGRlYWQgYG1haWx0bzpgIGxpbmsuXHJcbiAqL1xyXG5jb25zdCBFTUFJTCA9XHJcbiAgL15bXlxcc0A8PigpW1xcXSw7OlwiXFxcXF0rQFthLXowLTldKD86W2EtejAtOS1dKlthLXowLTldKT8oPzpcXC5bYS16MC05XSg/OlthLXowLTktXSpbYS16MC05XSk/KSpcXC5bYS16XXsyLH0kL2lcclxuXHJcbi8qKiBJcyBgYWRkcmVzc2Agc29tZXRoaW5nIHdlIGFyZSB3aWxsaW5nIHRvIHR1cm4gaW50byBhIGBtYWlsdG86YCBsaW5rPyAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaXNFbWFpbEFkZHJlc3MoYWRkcmVzczogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgY29uc3QgdHJpbW1lZCA9IGFkZHJlc3MudHJpbSgpXHJcbiAgaWYgKHRyaW1tZWQubGVuZ3RoID09PSAwIHx8IHRyaW1tZWQubGVuZ3RoID4gMjU0KSByZXR1cm4gZmFsc2VcclxuICAvLyBBIGxvY2FsIHBhcnQgbG9uZ2VyIHRoYW4gNjQgb2N0ZXRzIGlzIGludmFsaWQgcGVyIFJGQyA1MzIxLlxyXG4gIGNvbnN0IGxvY2FsID0gdHJpbW1lZC5zcGxpdCgnQCcpWzBdXHJcbiAgaWYgKCFsb2NhbCB8fCBsb2NhbC5sZW5ndGggPiA2NCkgcmV0dXJuIGZhbHNlXHJcbiAgaWYgKHRyaW1tZWQuaW5jbHVkZXMoJy4uJykpIHJldHVybiBmYWxzZVxyXG4gIHJldHVybiBFTUFJTC50ZXN0KHRyaW1tZWQpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXQgKG9yIGNsZWFyKSB0aGUgbGluayB0YXJnZXQgb24gZXZlcnkgbGluayB0b3VjaGVkIGJ5IHRoZSBzZWxlY3Rpb24uXHJcbiAqXHJcbiAqIGAnX2JsYW5rJ2AgYWx3YXlzIGNhcnJpZXMgYHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcImAuIFRoZSBtYXJrJ3MgYHRvSFRNTGBcclxuICogZW1pdHMgdGhlIHR3byB0b2dldGhlciwgc28gdGhlcmUgaXMgbm8gd2F5IHRvIHByb2R1Y2UgYSBgdGFyZ2V0PV9ibGFua2BcclxuICogbGluayB3aXRob3V0IHRoZSByZWwgdGhhdCBwcmV2ZW50cyByZXZlcnNlIHRhYm5hYmJpbmcuIGBudWxsYCBjbGVhcnMgYm90aC5cclxuICpcclxuICogRGVjbGluZXMgd2hlbiB0aGUgc2VsZWN0aW9uIHRvdWNoZXMgbm8gbGluaywgc28gaXQgY2FuIGJlIGNoYWluZWQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2V0TGlua1RhcmdldCh0YXJnZXQ6ICdfYmxhbmsnIHwgbnVsbCk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IG1hcExpbmtNYXJrcyhzdGF0ZSwgKG1hcmspID0+IHJldGFyZ2V0KG1hcmssIHRhcmdldCkpXHJcbn1cclxuXHJcbi8qKiBXaGljaCBhdHRyaWJ1dGVzIG9mIGEgbGluayB0byBjaGFuZ2U7IHRoZSByZXN0IGFyZSBsZWZ0IGFzIHRoZXkgYXJlLiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIExpbmtVcGRhdGUge1xyXG4gIHJlYWRvbmx5IGhyZWY/OiBzdHJpbmdcclxuICByZWFkb25seSB0aXRsZT86IHN0cmluZyB8IG51bGxcclxuICByZWFkb25seSB0YXJnZXQ/OiAnX2JsYW5rJyB8IG51bGxcclxufVxyXG5cclxuLyoqXHJcbiAqIENoYW5nZSBhIGxpbmsncyBhdHRyaWJ1dGVzIHdpdGhvdXQgZGlzdHVyYmluZyBpdHMgdGV4dC5cclxuICpcclxuICogVGhlIGNhc2UgdGhhdCBtYXR0ZXJzIGlzIGEgYmFyZSBjdXJzb3IuIGBzZXRNYXJrKCdsaW5rJywg4oCmKWAgd3JpdGVzIGEgbWFya1xyXG4gKiBvdmVyIHRoZSAqc2VsZWN0aW9uKiwgc28gd2l0aCBub3RoaW5nIHNlbGVjdGVkIGl0IHN0b3JlcyBhIHBlbmRpbmcgbWFyayBhbmRcclxuICogdGhlIGxpbmsgdGhlIGNhcmV0IGlzIGFjdHVhbGx5IHNpdHRpbmcgaW4ga2VlcHMgaXRzIG9sZCBhZGRyZXNzLCB3aGljaFxyXG4gKiBsb29rcywgZnJvbSB0aGUgb3V0c2lkZSwgZXhhY3RseSBsaWtlIGFuIGVkaXQgdGhhdCBzaWxlbnRseSBkaWQgbm90aGluZy5cclxuICogSGVyZSB0aGUgd2hvbGUgbGluayB1bmRlciB0aGUgY2FyZXQgaXMgcmV3cml0dGVuLCB0aGUgd2F5IHJlbW92aW5nIG9uZVxyXG4gKiBhbHJlYWR5IHdvcmtzLlxyXG4gKlxyXG4gKiBEZWNsaW5lcyB3aGVuIHRoZSBzZWxlY3Rpb24gdG91Y2hlcyBubyBsaW5rLCBvciB3aGVuIG5vdGhpbmcgd291bGQgY2hhbmdlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUxpbmsoYXR0cnM6IExpbmtVcGRhdGUpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICAvLyBFdmVyeSBocmVmIHJlYWNoaW5nIHRoZSBkb2N1bWVudCBnb2VzIHRocm91Z2ggdGhlIHNhbml0aXplciwgaW5jbHVkaW5nXHJcbiAgICAvLyBvbmUgdHlwZWQgaW50byBhbiBlZGl0aW5nIGZpZWxkIGJ5IHNvbWVvbmUgd2hvIG1lYW50IG5vIGhhcm0uXHJcbiAgICBjb25zdCBocmVmID0gYXR0cnMuaHJlZiA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogc2FmZUhyZWYoYXR0cnMuaHJlZilcclxuICAgIGlmIChhdHRycy5ocmVmICE9PSB1bmRlZmluZWQgJiYgIWhyZWYpIHJldHVybiBudWxsXHJcbiAgICByZXR1cm4gbWFwTGlua01hcmtzKHN0YXRlLCAobWFyaykgPT4ge1xyXG4gICAgICBjb25zdCBuZXh0OiBBdHRycyA9IHtcclxuICAgICAgICAuLi5tYXJrLmF0dHJzLFxyXG4gICAgICAgIC4uLihocmVmID09PSB1bmRlZmluZWQgPyB7fSA6IHsgaHJlZiB9KSxcclxuICAgICAgICAuLi4oYXR0cnMudGl0bGUgPT09IHVuZGVmaW5lZCA/IHt9IDogeyB0aXRsZTogYXR0cnMudGl0bGUgfSksXHJcbiAgICAgICAgLi4uKGF0dHJzLnRhcmdldCA9PT0gdW5kZWZpbmVkID8ge30gOiB7IHRhcmdldDogYXR0cnMudGFyZ2V0IH0pLFxyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IHVuY2hhbmdlZCA9IE9iamVjdC5rZXlzKG5leHQpLmV2ZXJ5KChrZXkpID0+IG5leHRba2V5XSA9PT0gbWFyay5hdHRyc1trZXldKVxyXG4gICAgICByZXR1cm4gdW5jaGFuZ2VkID8gbnVsbCA6IG1hcmsudHlwZS5jcmVhdGUobmV4dClcclxuICAgIH0pXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUmV3cml0ZSBldmVyeSBsaW5rIG1hcmsgdGhlIHNlbGVjdGlvbiB0b3VjaGVzLCBvciwgYXQgYSBiYXJlIGN1cnNvciwgZXZlcnlcclxuICogcnVuIG9mIHRoZSBvbmUgbGluayB0aGUgY2FyZXQgaXMgaW5zaWRlLCB3aGljaCBpcyB0aGUgb25seSB3YXkgYSB1c2VyIHdpdGhcclxuICogbm8gc2VsZWN0aW9uIGNhbiBzYXkgXCJ0aGlzIGxpbmtcIi5cclxuICpcclxuICogYHRyYW5zZm9ybWAgcmV0dXJucyB0aGUgcmVwbGFjZW1lbnQgbWFyaywgb3IgbnVsbCB0byBsZWF2ZSBhIHJ1biBhbG9uZS5cclxuICovXHJcbmZ1bmN0aW9uIG1hcExpbmtNYXJrcyhcclxuICBzdGF0ZTogRWRpdG9yU3RhdGUsXHJcbiAgdHJhbnNmb3JtOiAobWFyazogTWFyaykgPT4gTWFyayB8IG51bGwsXHJcbik6IFRyYW5zYWN0aW9uIHwgbnVsbCB7XHJcbiAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrVHlwZSgnbGluaycpXHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcblxyXG4gIGlmIChzZWxlY3Rpb24uZW1wdHkgJiYgc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikge1xyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgc2VsZWN0aW9uLmhlYWQucGF0aClcclxuICAgIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYWN0aXZlID0gbWFya3NBdElubGluZU9mZnNldChibG9jay5jb250ZW50LCBzZWxlY3Rpb24uaGVhZC5vZmZzZXQpLmZpbmQoXHJcbiAgICAgIChtYXJrKSA9PiBtYXJrLnR5cGUgPT09IHR5cGUsXHJcbiAgICApXHJcbiAgICBpZiAoIWFjdGl2ZSkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgIGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzV2l0aE1hcmsoYmxvY2suY29udGVudCwgMCwgaW5saW5lTGVuZ3RoKGJsb2NrLmNvbnRlbnQpLCB0eXBlKSkge1xyXG4gICAgICBpZiAoIXNhbWVMaW5rKHJhbmdlLm1hcmssIGFjdGl2ZSkpIGNvbnRpbnVlXHJcbiAgICAgIGNvbnN0IG5leHQgPSB0cmFuc2Zvcm0ocmFuZ2UubWFyaylcclxuICAgICAgaWYgKCFuZXh0KSBjb250aW51ZVxyXG4gICAgICB0ci5zdGVwKG5ldyBSZW1vdmVNYXJrU3RlcChzZWxlY3Rpb24uaGVhZC5wYXRoLCByYW5nZS5mcm9tLCByYW5nZS50bywgcmFuZ2UubWFyaykpXHJcbiAgICAgIHRyLnN0ZXAobmV3IEFkZE1hcmtTdGVwKHNlbGVjdGlvbi5oZWFkLnBhdGgsIHJhbmdlLmZyb20sIHJhbmdlLnRvLCBuZXh0KSlcclxuICAgIH1cclxuICAgIHJldHVybiB0ci5kb2NDaGFuZ2VkID8gdHIgOiBudWxsXHJcbiAgfVxyXG5cclxuICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgZm9yIChjb25zdCBibG9jayBvZiBibG9ja3NJblJhbmdlKHN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bykpIHtcclxuICAgIGlmIChibG9jay5mcm9tID49IGJsb2NrLnRvKSBjb250aW51ZVxyXG4gICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKSkge1xyXG4gICAgICBjb25zdCBuZXh0ID0gdHJhbnNmb3JtKHJhbmdlLm1hcmspXHJcbiAgICAgIGlmICghbmV4dCkgY29udGludWVcclxuICAgICAgdHIuc3RlcChuZXcgUmVtb3ZlTWFya1N0ZXAoYmxvY2sucGF0aCwgcmFuZ2UuZnJvbSwgcmFuZ2UudG8sIHJhbmdlLm1hcmspKVxyXG4gICAgICB0ci5zdGVwKG5ldyBBZGRNYXJrU3RlcChibG9jay5wYXRoLCByYW5nZS5mcm9tLCByYW5nZS50bywgbmV4dCkpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiB0ci5kb2NDaGFuZ2VkID8gdHIgOiBudWxsXHJcbn1cclxuXHJcbi8qKiBUaGUgc2FtZSBtYXJrIHdpdGggYSBuZXcgdGFyZ2V0LCBvciBudWxsIHdoZW4gaXQgYWxyZWFkeSBoYXMgaXQuICovXHJcbmZ1bmN0aW9uIHJldGFyZ2V0KG1hcms6IE1hcmssIHRhcmdldDogJ19ibGFuaycgfCBudWxsKTogTWFyayB8IG51bGwge1xyXG4gIGNvbnN0IGN1cnJlbnQgPSBtYXJrLmF0dHJzLnRhcmdldCA/PyBudWxsXHJcbiAgaWYgKGN1cnJlbnQgPT09IHRhcmdldCkgcmV0dXJuIG51bGxcclxuICByZXR1cm4gbWFyay50eXBlLmNyZWF0ZSh7IC4uLm1hcmsuYXR0cnMsIHRhcmdldCB9KVxyXG59XHJcblxyXG4vKiogVHdvIGxpbmsgbWFya3MgcG9pbnRpbmcgYXQgdGhlIHNhbWUgZGVzdGluYXRpb24uICovXHJcbmZ1bmN0aW9uIHNhbWVMaW5rKGE6IE1hcmssIGI6IE1hcmspOiBib29sZWFuIHtcclxuICByZXR1cm4gYS5hdHRycy5ocmVmID09PSBiLmF0dHJzLmhyZWYgJiYgYS5hdHRycy50aXRsZSA9PT0gYi5hdHRycy50aXRsZVxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEluc2VydEVtYWlsTGlua09wdGlvbnMge1xyXG4gIC8qKiBMaW5rIHRleHQ7IHRoZSBhZGRyZXNzIGl0c2VsZiBieSBkZWZhdWx0LiAqL1xyXG4gIHJlYWRvbmx5IHRleHQ/OiBzdHJpbmdcclxuICAvKiogT3BlbiBpbiBhIG5ldyB0YWIgKGltcGx5aW5nIGByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJgKS4gKi9cclxuICByZWFkb25seSB0YXJnZXQ/OiAnX2JsYW5rJyB8IG51bGxcclxufVxyXG5cclxuLyoqXHJcbiAqIExpbmsgdGhlIHNlbGVjdGlvbiB0byBhIGBtYWlsdG86YCBhZGRyZXNzLCBvciBpbnNlcnQgdGhlIGFkZHJlc3MgYXMgYSBuZXdcclxuICogbGlua2VkIHNwYW4gd2hlbiB0aGUgc2VsZWN0aW9uIGlzIGVtcHR5LiBEZWNsaW5lcyBvbiBhbiBhZGRyZXNzIHRoYXQgZG9lc1xyXG4gKiBub3QgdmFsaWRhdGUsIHNvIGEgdHlwbyBuZXZlciBiZWNvbWVzIGEgZGVhZCBsaW5rLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGluc2VydEVtYWlsTGluayhhZGRyZXNzOiBzdHJpbmcsIG9wdGlvbnM6IEluc2VydEVtYWlsTGlua09wdGlvbnMgPSB7fSk6IENvbW1hbmQge1xyXG4gIHJldHVybiAoc3RhdGUpID0+IHtcclxuICAgIGNvbnN0IHRyaW1tZWQgPSBhZGRyZXNzLnRyaW0oKVxyXG4gICAgaWYgKCFpc0VtYWlsQWRkcmVzcyh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IGhyZWYgPSBgbWFpbHRvOiR7dHJpbW1lZH1gXHJcbiAgICAvLyBCZWx0IGFuZCBicmFjZXM6IHRoZSBhZGRyZXNzIGlzIGFscmVhZHkgdmFsaWRhdGVkLCBidXQgZXZlcnkgaHJlZiBpblxyXG4gICAgLy8gdGhlIGRvY3VtZW50IGdvZXMgdGhyb3VnaCB0aGUgc2FtZSBzYW5pdGl6ZXIgcmVnYXJkbGVzcy5cclxuICAgIGlmICghc2FmZUhyZWYoaHJlZikpIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBhdHRycyA9IHsgaHJlZiwgdGl0bGU6IG51bGwsIHRhcmdldDogb3B0aW9ucy50YXJnZXQgPz8gbnVsbCB9XHJcblxyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBpZiAoIXNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIHNldE1hcmsoJ2xpbmsnLCBhdHRycykoc3RhdGUpXHJcbiAgICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuIG51bGxcclxuXHJcbiAgICAvLyBFbXB0eSBzZWxlY3Rpb246IGluc2VydCB0aGUgbGFiZWwsIHRoZW4gbGluayBleGFjdGx5IHdoYXQgd2FzIGluc2VydGVkLlxyXG4gICAgY29uc3QgcG9pbnQgPSBzZWxlY3Rpb24uZnJvbVxyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcG9pbnQucGF0aClcclxuICAgIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrVHlwZSgnbGluaycpXHJcbiAgICBpZiAoIWJsb2NrLnR5cGUuYWxsb3dzTWFya1R5cGUodHlwZSkpIHJldHVybiBudWxsXHJcblxyXG4gICAgY29uc3QgbGFiZWwgPSBvcHRpb25zLnRleHQ/LnRyaW0oKSB8fCB0cmltbWVkXHJcbiAgICBjb25zdCBpbmhlcml0ZWQgPSAoXHJcbiAgICAgIHN0YXRlLnN0b3JlZE1hcmtzID8/IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgcG9pbnQub2Zmc2V0KVxyXG4gICAgKS5maWx0ZXIoKGV4aXN0aW5nKSA9PiBleGlzdGluZy50eXBlICE9PSB0eXBlICYmIGJsb2NrLnR5cGUuYWxsb3dzTWFya1R5cGUoZXhpc3RpbmcudHlwZSkpXHJcbiAgICBjb25zdCBtYXJrID0gdHlwZS5jcmVhdGUoYXR0cnMpXHJcblxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgdHIuc3RlcChcclxuICAgICAgbmV3IFJlcGxhY2VJbmxpbmVTdGVwKFxyXG4gICAgICAgIHBvaW50LnBhdGgsXHJcbiAgICAgICAgcG9pbnQub2Zmc2V0LFxyXG4gICAgICAgIHBvaW50Lm9mZnNldCxcclxuICAgICAgICBGcmFnbWVudC5vZihzdGF0ZS5zY2hlbWEudGV4dChsYWJlbCwgbWFyay5hZGRUb1NldChpbmhlcml0ZWQpKSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHBvaW50LnBhdGgsIHBvaW50Lm9mZnNldCArIGxhYmVsLmxlbmd0aCkpKVxyXG4gICAgcmV0dXJuIHRyXHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUmVtb3ZlIHRoZSBsaW5rIG1hcmsgZnJvbSB0aGUgc2VsZWN0aW9uLCBvciBmcm9tIHRoZSB3aG9sZSBsaW5rIHVuZGVyIGFcclxuICogYmFyZSBjdXJzb3IsIHdoaWNoIGlzIHdoYXQgXCJ1bmxpbmtcIiBtZWFucyB3aGVuIG5vdGhpbmcgaXMgc2VsZWN0ZWQuXHJcbiAqIERlY2xpbmVzIHdoZW4gdGhlcmUgaXMgbm8gbGluayB0byByZW1vdmUuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgcmVtb3ZlTGluazogQ29tbWFuZCA9IChzdGF0ZSkgPT4ge1xyXG4gIGNvbnN0IHR5cGUgPSBzdGF0ZS5zY2hlbWEubWFya1R5cGUoJ2xpbmsnKVxyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG5cclxuICBpZiAoc2VsZWN0aW9uLmVtcHR5ICYmIHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5oZWFkLnBhdGgpXHJcbiAgICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAgIGNvbnN0IGFjdGl2ZSA9IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgc2VsZWN0aW9uLmhlYWQub2Zmc2V0KS5maW5kKFxyXG4gICAgICAobWFyaykgPT4gbWFyay50eXBlID09PSB0eXBlLFxyXG4gICAgKVxyXG4gICAgLy8gTm8gbGluayB1bmRlciB0aGUgY2FyZXQ6IGZhbGwgYmFjayB0byBjbGVhcmluZyB0aGUgc3RvcmVkIG1hcmssIHNvIGFcclxuICAgIC8vIHBlbmRpbmcgbGluayB0aGUgdXNlciBoYXMgbm90IHR5cGVkIGludG8geWV0IGNhbiBzdGlsbCBiZSBjYW5jZWxsZWQuXHJcbiAgICBpZiAoIWFjdGl2ZSkgcmV0dXJuIHVuc2V0TWFyaygnbGluaycpKHN0YXRlKVxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgZm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNXaXRoTWFyayhibG9jay5jb250ZW50LCAwLCBpbmxpbmVMZW5ndGgoYmxvY2suY29udGVudCksIHR5cGUpKSB7XHJcbiAgICAgIGlmICghc2FtZUxpbmsocmFuZ2UubWFyaywgYWN0aXZlKSkgY29udGludWVcclxuICAgICAgdHIuc3RlcChuZXcgUmVtb3ZlTWFya1N0ZXAoc2VsZWN0aW9uLmhlYWQucGF0aCwgcmFuZ2UuZnJvbSwgcmFuZ2UudG8sIHJhbmdlLm1hcmspKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRyLmRvY0NoYW5nZWQgPyB0ciA6IG51bGxcclxuICB9XHJcblxyXG4gIHJldHVybiB1bnNldE1hcmsoJ2xpbmsnKShzdGF0ZSlcclxufVxyXG5cclxuY29uc3QgVVJMX0lOX1RFWFQgPSAvKD86aHR0cHM/OlxcL1xcL3x3d3dcXC4pW15cXHM8PlwiJ2BdezIsMjAwMH0vZ2lcclxuXHJcbi8qKiBQdW5jdHVhdGlvbiB0aGF0IGVuZHMgYSBzZW50ZW5jZSByYXRoZXIgdGhhbiBhIFVSTC4gKi9cclxuY29uc3QgVVJMX1RSQUlMSU5HX1BVTkNUVUFUSU9OID0gJy4sOzohP1xcJ1wiYCknXHJcblxyXG4vKipcclxuICogU3BsaXQgcGxhaW4gdGV4dCBpbnRvIHRleHQgbm9kZXMgd2l0aCBldmVyeSBVUkwgd3JhcHBlZCBpbiBhIGxpbmsgbWFyazpcclxuICogd2hhdCBwYXN0aW5nIGEgcGFyYWdyYXBoIHRoYXQgbWVudGlvbnMgYSBmZXcgc2l0ZXMgc2hvdWxkIHByb2R1Y2UuIFJldHVybnNcclxuICogbnVsbCB3aGVuIHRoZSB0ZXh0IGhvbGRzIG5vIFVSTCwgc28gY2FsbGVycyBjYW4gZmFsbCBiYWNrIHRvIGEgcGxhaW4gaW5zZXJ0LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGxpbmtpZnlUZXh0KFxyXG4gIHNjaGVtYTogU2NoZW1hLFxyXG4gIHRleHQ6IHN0cmluZyxcclxuICBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gW10sXHJcbik6IEVkaXRvck5vZGVbXSB8IG51bGwge1xyXG4gIGNvbnN0IHR5cGUgPSBzY2hlbWEubWFya3MubGlua1xyXG4gIGlmICghdHlwZSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBub2RlczogRWRpdG9yTm9kZVtdID0gW11cclxuICBsZXQgbGFzdCA9IDBcclxuICBmb3IgKGNvbnN0IG1hdGNoIG9mIHRleHQubWF0Y2hBbGwoVVJMX0lOX1RFWFQpKSB7XHJcbiAgICBsZXQgdXJsID0gbWF0Y2hbMF1cclxuICAgIHdoaWxlICh1cmwubGVuZ3RoID4gMCAmJiBVUkxfVFJBSUxJTkdfUFVOQ1RVQVRJT04uaW5jbHVkZXModXJsW3VybC5sZW5ndGggLSAxXSBhcyBzdHJpbmcpKSB7XHJcbiAgICAgIHVybCA9IHVybC5zbGljZSgwLCAtMSlcclxuICAgIH1cclxuICAgIGNvbnN0IGhyZWYgPSBzYWZlSHJlZigvXnd3d1xcLi9pLnRlc3QodXJsKSA/IGBodHRwczovLyR7dXJsfWAgOiB1cmwpXHJcbiAgICBpZiAoIWhyZWYgfHwgdXJsLmxlbmd0aCA9PT0gMCkgY29udGludWVcclxuICAgIGNvbnN0IHN0YXJ0ID0gbWF0Y2guaW5kZXggPz8gMFxyXG4gICAgaWYgKHN0YXJ0ID4gbGFzdCkgbm9kZXMucHVzaChzY2hlbWEudGV4dCh0ZXh0LnNsaWNlKGxhc3QsIHN0YXJ0KSwgbWFya3MpKVxyXG4gICAgbm9kZXMucHVzaChzY2hlbWEudGV4dCh1cmwsIHR5cGUuY3JlYXRlKHsgaHJlZiB9KS5hZGRUb1NldChtYXJrcykpKVxyXG4gICAgbGFzdCA9IHN0YXJ0ICsgdXJsLmxlbmd0aFxyXG4gIH1cclxuICBpZiAobm9kZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbFxyXG4gIGlmIChsYXN0IDwgdGV4dC5sZW5ndGgpIG5vZGVzLnB1c2goc2NoZW1hLnRleHQodGV4dC5zbGljZShsYXN0KSwgbWFya3MpKVxyXG4gIHJldHVybiBub2Rlc1xyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvclN0YXRlIH0gZnJvbSAnLi4vc3RhdGUvZWRpdG9yLXN0YXRlJ1xyXG5pbXBvcnQgdHlwZSB7IFNlbGVjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3NlbGVjdGlvbidcclxuaW1wb3J0IHR5cGUgeyBTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcCdcclxuaW1wb3J0IHsgU2V0Tm9kZUF0dHJzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL2F0dHJzLXN0ZXAnXHJcbmltcG9ydCB7IEFkZE1hcmtTdGVwLCBSZW1vdmVNYXJrU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL21hcmstc3RlcHMnXHJcbmltcG9ydCB7IFJlcGxhY2VJbmxpbmVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1pbmxpbmUnXHJcbmltcG9ydCB7IFJlcGxhY2VOb2Rlc1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9yZXBsYWNlLW5vZGVzJ1xyXG5pbXBvcnQgeyBKb2luTm9kZXNTdGVwLCBTcGxpdE5vZGVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvc3BsaXQtam9pbidcclxuaW1wb3J0IHsgTGlmdE5vZGVzU3RlcCwgV3JhcE5vZGVzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3dyYXAtbGlmdCdcclxuaW1wb3J0IHR5cGUgeyBUcmFuc2FjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3RyYW5zYWN0aW9uJ1xyXG5cclxuaW50ZXJmYWNlIEhpc3RvcnlHcm91cCB7XHJcbiAgLyoqIFN0ZXBzIHRoYXQgdW5kbyB0aGUgZ3JvdXAsIGluIGFwcGxpY2F0aW9uIG9yZGVyLiAqL1xyXG4gIHN0ZXBzOiBTdGVwW11cclxuICBzZWxlY3Rpb25CZWZvcmU6IFNlbGVjdGlvblxyXG4gIC8qKiBUaW1lIG9mIHRoZSBsYXN0IHRyYW5zYWN0aW9uIGZvbGRlZCBpbjsgZHJpdmVzIHR5cGluZy1ncm91cCBtZXJnZXMuICovXHJcbiAgdGltZXN0YW1wOiBudW1iZXJcclxuICAvKiogV2hlbiB0aGUgZ3JvdXAgaGFwcGVuZWQsIGZvciBkaXNwbGF5LCBrZXB0IGFjcm9zcyB1bmRvL3JlZG8gbW92ZXMuICovXHJcbiAgYXQ6IG51bWJlclxyXG4gIC8qKiBXaGF0IHRoZSBncm91cCBkaWQsIGZvciBhIGhpc3RvcnkgcGFuZWwuICovXHJcbiAgbGFiZWw6IHN0cmluZ1xyXG4gIC8qKiBIb3cgbWFueSB0cmFuc2FjdGlvbnMgd2VyZSBmb2xkZWQgaW50byB0aGUgZ3JvdXAuICovXHJcbiAgc2l6ZTogbnVtYmVyXHJcbn1cclxuXHJcbi8qKiBPbmUgdW5kbyBvciByZWRvIGdyb3VwLCBhcyBhIGhpc3RvcnkgcGFuZWwgbGlzdHMgaXQuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgSGlzdG9yeUVudHJ5IHtcclxuICAvKiogXCJUeXBpbmdcIiwgXCJUZXh0IGZvcm1hdHRpbmdcIiwg4oCmIG9yIGEgbGFiZWwgc2V0IHRocm91Z2gge0BsaW5rIEhJU1RPUllfTEFCRUx9LiAqL1xyXG4gIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmdcclxuICAvKiogV2hlbiB0aGUgZ3JvdXAgaGFwcGVuZWQgKG1zIHNpbmNlIHRoZSBlcG9jaCwgZnJvbSB0aGUgdHJhbnNhY3Rpb24pLiAqL1xyXG4gIHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyXHJcbiAgLyoqIEhvdyBtYW55IHRyYW5zYWN0aW9ucyB3ZXJlIGZvbGRlZCBpbnRvIHRoZSBncm91cC4gKi9cclxuICByZWFkb25seSBzaXplOiBudW1iZXJcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBIaXN0b3J5T3B0aW9ucyB7XHJcbiAgLyoqIFRyYW5zYWN0aW9ucyBjbG9zZXIgdG9nZXRoZXIgdGhhbiB0aGlzIChtcykgbWVyZ2UgaW50byBvbmUgdW5kbyBncm91cC4gKi9cclxuICByZWFkb25seSBncm91cERlbGF5PzogbnVtYmVyXHJcbiAgLyoqIE1heGltdW0gbnVtYmVyIG9mIHVuZG8gZ3JvdXBzIGtlcHQuICovXHJcbiAgcmVhZG9ubHkgZGVwdGg/OiBudW1iZXJcclxufVxyXG5cclxuLyoqIFRyYW5zYWN0aW9uIG1ldGEga2V5OiBzZXQgdG8gYGZhbHNlYCB0byBrZWVwIGEgdHJhbnNhY3Rpb24gb3V0IG9mIGhpc3RvcnkuICovXHJcbmV4cG9ydCBjb25zdCBBRERfVE9fSElTVE9SWSA9ICdhZGRUb0hpc3RvcnknXHJcbi8qKiBUcmFuc2FjdGlvbiBtZXRhIGtleTogc2V0IHRvIGB0cnVlYCB0byBmb3JjZSBhIG5ldyB1bmRvIGdyb3VwLiAqL1xyXG5leHBvcnQgY29uc3QgTkVXX0hJU1RPUllfR1JPVVAgPSAnbmV3SGlzdG9yeUdyb3VwJ1xyXG4vKipcclxuICogVHJhbnNhY3Rpb24gbWV0YSBrZXk6IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgZm9yIHRoZSB1bmRvIGdyb3VwIChcIkluc2VydFxyXG4gKiB0YWJsZVwiKS4gV2l0aG91dCBpdCB0aGUgbGFiZWwgaXMgaW5mZXJyZWQgZnJvbSB0aGUga2luZHMgb2Ygc3RlcCBhcHBsaWVkLlxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IEhJU1RPUllfTEFCRUwgPSAnaGlzdG9yeUxhYmVsJ1xyXG5cclxuLyoqXHJcbiAqIFVuZG8gbWFuYWdlciBidWlsdCBvbiBzdGVwIGludmVyc2lvbi4gR3JvdXBzIGFkamFjZW50LWluLXRpbWUgdHJhbnNhY3Rpb25zXHJcbiAqIGFuZCByZXN0b3JlcyB0aGUgc2VsZWN0aW9uIGZyb20gYmVmb3JlIGVhY2ggZ3JvdXAuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgSGlzdG9yeSB7XHJcbiAgcHJpdmF0ZSB1bmRvU3RhY2s6IEhpc3RvcnlHcm91cFtdID0gW11cclxuICBwcml2YXRlIHJlZG9TdGFjazogSGlzdG9yeUdyb3VwW10gPSBbXVxyXG4gIHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBEZWxheTogbnVtYmVyXHJcbiAgcHJpdmF0ZSByZWFkb25seSBkZXB0aDogbnVtYmVyXHJcblxyXG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM6IEhpc3RvcnlPcHRpb25zID0ge30pIHtcclxuICAgIHRoaXMuZ3JvdXBEZWxheSA9IG9wdGlvbnMuZ3JvdXBEZWxheSA/PyA1MDBcclxuICAgIHRoaXMuZGVwdGggPSBvcHRpb25zLmRlcHRoID8/IDEwMFxyXG4gIH1cclxuXHJcbiAgZ2V0IGNhblVuZG8oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy51bmRvU3RhY2subGVuZ3RoID4gMFxyXG4gIH1cclxuXHJcbiAgZ2V0IGNhblJlZG8oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5yZWRvU3RhY2subGVuZ3RoID4gMFxyXG4gIH1cclxuXHJcbiAgLyoqIFVuZG8gZ3JvdXBzLCBvbGRlc3QgZmlyc3Q6IHRoZSBsYXN0IGVudHJ5IGlzIHdoYXQge0BsaW5rIHVuZG99IHJldmVydHMgbmV4dC4gKi9cclxuICBnZXQgdW5kb0VudHJpZXMoKTogcmVhZG9ubHkgSGlzdG9yeUVudHJ5W10ge1xyXG4gICAgcmV0dXJuIHRoaXMudW5kb1N0YWNrLm1hcChlbnRyeU9mKVxyXG4gIH1cclxuXHJcbiAgLyoqIFJlZG8gZ3JvdXBzOyB0aGUgbGFzdCBlbnRyeSBpcyB3aGF0IHtAbGluayByZWRvfSByZWFwcGxpZXMgbmV4dC4gKi9cclxuICBnZXQgcmVkb0VudHJpZXMoKTogcmVhZG9ubHkgSGlzdG9yeUVudHJ5W10ge1xyXG4gICAgcmV0dXJuIHRoaXMucmVkb1N0YWNrLm1hcChlbnRyeU9mKVxyXG4gIH1cclxuXHJcbiAgLyoqIFJlY29yZCBhIGRpc3BhdGNoZWQgZG9jdW1lbnQtY2hhbmdpbmcgdHJhbnNhY3Rpb24uICovXHJcbiAgcmVjb3JkKHRyOiBUcmFuc2FjdGlvbiwgc2VsZWN0aW9uQmVmb3JlOiBTZWxlY3Rpb24pOiB2b2lkIHtcclxuICAgIGlmICghdHIuZG9jQ2hhbmdlZCB8fCB0ci5nZXRNZXRhKEFERF9UT19ISVNUT1JZKSA9PT0gZmFsc2UpIHJldHVyblxyXG4gICAgY29uc3QgaW52ZXJ0ZWQgPSBpbnZlcnRTdGVwcyh0ci5zdGVwcywgdHIuZG9jcylcclxuICAgIGNvbnN0IGxhYmVsID0gbGFiZWxGb3IodHIpXHJcbiAgICBjb25zdCBsYXN0ID0gdGhpcy51bmRvU3RhY2tbdGhpcy51bmRvU3RhY2subGVuZ3RoIC0gMV1cclxuICAgIGlmIChcclxuICAgICAgbGFzdCAmJlxyXG4gICAgICB0ci50aW1lIC0gbGFzdC50aW1lc3RhbXAgPCB0aGlzLmdyb3VwRGVsYXkgJiZcclxuICAgICAgdHIuZ2V0TWV0YShORVdfSElTVE9SWV9HUk9VUCkgIT09IHRydWVcclxuICAgICkge1xyXG4gICAgICBsYXN0LnN0ZXBzID0gWy4uLmludmVydGVkLCAuLi5sYXN0LnN0ZXBzXVxyXG4gICAgICBsYXN0LnRpbWVzdGFtcCA9IHRyLnRpbWVcclxuICAgICAgbGFzdC5hdCA9IHRyLnRpbWVcclxuICAgICAgbGFzdC5zaXplICs9IDFcclxuICAgICAgLy8gQSBidXJzdCBtaXhpbmcga2luZHMgb2YgY2hhbmdlIGlzIGJlc3QgZGVzY3JpYmVkIGFzIHBsYWluIGVkaXRpbmcuXHJcbiAgICAgIGlmIChsYXN0LmxhYmVsICE9PSBsYWJlbCkgbGFzdC5sYWJlbCA9ICdFZGl0aW5nJ1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy51bmRvU3RhY2sucHVzaCh7XHJcbiAgICAgICAgc3RlcHM6IGludmVydGVkLFxyXG4gICAgICAgIHNlbGVjdGlvbkJlZm9yZSxcclxuICAgICAgICB0aW1lc3RhbXA6IHRyLnRpbWUsXHJcbiAgICAgICAgYXQ6IHRyLnRpbWUsXHJcbiAgICAgICAgbGFiZWwsXHJcbiAgICAgICAgc2l6ZTogMSxcclxuICAgICAgfSlcclxuICAgICAgaWYgKHRoaXMudW5kb1N0YWNrLmxlbmd0aCA+IHRoaXMuZGVwdGgpIHRoaXMudW5kb1N0YWNrLnNoaWZ0KClcclxuICAgIH1cclxuICAgIHRoaXMucmVkb1N0YWNrID0gW11cclxuICB9XHJcblxyXG4gIHVuZG8oc3RhdGU6IEVkaXRvclN0YXRlKTogVHJhbnNhY3Rpb24gfCBudWxsIHtcclxuICAgIHJldHVybiB0aGlzLm1vdmUoc3RhdGUsIHRoaXMudW5kb1N0YWNrLCB0aGlzLnJlZG9TdGFjaylcclxuICB9XHJcblxyXG4gIHJlZG8oc3RhdGU6IEVkaXRvclN0YXRlKTogVHJhbnNhY3Rpb24gfCBudWxsIHtcclxuICAgIHJldHVybiB0aGlzLm1vdmUoc3RhdGUsIHRoaXMucmVkb1N0YWNrLCB0aGlzLnVuZG9TdGFjaylcclxuICB9XHJcblxyXG4gIGNsZWFyKCk6IHZvaWQge1xyXG4gICAgdGhpcy51bmRvU3RhY2sgPSBbXVxyXG4gICAgdGhpcy5yZWRvU3RhY2sgPSBbXVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBtb3ZlKHN0YXRlOiBFZGl0b3JTdGF0ZSwgZnJvbTogSGlzdG9yeUdyb3VwW10sIHRvOiBIaXN0b3J5R3JvdXBbXSk6IFRyYW5zYWN0aW9uIHwgbnVsbCB7XHJcbiAgICBjb25zdCBncm91cCA9IGZyb20ucG9wKClcclxuICAgIGlmICghZ3JvdXApIHJldHVybiBudWxsXHJcbiAgICAvLyBNb3Zpbmcgb2ZmIGEgZ3JvdXAgY2xvc2VzIHRoZSBvbmUgbm93IG9uIHRvcDogdGhlIG5leHQgZWRpdCBtdXN0IHN0YXJ0XHJcbiAgICAvLyBpdHMgb3duIGdyb3VwLCBvciBhIHNpbmdsZSB1bmRvIHdvdWxkIHJldmVydCBib3RoIHRoYXQgZWRpdCBhbmQgd29ya1xyXG4gICAgLy8gdGhlIHVzZXIgaGFkIGFscmVhZHkgc3RlcHBlZCBiYWNrIG92ZXIuXHJcbiAgICBjb25zdCBleHBvc2VkID0gZnJvbVtmcm9tLmxlbmd0aCAtIDFdXHJcbiAgICBpZiAoZXhwb3NlZCkgZXhwb3NlZC50aW1lc3RhbXAgPSAwXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBmb3IgKGNvbnN0IHN0ZXAgb2YgZ3JvdXAuc3RlcHMpIHRyLnN0ZXAoc3RlcClcclxuICAgIHRyLnNldFNlbGVjdGlvbihncm91cC5zZWxlY3Rpb25CZWZvcmUpXHJcbiAgICB0ci5zZXRNZXRhKEFERF9UT19ISVNUT1JZLCBmYWxzZSlcclxuICAgIHRvLnB1c2goe1xyXG4gICAgICBzdGVwczogaW52ZXJ0U3RlcHModHIuc3RlcHMsIHRyLmRvY3MpLFxyXG4gICAgICBzZWxlY3Rpb25CZWZvcmU6IHN0YXRlLnNlbGVjdGlvbixcclxuICAgICAgdGltZXN0YW1wOiAwLCAvLyBuZXZlciBtZXJnZWQgd2l0aCB0eXBpbmcgZ3JvdXBzXHJcbiAgICAgIGF0OiBncm91cC5hdCxcclxuICAgICAgbGFiZWw6IGdyb3VwLmxhYmVsLFxyXG4gICAgICBzaXplOiBncm91cC5zaXplLFxyXG4gICAgfSlcclxuICAgIHJldHVybiB0clxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZW50cnlPZihncm91cDogSGlzdG9yeUdyb3VwKTogSGlzdG9yeUVudHJ5IHtcclxuICByZXR1cm4geyBsYWJlbDogZ3JvdXAubGFiZWwsIHRpbWVzdGFtcDogZ3JvdXAuYXQsIHNpemU6IGdyb3VwLnNpemUgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBpbnZlcnRTdGVwcyhzdGVwczogcmVhZG9ubHkgU3RlcFtdLCBkb2NzOiByZWFkb25seSBFZGl0b3JOb2RlW10pOiBTdGVwW10ge1xyXG4gIHJldHVybiBzdGVwcy5tYXAoKHN0ZXAsIGkpID0+IHN0ZXAuaW52ZXJ0KGRvY3NbaV0gYXMgRWRpdG9yTm9kZSkpLnJldmVyc2UoKVxyXG59XHJcblxyXG4vKiogRGVzY3JpYmUgYSB0cmFuc2FjdGlvbiBmb3IgdGhlIGhpc3RvcnkgcGFuZWwsIGZyb20gaXRzIG1ldGEgb3IgaXRzIHN0ZXBzLiAqL1xyXG5mdW5jdGlvbiBsYWJlbEZvcih0cjogVHJhbnNhY3Rpb24pOiBzdHJpbmcge1xyXG4gIGNvbnN0IGN1c3RvbSA9IHRyLmdldE1ldGEoSElTVE9SWV9MQUJFTClcclxuICBpZiAodHlwZW9mIGN1c3RvbSA9PT0gJ3N0cmluZycgJiYgY3VzdG9tLmxlbmd0aCA+IDApIHJldHVybiBjdXN0b21cclxuICBjb25zdCBraW5kcyA9IG5ldyBTZXQodHIuc3RlcHMubWFwKGtpbmRPZikpXHJcbiAgaWYgKGtpbmRzLmhhcygnc3RydWN0dXJlJykpIHJldHVybiAnU3RydWN0dXJlIGNoYW5nZSdcclxuICBpZiAoa2luZHMuaGFzKCdzcGxpdCcpKSByZXR1cm4gJ1BhcmFncmFwaCBjaGFuZ2UnXHJcbiAgaWYgKGtpbmRzLmhhcygnd3JhcCcpKSByZXR1cm4gJ0Jsb2NrIGNoYW5nZSdcclxuICBpZiAoa2luZHMuaGFzKCdhdHRycycpKSByZXR1cm4gJ0Jsb2NrIGZvcm1hdHRpbmcnXHJcbiAgaWYgKGtpbmRzLmhhcygnbWFyaycpKSByZXR1cm4gJ1RleHQgZm9ybWF0dGluZydcclxuICBpZiAoa2luZHMuaGFzKCd0ZXh0JykpIHJldHVybiAnVHlwaW5nJ1xyXG4gIHJldHVybiAnRWRpdCdcclxufVxyXG5cclxuZnVuY3Rpb24ga2luZE9mKHN0ZXA6IFN0ZXApOiBzdHJpbmcge1xyXG4gIGlmIChzdGVwIGluc3RhbmNlb2YgUmVwbGFjZUlubGluZVN0ZXApIHJldHVybiAndGV4dCdcclxuICBpZiAoc3RlcCBpbnN0YW5jZW9mIEFkZE1hcmtTdGVwIHx8IHN0ZXAgaW5zdGFuY2VvZiBSZW1vdmVNYXJrU3RlcCkgcmV0dXJuICdtYXJrJ1xyXG4gIGlmIChzdGVwIGluc3RhbmNlb2YgU2V0Tm9kZUF0dHJzU3RlcCkgcmV0dXJuICdhdHRycydcclxuICBpZiAoc3RlcCBpbnN0YW5jZW9mIFNwbGl0Tm9kZVN0ZXAgfHwgc3RlcCBpbnN0YW5jZW9mIEpvaW5Ob2Rlc1N0ZXApIHJldHVybiAnc3BsaXQnXHJcbiAgaWYgKHN0ZXAgaW5zdGFuY2VvZiBXcmFwTm9kZXNTdGVwIHx8IHN0ZXAgaW5zdGFuY2VvZiBMaWZ0Tm9kZXNTdGVwKSByZXR1cm4gJ3dyYXAnXHJcbiAgaWYgKHN0ZXAgaW5zdGFuY2VvZiBSZXBsYWNlTm9kZXNTdGVwKSByZXR1cm4gJ3N0cnVjdHVyZSdcclxuICByZXR1cm4gJ290aGVyJ1xyXG59XHJcbiIsICJpbXBvcnQgeyBpc0xpc3RJdGVtVHlwZU5hbWUgfSBmcm9tICcuLi9jb21tYW5kcy9saXN0cydcclxuaW1wb3J0IHsgTkVXX0hJU1RPUllfR1JPVVAgfSBmcm9tICcuLi9oaXN0b3J5L2hpc3RvcnknXHJcbmltcG9ydCB7IEZyYWdtZW50IH0gZnJvbSAnLi4vbW9kZWwvZnJhZ21lbnQnXHJcbmltcG9ydCB7IG1hcmtzQXRJbmxpbmVPZmZzZXQgfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IHBvcyB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgeyB0eXBlIFBhdGgsIG5vZGVBdFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBzYWZlSHJlZiB9IGZyb20gJy4uL3NjaGVtYS9iYXNpYydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uL3N0YXRlL2VkaXRvci1zdGF0ZSdcclxuaW1wb3J0IHsgVGV4dFNlbGVjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3NlbGVjdGlvbidcclxuaW1wb3J0IHsgQWRkTWFya1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9tYXJrLXN0ZXBzJ1xyXG5pbXBvcnQgeyBSZXBsYWNlSW5saW5lU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3JlcGxhY2UtaW5saW5lJ1xyXG5pbXBvcnQgeyBSZXBsYWNlTm9kZXNTdGVwLCByZXBsYWNlTm9kZUF0IH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1ub2RlcydcclxuaW1wb3J0IHsgV3JhcE5vZGVzU3RlcCB9IGZyb20gJy4uL3N0YXRlL3N0ZXBzL3dyYXAtbGlmdCdcclxuaW1wb3J0IHR5cGUgeyBUcmFuc2FjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3RyYW5zYWN0aW9uJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJbnB1dFJ1bGVDb250ZXh0IHtcclxuICByZWFkb25seSBzdGF0ZTogRWRpdG9yU3RhdGVcclxuICByZWFkb25seSBibG9ja1BhdGg6IFBhdGhcclxuICByZWFkb25seSBibG9jazogRWRpdG9yTm9kZVxyXG4gIC8qKiBNYXRjaGVkIHJhbmdlIGluIHRoZSBibG9jaydzIGV4aXN0aW5nIGlubGluZSBjb250ZW50IChbZnJvbSwgY2FyZXQpKS4gKi9cclxuICByZWFkb25seSBmcm9tOiBudW1iZXJcclxuICByZWFkb25seSB0bzogbnVtYmVyXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIHBhdHRlcm4tdHJpZ2dlcmVkIHRyYW5zZm9ybS4gYG1hdGNoYCBydW5zIGFnYWluc3QgdGhlIGJsb2NrIHRleHQgZnJvbSBpdHNcclxuICogc3RhcnQgdG8gdGhlIGNhcmV0IHBsdXMgdGhlIGp1c3QtdHlwZWQgY2hhcmFjdGVyLCBhbmQgbXVzdCBhbmNob3IgYXQgdGhlXHJcbiAqIGVuZCAoYCRgKS4gV2hlbiBpdCBmaXJlcywgdGhlIHR5cGVkIGNoYXJhY3RlciBpcyBuZXZlciBpbnNlcnRlZC4gVGhlIHJ1bGVcclxuICogcHJvZHVjZXMgdGhlIHdob2xlIHRyYW5zYWN0aW9uLlxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBJbnB1dFJ1bGUge1xyXG4gIHJlYWRvbmx5IG1hdGNoOiBSZWdFeHBcclxuICByZWFkb25seSBydW46IChjb250ZXh0OiBJbnB1dFJ1bGVDb250ZXh0LCBtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiBUcmFuc2FjdGlvbiB8IG51bGxcclxufVxyXG5cclxuLyoqXHJcbiAqIFRyeSB0aGUgcnVsZXMgZm9yIGEgdHlwZWQgY2hhcmFjdGVyLiBSZXR1cm5zIHRoZSB0cmFuc2Zvcm0gdHJhbnNhY3Rpb24sIG9yXHJcbiAqIG51bGwgd2hlbiBubyBydWxlIGFwcGxpZXMgKHRoZSBjYWxsZXIgdGhlbiBpbnNlcnRzIHRoZSB0ZXh0IG5vcm1hbGx5KS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBhcHBseUlucHV0UnVsZXMoXHJcbiAgc3RhdGU6IEVkaXRvclN0YXRlLFxyXG4gIHR5cGVkOiBzdHJpbmcsXHJcbiAgcnVsZXM6IHJlYWRvbmx5IElucHV0UnVsZVtdLFxyXG4pOiBUcmFuc2FjdGlvbiB8IG51bGwge1xyXG4gIGlmICh0eXBlZC5sZW5ndGggIT09IDEpIHJldHVybiBudWxsXHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikgfHwgIXNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBwb2ludCA9IHNlbGVjdGlvbi5oZWFkXHJcbiAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcG9pbnQucGF0aClcclxuICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuICAvLyBTb3VyY2UgdGV4dCBpcyB0eXBlZCwgbm90IHdyaXR0ZW46IFwiIyBcIiwgXCI+IFwiLCBcImBgYFwiIGFuZCBcIi0tXCIgYXJlIGFsbFxyXG4gIC8vIHRoaW5ncyBhIGNvZGUgYmxvY2sgaXMgZXhwZWN0ZWQgdG8gaG9sZCBsaXRlcmFsbHksIHNvIG5vIHJ1bGUgbWF5IGZpcmVcclxuICAvLyBpbnNpZGUgb25lLiBUaGUgc2FtZSBnb2VzIGZvciB0ZXh0IGFscmVhZHkgY2FycnlpbmcgdGhlIGBjb2RlYCBtYXJrLlxyXG4gIGlmIChibG9jay50eXBlLnNwZWMucHJlc2VydmVXaGl0ZXNwYWNlKSByZXR1cm4gbnVsbFxyXG4gIGlmIChpc0luc2lkZUlubGluZUNvZGUoYmxvY2ssIHBvaW50Lm9mZnNldCkpIHJldHVybiBudWxsXHJcbiAgLy8gT2Zmc2V0cyBpbiBgdGV4dENvbnRlbnRgIGVxdWFsIGlubGluZSBvZmZzZXRzIG9ubHkgd2l0aG91dCBhdG9tcywgYmFpbCBvdGhlcndpc2UuXHJcbiAgaWYgKGJsb2NrLmNvbnRlbnQuY2hpbGRyZW4uc29tZSgoY2hpbGQpID0+ICFjaGlsZC5pc1RleHQpKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IHRleHRCZWZvcmUgPSBibG9jay50ZXh0Q29udGVudC5zbGljZSgwLCBwb2ludC5vZmZzZXQpXHJcbiAgY29uc3QgY2FuZGlkYXRlID0gdGV4dEJlZm9yZSArIHR5cGVkXHJcbiAgZm9yIChjb25zdCBydWxlIG9mIHJ1bGVzKSB7XHJcbiAgICBjb25zdCBtYXRjaCA9IHJ1bGUubWF0Y2guZXhlYyhjYW5kaWRhdGUpXHJcbiAgICBpZiAoIW1hdGNoIHx8IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoICE9PSBjYW5kaWRhdGUubGVuZ3RoKSBjb250aW51ZVxyXG4gICAgY29uc3QgdHIgPSBydWxlLnJ1bihcclxuICAgICAgeyBzdGF0ZSwgYmxvY2tQYXRoOiBwb2ludC5wYXRoLCBibG9jaywgZnJvbTogbWF0Y2guaW5kZXgsIHRvOiBwb2ludC5vZmZzZXQgfSxcclxuICAgICAgbWF0Y2gsXHJcbiAgICApXHJcbiAgICBpZiAodHIpIHJldHVybiB0ci5zZXRNZXRhKE5FV19ISVNUT1JZX0dST1VQLCB0cnVlKVxyXG4gIH1cclxuICByZXR1cm4gbnVsbFxyXG59XHJcblxyXG4vKipcclxuICogV2hldGhlciB0aGUgdGV4dCB0aGUgY2FyZXQgaXMgZXh0ZW5kaW5nIGNhcnJpZXMgdGhlIGBjb2RlYCBtYXJrLiBNYXJrc1xyXG4gKiBjb250aW51ZSBmcm9tIHRoZSBsZWZ0IGFzIHlvdSB0eXBlLCBzbyBpdCBpcyB0aGUgcnVuICplbmRpbmcqIGF0IHRoZSBjYXJldFxyXG4gKiB0aGF0IGRlY2lkZXMuIFRoZSBzYW1lIHJ1bGUgYG1hcmtzQXRJbmxpbmVPZmZzZXRgIGFwcGxpZXMuXHJcbiAqL1xyXG5mdW5jdGlvbiBpc0luc2lkZUlubGluZUNvZGUoYmxvY2s6IEVkaXRvck5vZGUsIG9mZnNldDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgY29uc3QgbWFya3MgPSBtYXJrc0F0SW5saW5lT2Zmc2V0KGJsb2NrLmNvbnRlbnQsIG9mZnNldClcclxuICByZXR1cm4gbWFya3Muc29tZSgobWFyaykgPT4gbWFyay50eXBlLm5hbWUgPT09ICdjb2RlJylcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBEZWZhdWx0SW5wdXRSdWxlT3B0aW9ucyB7XHJcbiAgLyoqIGAtLWAg4oaSIGVtIGRhc2guIE9uIGJ5IGRlZmF1bHQuICovXHJcbiAgcmVhZG9ubHkgZW1EYXNoPzogYm9vbGVhblxyXG4gIC8qKiBMaW5rIGEgVVJMIGFzIHNvb24gYXMgaXQgaXMgZm9sbG93ZWQgYnkgYSBzcGFjZS4gT24gYnkgZGVmYXVsdC4gKi9cclxuICByZWFkb25seSBhdXRvbGluaz86IGJvb2xlYW5cclxuICAvKiogYGAgYHRleHRgIGBgIOKGkiBpbmxpbmUgY29kZSwgb24gdGhlIGNsb3NpbmcgYmFja3RpY2suIE9uIGJ5IGRlZmF1bHQuICovXHJcbiAgcmVhZG9ubHkgaW5saW5lQ29kZT86IGJvb2xlYW5cclxufVxyXG5cclxuLyoqIFRoZSBzdG9jayBtYXJrZG93bi1zdHlsZSBzaG9ydGN1dHM6IGhlYWRpbmdzLCBsaXN0cywgcXVvdGUsIGNvZGUsIGVtIGRhc2guICovXHJcbmV4cG9ydCBmdW5jdGlvbiBkZWZhdWx0SW5wdXRSdWxlcyhvcHRpb25zOiBEZWZhdWx0SW5wdXRSdWxlT3B0aW9ucyA9IHt9KTogSW5wdXRSdWxlW10ge1xyXG4gIGNvbnN0IHJ1bGVzOiBJbnB1dFJ1bGVbXSA9IFtcclxuICAgIC8vIFwiIyMgXCIg4oaSIGhlYWRpbmdcclxuICAgIHtcclxuICAgICAgbWF0Y2g6IC9eKCN7MSw2fSkgJC8sXHJcbiAgICAgIHJ1bjogKHsgc3RhdGUsIGJsb2NrUGF0aCwgZnJvbSwgdG8gfSwgbWF0Y2gpID0+IHtcclxuICAgICAgICBjb25zdCBsZXZlbCA9IChtYXRjaFsxXSBhcyBzdHJpbmcpLmxlbmd0aFxyXG4gICAgICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChibG9ja1BhdGgsIGZyb20sIHRvLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgICAgICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHRyLmRvYywgYmxvY2tQYXRoKVxyXG4gICAgICAgIGlmICghYmxvY2spIHJldHVybiBudWxsXHJcbiAgICAgICAgdHIuc3RlcChcclxuICAgICAgICAgIHJlcGxhY2VOb2RlQXQoXHJcbiAgICAgICAgICAgIGJsb2NrUGF0aCxcclxuICAgICAgICAgICAgRnJhZ21lbnQub2Yoc3RhdGUuc2NoZW1hLm5vZGVUeXBlKCdoZWFkaW5nJykuY3JlYXRlKHsgbGV2ZWwgfSwgYmxvY2suY29udGVudCkpLFxyXG4gICAgICAgICAgKSxcclxuICAgICAgICApXHJcbiAgICAgICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhibG9ja1BhdGgsIDApKSlcclxuICAgICAgICByZXR1cm4gdHJcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgICAvLyBcIi0gXCIgLyBcIiogXCIgLyBcIisgXCIg4oaSIGJ1bGxldCBsaXN0OyBcIjEuIFwiIOKGkiBvcmRlcmVkIGxpc3RcclxuICAgIHtcclxuICAgICAgbWF0Y2g6IC9eKFstKitdKSAkLyxcclxuICAgICAgcnVuOiAoY29udGV4dCkgPT4gd3JhcEluTGlzdChjb250ZXh0LCAnYnVsbGV0TGlzdCcsIHVuZGVmaW5lZCksXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBtYXRjaDogL14oXFxkezEsOX0pXFwuICQvLFxyXG4gICAgICBydW46IChjb250ZXh0LCBtYXRjaCkgPT5cclxuICAgICAgICB3cmFwSW5MaXN0KGNvbnRleHQsICdvcmRlcmVkTGlzdCcsIHtcclxuICAgICAgICAgIHN0YXJ0OiBOdW1iZXIucGFyc2VJbnQobWF0Y2hbMV0gYXMgc3RyaW5nLCAxMCksXHJcbiAgICAgICAgfSksXHJcbiAgICB9LFxyXG4gICAgLy8gXCI+IFwiIOKGkiBibG9ja3F1b3RlXHJcbiAgICB7XHJcbiAgICAgIG1hdGNoOiAvXj4gJC8sXHJcbiAgICAgIHJ1bjogKHsgc3RhdGUsIGJsb2NrUGF0aCwgZnJvbSwgdG8gfSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChibG9ja1BhdGgsIGZyb20sIHRvLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgICAgICAgY29uc3QgcGFyZW50UGF0aCA9IGJsb2NrUGF0aC5zbGljZSgwLCAtMSlcclxuICAgICAgICBjb25zdCBpbmRleCA9IGJsb2NrUGF0aFtibG9ja1BhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgICAgICAgdHIuc3RlcChuZXcgV3JhcE5vZGVzU3RlcChwYXJlbnRQYXRoLCBpbmRleCwgaW5kZXggKyAxLCAnYmxvY2txdW90ZScpKVxyXG4gICAgICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoWy4uLnBhcmVudFBhdGgsIGluZGV4LCAwXSwgMCkpKVxyXG4gICAgICAgIHJldHVybiB0clxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIC8vIFwiYGBgXCIg4oaSIGNvZGUgYmxvY2tcclxuICAgIHtcclxuICAgICAgbWF0Y2g6IC9eYGBgJC8sXHJcbiAgICAgIHJ1bjogKHsgc3RhdGUsIGJsb2NrUGF0aCwgZnJvbSwgdG8gfSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgICAgICB0ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChibG9ja1BhdGgsIGZyb20sIHRvLCBGcmFnbWVudC5lbXB0eSkpXHJcbiAgICAgICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHRyLmRvYywgYmxvY2tQYXRoKVxyXG4gICAgICAgIGlmICghYmxvY2spIHJldHVybiBudWxsXHJcbiAgICAgICAgdHIuc3RlcChcclxuICAgICAgICAgIHJlcGxhY2VOb2RlQXQoXHJcbiAgICAgICAgICAgIGJsb2NrUGF0aCxcclxuICAgICAgICAgICAgRnJhZ21lbnQub2Yoc3RhdGUuc2NoZW1hLm5vZGVUeXBlKCdjb2RlQmxvY2snKS5jcmVhdGUodW5kZWZpbmVkLCBibG9jay5jb250ZW50KSksXHJcbiAgICAgICAgICApLFxyXG4gICAgICAgIClcclxuICAgICAgICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKGJsb2NrUGF0aCwgMCkpKVxyXG4gICAgICAgIHJldHVybiB0clxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICBdXHJcbiAgaWYgKG9wdGlvbnMuYXV0b2xpbmsgIT09IGZhbHNlKSBydWxlcy5wdXNoKGF1dG9saW5rUnVsZSgpKVxyXG4gIGlmIChvcHRpb25zLmlubGluZUNvZGUgIT09IGZhbHNlKSBydWxlcy5wdXNoKGlubGluZUNvZGVSdWxlKCkpXHJcbiAgaWYgKG9wdGlvbnMuZW1EYXNoICE9PSBmYWxzZSkge1xyXG4gICAgcnVsZXMucHVzaCh7XHJcbiAgICAgIG1hdGNoOiAvLS0kLyxcclxuICAgICAgcnVuOiAoeyBzdGF0ZSwgYmxvY2tQYXRoLCBmcm9tLCB0byB9KSA9PiB7XHJcbiAgICAgICAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gICAgICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKGJsb2NrUGF0aCwgZnJvbSwgdG8sIEZyYWdtZW50Lm9mKHN0YXRlLnNjaGVtYS50ZXh0KCfigJQnKSkpKVxyXG4gICAgICAgIHRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihwb3MoYmxvY2tQYXRoLCBmcm9tICsgMSkpKVxyXG4gICAgICAgIHJldHVybiB0clxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICB9XHJcbiAgcmV0dXJuIHJ1bGVzXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdyYXBJbkxpc3QoXHJcbiAgY29udGV4dDogSW5wdXRSdWxlQ29udGV4dCxcclxuICBsaXN0VHlwZU5hbWU6IHN0cmluZyxcclxuICBhdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXHJcbik6IFRyYW5zYWN0aW9uIHwgbnVsbCB7XHJcbiAgY29uc3QgeyBzdGF0ZSwgYmxvY2tQYXRoLCBmcm9tLCB0byB9ID0gY29udGV4dFxyXG4gIC8vIE5ldmVyIHRyaWdnZXIgaW5zaWRlIGFuIGV4aXN0aW5nIGxpc3QgaXRlbSBvciBhIG5vbi1wYXJhZ3JhcGggYmxvY2suXHJcbiAgaWYgKGNvbnRleHQuYmxvY2sudHlwZS5uYW1lICE9PSAncGFyYWdyYXBoJykgcmV0dXJuIG51bGxcclxuICBjb25zdCBwYXJlbnRQYXRoID0gYmxvY2tQYXRoLnNsaWNlKDAsIC0xKVxyXG4gIGlmIChwYXJlbnRQYXRoLmxlbmd0aCA+IDAgJiYgaXNMaXN0SXRlbVR5cGVOYW1lKG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBwYXJlbnRQYXRoKT8udHlwZS5uYW1lKSkge1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcbiAgY29uc3QgdHIgPSBzdGF0ZS50clxyXG4gIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKGJsb2NrUGF0aCwgZnJvbSwgdG8sIEZyYWdtZW50LmVtcHR5KSlcclxuICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgodHIuZG9jLCBibG9ja1BhdGgpXHJcbiAgaWYgKCFibG9jaykgcmV0dXJuIG51bGxcclxuICBjb25zdCBpbmRleCA9IGJsb2NrUGF0aFtibG9ja1BhdGgubGVuZ3RoIC0gMV0gYXMgbnVtYmVyXHJcbiAgY29uc3Qgc2NoZW1hID0gc3RhdGUuc2NoZW1hXHJcbiAgY29uc3QgaXRlbSA9IHNjaGVtYS5ub2RlVHlwZSgnbGlzdEl0ZW0nKS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5vZihibG9jaykpXHJcbiAgdHIuc3RlcChcclxuICAgIG5ldyBSZXBsYWNlTm9kZXNTdGVwKFxyXG4gICAgICBwYXJlbnRQYXRoLFxyXG4gICAgICBpbmRleCxcclxuICAgICAgaW5kZXggKyAxLFxyXG4gICAgICBGcmFnbWVudC5vZihzY2hlbWEubm9kZVR5cGUobGlzdFR5cGVOYW1lKS5jcmVhdGUoYXR0cnMsIEZyYWdtZW50Lm9mKGl0ZW0pKSksXHJcbiAgICApLFxyXG4gIClcclxuICB0ci5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKFsuLi5wYXJlbnRQYXRoLCBpbmRleCwgMCwgMF0sIDApKSlcclxuICByZXR1cm4gdHJcclxufVxyXG5cclxuLyoqXHJcbiAqIEEgVVJMIGZvbGxvd2VkIGJ5IGEgc3BhY2UgYmVjb21lcyBhIGxpbmsuIE1hdGNoaW5nIG9ubHkgYXQgYSB0ZXJtaW5hdGluZ1xyXG4gKiBzcGFjZSAob3IgY2xvc2luZyBicmFja2V0KSBtZWFucyB0aGUgcnVsZSBmaXJlcyBvbmNlLCBvbiBhIGNvbXBsZXRlIFVSTCxcclxuICogcmF0aGVyIHRoYW4gcmUtcnVubmluZyBvbiBldmVyeSBrZXlzdHJva2UgYXMgb25lIGlzIHR5cGVkLlxyXG4gKlxyXG4gKiBUcmFpbGluZyBzZW50ZW5jZSBwdW5jdHVhdGlvbiBpcyBsZWZ0IG91dCBvZiB0aGUgbGluay4gXCJTZWUgaHR0cHM6Ly94LmRldi5cIlxyXG4gKiBzaG91bGQgbm90IGxpbmsgdGhlIGZ1bGwgc3RvcC4gQmFsYW5jZWQgdHJhaWxpbmcgcGFyZW5zIGFyZSBrZXB0LCBzaW5jZVxyXG4gKiB0aGV5IGFyZSBjb21tb24gaW4gcmVhbCBVUkxzIChXaWtpcGVkaWEgYXJ0aWNsZSB0aXRsZXMsIGZvciBvbmUpLlxyXG4gKi9cclxuY29uc3QgQVVUT0xJTksgPSAvKD86XnxbXFxzKF0pKCg/Omh0dHBzPzpcXC9cXC98d3d3XFwuKVteXFxzPD5cIidgXXsyLDIwMDB9KShbXFxzKV0pJC9pXHJcblxyXG5mdW5jdGlvbiBhdXRvbGlua1J1bGUoKTogSW5wdXRSdWxlIHtcclxuICByZXR1cm4ge1xyXG4gICAgbWF0Y2g6IEFVVE9MSU5LLFxyXG4gICAgcnVuOiAoeyBzdGF0ZSwgYmxvY2tQYXRoLCBibG9jaywgdG8gfSwgbWF0Y2gpID0+IHtcclxuICAgICAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrVHlwZSgnbGluaycpXHJcbiAgICAgIC8vIENvZGUgYmxvY2tzIGRpc2FsbG93IGV2ZXJ5IG1hcmssIHNvIHRoaXMgaXMgd2hhdCBrZWVwcyBhIFVSTCB0eXBlZFxyXG4gICAgICAvLyBpbnRvIG9uZSBwbGFpbiB0ZXh0LiBUaGUgc2FtZSBjaGVjayBjb3ZlcnMgYW55IHN1Y2ggYmxvY2sgdHlwZS5cclxuICAgICAgaWYgKCFibG9jay50eXBlLmFsbG93c01hcmtUeXBlKHR5cGUpKSByZXR1cm4gbnVsbFxyXG5cclxuICAgICAgY29uc3QgcmF3ID0gbWF0Y2hbMV0gYXMgc3RyaW5nXHJcbiAgICAgIGNvbnN0IHRyYWlsaW5nID0gbWF0Y2hbMl0gYXMgc3RyaW5nXHJcbiAgICAgIGNvbnN0IHVybCA9IHRyaW1UcmFpbGluZ1B1bmN0dWF0aW9uKHJhdylcclxuICAgICAgaWYgKHVybC5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgICAgIC8vIGB3d3cuYCBpcyBhIFVSTCB0byBhIGh1bWFuIGJ1dCBub3QgdG8gYSBicm93c2VyOyBnaXZlIGl0IGEgc2NoZW1lLlxyXG4gICAgICBjb25zdCBocmVmID0gc2FmZUhyZWYoL153d3dcXC4vaS50ZXN0KHVybCkgPyBgaHR0cHM6Ly8ke3VybH1gIDogdXJsKVxyXG4gICAgICBpZiAoIWhyZWYpIHJldHVybiBudWxsXHJcblxyXG4gICAgICAvLyBUaGUgKm1hdGNoZWQqIHRleHQsIHB1bmN0dWF0aW9uIGluY2x1ZGVkLCBpcyB3aGF0IHNpdHMgaW1tZWRpYXRlbHlcclxuICAgICAgLy8gYmVmb3JlIHRoZSB0eXBlZCBjaGFyYWN0ZXIsIHNvIHRoZSBzdGFydCBpcyBtZWFzdXJlZCBmcm9tIHRoZSByYXdcclxuICAgICAgLy8gbWF0Y2ggYW5kIHRoZSBsaW5rIHRoZW4gc3RvcHMgc2hvcnQgb2YgdGhlIHB1bmN0dWF0aW9uLiBNZWFzdXJpbmdcclxuICAgICAgLy8gZnJvbSB0aGUgdHJpbW1lZCBVUkwgaW5zdGVhZCB3b3VsZCBzaGlmdCB0aGUgd2hvbGUgc3BhbiByaWdodCwgZWF0aW5nXHJcbiAgICAgIC8vIHRoZSBmaXJzdCBjaGFyYWN0ZXIgb2YgdGhlIFVSTCBhbmQgbWFya2luZyB0aGUgZnVsbCBzdG9wIGFmdGVyIGl0LlxyXG4gICAgICBjb25zdCBzdGFydCA9IHRvIC0gcmF3Lmxlbmd0aFxyXG4gICAgICBpZiAoc3RhcnQgPCAwKSByZXR1cm4gbnVsbFxyXG4gICAgICBjb25zdCBlbmQgPSBzdGFydCArIHVybC5sZW5ndGhcclxuXHJcbiAgICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgICAgdHIuc3RlcChuZXcgQWRkTWFya1N0ZXAoYmxvY2tQYXRoLCBzdGFydCwgZW5kLCB0eXBlLmNyZWF0ZSh7IGhyZWYgfSkpKVxyXG4gICAgICAvLyBUaGUgcnVsZSBzd2FsbG93ZWQgdGhlIHR5cGVkIGNoYXJhY3Rlciwgc28gcHV0IGl0IGJhY2ssIHVubWFya2VkLFxyXG4gICAgICAvLyBvciB0aGUgbGluayB3b3VsZCBrZWVwIGdyb3dpbmcgYXMgdGhlIHVzZXIgY2FycmllcyBvbiB0eXBpbmcuIEl0XHJcbiAgICAgIC8vIGJlbG9uZ3MgYXQgdGhlIGNhcmV0LCBhZnRlciBhbnkgcHVuY3R1YXRpb24gbGVmdCBvdXQgb2YgdGhlIGxpbmsuXHJcbiAgICAgIHRyLnN0ZXAobmV3IFJlcGxhY2VJbmxpbmVTdGVwKGJsb2NrUGF0aCwgdG8sIHRvLCBGcmFnbWVudC5vZihzdGF0ZS5zY2hlbWEudGV4dCh0cmFpbGluZykpKSlcclxuICAgICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhibG9ja1BhdGgsIHRvICsgdHJhaWxpbmcubGVuZ3RoKSkpXHJcbiAgICAgIHJldHVybiB0clxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBgYCBgY29kZWAgYGAg4oaSIHRoZSB0ZXh0IGJldHdlZW4gdGhlIGJhY2t0aWNrcyBpbiB0aGUgYGNvZGVgIG1hcmssIG9uIHRoZVxyXG4gKiBjbG9zaW5nIGJhY2t0aWNrLiBUaHJlZSBiYWNrdGlja3MgaW4gYSByb3cgYXJlIHRoZSBjb2RlLWJsb2NrIHJ1bGUncywgc28gYVxyXG4gKiBydW4gb2YgYmFja3RpY2tzIHdpdGggbm90aGluZyBiZXR3ZWVuIHRoZW0gbmV2ZXIgbWF0Y2hlcyBoZXJlLlxyXG4gKi9cclxuZnVuY3Rpb24gaW5saW5lQ29kZVJ1bGUoKTogSW5wdXRSdWxlIHtcclxuICByZXR1cm4ge1xyXG4gICAgbWF0Y2g6IC8oPzpefFteYF0pYChbXmBdKylgJC8sXHJcbiAgICBydW46ICh7IHN0YXRlLCBibG9ja1BhdGgsIGJsb2NrLCB0byB9LCBtYXRjaCkgPT4ge1xyXG4gICAgICBjb25zdCB0eXBlID0gc3RhdGUuc2NoZW1hLm1hcmtzLmNvZGVcclxuICAgICAgaWYgKCF0eXBlIHx8ICFibG9jay50eXBlLmFsbG93c01hcmtUeXBlKHR5cGUpKSByZXR1cm4gbnVsbFxyXG4gICAgICBjb25zdCBpbm5lciA9IG1hdGNoWzFdIGFzIHN0cmluZ1xyXG4gICAgICAvLyBUaGUgY2FyZXQgc2l0cyBhZnRlciBcImBpbm5lclwiOyB0aGUgdHlwZWQgY2xvc2luZyBiYWNrdGljayBpcyBzd2FsbG93ZWQuXHJcbiAgICAgIGNvbnN0IHN0YXJ0ID0gdG8gLSBpbm5lci5sZW5ndGggLSAxXHJcbiAgICAgIGlmIChzdGFydCA8IDApIHJldHVybiBudWxsXHJcbiAgICAgIGNvbnN0IHRyID0gc3RhdGUudHJcclxuICAgICAgdHIuc3RlcChcclxuICAgICAgICBuZXcgUmVwbGFjZUlubGluZVN0ZXAoXHJcbiAgICAgICAgICBibG9ja1BhdGgsXHJcbiAgICAgICAgICBzdGFydCxcclxuICAgICAgICAgIHRvLFxyXG4gICAgICAgICAgRnJhZ21lbnQub2Yoc3RhdGUuc2NoZW1hLnRleHQoaW5uZXIsIFt0eXBlLmNyZWF0ZSgpXSkpLFxyXG4gICAgICAgICksXHJcbiAgICAgIClcclxuICAgICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhibG9ja1BhdGgsIHN0YXJ0ICsgaW5uZXIubGVuZ3RoKSkpXHJcbiAgICAgIHJldHVybiB0clxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBQdW5jdHVhdGlvbiB0aGF0IGVuZHMgYSBzZW50ZW5jZSByYXRoZXIgdGhhbiBhIFVSTC4gKi9cclxuY29uc3QgVFJBSUxJTkdfUFVOQ1RVQVRJT04gPSAnLiw7OiE/XFwnXCJgJ1xyXG5cclxuLyoqIERyb3AgdGhlIHB1bmN0dWF0aW9uIGEgc2VudGVuY2UsIG5vdCBhIFVSTCwgaXMgbGlrZWx5IHRvIGhhdmUgZW5kZWQgd2l0aC4gKi9cclxuZnVuY3Rpb24gdHJpbVRyYWlsaW5nUHVuY3R1YXRpb24odXJsOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGxldCBlbmQgPSB1cmwubGVuZ3RoXHJcbiAgd2hpbGUgKGVuZCA+IDApIHtcclxuICAgIGNvbnN0IGNoYXIgPSB1cmxbZW5kIC0gMV0gYXMgc3RyaW5nXHJcbiAgICBpZiAoY2hhciA9PT0gJyknKSB7XHJcbiAgICAgIC8vIEtlZXAgYSBjbG9zaW5nIHBhcmVuIG9ubHkgd2hlbiB0aGUgVVJMIG9wZW5lZCBvbmUuXHJcbiAgICAgIGNvbnN0IG9wZW5zID0gKHVybC5zbGljZSgwLCBlbmQpLm1hdGNoKC9cXCgvZykgPz8gW10pLmxlbmd0aFxyXG4gICAgICBjb25zdCBjbG9zZXMgPSAodXJsLnNsaWNlKDAsIGVuZCkubWF0Y2goL1xcKS9nKSA/PyBbXSkubGVuZ3RoXHJcbiAgICAgIGlmIChvcGVucyA+PSBjbG9zZXMpIGJyZWFrXHJcbiAgICAgIGVuZCAtPSAxXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICBpZiAoVFJBSUxJTkdfUFVOQ1RVQVRJT04uaW5jbHVkZXMoY2hhcikpIHtcclxuICAgICAgZW5kIC09IDFcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGJyZWFrXHJcbiAgfVxyXG4gIHJldHVybiB1cmwuc2xpY2UoMCwgZW5kKVxyXG59XHJcbiIsICJpbXBvcnQgdHlwZSB7IENvbW1hbmQgfSBmcm9tICcuLi9jb21tYW5kcy9jb21tYW5kcydcclxuaW1wb3J0IHsgdGV4dGJsb2NrcyB9IGZyb20gJy4uL21vZGVsL2Jsb2NrcydcclxuaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgaW5saW5lU2l6ZSwgbWFya3NBdElubGluZU9mZnNldCB9IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlLCBUZXh0Tm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUGF0aCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IFJlcGxhY2VJbmxpbmVTdGVwIH0gZnJvbSAnLi4vc3RhdGUvc3RlcHMvcmVwbGFjZS1pbmxpbmUnXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaE1hdGNoIHtcclxuICByZWFkb25seSBwYXRoOiBQYXRoXHJcbiAgcmVhZG9ubHkgZnJvbTogbnVtYmVyXHJcbiAgcmVhZG9ubHkgdG86IG51bWJlclxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaE9wdGlvbnMge1xyXG4gIHJlYWRvbmx5IGNhc2VTZW5zaXRpdmU/OiBib29sZWFuXHJcbn1cclxuXHJcbi8qKiBBIGJsb2NrJ3MgdGV4dCB3aXRoIGlubGluZSBhdG9tcyBhcyBwbGFjZWhvbGRlcnMsIHNvIG9mZnNldHMgc3RheSBhbGlnbmVkLiAqL1xyXG5mdW5jdGlvbiBzZWFyY2hhYmxlVGV4dChibG9jazogRWRpdG9yTm9kZSk6IHN0cmluZyB7XHJcbiAgbGV0IHRleHQgPSAnJ1xyXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgYmxvY2suY29udGVudC5jaGlsZHJlbikge1xyXG4gICAgdGV4dCArPSBjaGlsZC5pc1RleHQgPyAoY2hpbGQgYXMgVGV4dE5vZGUpLnRleHQgOiAn77+8Jy5yZXBlYXQoaW5saW5lU2l6ZShjaGlsZCkpXHJcbiAgfVxyXG4gIHJldHVybiB0ZXh0XHJcbn1cclxuXHJcbi8qKiBBbGwgbWF0Y2hlcyBvZiBhIHF1ZXJ5IGFjcm9zcyB0aGUgZG9jdW1lbnQncyB0ZXh0YmxvY2tzLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZmluZE1hdGNoZXMoXHJcbiAgZG9jOiBFZGl0b3JOb2RlLFxyXG4gIHF1ZXJ5OiBzdHJpbmcsXHJcbiAgb3B0aW9uczogU2VhcmNoT3B0aW9ucyA9IHt9LFxyXG4pOiByZWFkb25seSBTZWFyY2hNYXRjaFtdIHtcclxuICBpZiAocXVlcnkubGVuZ3RoID09PSAwKSByZXR1cm4gW11cclxuICBjb25zdCBjYXNlU2Vuc2l0aXZlID0gb3B0aW9ucy5jYXNlU2Vuc2l0aXZlID09PSB0cnVlXHJcbiAgY29uc3QgbmVlZGxlID0gY2FzZVNlbnNpdGl2ZSA/IHF1ZXJ5IDogcXVlcnkudG9Mb3dlckNhc2UoKVxyXG4gIGNvbnN0IG1hdGNoZXM6IFNlYXJjaE1hdGNoW10gPSBbXVxyXG4gIGZvciAoY29uc3QgeyBwYXRoLCBub2RlIH0gb2YgdGV4dGJsb2Nrcyhkb2MpKSB7XHJcbiAgICBjb25zdCBoYXlzdGFjayA9IGNhc2VTZW5zaXRpdmUgPyBzZWFyY2hhYmxlVGV4dChub2RlKSA6IHNlYXJjaGFibGVUZXh0KG5vZGUpLnRvTG93ZXJDYXNlKClcclxuICAgIGxldCBpbmRleCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlKVxyXG4gICAgd2hpbGUgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICBtYXRjaGVzLnB1c2goeyBwYXRoLCBmcm9tOiBpbmRleCwgdG86IGluZGV4ICsgcXVlcnkubGVuZ3RoIH0pXHJcbiAgICAgIGluZGV4ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUsIGluZGV4ICsgcXVlcnkubGVuZ3RoKVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gbWF0Y2hlc1xyXG59XHJcblxyXG4vKiogUmVwbGFjZSBvbmUgbWF0Y2gsIGluaGVyaXRpbmcgdGhlIG1hcmtzIGF0IGl0cyBzdGFydC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxhY2VNYXRjaChtYXRjaDogU2VhcmNoTWF0Y2gsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBDb21tYW5kIHtcclxuICByZXR1cm4gKHN0YXRlKSA9PiB7XHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICBjb25zdCBpbnNlcnQgPSBidWlsZFJlcGxhY2VtZW50KHN0YXRlLmRvYywgbWF0Y2gsIHJlcGxhY2VtZW50KVxyXG4gICAgaWYgKGluc2VydCA9PT0gbnVsbCkgcmV0dXJuIG51bGxcclxuICAgIGlmICghdHIubWF5YmVTdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChtYXRjaC5wYXRoLCBtYXRjaC5mcm9tLCBtYXRjaC50bywgaW5zZXJ0KSkpIHJldHVybiBudWxsXHJcbiAgICByZXR1cm4gdHJcclxuICB9XHJcbn1cclxuXHJcbi8qKiBSZXBsYWNlIGV2ZXJ5IG1hdGNoIG9mIHRoZSBxdWVyeS4gT2Zmc2V0cyBhcmUgYXBwbGllZCBiYWNrLXRvLWZyb250IHBlciBibG9jay4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxhY2VBbGwoXHJcbiAgcXVlcnk6IHN0cmluZyxcclxuICByZXBsYWNlbWVudDogc3RyaW5nLFxyXG4gIG9wdGlvbnM6IFNlYXJjaE9wdGlvbnMgPSB7fSxcclxuKTogQ29tbWFuZCB7XHJcbiAgcmV0dXJuIChzdGF0ZSkgPT4ge1xyXG4gICAgY29uc3QgbWF0Y2hlcyA9IGZpbmRNYXRjaGVzKHN0YXRlLmRvYywgcXVlcnksIG9wdGlvbnMpXHJcbiAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgICBjb25zdCB0ciA9IHN0YXRlLnRyXHJcbiAgICAvLyBSZXZlcnNlIG9yZGVyIGtlZXBzIGVhcmxpZXIgb2Zmc2V0cyBpbiB0aGUgc2FtZSBibG9jayBzdGFibGUuXHJcbiAgICBmb3IgKGxldCBpID0gbWF0Y2hlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICBjb25zdCBtYXRjaCA9IG1hdGNoZXNbaV0gYXMgU2VhcmNoTWF0Y2hcclxuICAgICAgY29uc3QgaW5zZXJ0ID0gYnVpbGRSZXBsYWNlbWVudChzdGF0ZS5kb2MsIG1hdGNoLCByZXBsYWNlbWVudClcclxuICAgICAgaWYgKGluc2VydCA9PT0gbnVsbCkgY29udGludWVcclxuICAgICAgdHIuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAobWF0Y2gucGF0aCwgbWF0Y2guZnJvbSwgbWF0Y2gudG8sIGluc2VydCkpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHIuZG9jQ2hhbmdlZCA/IHRyIDogbnVsbFxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGRSZXBsYWNlbWVudChcclxuICBkb2M6IEVkaXRvck5vZGUsXHJcbiAgbWF0Y2g6IFNlYXJjaE1hdGNoLFxyXG4gIHJlcGxhY2VtZW50OiBzdHJpbmcsXHJcbik6IEZyYWdtZW50IHwgbnVsbCB7XHJcbiAgaWYgKHJlcGxhY2VtZW50Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIEZyYWdtZW50LmVtcHR5XHJcbiAgbGV0IGJsb2NrOiBFZGl0b3JOb2RlIHwgbnVsbCA9IGRvY1xyXG4gIGZvciAoY29uc3QgaW5kZXggb2YgbWF0Y2gucGF0aCkge1xyXG4gICAgYmxvY2sgPSBibG9jaz8uY29udGVudC5tYXliZUNoaWxkKGluZGV4KSA/PyBudWxsXHJcbiAgfVxyXG4gIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IG1hcmtzID0gbWFya3NBdElubGluZU9mZnNldChibG9jay5jb250ZW50LCBtYXRjaC5mcm9tICsgMSlcclxuICByZXR1cm4gRnJhZ21lbnQub2YoYmxvY2sudHlwZS5zY2hlbWEudGV4dChyZXBsYWNlbWVudCwgbWFya3MpKVxyXG59XHJcbiIsICJpbXBvcnQgeyB0ZXh0YmxvY2tzIH0gZnJvbSAnLi9ibG9ja3MnXHJcbmltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4vaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUsIFRleHROb2RlIH0gZnJvbSAnLi9ub2RlJ1xyXG5cclxuLyoqIENoYXJhY3RlciBjb3VudDogaW5saW5lIGxlbmd0aCBzdW1tZWQgb3ZlciBhbGwgdGV4dGJsb2NrcyAoYXRvbXMgY291bnQgMSkuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjaGFyYWN0ZXJDb3VudChkb2M6IEVkaXRvck5vZGUpOiBudW1iZXIge1xyXG4gIHJldHVybiB0ZXh0YmxvY2tzKGRvYykucmVkdWNlKChzdW0sIHsgbm9kZSB9KSA9PiBzdW0gKyBpbmxpbmVMZW5ndGgobm9kZS5jb250ZW50KSwgMClcclxufVxyXG5cclxuLyoqIFdvcmQgY291bnQgb3ZlciB0aGUgZG9jdW1lbnQncyB2aXNpYmxlIHRleHQuIElubGluZSBhdG9tcyBzZXBhcmF0ZSB3b3Jkcy4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHdvcmRDb3VudChkb2M6IEVkaXRvck5vZGUpOiBudW1iZXIge1xyXG4gIGxldCBjb3VudCA9IDBcclxuICBmb3IgKGNvbnN0IHsgbm9kZSB9IG9mIHRleHRibG9ja3MoZG9jKSkge1xyXG4gICAgY291bnQgKz0gYmxvY2tUZXh0KG5vZGUpXHJcbiAgICAgIC5zcGxpdCgvXFxzKy8pXHJcbiAgICAgIC5maWx0ZXIoKHdvcmQpID0+IHdvcmQubGVuZ3RoID4gMCkubGVuZ3RoXHJcbiAgfVxyXG4gIHJldHVybiBjb3VudFxyXG59XHJcblxyXG4vKipcclxuICogU2VudGVuY2UgY291bnQ6IHJ1bnMgb2YgdGV4dCBjbG9zZWQgYnkgYC5gLCBgIWAsIGA/YCBvciBg4oCmYCwgd2l0aCBhIGJsb2NrJ3NcclxuICogZW5kIGNsb3NpbmcgaXRzIGxhc3Qgc2VudGVuY2UuIEEgaGV1cmlzdGljLCBcImUuZy5cIiBjb3VudHMgYXMgYSBib3VuZGFyeSxcclxuICogYnV0IHRoZSBvbmUgZXZlcnkgd29yZCBwcm9jZXNzb3IncyBzdGF0aXN0aWNzIGRpYWxvZyB1c2VzLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHNlbnRlbmNlQ291bnQoZG9jOiBFZGl0b3JOb2RlKTogbnVtYmVyIHtcclxuICBsZXQgY291bnQgPSAwXHJcbiAgZm9yIChjb25zdCB7IG5vZGUgfSBvZiB0ZXh0YmxvY2tzKGRvYykpIHtcclxuICAgIGNvbnN0IHRleHQgPSBibG9ja1RleHQobm9kZSkudHJpbSgpXHJcbiAgICBpZiAodGV4dC5sZW5ndGggPT09IDApIGNvbnRpbnVlXHJcbiAgICBjb3VudCArPSBNYXRoLm1heChcclxuICAgICAgMSxcclxuICAgICAgdGV4dC5zcGxpdCgvWy4hP+KApl0rKD86XFxzK3wkKS8pLmZpbHRlcigocGFydCkgPT4gcGFydC50cmltKCkubGVuZ3RoID4gMCkubGVuZ3RoLFxyXG4gICAgKVxyXG4gIH1cclxuICByZXR1cm4gY291bnRcclxufVxyXG5cclxuLyoqIFBhcmFncmFwaCBjb3VudDogdGV4dGJsb2NrcyBob2xkaW5nIGF0IGxlYXN0IG9uZSB2aXNpYmxlIGNoYXJhY3Rlci4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHBhcmFncmFwaENvdW50KGRvYzogRWRpdG9yTm9kZSk6IG51bWJlciB7XHJcbiAgbGV0IGNvdW50ID0gMFxyXG4gIGZvciAoY29uc3QgeyBub2RlIH0gb2YgdGV4dGJsb2Nrcyhkb2MpKSB7XHJcbiAgICBpZiAoYmxvY2tUZXh0KG5vZGUpLnRyaW0oKS5sZW5ndGggPiAwKSBjb3VudCsrXHJcbiAgfVxyXG4gIHJldHVybiBjb3VudFxyXG59XHJcblxyXG4vKiogQSBibG9jaydzIHRleHQgd2l0aCBlYWNoIGlubGluZSBhdG9tIHN0YW5kaW5nIGluIGFzIGEgd29yZCBzZXBhcmF0b3IuICovXHJcbmZ1bmN0aW9uIGJsb2NrVGV4dChub2RlOiBFZGl0b3JOb2RlKTogc3RyaW5nIHtcclxuICBsZXQgdGV4dCA9ICcnXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNvbnRlbnQuY2hpbGRyZW4pIHtcclxuICAgIHRleHQgKz0gY2hpbGQuaXNUZXh0ID8gKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0IDogJyAnXHJcbiAgfVxyXG4gIHJldHVybiB0ZXh0XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSwgVGV4dE5vZGUgfSBmcm9tICcuLi9tb2RlbC9ub2RlJ1xyXG5pbXBvcnQgdHlwZSB7IEhUTUxTcGVjIH0gZnJvbSAnLi4vbW9kZWwvc2NoZW1hJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBIVE1MU2VyaWFsaXplT3B0aW9ucyB7XHJcbiAgLyoqXHJcbiAgICogTWFya3VwIHRvIGVtaXQgZm9yIGEgbm9kZSBpbnN0ZWFkIG9mIHRoZSBvbmUgaXRzIHNjaGVtYSBkZXNjcmliZXM7XHJcbiAgICogcmV0dXJuIG51bGwgdG8gbGVhdmUgdGhlIG5vZGUgYWxvbmUuXHJcbiAgICpcclxuICAgKiBUaGlzIGlzIGhvdyBhIGRvY3VtZW50IGdldHMgb3V0IGNhcnJ5aW5nIHdoYXQgdGhlIGVkaXRvciAqZHJldyogcmF0aGVyXHJcbiAgICogdGhhbiBvbmx5IHdoYXQgaXQgaG9sZHMsIHN5bnRheCBoaWdobGlnaHRpbmcgaXMgYSBkZWNvcmF0aW9uIGxheWVyIGFuZCBhXHJcbiAgICogZGlhZ3JhbSBwcmV2aWV3IGlzIGFuIGVsZW1lbnQgdGhlIHJlbmRlcmVyIGFwcGVuZHMsIHNvIG5laXRoZXIgaXMgaW4gdGhlXHJcbiAgICogbW9kZWwgYW5kIG5laXRoZXIgd291bGQgb3RoZXJ3aXNlIHN1cnZpdmUgYmVpbmcgc2VyaWFsaXplZCBmcm9tIGl0LlxyXG4gICAqXHJcbiAgICogKipUaGUgc3RyaW5nIGlzIGVtaXR0ZWQgdmVyYmF0aW0sIG5vdCBlc2NhcGVkLioqIEl0IGlzIG1hcmt1cCB0aGUgaG9zdFxyXG4gICAqIHByb2R1Y2VkLCBvbiB0aGUgc2FtZSBmb290aW5nIGFzIHRoZSBkaWFncmFtIHJlbmRlcmVyJ3Mgb3duIG91dHB1dDtcclxuICAgKiBuZXZlciBoYW5kIHRoaXMgYW55dGhpbmcgdGhhdCBhcnJpdmVkIHdpdGggYSBkb2N1bWVudC5cclxuICAgKi9cclxuICByZWFkb25seSByZW5kZXJOb2RlPzogKG5vZGU6IEVkaXRvck5vZGUpID0+IHN0cmluZyB8IG51bGxcclxufVxyXG5cclxuLyoqXHJcbiAqIFN0cmluZy1iYXNlZCBIVE1MIGV4cG9ydCBkcml2ZW4gYnkgdGhlIHNjaGVtYSdzIGB0b0hUTUxgIHNwZWNzLiBObyBET01cclxuICogdXNhZ2UgKFNTUi1zYWZlKTsgYWxsIHRleHQgYW5kIGF0dHJpYnV0ZSB2YWx1ZXMgYXJlIGVzY2FwZWQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplVG9IVE1MKG5vZGU6IEVkaXRvck5vZGUsIG9wdGlvbnM6IEhUTUxTZXJpYWxpemVPcHRpb25zID0ge30pOiBzdHJpbmcge1xyXG4gIGlmIChub2RlLmlzVGV4dCkgcmV0dXJuIHNlcmlhbGl6ZVRleHQobm9kZSBhcyBUZXh0Tm9kZSlcclxuICBjb25zdCByZXBsYWNlbWVudCA9IG9wdGlvbnMucmVuZGVyTm9kZT8uKG5vZGUpXHJcbiAgaWYgKHJlcGxhY2VtZW50ICE9PSBudWxsICYmIHJlcGxhY2VtZW50ICE9PSB1bmRlZmluZWQpIHJldHVybiByZXBsYWNlbWVudFxyXG4gIGNvbnN0IHNwZWMgPSBub2RlLnR5cGUuc3BlYy50b0hUTUw/Lihub2RlKVxyXG4gIC8vIEFuIGFycm93LCBub3QgYSBiYXJlIHJlZmVyZW5jZTogYG1hcGAgd291bGQgcGFzcyB0aGUgaW5kZXggYWxvbmcgYXMgdGhlXHJcbiAgLy8gb3B0aW9ucyBhcmd1bWVudC5cclxuICBjb25zdCBjaGlsZHJlbiA9IG5vZGUuY29udGVudC5jaGlsZHJlbi5tYXAoKGNoaWxkKSA9PiBzZXJpYWxpemVUb0hUTUwoY2hpbGQsIG9wdGlvbnMpKS5qb2luKCcnKVxyXG4gIGlmICghc3BlYykgcmV0dXJuIGNoaWxkcmVuXHJcbiAgcmV0dXJuIHJlbmRlclRhZyhzcGVjLCBjaGlsZHJlbilcclxufVxyXG5cclxuZnVuY3Rpb24gc2VyaWFsaXplVGV4dChub2RlOiBUZXh0Tm9kZSk6IHN0cmluZyB7XHJcbiAgbGV0IGh0bWwgPSBlc2NhcGVIVE1MKG5vZGUudGV4dClcclxuICAvLyBJbm5lcm1vc3QgbWFyayBmaXJzdCBzbyB0aGUgZmlyc3QgbWFyayBpbiB0aGUgc2V0IGlzIHRoZSBvdXRlcm1vc3QgdGFnLlxyXG4gIGZvciAobGV0IGkgPSBub2RlLm1hcmtzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICBjb25zdCBtYXJrID0gbm9kZS5tYXJrc1tpXVxyXG4gICAgY29uc3Qgc3BlYyA9IG1hcmsudHlwZS5zcGVjLnRvSFRNTD8uKG1hcmspXHJcbiAgICBpZiAoc3BlYykgaHRtbCA9IHJlbmRlclRhZyhzcGVjLCBodG1sKVxyXG4gIH1cclxuICByZXR1cm4gaHRtbFxyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJUYWcoc3BlYzogSFRNTFNwZWMsIGNoaWxkcmVuOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGF0dHJzID0gT2JqZWN0LmVudHJpZXMoc3BlYy5hdHRycyA/PyB7fSlcclxuICAgIC5tYXAoKFtuYW1lLCB2YWx1ZV0pID0+IGAgJHtuYW1lfT1cIiR7ZXNjYXBlSFRNTCh2YWx1ZSl9XCJgKVxyXG4gICAgLmpvaW4oJycpXHJcbiAgaWYgKHNwZWMuaXNWb2lkKSByZXR1cm4gYDwke3NwZWMudGFnfSR7YXR0cnN9PmBcclxuICBjb25zdCBib2R5ID0gY2hpbGRyZW4gfHwgc3BlYy5pbm5lckhUTUwgfHwgKHNwZWMudGV4dCA/IGVzY2FwZUhUTUwoc3BlYy50ZXh0KSA6ICcnKVxyXG4gIGNvbnN0IGlubmVyID0gc3BlYy5jaGlsZFRhZyA/IGA8JHtzcGVjLmNoaWxkVGFnfT4ke2JvZHl9PC8ke3NwZWMuY2hpbGRUYWd9PmAgOiBib2R5XHJcbiAgcmV0dXJuIGA8JHtzcGVjLnRhZ30ke2F0dHJzfT4ke2lubmVyfTwvJHtzcGVjLnRhZ30+YFxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZXNjYXBlSFRNTCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gdmFsdWVcclxuICAgIC5yZXBsYWNlQWxsKCcmJywgJyZhbXA7JylcclxuICAgIC5yZXBsYWNlQWxsKCc8JywgJyZsdDsnKVxyXG4gICAgLnJlcGxhY2VBbGwoJz4nLCAnJmd0OycpXHJcbiAgICAucmVwbGFjZUFsbCgnXCInLCAnJnF1b3Q7JylcclxuICAgIC5yZXBsYWNlQWxsKFwiJ1wiLCAnJiMzOTsnKVxyXG59XHJcblxyXG4vKiogUGxhaW4tdGV4dCBleHBvcnQ6IHRleHRibG9jayBjb250ZW50cyBqb2luZWQgYnkgbmV3bGluZXMuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVUb1RleHQoZG9jOiBFZGl0b3JOb2RlKTogc3RyaW5nIHtcclxuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXVxyXG4gIGNvbnN0IHdhbGsgPSAobm9kZTogRWRpdG9yTm9kZSk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKG5vZGUuaXNUZXh0YmxvY2spIHtcclxuICAgICAgbGluZXMucHVzaChub2RlLnRleHRDb250ZW50KVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jb250ZW50LmNoaWxkcmVuKSB3YWxrKGNoaWxkKVxyXG4gIH1cclxuICB3YWxrKGRvYylcclxuICByZXR1cm4gbGluZXMuam9pbignXFxuJylcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHsgdHlwZSBIVE1MU2VyaWFsaXplT3B0aW9ucywgc2VyaWFsaXplVG9IVE1MIH0gZnJvbSAnLi9odG1sJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBIVE1MRG9jdW1lbnRPcHRpb25zIHtcclxuICAvKiogR29lcyBpbiBgPHRpdGxlPmAuIERlZmF1bHRzIHRvIFwiRG9jdW1lbnRcIi4gKi9cclxuICByZWFkb25seSB0aXRsZT86IHN0cmluZ1xyXG4gIC8qKlxyXG4gICAqIFN0eWxlc2hlZXQgVVJMcyB0byBsaW5rLiBSZWxhdGl2ZSBVUkxzIGFyZSByZXNvbHZlZCBhZ2FpbnN0IGBiYXNlVVJMYCxcclxuICAgKiBzbyBhIGRvY3VtZW50IHNhdmVkIGVsc2V3aGVyZSBzdGlsbCBmaW5kcyB0aGVtLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IHN0eWxlU2hlZXRzPzogcmVhZG9ubHkgc3RyaW5nW11cclxuICAvKiogU2NyaXB0IFVSTHMgdG8gbG9hZCwgcmVzb2x2ZWQgdGhlIHNhbWUgd2F5LiAqL1xyXG4gIHJlYWRvbmx5IHNjcmlwdHM/OiByZWFkb25seSBzdHJpbmdbXVxyXG4gIC8qKlxyXG4gICAqIEJhc2UgZm9yIHJlc29sdmluZyB0aGUgVVJMcyBhYm92ZSwgZS5nLiBgXCJodHRwOi8vbG9jYWxob3N0OjUxNzNcImAuIEFsc29cclxuICAgKiBlbWl0dGVkIGFzIGA8YmFzZSBocmVmPmAgc28gYW55IHJlbGF0aXZlIGxpbmsgaW5zaWRlIHRoZSBkb2N1bWVudCBpdHNlbGZcclxuICAgKiByZXNvbHZlcyBhZ2FpbnN0IHRoZSBvcmlnaW4gaXQgY2FtZSBmcm9tIHJhdGhlciB0aGFuIHdoZXJldmVyIHRoZSBmaWxlXHJcbiAgICogZW5kcyB1cC5cclxuICAgKi9cclxuICByZWFkb25seSBiYXNlVVJMPzogc3RyaW5nXHJcbiAgLyoqIENTUyBlbWJlZGRlZCBkaXJlY3RseSBpbiB0aGUgcGFnZSwgYWZ0ZXIgdGhlIGxpbmtlZCBzdHlsZXNoZWV0cy4gKi9cclxuICByZWFkb25seSBpbmxpbmVDU1M/OiBzdHJpbmdcclxuICAvKiogSmF2YVNjcmlwdCBlbWJlZGRlZCBkaXJlY3RseSwgYWZ0ZXIgdGhlIGxpbmtlZCBzY3JpcHRzLiAqL1xyXG4gIHJlYWRvbmx5IGlubGluZUpTPzogc3RyaW5nXHJcbiAgLyoqIExhbmd1YWdlIGZvciBgPGh0bWwgbGFuZz5gLiBEZWZhdWx0cyB0byBcImVuXCIuICovXHJcbiAgcmVhZG9ubHkgbGFuZz86IHN0cmluZ1xyXG4gIC8qKiBQYXNzZWQgdG8ge0BsaW5rIHNlcmlhbGl6ZVRvSFRNTH07IHNlZSB7QGxpbmsgSFRNTFNlcmlhbGl6ZU9wdGlvbnMucmVuZGVyTm9kZX0uICovXHJcbiAgcmVhZG9ubHkgcmVuZGVyTm9kZT86IEhUTUxTZXJpYWxpemVPcHRpb25zWydyZW5kZXJOb2RlJ11cclxuICAvKipcclxuICAgKiBUaGUgcGFsZXR0ZSB0aGUgZG9jdW1lbnQgd2FzIGJlaW5nIGVkaXRlZCBpbiwgYmFrZWQgaW50byB0aGUgcGFnZSBzbyBpdFxyXG4gICAqIG9wZW5zIGluIHRoYXQgdGhlbWUgcmF0aGVyIHRoYW4gaW4gd2hhdGV2ZXIgdGhlIHJlYWRlcidzIHN0eWxlc2hlZXQsIG9yXHJcbiAgICogb3BlcmF0aW5nIHN5c3RlbSwgZGVjaWRlcyBmb3IgaXQuXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgdGhlbWU/OiBIVE1MRG9jdW1lbnRUaGVtZVxyXG59XHJcblxyXG4vKiogVGhlIGVkaXRvcidzIHRoZW1lLCBhcyBhbiBleHBvcnRlZCBwYWdlIGhhcyB0byBjYXJyeSBpdC4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBIVE1MRG9jdW1lbnRUaGVtZSB7XHJcbiAgLyoqIFRoZSBncm91bmQgdGhlIHBhbGV0dGUgc2l0cyBvbjsgd3JpdHRlbiB0byBgZGF0YS10cmV2aXhhbC10aGVtZWAuICovXHJcbiAgcmVhZG9ubHkgc2NoZW1lPzogJ2xpZ2h0JyB8ICdkYXJrJ1xyXG4gIC8qKiBUaGUgcHJlc2V0IGluIGZvcmNlLCBpZiBhbnk7IHdyaXR0ZW4gdG8gYGRhdGEtdHJldml4YWwtcHJlc2V0YC4gKi9cclxuICByZWFkb25seSBwcmVzZXQ/OiBzdHJpbmcgfCBudWxsXHJcbiAgLyoqXHJcbiAgICogUmVzb2x2ZWQgdG9rZW4gdmFsdWVzIGtleWVkIGJ5IG5hbWUgd2l0aG91dCB0aGUgYC0tdHZ4LWAgcHJlZml4LCBlLmcuXHJcbiAgICogYHsgJ2NvbG9yLWJnJzogJyMyZTM0NDAnIH1gLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IHRva2Vucz86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZz4+XHJcbn1cclxuXHJcbi8qKiBBYnNvbHV0ZSBmb3JtcyB0aGlzIHdpbGwgZW1pdCBhcy1pcy4gKi9cclxuY29uc3QgQUJTT0xVVEUgPSAvXig/Omh0dHBzPzpcXC9cXC98XFwvXFwvKS9pXHJcblxyXG4vLyBBIHRoZW1lIGNhbiBiZSBhdXRob3JlZCBieSBhIHVzZXIgdGhyb3VnaCBhIGN1c3RvbS10aGVtZSBkaWFsb2csIHNvIGl0c1xyXG4vLyBuYW1lIGFuZCBldmVyeSB0b2tlbiB2YWx1ZSBhcmUgdW50cnVzdGVkIHRleHQgb24gdGhlIHdheSBpbnRvIENTUy4gQSBuYW1lXHJcbi8vIHRoYXQgY291bGQgY2xvc2UgdGhlIGF0dHJpYnV0ZSBpdCBsYW5kcyBpbiwgb3IgYSB2YWx1ZSB0aGF0IGNvdWxkIGNsb3NlIHRoZVxyXG4vLyBkZWNsYXJhdGlvbiBibG9jaywgd291bGQgbGV0IGEgXCJ0aGVtZVwiIHdyaXRlIHJ1bGVzIGZvciB0aGUgd2hvbGUgcGFnZS5cclxuXHJcbi8qKiBBIHRva2VuIG5hbWUgaXMgdGhlIHRhaWwgb2YgYSBjdXN0b20gcHJvcGVydHk6IGxldHRlcnMsIGRpZ2l0cywgZGFzaGVzLiAqL1xyXG5jb25zdCBTQUZFX1RPS0VOX05BTUUgPSAvXlthLXpBLVowLTktXSskL1xyXG4vKiogQSB2YWx1ZSB0aGF0IGNvdWxkIGVuZCB0aGUgZGVjbGFyYXRpb24sIGNsb3NlIHRoZSBibG9jaywgb3Igb3BlbiBhIGNvbW1lbnQuICovXHJcbmNvbnN0IFVOU0FGRV9JTl9WQUxVRSA9IC9be308PjtAXFxcXF18XFwvXFwqL1xyXG4vKiogQSBwcmVzZXQgbmFtZSB0aGF0IGNvdWxkIGJyZWFrIG91dCBvZiB0aGUgYXR0cmlidXRlIGl0IGlzIHdyaXR0ZW4gdG8uICovXHJcbmNvbnN0IFVOU0FGRV9JTl9QUkVTRVQgPSAvW1wiJ1xcXFx7fTw+XFxuXFxyXS9cclxuXHJcbi8qKlxyXG4gKiBXaGV0aGVyIGEgVVJMIGNhcnJpZXMgYSBzY2hlbWUgb2YgaXRzIG93bi4gQSBjb2xvbiBhcHBlYXJpbmcgYmVmb3JlIHRoZVxyXG4gKiBmaXJzdCBzbGFzaCBpcyB3aGF0IG1ha2VzIG9uZSwgc28gYGphdmFzY3JpcHQ6YWxlcnQoMSlgIGFuZCBgZGF0YTrigKZgIGFyZVxyXG4gKiBjYXVnaHQgd2hpbGUgYGFzc2V0cy9hLmNzc2AgYW5kIGAvYS5jc3NgIGFyZSBub3QuXHJcbiAqL1xyXG5mdW5jdGlvbiBoYXNTY2hlbWUodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICBjb25zdCBjb2xvbiA9IHVybC5pbmRleE9mKCc6JylcclxuICBpZiAoY29sb24gPT09IC0xKSByZXR1cm4gZmFsc2VcclxuICBjb25zdCBzbGFzaCA9IHVybC5pbmRleE9mKCcvJylcclxuICByZXR1cm4gc2xhc2ggPT09IC0xIHx8IGNvbG9uIDwgc2xhc2hcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlc29sdmUgYSBVUkwgYWdhaW5zdCBhIGJhc2UsIGRyb3BwaW5nIGFueXRoaW5nIHRoYXQgaXMgbm90IHBsYWlubHkgYVxyXG4gKiBkb2N1bWVudCByZWZlcmVuY2UuXHJcbiAqXHJcbiAqIGBqYXZhc2NyaXB0OmAgYW5kIGBkYXRhOmAgYXJlIHJlZnVzZWQgb3V0cmlnaHQ6IHRoZXNlIFVSTHMgbGFuZCBpbiBhIGBzcmNgXHJcbiAqIG9yIGBocmVmYCB0aGF0IHRoZSByZWNlaXZpbmcgcGFnZSB3aWxsIGZldGNoIGFuZCBleGVjdXRlLlxyXG4gKi9cclxuZnVuY3Rpb24gcmVzb2x2ZVVSTCh1cmw6IHN0cmluZywgYmFzZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgY29uc3QgdHJpbW1lZCA9IHVybC50cmltKClcclxuICBpZiAoIXRyaW1tZWQpIHJldHVybiBudWxsXHJcbiAgLy8gQSBzY2hlbWUgb3RoZXIgdGhhbiBodHRwKHMpIGlzIHJlZnVzZWQ6IHRoZXNlIGxhbmQgaW4gYSBzcmMvaHJlZiB0aGF0IHRoZVxyXG4gIC8vIHJlY2VpdmluZyBwYWdlIHdpbGwgZmV0Y2ggYW5kIGV4ZWN1dGUuXHJcbiAgaWYgKGhhc1NjaGVtZSh0cmltbWVkKSAmJiAhQUJTT0xVVEUudGVzdCh0cmltbWVkKSkgcmV0dXJuIG51bGxcclxuICBpZiAoIWJhc2UpIHJldHVybiB0cmltbWVkXHJcbiAgLy8gQWxyZWFkeSBhYnNvbHV0ZTogbGVhdmUgaXQgYWxvbmUuXHJcbiAgaWYgKEFCU09MVVRFLnRlc3QodHJpbW1lZCkpIHJldHVybiB0cmltbWVkXHJcbiAgY29uc3Qgb3JpZ2luID0gYmFzZS5yZXBsYWNlKC9cXC8rJC8sICcnKVxyXG4gIC8vIGAuL2Fzc2V0cy94LmNzc2Agd291bGQgb3RoZXJ3aXNlIGpvaW4gYXMgYG9yaWdpbi8uL2Fzc2V0cy94LmNzc2AuXHJcbiAgY29uc3QgcGF0aCA9IHRyaW1tZWQucmVwbGFjZSgvXlxcLlxcLy8sICcnKVxyXG4gIHJldHVybiBwYXRoLnN0YXJ0c1dpdGgoJy8nKSA/IGAke29yaWdpbn0ke3BhdGh9YCA6IGAke29yaWdpbn0vJHtwYXRofWBcclxufVxyXG5cclxuLyoqIEVzY2FwZSBhIHN0cmluZyBmb3IgdXNlIGluc2lkZSBhIGRvdWJsZS1xdW90ZWQgYXR0cmlidXRlLiAqL1xyXG5mdW5jdGlvbiBlc2NhcGVBdHRyaWJ1dGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHZhbHVlXHJcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxyXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxyXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxyXG59XHJcblxyXG4vKiogRXNjYXBlIHRleHQgZm9yIGEgYDx0aXRsZT5gIG9yIG90aGVyIGVsZW1lbnQgY29udGVudC4gKi9cclxuZnVuY3Rpb24gZXNjYXBlVGV4dCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvJi9nLCAnJmFtcDsnKS5yZXBsYWNlKC88L2csICcmbHQ7JykucmVwbGFjZSgvPi9nLCAnJmd0OycpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgZ3JvdW5kLCBhcyBvbmUgb2YgdGhlIHR3byB3b3JkcyB0aGF0IG1lYW4gYW55dGhpbmcgaGVyZS4gVGhlIHR5cGUgc2F5c1xyXG4gKiBhcyBtdWNoLCBidXQgdGhpcyBpcyBhIHBsYWluLWRhdGEgb3B0aW9uIG9uIGEgcHVibGljIGZ1bmN0aW9uOiBhIGhvc3QgdGhhdFxyXG4gKiByZWFkcyBhIHRoZW1lIG91dCBvZiBzdG9yYWdlLCBvciBvZmYgdGhlIHdpcmUsIGhhbmRzIG92ZXIgd2hhdGV2ZXIgaXNcclxuICogdGhlcmUsIGFuZCBvbmUgb2YgdGhlIHBsYWNlcyBpdCBsYW5kcyBpcyBhIENTUyBkZWNsYXJhdGlvbi5cclxuICovXHJcbmZ1bmN0aW9uIHNjaGVtZSh0aGVtZTogSFRNTERvY3VtZW50VGhlbWUpOiAnbGlnaHQnIHwgJ2RhcmsnIHwgbnVsbCB7XHJcbiAgcmV0dXJuIHRoZW1lLnNjaGVtZSA9PT0gJ2xpZ2h0JyB8fCB0aGVtZS5zY2hlbWUgPT09ICdkYXJrJyA/IHRoZW1lLnNjaGVtZSA6IG51bGxcclxufVxyXG5cclxuLyoqIGBkYXRhLXRyZXZpeGFsLXRoZW1lYCBhbmQgYGRhdGEtdHJldml4YWwtcHJlc2V0YCwgcmVhZHkgdG8gc3BsaWNlIGludG8gYSB0YWcuICovXHJcbmZ1bmN0aW9uIHRoZW1lQXR0cmlidXRlcyh0aGVtZTogSFRNTERvY3VtZW50VGhlbWUgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xyXG4gIGlmICghdGhlbWUpIHJldHVybiAnJ1xyXG4gIGxldCBvdXQgPSAnJ1xyXG4gIGNvbnN0IGdyb3VuZCA9IHNjaGVtZSh0aGVtZSlcclxuICBpZiAoZ3JvdW5kKSBvdXQgKz0gYCBkYXRhLXRyZXZpeGFsLXRoZW1lPVwiJHtncm91bmR9XCJgXHJcbiAgaWYgKHRoZW1lLnByZXNldCAmJiAhVU5TQUZFX0lOX1BSRVNFVC50ZXN0KHRoZW1lLnByZXNldCkpIHtcclxuICAgIG91dCArPSBgIGRhdGEtdHJldml4YWwtcHJlc2V0PVwiJHtlc2NhcGVBdHRyaWJ1dGUodGhlbWUucHJlc2V0KX1cImBcclxuICB9XHJcbiAgcmV0dXJuIG91dFxyXG59XHJcblxyXG4vKipcclxuICogVGhlIHRoZW1lIGFzIGEgc3R5bGVzaGVldCBvZiBpdHMgb3duLCBlbWl0dGVkIGFmdGVyIGV2ZXJ5dGhpbmcgdGhlIGNhbGxlclxyXG4gKiBjb2xsZWN0ZWQgc28gdGhhdCBpdCB3aW5zIG9uIHNvdXJjZSBvcmRlci5cclxuICpcclxuICogVGhlIHBhbGV0dGUgaXMgd3JpdHRlbiBvdXQgYXMgcmVzb2x2ZWQgdmFsdWVzIHJhdGhlciB0aGFuIGxlZnQgdG8gdGhlXHJcbiAqIGF0dHJpYnV0ZXMgYWJvdmUuIFRob3NlIG9ubHkgd29yayBpZiB0aGUgcnVsZXMgcmVhZGluZyB0aGVtIHdlcmUgY29sbGVjdGVkXHJcbiAqIHRvbywgYW5kIGEgcHJlc2V0IHJ1bGUgaXMgaW4gYW55IGNhc2Ugb25lIHNlbGVjdG9yIGFtb25nIHNldmVyYWwgY29tcGV0aW5nXHJcbiAqIGZvciB0aGUgc2FtZSB0b2tlbnMsIHdoaWNoIGlzIGhvdyBhbiBleHBvcnQgZW5kcyB1cCBwbGFpbiB3aGl0ZSBhZnRlciB0aGVcclxuICogZWRpdG9yIGl0IGNhbWUgZnJvbSB3YXMgbm90LiBWYWx1ZXMgd3JpdHRlbiBzdHJhaWdodCBvbnRvIGAudHJldml4YWxgXHJcbiAqIGRlcGVuZCBvbiBub3RoaW5nLlxyXG4gKi9cclxuZnVuY3Rpb24gdGhlbWVDU1ModGhlbWU6IEhUTUxEb2N1bWVudFRoZW1lKTogc3RyaW5nIHtcclxuICBjb25zdCBydWxlczogc3RyaW5nW10gPSBbXVxyXG4gIGNvbnN0IGRlY2xhcmF0aW9ucyA9IE9iamVjdC5lbnRyaWVzKHRoZW1lLnRva2VucyA/PyB7fSlcclxuICAgIC5maWx0ZXIoKFt0b2tlbiwgdmFsdWVdKSA9PiBTQUZFX1RPS0VOX05BTUUudGVzdCh0b2tlbikgJiYgIVVOU0FGRV9JTl9WQUxVRS50ZXN0KHZhbHVlKSlcclxuICAgIC5tYXAoKFt0b2tlbiwgdmFsdWVdKSA9PiBgICAtLXR2eC0ke3Rva2VufTogJHt2YWx1ZX07YClcclxuICAvLyBgOnJvb3RgIGFzIHdlbGwgYXMgYC50cmV2aXhhbGA6IHRoZSBwYWdlIGFyb3VuZCB0aGUgZG9jdW1lbnQgcmVhZHMgdGhlXHJcbiAgLy8gc2FtZSB0b2tlbnMsIGFuZCBub3RoaW5nIGVsc2UgZGVmaW5lcyB0aGVtIHVwIHRoZXJlLlxyXG4gIGlmIChkZWNsYXJhdGlvbnMubGVuZ3RoID4gMCkgcnVsZXMucHVzaChgOnJvb3QsIC50cmV2aXhhbCB7XFxuJHtkZWNsYXJhdGlvbnMuam9pbignXFxuJyl9XFxufWApXHJcbiAgY29uc3QgZ3JvdW5kID0gc2NoZW1lKHRoZW1lKVxyXG4gIGlmIChncm91bmQpIHJ1bGVzLnB1c2goYDpyb290IHsgY29sb3Itc2NoZW1lOiAke2dyb3VuZH07IH1gKVxyXG4gIC8vIEEgZGFyayBkb2N1bWVudCBpbiBhIHdoaXRlIGd1dHRlciByZWFkcyBhcyBhIGJyb2tlbiBleHBvcnQgcmF0aGVyIHRoYW4gYVxyXG4gIC8vIGRhcmsgdGhlbWUsIGFuZCBubyBgLnRyZXZpeGFsYCBydWxlIHJlYWNoZXMgdGhhdCBmYXIuXHJcbiAgcnVsZXMucHVzaChcclxuICAgICdodG1sLCBib2R5IHsgbWFyZ2luOiAwOyBiYWNrZ3JvdW5kOiB2YXIoLS10dngtY29sb3ItYmcsICNmZmZmZmYpOyBjb2xvcjogdmFyKC0tdHZ4LWNvbG9yLXRleHQsICMxYTFhMmIpOyB9JyxcclxuICApXHJcbiAgLy8gVGhlIHBhZ2UncyBvd24gc2Nyb2xsYmFyLCBpbiB0aGUgcGFsZXR0ZSB0aGUgcGFnZSBpcyBpbi5cclxuICAvL1xyXG4gIC8vIEEgc3RhbmRhbG9uZSBkb2N1bWVudCBpcyBhIHdob2xlIGJyb3dzaW5nIGNvbnRleHQ6IGl0IHBhaW50cyBpdHMgb3duIGJhcixcclxuICAvLyBhbmQgbGVmdCBhbG9uZSB0aGF0IGJhciBpcyB0aGUgYnJvd3NlcidzIGRlZmF1bHQgZnVybml0dXJlLCB3aGljaCBvbiBhXHJcbiAgLy8gZGFyayBleHBvcnQsIG9yIGluIHRoZSBzaWRlLWJ5LXNpZGUgcHJldmlldyBmcmFtZSwgaXMgYSBoZWF2eSBwYWxlIHN0cmlwZVxyXG4gIC8vIGRvd24gdGhlIGVkZ2Ugb2YgYW4gb3RoZXJ3aXNlIGRhcmsgcGFnZS4gYGNvbG9yLXNjaGVtZWAgYWJvdmUgZ2V0cyB0aGVcclxuICAvLyBicm93c2VyIG1vc3Qgb2YgdGhlIHdheSB0aGVyZTsgdGhlc2UgbWF0Y2ggaXQgdG8gdGhlIGVkaXRvciBpdCBjYW1lIGZyb20uXHJcbiAgcnVsZXMucHVzaChcclxuICAgICdodG1sIHsgc2Nyb2xsYmFyLXdpZHRoOiB0aGluOyBzY3JvbGxiYXItY29sb3I6IHZhcigtLXR2eC1jb2xvci1ib3JkZXIsICNkOWQ5ZTMpIHRyYW5zcGFyZW50OyB9JyxcclxuICAgICc6Oi13ZWJraXQtc2Nyb2xsYmFyIHsgd2lkdGg6IDEwcHg7IGhlaWdodDogMTBweDsgfScsXHJcbiAgICAvLyBTaXplZCBhd2F5IHJhdGhlciB0aGFuIGBkaXNwbGF5YC1lZCBhd2F5OiB0aGUgaW5qZWN0aW9uIHRlc3RzIG92ZXIgdGhpc1xyXG4gICAgLy8gZnVuY3Rpb24gdXNlIHRoYXQgZXhhY3QgZGVjbGFyYXRpb24gYXMgdGhlaXIgc2VudGluZWwsIGFuZCBhIGNvc21ldGljXHJcbiAgICAvLyBydWxlIGhlcmUgbXVzdCBub3QgYmx1bnQgb25lLlxyXG4gICAgJzo6LXdlYmtpdC1zY3JvbGxiYXItYnV0dG9uIHsgd2lkdGg6IDA7IGhlaWdodDogMDsgfScsXHJcbiAgICAnOjotd2Via2l0LXNjcm9sbGJhci10cmFjaywgOjotd2Via2l0LXNjcm9sbGJhci1jb3JuZXIgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgfScsXHJcbiAgICAnOjotd2Via2l0LXNjcm9sbGJhci10aHVtYiB7IGJhY2tncm91bmQ6IHZhcigtLXR2eC1jb2xvci1ib3JkZXIsICNkOWQ5ZTMpOyBib3JkZXI6IDNweCBzb2xpZCB0cmFuc3BhcmVudDsgYm9yZGVyLXJhZGl1czogNXB4OyBiYWNrZ3JvdW5kLWNsaXA6IHBhZGRpbmctYm94OyB9JyxcclxuICAgICc6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iOmhvdmVyIHsgYmFja2dyb3VuZDogdmFyKC0tdHZ4LWNvbG9yLXRleHQtbXV0ZWQsICM2YjZiODApOyBiYWNrZ3JvdW5kLWNsaXA6IHBhZGRpbmctYm94OyB9JyxcclxuICApXHJcbiAgLy8gQnJvd3NlcnMgZHJvcCBiYWNrZ3JvdW5kcyB3aGVuIHByaW50aW5nIHVubGVzcyBhIHBhZ2UgYXNrcyBmb3IgdGhlbSwgYW5kXHJcbiAgLy8gXCJTYXZlIGFzIFBERlwiIGlzIGEgcHJpbnQ6IHdpdGhvdXQgdGhpcyBhIGRhcmsgdGhlbWUgcHJpbnRzIGFzIHBhbGUgdGV4dFxyXG4gIC8vIG9uIHdoaXRlIHBhcGVyLCBhbmQgY29kZSBibG9ja3MgYW5kIGhpZ2hsaWdodHMgbG9zZSB0aGVpciBmaWxscyBpbiBldmVyeVxyXG4gIC8vIHRoZW1lLlxyXG4gIHJ1bGVzLnB1c2goXHJcbiAgICAnQG1lZGlhIHByaW50IHtcXG4gIGh0bWwsIGJvZHksIC50cmV2aXhhbCwgLnRyZXZpeGFsICogeyAtd2Via2l0LXByaW50LWNvbG9yLWFkanVzdDogZXhhY3Q7IHByaW50LWNvbG9yLWFkanVzdDogZXhhY3Q7IH1cXG59JyxcclxuICApXHJcbiAgcmV0dXJuIHJ1bGVzLmpvaW4oJ1xcbicpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXJpYWxpemUgYSBkb2N1bWVudCBhcyBhIGNvbXBsZXRlLCBzdGFuZGFsb25lIEhUTUwgcGFnZS5cclxuICpcclxuICoge0BsaW5rIHNlcmlhbGl6ZVRvSFRNTH0gcmV0dXJucyBhIGJhcmUgZnJhZ21lbnQsIHdoaWNoIGlzIHdoYXQgeW91IHdhbnQgZm9yXHJcbiAqIGEgY2xpcGJvYXJkIHBheWxvYWQgb3IgZm9yIHN0b3JpbmcgY29udGVudCwgYnV0IHBhc3RlZCBpbnRvIGEgZmlsZSBvbiBpdHNcclxuICogb3duIGl0IHJlbmRlcnMgdW5zdHlsZWQsIGJlY2F1c2Ugbm90aGluZyBjYXJyaWVzIHRoZSBzdHlsZXNoZWV0IHdpdGggaXQuXHJcbiAqIFRoaXMgd3JhcHMgdGhlIHNhbWUgbWFya3VwIGluIGEgcmVhbCBwYWdlIHdpdGggaXRzIHN0eWxlcyBhbmQgc2NyaXB0c1xyXG4gKiBhdHRhY2hlZCwgc28gdGhlIGZpbGUgb3BlbnMgbG9va2luZyBsaWtlIHRoZSBlZGl0b3IgZGlkLlxyXG4gKlxyXG4gKiBgYGB0c1xyXG4gKiBzZXJpYWxpemVUb0hUTUxEb2N1bWVudChlZGl0b3Iuc3RhdGUuZG9jLCB7XHJcbiAqICAgYmFzZVVSTDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3MycsXHJcbiAqICAgc3R5bGVTaGVldHM6IFsnL3N0eWxlcy5jc3MnXSxcclxuICogfSlcclxuICogYGBgXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplVG9IVE1MRG9jdW1lbnQoXHJcbiAgZG9jOiBFZGl0b3JOb2RlLFxyXG4gIG9wdGlvbnM6IEhUTUxEb2N1bWVudE9wdGlvbnMgPSB7fSxcclxuKTogc3RyaW5nIHtcclxuICBjb25zdCBiYXNlID0gb3B0aW9ucy5iYXNlVVJMPy50cmltKClcclxuICBjb25zdCBoZWFkOiBzdHJpbmdbXSA9IFtcclxuICAgICc8bWV0YSBjaGFyc2V0PVwidXRmLThcIj4nLFxyXG4gICAgJzxtZXRhIG5hbWU9XCJ2aWV3cG9ydFwiIGNvbnRlbnQ9XCJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MVwiPicsXHJcbiAgXVxyXG5cclxuICAvLyBgPGJhc2U+YCBmaXJzdDogaXQgZ292ZXJucyBldmVyeSByZWxhdGl2ZSBVUkwgdGhhdCBmb2xsb3dzIGl0LCBpbmNsdWRpbmdcclxuICAvLyBvbmVzIGluc2lkZSB0aGUgZG9jdW1lbnQgYm9keS5cclxuICBpZiAoYmFzZSkgaGVhZC5wdXNoKGA8YmFzZSBocmVmPVwiJHtlc2NhcGVBdHRyaWJ1dGUoYmFzZS5yZXBsYWNlKC9cXC8rJC8sICcnKSl9L1wiPmApXHJcbiAgaGVhZC5wdXNoKGA8dGl0bGU+JHtlc2NhcGVUZXh0KG9wdGlvbnMudGl0bGUgPz8gJ0RvY3VtZW50Jyl9PC90aXRsZT5gKVxyXG5cclxuICBmb3IgKGNvbnN0IGhyZWYgb2Ygb3B0aW9ucy5zdHlsZVNoZWV0cyA/PyBbXSkge1xyXG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlVVJMKGhyZWYsIGJhc2UpXHJcbiAgICBpZiAocmVzb2x2ZWQpIGhlYWQucHVzaChgPGxpbmsgcmVsPVwic3R5bGVzaGVldFwiIGhyZWY9XCIke2VzY2FwZUF0dHJpYnV0ZShyZXNvbHZlZCl9XCI+YClcclxuICB9XHJcblxyXG4gIGlmIChvcHRpb25zLmlubGluZUNTUykge1xyXG4gICAgLy8gYDwvc3R5bGU+YCBpbnNpZGUgdGhlIENTUyB3b3VsZCBjbG9zZSB0aGUgYmxvY2sgZWFybHkgYW5kIGxldCB0aGUgcmVzdFxyXG4gICAgLy8gYmUgcGFyc2VkIGFzIG1hcmt1cC5cclxuICAgIGhlYWQucHVzaChgPHN0eWxlPlxcbiR7b3B0aW9ucy5pbmxpbmVDU1MucmVwbGFjZSgvPFxcL3N0eWxlPi9naSwgJzxcXFxcL3N0eWxlPicpfVxcbjwvc3R5bGU+YClcclxuICB9XHJcblxyXG4gIGlmIChvcHRpb25zLnRoZW1lKSBoZWFkLnB1c2goYDxzdHlsZT5cXG4ke3RoZW1lQ1NTKG9wdGlvbnMudGhlbWUpfVxcbjwvc3R5bGU+YClcclxuXHJcbiAgY29uc3QgdGhlbWVkID0gdGhlbWVBdHRyaWJ1dGVzKG9wdGlvbnMudGhlbWUpXHJcbiAgY29uc3QgYm9keTogc3RyaW5nW10gPSBbXHJcbiAgICAvLyBgLnRyZXZpeGFsYCBhbmQgYC50cmV2aXhhbC1jb250ZW50YCBhcmUgd2hhdCB0aGUgc3R5bGVzaGVldCB0YXJnZXRzLCBzb1xyXG4gICAgLy8gdGhlIGV4cG9ydGVkIHBhZ2UgaGFzIHRvIHJlcHJvZHVjZSB0aGF0IHN0cnVjdHVyZSB0byBiZSBzdHlsZWQgYXQgYWxsLlxyXG4gICAgYDxkaXYgY2xhc3M9XCJ0cmV2aXhhbFwiJHt0aGVtZWR9PmAsXHJcbiAgICAnPGRpdiBjbGFzcz1cInRyZXZpeGFsLWNvbnRlbnRcIj4nLFxyXG4gICAgc2VyaWFsaXplVG9IVE1MKGRvYywgeyByZW5kZXJOb2RlOiBvcHRpb25zLnJlbmRlck5vZGUgfSksXHJcbiAgICAnPC9kaXY+JyxcclxuICAgICc8L2Rpdj4nLFxyXG4gIF1cclxuXHJcbiAgZm9yIChjb25zdCBzcmMgb2Ygb3B0aW9ucy5zY3JpcHRzID8/IFtdKSB7XHJcbiAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVVUkwoc3JjLCBiYXNlKVxyXG4gICAgaWYgKHJlc29sdmVkKSBib2R5LnB1c2goYDxzY3JpcHQgc3JjPVwiJHtlc2NhcGVBdHRyaWJ1dGUocmVzb2x2ZWQpfVwiPjwvc2NyaXB0PmApXHJcbiAgfVxyXG5cclxuICBpZiAob3B0aW9ucy5pbmxpbmVKUykge1xyXG4gICAgYm9keS5wdXNoKGA8c2NyaXB0PlxcbiR7b3B0aW9ucy5pbmxpbmVKUy5yZXBsYWNlKC88XFwvc2NyaXB0Pi9naSwgJzxcXFxcL3NjcmlwdD4nKX1cXG48L3NjcmlwdD5gKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIFtcclxuICAgICc8IWRvY3R5cGUgaHRtbD4nLFxyXG4gICAgYDxodG1sIGxhbmc9XCIke2VzY2FwZUF0dHJpYnV0ZShvcHRpb25zLmxhbmcgPz8gJ2VuJyl9XCIke3RoZW1lZH0+YCxcclxuICAgICc8aGVhZD4nLFxyXG4gICAgLi4uaGVhZCxcclxuICAgICc8L2hlYWQ+JyxcclxuICAgICc8Ym9keT4nLFxyXG4gICAgLi4uYm9keSxcclxuICAgICc8L2JvZHk+JyxcclxuICAgICc8L2h0bWw+JyxcclxuICAgICcnLFxyXG4gIF0uam9pbignXFxuJylcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBGcmFnbWVudCB9IGZyb20gJy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgdHlwZSB7IE1hcmsgfSBmcm9tICcuLi9tb2RlbC9tYXJrJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUsIFRleHROb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTWFya2Rvd25TZXJpYWxpemVPcHRpb25zIHtcclxuICAvKiogQnVsbGV0IG1hcmtlciBmb3IgdW5vcmRlcmVkIGxpc3RzOyBgXCItXCJgIGJ5IGRlZmF1bHQuICovXHJcbiAgcmVhZG9ubHkgYnVsbGV0PzogJy0nIHwgJyonIHwgJysnXHJcbiAgLyoqIEVtcGhhc2lzIGRlbGltaXRlciBmb3IgaXRhbGljczsgYFwiX1wiYCBieSBkZWZhdWx0LiAqL1xyXG4gIHJlYWRvbmx5IGVtcGhhc2lzPzogJ18nIHwgJyonXHJcbiAgLyoqXHJcbiAgICogTm9kZSBuYW1lcyB0byB0cmVhdCBhcyB0YWJsZXMsIHJvd3MgYW5kIGNlbGxzIHdoZW4gYSB0YWJsZSBleHRlbnNpb24gaXNcclxuICAgKiBsb2FkZWQuIERlZmF1bHRzIG1hdGNoIGBAdHJldml4YWwvZXh0ZW5zaW9uLXRhYmxlYC5cclxuICAgKi9cclxuICByZWFkb25seSB0YWJsZU5hbWVzPzoge1xyXG4gICAgcmVhZG9ubHkgdGFibGU/OiBzdHJpbmdcclxuICAgIHJlYWRvbmx5IHJvdz86IHN0cmluZ1xyXG4gICAgcmVhZG9ubHkgY2VsbD86IHN0cmluZ1xyXG4gIH1cclxufVxyXG5cclxuaW50ZXJmYWNlIFJlc29sdmVkIHtcclxuICByZWFkb25seSBidWxsZXQ6IHN0cmluZ1xyXG4gIHJlYWRvbmx5IGVtcGhhc2lzOiBzdHJpbmdcclxuICByZWFkb25seSB0YWJsZTogc3RyaW5nXHJcbiAgcmVhZG9ubHkgcm93OiBzdHJpbmdcclxuICByZWFkb25seSBjZWxsOiBzdHJpbmdcclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcmtkb3duIChHRk0pIGV4cG9ydC4gQ292ZXJzIGV2ZXJ5dGhpbmcgdGhlIGRlZmF1bHQgc2NoZW1hIGNhbiBob2xkLCBwbHVzXHJcbiAqIHRhYmxlcyBhbmQgaW1hZ2VzIGZyb20gdGhlIGJ1bmRsZWQgZXh0ZW5zaW9ucyB3aGVuIHRob3NlIG5vZGVzIGFyZSBwcmVzZW50LlxyXG4gKlxyXG4gKiBVbmtub3duIGJsb2NrIHR5cGVzIGRlZ3JhZGUgdG8gdGhlaXIgdGV4dCBjb250ZW50IHJhdGhlciB0aGFuIGJlaW5nXHJcbiAqIGRyb3BwZWQsIHNvIGEgc2NoZW1hIHdpdGggY3VzdG9tIG5vZGVzIHN0aWxsIHJvdW5kLXRyaXBzIGl0cyBwcm9zZS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVUb01hcmtkb3duKFxyXG4gIGRvYzogRWRpdG9yTm9kZSxcclxuICBvcHRpb25zOiBNYXJrZG93blNlcmlhbGl6ZU9wdGlvbnMgPSB7fSxcclxuKTogc3RyaW5nIHtcclxuICBjb25zdCBjb25maWc6IFJlc29sdmVkID0ge1xyXG4gICAgYnVsbGV0OiBvcHRpb25zLmJ1bGxldCA/PyAnLScsXHJcbiAgICBlbXBoYXNpczogb3B0aW9ucy5lbXBoYXNpcyA/PyAnXycsXHJcbiAgICB0YWJsZTogb3B0aW9ucy50YWJsZU5hbWVzPy50YWJsZSA/PyAndGFibGUnLFxyXG4gICAgcm93OiBvcHRpb25zLnRhYmxlTmFtZXM/LnJvdyA/PyAndGFibGVSb3cnLFxyXG4gICAgY2VsbDogb3B0aW9ucy50YWJsZU5hbWVzPy5jZWxsID8/ICd0YWJsZUNlbGwnLFxyXG4gIH1cclxuICBjb25zdCBibG9ja3MgPSBkb2MuY29udGVudC5jaGlsZHJlbi5tYXAoKGNoaWxkKSA9PiBzZXJpYWxpemVCbG9jayhjaGlsZCwgY29uZmlnLCAnJykpXHJcbiAgLy8gQSB0cmFpbGluZyBuZXdsaW5lIGlzIGNvbnZlbnRpb25hbCBhbmQgbWFrZXMgdGhlIG91dHB1dCBkaWZmLWZyaWVuZGx5LlxyXG4gIHJldHVybiBgJHtibG9ja3MuZmlsdGVyKChibG9jaykgPT4gYmxvY2sgIT09IG51bGwpLmpvaW4oJ1xcblxcbicpfVxcbmBcclxufVxyXG5cclxuLyoqXHJcbiAqIE9uZSBibG9jaywgYWxyZWFkeSBpbmRlbnRlZCBmb3IgaXRzIG5lc3RpbmcgbGV2ZWwuIGBpbmRlbnRgIGlzIHRoZSBwcmVmaXhcclxuICogZXZlcnkgbGluZSBhZnRlciB0aGUgZmlyc3QgbXVzdCBjYXJyeS4gVGhhdCBpcyB3aGF0IGtlZXBzIG5lc3RlZCBsaXN0XHJcbiAqIGNvbnRlbnQgYXR0YWNoZWQgdG8gaXRzIGl0ZW0uXHJcbiAqL1xyXG5mdW5jdGlvbiBzZXJpYWxpemVCbG9jayhub2RlOiBFZGl0b3JOb2RlLCBjb25maWc6IFJlc29sdmVkLCBpbmRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgc3dpdGNoIChub2RlLnR5cGUubmFtZSkge1xyXG4gICAgY2FzZSAncGFyYWdyYXBoJzpcclxuICAgICAgcmV0dXJuIGluZGVudCArIHNlcmlhbGl6ZUlubGluZShub2RlLmNvbnRlbnQsIGNvbmZpZylcclxuICAgIGNhc2UgJ2hlYWRpbmcnOiB7XHJcbiAgICAgIGNvbnN0IGxldmVsID0gTWF0aC5taW4oNiwgTWF0aC5tYXgoMSwgTnVtYmVyKG5vZGUuYXR0cnMubGV2ZWwpIHx8IDEpKVxyXG4gICAgICByZXR1cm4gYCR7aW5kZW50fSR7JyMnLnJlcGVhdChsZXZlbCl9ICR7c2VyaWFsaXplSW5saW5lKG5vZGUuY29udGVudCwgY29uZmlnKX1gXHJcbiAgICB9XHJcbiAgICBjYXNlICdjb2RlQmxvY2snOiB7XHJcbiAgICAgIGNvbnN0IGxhbmd1YWdlID0gdHlwZW9mIG5vZGUuYXR0cnMubGFuZ3VhZ2UgPT09ICdzdHJpbmcnID8gbm9kZS5hdHRycy5sYW5ndWFnZSA6ICcnXHJcbiAgICAgIGNvbnN0IGJvZHkgPSBub2RlLnRleHRDb250ZW50XHJcbiAgICAgIC8vIEEgZmVuY2UgbXVzdCBiZSBsb25nZXIgdGhhbiB0aGUgbG9uZ2VzdCBiYWNrdGljayBydW4gaW5zaWRlIGl0LCBvciB0aGVcclxuICAgICAgLy8gY29kZSBjbG9zZXMgdGhlIGJsb2NrIGVhcmx5LlxyXG4gICAgICBjb25zdCBmZW5jZSA9ICdgJy5yZXBlYXQoTWF0aC5tYXgoMywgbG9uZ2VzdEJhY2t0aWNrUnVuKGJvZHkpICsgMSkpXHJcbiAgICAgIGNvbnN0IGxpbmVzID0gYm9keS5sZW5ndGggPiAwID8gYm9keS5zcGxpdCgnXFxuJykgOiBbJyddXHJcbiAgICAgIHJldHVybiBbXHJcbiAgICAgICAgYCR7aW5kZW50fSR7ZmVuY2V9JHtsYW5ndWFnZX1gLFxyXG4gICAgICAgIC4uLmxpbmVzLm1hcCgobGluZSkgPT4gaW5kZW50ICsgbGluZSksXHJcbiAgICAgICAgYCR7aW5kZW50fSR7ZmVuY2V9YCxcclxuICAgICAgXS5qb2luKCdcXG4nKVxyXG4gICAgfVxyXG4gICAgY2FzZSAnYmxvY2txdW90ZSc6IHtcclxuICAgICAgY29uc3QgaW5uZXIgPSBub2RlLmNvbnRlbnQuY2hpbGRyZW5cclxuICAgICAgICAubWFwKChjaGlsZCkgPT4gc2VyaWFsaXplQmxvY2soY2hpbGQsIGNvbmZpZywgJycpKVxyXG4gICAgICAgIC5qb2luKCdcXG5cXG4nKVxyXG4gICAgICByZXR1cm4gcHJlZml4TGluZXMoaW5uZXIsIGAke2luZGVudH0+IGApXHJcbiAgICB9XHJcbiAgICBjYXNlICdob3Jpem9udGFsUnVsZSc6XHJcbiAgICAgIHJldHVybiBgJHtpbmRlbnR9LS0tYFxyXG4gICAgY2FzZSAnYnVsbGV0TGlzdCc6XHJcbiAgICAvLyBBIHRhc2sgbGlzdCBpcyBhIGJ1bGxldCBsaXN0IHdob3NlIGl0ZW1zIGVhY2ggY2FycnkgYSBjaGVja2JveDsgdGhlXHJcbiAgICAvLyBgdGFza01hcmtlcmAgYmVsb3cgdHVybnMgZWFjaCBpdGVtJ3MgYGNoZWNrZWRgIGF0dHIgaW50byBgWyBdYC9gW3hdYC5cclxuICAgIGNhc2UgJ3Rhc2tMaXN0JzpcclxuICAgICAgcmV0dXJuIHNlcmlhbGl6ZUxpc3Qobm9kZSwgY29uZmlnLCBpbmRlbnQsIG51bGwpXHJcbiAgICBjYXNlICdvcmRlcmVkTGlzdCc6IHtcclxuICAgICAgY29uc3Qgc3RhcnQgPSB0eXBlb2Ygbm9kZS5hdHRycy5zdGFydCA9PT0gJ251bWJlcicgPyBub2RlLmF0dHJzLnN0YXJ0IDogMVxyXG4gICAgICByZXR1cm4gc2VyaWFsaXplTGlzdChub2RlLCBjb25maWcsIGluZGVudCwgc3RhcnQpXHJcbiAgICB9XHJcbiAgICBkZWZhdWx0OlxyXG4gICAgICBpZiAobm9kZS50eXBlLm5hbWUgPT09IGNvbmZpZy50YWJsZSkgcmV0dXJuIHNlcmlhbGl6ZVRhYmxlKG5vZGUsIGNvbmZpZywgaW5kZW50KVxyXG4gICAgICBpZiAobm9kZS5pc1RleHRibG9jaykgcmV0dXJuIGluZGVudCArIHNlcmlhbGl6ZUlubGluZShub2RlLmNvbnRlbnQsIGNvbmZpZylcclxuICAgICAgLy8gVW5rbm93biBjb250YWluZXI6IGVtaXQgaXRzIGJsb2NrcyBzbyBub3RoaW5nIGlzIHNpbGVudGx5IGxvc3QuXHJcbiAgICAgIHJldHVybiBub2RlLmNvbnRlbnQuY2hpbGRyZW5cclxuICAgICAgICAubWFwKChjaGlsZCkgPT4gc2VyaWFsaXplQmxvY2soY2hpbGQsIGNvbmZpZywgaW5kZW50KSlcclxuICAgICAgICAuam9pbignXFxuXFxuJylcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNlcmlhbGl6ZUxpc3QoXHJcbiAgbGlzdDogRWRpdG9yTm9kZSxcclxuICBjb25maWc6IFJlc29sdmVkLFxyXG4gIGluZGVudDogc3RyaW5nLFxyXG4gIHN0YXJ0OiBudW1iZXIgfCBudWxsLFxyXG4pOiBzdHJpbmcge1xyXG4gIGNvbnN0IGl0ZW1zOiBzdHJpbmdbXSA9IFtdXHJcbiAgbGV0IGNvdW50ZXIgPSBzdGFydCA/PyAwXHJcbiAgZm9yIChjb25zdCBpdGVtIG9mIGxpc3QuY29udGVudC5jaGlsZHJlbikge1xyXG4gICAgY29uc3QgbWFya2VyID0gc3RhcnQgPT09IG51bGwgPyBgJHtjb25maWcuYnVsbGV0fSBgIDogYCR7Y291bnRlcisrfS4gYFxyXG4gICAgLy8gQ29udGludWF0aW9uIGxpbmVzIGFsaWduIHVuZGVyIHRoZSBtYXJrZXIsIHdoaWNoIGlzIHdoYXQgbWFrZXMgYSBuZXN0ZWRcclxuICAgIC8vIGxpc3QgYSBjaGlsZCBvZiB0aGlzIGl0ZW0gcmF0aGVyIHRoYW4gYSBzaWJsaW5nIG9mIHRoZSBsaXN0LlxyXG4gICAgY29uc3QgY2hpbGRJbmRlbnQgPSBpbmRlbnQgKyAnICcucmVwZWF0KG1hcmtlci5sZW5ndGgpXHJcbiAgICBjb25zdCB0YXNrID0gdGFza01hcmtlcihpdGVtKVxyXG4gICAgY29uc3QgYmxvY2tzID0gaXRlbS5jb250ZW50LmNoaWxkcmVuLm1hcCgoY2hpbGQsIGluZGV4KSA9PlxyXG4gICAgICBzZXJpYWxpemVCbG9jayhjaGlsZCwgY29uZmlnLCBpbmRleCA9PT0gMCA/ICcnIDogY2hpbGRJbmRlbnQpLFxyXG4gICAgKVxyXG4gICAgY29uc3QgYm9keSA9IGJsb2Nrcy5qb2luKCdcXG5cXG4nKVxyXG4gICAgaXRlbXMucHVzaChpbmRlbnQgKyBtYXJrZXIgKyB0YXNrICsgYm9keS5yZXBsYWNlKC9eLywgJycpKVxyXG4gIH1cclxuICByZXR1cm4gaXRlbXMuam9pbignXFxuJylcclxufVxyXG5cclxuLyoqXHJcbiAqIGBbIF0gYCAvIGBbeF0gYCBmb3IgYSB0YXNrIGl0ZW0sIGVsc2Ugbm90aGluZy4gS2V5ZWQgb24gdGhlIG5vZGUgdHlwZVxyXG4gKiByYXRoZXIgdGhhbiB0aGUgbWVyZSBwcmVzZW5jZSBvZiBhIGBjaGVja2VkYCBhdHRyLCBzbyBhbiBvcmRpbmFyeSBsaXN0XHJcbiAqIGl0ZW0gdGhhdCBoYXBwZW5zIHRvIGNhcnJ5IG9uZSBpcyBub3QgdHVybmVkIGludG8gYSBjaGVja2JveC5cclxuICovXHJcbmZ1bmN0aW9uIHRhc2tNYXJrZXIoaXRlbTogRWRpdG9yTm9kZSk6IHN0cmluZyB7XHJcbiAgaWYgKGl0ZW0udHlwZS5uYW1lICE9PSAndGFza0l0ZW0nKSByZXR1cm4gJydcclxuICByZXR1cm4gaXRlbS5hdHRycy5jaGVja2VkID09PSB0cnVlID8gJ1t4XSAnIDogJ1sgXSAnXHJcbn1cclxuXHJcbi8qKiBBIEdGTSBwaXBlIHRhYmxlLiBBbGlnbm1lbnQgY29tZXMgZnJvbSB0aGUgZmlyc3Qgcm93J3MgY2VsbCBhdHRycy4gKi9cclxuZnVuY3Rpb24gc2VyaWFsaXplVGFibGUodGFibGU6IEVkaXRvck5vZGUsIGNvbmZpZzogUmVzb2x2ZWQsIGluZGVudDogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCByb3dzID0gdGFibGUuY29udGVudC5jaGlsZHJlbi5maWx0ZXIoKHJvdykgPT4gcm93LnR5cGUubmFtZSA9PT0gY29uZmlnLnJvdylcclxuICBpZiAocm93cy5sZW5ndGggPT09IDApIHJldHVybiAnJ1xyXG4gIGNvbnN0IGNlbGxzT2YgPSAocm93OiBFZGl0b3JOb2RlKTogRWRpdG9yTm9kZVtdID0+XHJcbiAgICByb3cuY29udGVudC5jaGlsZHJlbi5maWx0ZXIoKGNlbGwpID0+IGNlbGwudHlwZS5uYW1lID09PSBjb25maWcuY2VsbClcclxuXHJcbiAgY29uc3QgY29sdW1ucyA9IE1hdGgubWF4KC4uLnJvd3MubWFwKChyb3cpID0+IGNlbGxzT2Yocm93KS5sZW5ndGgpKVxyXG4gIGNvbnN0IHJlbmRlclJvdyA9IChyb3c6IEVkaXRvck5vZGUpOiBzdHJpbmcgPT4ge1xyXG4gICAgY29uc3QgY2VsbHMgPSBjZWxsc09mKHJvdylcclxuICAgIGNvbnN0IHJlbmRlcmVkOiBzdHJpbmdbXSA9IFtdXHJcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY29sdW1uczsgaW5kZXgrKykge1xyXG4gICAgICBjb25zdCBjZWxsID0gY2VsbHNbaW5kZXhdXHJcbiAgICAgIHJlbmRlcmVkLnB1c2goY2VsbCA/IGNlbGxUZXh0KGNlbGwsIGNvbmZpZykgOiAnJylcclxuICAgIH1cclxuICAgIHJldHVybiBgJHtpbmRlbnR9fCAke3JlbmRlcmVkLmpvaW4oJyB8ICcpfSB8YFxyXG4gIH1cclxuXHJcbiAgY29uc3QgZmlyc3QgPSByb3dzWzBdIGFzIEVkaXRvck5vZGVcclxuICBjb25zdCBoZWFkZXJDZWxscyA9IGNlbGxzT2YoZmlyc3QpXHJcbiAgLy8gT25lIGRlbGltaXRlciBwZXIgY29sdW1uLCB0YWtpbmcgaXRzIGFsaWdubWVudCBmcm9tIHRoZSBoZWFkZXIgY2VsbCAtLVxyXG4gIC8vIGEgc2hvcnQgaGVhZGVyIHJvdyBzdGlsbCBuZWVkcyBhIHJ1bGUgZm9yIGV2ZXJ5IGNvbHVtbi5cclxuICBjb25zdCBkZWxpbWl0ZXIgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBjb2x1bW5zIH0sIChfdW51c2VkLCBpbmRleCkgPT5cclxuICAgIGFsaWdubWVudFJ1bGUoaGVhZGVyQ2VsbHNbaW5kZXhdPy5hdHRycy5hbGlnbiksXHJcbiAgKVxyXG4gIGNvbnN0IGxpbmVzID0gW3JlbmRlclJvdyhmaXJzdCksIGAke2luZGVudH18ICR7ZGVsaW1pdGVyLmpvaW4oJyB8ICcpfSB8YF1cclxuICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzLnNsaWNlKDEpKSBsaW5lcy5wdXNoKHJlbmRlclJvdyhyb3cpKVxyXG4gIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKVxyXG59XHJcblxyXG5mdW5jdGlvbiBhbGlnbm1lbnRSdWxlKGFsaWduOiB1bmtub3duKTogc3RyaW5nIHtcclxuICBpZiAoYWxpZ24gPT09ICdsZWZ0JykgcmV0dXJuICc6LS0tJ1xyXG4gIGlmIChhbGlnbiA9PT0gJ2NlbnRlcicpIHJldHVybiAnOi0tLTonXHJcbiAgaWYgKGFsaWduID09PSAncmlnaHQnKSByZXR1cm4gJy0tLTonXHJcbiAgcmV0dXJuICctLS0nXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIGNlbGwncyBjb250ZW50IGZsYXR0ZW5lZCB0byBvbmUgbGluZTogYSBwaXBlIHRhYmxlIGhhcyBubyB3YXkgdG8gZXhwcmVzc1xyXG4gKiBhIGJsb2NrIGJyZWFrLCBzbyBwYXJhZ3JhcGhzIGpvaW4gd2l0aCBhIHNwYWNlIGFuZCBwaXBlcyBhcmUgZXNjYXBlZC5cclxuICovXHJcbmZ1bmN0aW9uIGNlbGxUZXh0KGNlbGw6IEVkaXRvck5vZGUsIGNvbmZpZzogUmVzb2x2ZWQpOiBzdHJpbmcge1xyXG4gIHJldHVybiBjZWxsLmNvbnRlbnQuY2hpbGRyZW5cclxuICAgIC5tYXAoKGJsb2NrKSA9PiBzZXJpYWxpemVJbmxpbmUoYmxvY2suY29udGVudCwgY29uZmlnKSlcclxuICAgIC5qb2luKCcgJylcclxuICAgIC5yZXBsYWNlQWxsKCd8JywgJ1xcXFx8JylcclxuICAgIC50cmltKClcclxufVxyXG5cclxuLyoqIElubGluZSBjb250ZW50OiB0ZXh0IHdpdGggbWFya3MsIGhhcmQgYnJlYWtzLCBpbWFnZXMgYW5kIGlubGluZSBhdG9tcy4gKi9cclxuZnVuY3Rpb24gc2VyaWFsaXplSW5saW5lKGNvbnRlbnQ6IEZyYWdtZW50LCBjb25maWc6IFJlc29sdmVkKTogc3RyaW5nIHtcclxuICBsZXQgb3V0ID0gJydcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNvbnRlbnQuY2hpbGRyZW4pIHtcclxuICAgIGlmIChjaGlsZC5pc1RleHQpIHtcclxuICAgICAgb3V0ICs9IGFwcGx5TWFya3MoZXNjYXBlTWFya2Rvd24oKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0KSwgY2hpbGQubWFya3MsIGNvbmZpZylcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGlmIChjaGlsZC50eXBlLm5hbWUgPT09ICdoYXJkQnJlYWsnKSB7XHJcbiAgICAgIC8vIFR3byB0cmFpbGluZyBzcGFjZXMgaXMgdGhlIG9ubHkgaGFyZCBicmVhayB0aGF0IHN1cnZpdmVzIGEgcm91bmQgdHJpcFxyXG4gICAgICAvLyB0aHJvdWdoIGV2ZXJ5IHBhcnNlcjsgYSBsb25lIGJhY2tzbGFzaCBpcyBub3QgdW5pdmVyc2FsbHkgc3VwcG9ydGVkLlxyXG4gICAgICBvdXQgKz0gJyAgXFxuJ1xyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG4gICAgaWYgKGNoaWxkLnR5cGUubmFtZSA9PT0gJ2ltYWdlJykge1xyXG4gICAgICBvdXQgKz0gc2VyaWFsaXplSW1hZ2UoY2hpbGQpXHJcbiAgICAgIGNvbnRpbnVlXHJcbiAgICB9XHJcbiAgICAvLyBVbmtub3duIGlubGluZSBub2RlOiBmYWxsIGJhY2sgdG8gaXRzIHRleHQsIG9yIGl0cyBvd24gdG9IVE1MIHRleHQgc3BlYy5cclxuICAgIG91dCArPSBlc2NhcGVNYXJrZG93bihjaGlsZC50ZXh0Q29udGVudCB8fCBTdHJpbmcoY2hpbGQudHlwZS5zcGVjLnRvSFRNTD8uKGNoaWxkKT8udGV4dCA/PyAnJykpXHJcbiAgfVxyXG4gIHJldHVybiBvdXRcclxufVxyXG5cclxuZnVuY3Rpb24gc2VyaWFsaXplSW1hZ2Uobm9kZTogRWRpdG9yTm9kZSk6IHN0cmluZyB7XHJcbiAgY29uc3Qgc3JjID0gdHlwZW9mIG5vZGUuYXR0cnMuc3JjID09PSAnc3RyaW5nJyA/IG5vZGUuYXR0cnMuc3JjIDogJydcclxuICBjb25zdCBhbHQgPSB0eXBlb2Ygbm9kZS5hdHRycy5hbHQgPT09ICdzdHJpbmcnID8gbm9kZS5hdHRycy5hbHQgOiAnJ1xyXG4gIGNvbnN0IHRpdGxlID0gdHlwZW9mIG5vZGUuYXR0cnMudGl0bGUgPT09ICdzdHJpbmcnID8gbm9kZS5hdHRycy50aXRsZSA6ICcnXHJcbiAgY29uc3Qgc3VmZml4ID0gdGl0bGUgPyBgIFwiJHt0aXRsZS5yZXBsYWNlQWxsKCdcIicsICdcXFxcXCInKX1cImAgOiAnJ1xyXG4gIHJldHVybiBgIVske2VzY2FwZUxpbmtUZXh0KGFsdCl9XSgke2VuY29kZURlc3RpbmF0aW9uKHNyYyl9JHtzdWZmaXh9KWBcclxufVxyXG5cclxuLyoqXHJcbiAqIFdyYXAgdGV4dCBpbiBlYWNoIG9mIGl0cyBtYXJrcywgaW5uZXJtb3N0IGZpcnN0IHNvIHRoZSBmaXJzdCBtYXJrIGluIHRoZVxyXG4gKiBzZXQgZW5kcyB1cCBvdXRlcm1vc3QsIG1hdGNoaW5nIHRoZSBIVE1MIHNlcmlhbGl6ZXIncyBvcmRlcmluZy5cclxuICovXHJcbmZ1bmN0aW9uIGFwcGx5TWFya3ModGV4dDogc3RyaW5nLCBtYXJrczogcmVhZG9ubHkgTWFya1tdLCBjb25maWc6IFJlc29sdmVkKTogc3RyaW5nIHtcclxuICBpZiAobWFya3MubGVuZ3RoID09PSAwKSByZXR1cm4gdGV4dFxyXG4gIGxldCBvdXQgPSB0ZXh0XHJcbiAgLy8gYGNvZGVgIG11c3QgYmUgYXBwbGllZCBmaXJzdCBhbmQgc3VwcHJlc3NlcyB0aGUgZXNjYXBpbmcgb2YgZXZlcnl0aGluZ1xyXG4gIC8vIGluc2lkZSBpdCwgc28gaGFuZGxlIGl0IGJlZm9yZSB0aGUgd3JhcHBpbmcgbWFya3MuXHJcbiAgY29uc3QgY29kZU1hcmsgPSBtYXJrcy5maW5kKChtYXJrKSA9PiBtYXJrLnR5cGUubmFtZSA9PT0gJ2NvZGUnKVxyXG4gIGlmIChjb2RlTWFyaykgb3V0ID0gd3JhcENvZGUodW5lc2NhcGVNYXJrZG93bihvdXQpKVxyXG4gIGZvciAobGV0IGluZGV4ID0gbWFya3MubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xyXG4gICAgY29uc3QgbWFyayA9IG1hcmtzW2luZGV4XSBhcyBNYXJrXHJcbiAgICBzd2l0Y2ggKG1hcmsudHlwZS5uYW1lKSB7XHJcbiAgICAgIGNhc2UgJ2JvbGQnOlxyXG4gICAgICAgIG91dCA9IGAqKiR7b3V0fSoqYFxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2l0YWxpYyc6XHJcbiAgICAgICAgb3V0ID0gYCR7Y29uZmlnLmVtcGhhc2lzfSR7b3V0fSR7Y29uZmlnLmVtcGhhc2lzfWBcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdzdHJpa2V0aHJvdWdoJzpcclxuICAgICAgICBvdXQgPSBgfn4ke291dH1+fmBcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdsaW5rJzoge1xyXG4gICAgICAgIGNvbnN0IGhyZWYgPSB0eXBlb2YgbWFyay5hdHRycy5ocmVmID09PSAnc3RyaW5nJyA/IG1hcmsuYXR0cnMuaHJlZiA6ICcnXHJcbiAgICAgICAgY29uc3QgdGl0bGUgPSB0eXBlb2YgbWFyay5hdHRycy50aXRsZSA9PT0gJ3N0cmluZycgPyBtYXJrLmF0dHJzLnRpdGxlIDogJydcclxuICAgICAgICBjb25zdCBzdWZmaXggPSB0aXRsZSA/IGAgXCIke3RpdGxlLnJlcGxhY2VBbGwoJ1wiJywgJ1xcXFxcIicpfVwiYCA6ICcnXHJcbiAgICAgICAgb3V0ID0gYFske291dH1dKCR7ZW5jb2RlRGVzdGluYXRpb24oaHJlZil9JHtzdWZmaXh9KWBcclxuICAgICAgICBicmVha1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGNvZGUgaXMgaGFuZGxlZCBhYm92ZTsgdGhlIHJlc3QgKHVuZGVybGluZSwgaGlnaGxpZ2h0LCBjb2xvcnMsIOKApilcclxuICAgICAgLy8gaGF2ZSBubyBtYXJrZG93biBlcXVpdmFsZW50IGFuZCBwYXNzIHRocm91Z2ggYXMgcGxhaW4gdGV4dC5cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICBicmVha1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gb3V0XHJcbn1cclxuXHJcbi8qKiBJbmxpbmUgY29kZSBuZWVkcyBhIGJhY2t0aWNrIHJ1biBsb25nZXIgdGhhbiBhbnkgaW5zaWRlIHRoZSB0ZXh0LiAqL1xyXG5mdW5jdGlvbiB3cmFwQ29kZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGZlbmNlID0gJ2AnLnJlcGVhdChsb25nZXN0QmFja3RpY2tSdW4odGV4dCkgKyAxKVxyXG4gIC8vIEEgbGVhZGluZy90cmFpbGluZyBiYWNrdGljayBvciBzcGFjZSBuZWVkcyBwYWRkaW5nLCBwZXIgQ29tbW9uTWFyay5cclxuICBjb25zdCBwYWQgPSB0ZXh0LnN0YXJ0c1dpdGgoJ2AnKSB8fCB0ZXh0LmVuZHNXaXRoKCdgJykgfHwgdGV4dC50cmltKCkgIT09IHRleHQgPyAnICcgOiAnJ1xyXG4gIHJldHVybiBgJHtmZW5jZX0ke3BhZH0ke3RleHR9JHtwYWR9JHtmZW5jZX1gXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvbmdlc3RCYWNrdGlja1J1bih0ZXh0OiBzdHJpbmcpOiBudW1iZXIge1xyXG4gIGxldCBsb25nZXN0ID0gMFxyXG4gIGxldCBydW4gPSAwXHJcbiAgZm9yIChjb25zdCBjaGFyIG9mIHRleHQpIHtcclxuICAgIGlmIChjaGFyID09PSAnYCcpIHtcclxuICAgICAgcnVuICs9IDFcclxuICAgICAgaWYgKHJ1biA+IGxvbmdlc3QpIGxvbmdlc3QgPSBydW5cclxuICAgIH0gZWxzZSBydW4gPSAwXHJcbiAgfVxyXG4gIHJldHVybiBsb25nZXN0XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDaGFyYWN0ZXJzIHRoYXQgYmVnaW4gbWFya2Rvd24gY29uc3RydWN0cy4gRXNjYXBpbmcgdGhlc2Ugb24gdGhlIHdheSBvdXQgaXNcclxuICogd2hhdCBtYWtlcyBhIHBhcmFncmFwaCByZWFkaW5nIGAqbm90IGVtcGhhc2lzKmAgY29tZSBiYWNrIGFzIHRoYXQgbGl0ZXJhbFxyXG4gKiB0ZXh0IGluc3RlYWQgb2YgYXMgZW1waGFzaXMuIFRoZSBjZW50cmFsIHJvdW5kLXRyaXAgY29ycmVjdG5lc3MgcnVsZS5cclxuICovXHJcbmNvbnN0IElOTElORV9TUEVDSUFMUyA9IC9bXFxcXGAqX1tcXF08PiZ+fCRdL2dcclxuXHJcbi8qKiBDb25zdHJ1Y3RzIHRoYXQgb25seSBtZWFuIHNvbWV0aGluZyBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lLiAqL1xyXG5jb25zdCBMSU5FX0xFQURFUlMgPSAvXihcXHMqKSgjezEsNn1cXHN8Wy0qK11cXHN8Pnw9ezIsfVxccyokfC17Mix9XFxzKiQpL1xyXG4vKiogQW4gb3JkZXJlZC1pdGVtIG1hcmtlcjogdGhlIGRpZ2l0cyBhcmUgbGl0ZXJhbCwgdGhlIGRlbGltaXRlciBpcyBtYXJrdXAuICovXHJcbmNvbnN0IE9SREVSRURfTEVBREVSID0gL14oXFxzKikoXFxkezEsOX0pKFsuKV1cXHMpL1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZU1hcmtkb3duKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgbGV0IGVzY2FwZWQgPSB0ZXh0LnJlcGxhY2UoSU5MSU5FX1NQRUNJQUxTLCAoY2hhcikgPT4gYFxcXFwke2NoYXJ9YClcclxuICAvLyBgIyBgIGFuZCBgLSBgIGFyZSBtYXJrdXAgb25seSBpbiBsZWFkaW5nIHBvc2l0aW9uOyBlc2NhcGUganVzdCB0aGUgbWFya2VyXHJcbiAgLy8gc28gdGhlIHJlc3Qgb2YgdGhlIGxpbmUgaXMgbGVmdCByZWFkYWJsZS5cclxuICBlc2NhcGVkID0gZXNjYXBlZC5yZXBsYWNlKExJTkVfTEVBREVSUywgKF9tYXRjaCwgc3BhY2U6IHN0cmluZywgbWFya2VyOiBzdHJpbmcpID0+IHtcclxuICAgIHJldHVybiBgJHtzcGFjZX1cXFxcJHttYXJrZXJ9YFxyXG4gIH0pXHJcbiAgLy8gRm9yIFwiMS4gXCIgdGhlIGJhY2tzbGFzaCBtdXN0IHByZWNlZGUgdGhlIGRlbGltaXRlciwgbm90IHRoZSBkaWdpdHM6XHJcbiAgLy8gYSBiYWNrc2xhc2ggYmVmb3JlIGEgZGlnaXQgaXMgbm90IGFuIGVzY2FwZSBhdCBhbGwsIHNvIGl0IHdvdWxkXHJcbiAgLy8gc3Vydml2ZSBpbnRvIHRoZSBvdXRwdXQgYXMgYSBsaXRlcmFsIGJhY2tzbGFzaC5cclxuICBlc2NhcGVkID0gZXNjYXBlZC5yZXBsYWNlKFxyXG4gICAgT1JERVJFRF9MRUFERVIsXHJcbiAgICAoX21hdGNoLCBzcGFjZTogc3RyaW5nLCBkaWdpdHM6IHN0cmluZywgZGVsaW1pdGVyOiBzdHJpbmcpID0+IHtcclxuICAgICAgcmV0dXJuIGAke3NwYWNlfSR7ZGlnaXRzfVxcXFwke2RlbGltaXRlcn1gXHJcbiAgICB9LFxyXG4gIClcclxuICByZXR1cm4gZXNjYXBlZFxyXG59XHJcblxyXG4vKiogVW5kbyB7QGxpbmsgZXNjYXBlTWFya2Rvd259OyB1c2VkIGZvciBjb2RlIHNwYW5zLCB3aGVyZSBub3RoaW5nIGlzIG1hcmt1cC4gKi9cclxuZnVuY3Rpb24gdW5lc2NhcGVNYXJrZG93bih0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIHJldHVybiB0ZXh0LnJlcGxhY2UoL1xcXFwoW1xcXFxgKl9bXFxdPD4mfnwkIysuKT4tXSkvZywgJyQxJylcclxufVxyXG5cclxuLyoqIExpbmsgdGV4dCBtYXkgY29udGFpbiBicmFja2V0czsgdGhleSBtdXN0IHN0YXkgYmFsYW5jZWQtZXNjYXBlZC4gKi9cclxuZnVuY3Rpb24gZXNjYXBlTGlua1RleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gdGV4dC5yZXBsYWNlQWxsKCdcXFxcJywgJ1xcXFxcXFxcJykucmVwbGFjZUFsbCgnWycsICdcXFxcWycpLnJlcGxhY2VBbGwoJ10nLCAnXFxcXF0nKVxyXG59XHJcblxyXG4vKipcclxuICogQSBsaW5rIGRlc3RpbmF0aW9uLiBTcGFjZXMgYW5kIHBhcmVucyB3b3VsZCBlbmQgdGhlIGRlc3RpbmF0aW9uIGVhcmx5LCBzbyBhXHJcbiAqIFVSTCBjb250YWluaW5nIHRoZW0gaXMgd3JhcHBlZCBpbiBhbmdsZSBicmFja2V0cywgYXMgQ29tbW9uTWFyayBhbGxvd3MuXHJcbiAqL1xyXG5mdW5jdGlvbiBlbmNvZGVEZXN0aW5hdGlvbih1cmw6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgaWYgKHVybCA9PT0gJycpIHJldHVybiAnJ1xyXG4gIGlmICgvW1xccygpPD5dLy50ZXN0KHVybCkpIHJldHVybiBgPCR7dXJsLnJlcGxhY2VBbGwoJzwnLCAnJTNDJykucmVwbGFjZUFsbCgnPicsICclM0UnKX0+YFxyXG4gIHJldHVybiB1cmxcclxufVxyXG5cclxuLyoqIFByZWZpeCBldmVyeSBsaW5lIG9mIGEgYmxvY2ssIGtlZXBpbmcgYmxhbmsgbGluZXMgcXVvdGVkIHRvby4gKi9cclxuZnVuY3Rpb24gcHJlZml4TGluZXModGV4dDogc3RyaW5nLCBwcmVmaXg6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHRleHRcclxuICAgIC5zcGxpdCgnXFxuJylcclxuICAgIC5tYXAoKGxpbmUpID0+IChsaW5lLmxlbmd0aCA+IDAgPyBwcmVmaXggKyBsaW5lIDogcHJlZml4LnRyaW1FbmQoKSkpXHJcbiAgICAuam9pbignXFxuJylcclxufVxyXG4iLCAiaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgbWVyZ2VJbmxpbmUgfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgTWFyayB9IGZyb20gJy4uL21vZGVsL21hcmsnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IG5vcm1hbGl6ZURvYyB9IGZyb20gJy4uL21vZGVsL25vcm1hbGl6ZSdcclxuaW1wb3J0IHR5cGUgeyBNYXJrVHlwZSwgTm9kZVR5cGUsIFBhcnNlUnVsZSwgU2NoZW1hIH0gZnJvbSAnLi4vbW9kZWwvc2NoZW1hJ1xyXG5cclxuLyoqXHJcbiAqIFNhbml0aXppbmcgSFRNTCBpbXBvcnQuIFNlY3VyaXR5IG1vZGVsOiBzYW5pdGl6ZS1ieS1jb25zdHJ1Y3Rpb24uIFRoZVxyXG4gKiBwYXJzZXIgb25seSBldmVyICpidWlsZHMgbW9kZWwgbm9kZXMqIGZyb20gYW4gYWxsb3dsaXN0IG9mIHBhcnNlIHJ1bGVzLCBzb1xyXG4gKiBzY3JpcHRzLCBldmVudCBoYW5kbGVycywgdW5rbm93biBlbWJlZHMgYW5kIHN0eWxlcyBjYW4gbmV2ZXIgcmVhY2ggdGhlXHJcbiAqIGRvY3VtZW50LiBEYW5nZXJvdXMgc3VidHJlZXMgYXJlIGRyb3BwZWQgd2hvbGVzYWxlOyB1bmtub3duIGVsZW1lbnRzIGtlZXBcclxuICogdGhlaXIgY29udGVudCBidXQgbG9zZSB0aGVpciBmb3JtYXR0aW5nLiBObyBgaW5uZXJIVE1MYCBpcyBldmVyIHdyaXR0ZW4uXHJcbiAqL1xyXG5cclxuLyoqIEVsZW1lbnRzIHdob3NlIGVudGlyZSBzdWJ0cmVlIGlzIGRpc2NhcmRlZC4gKi9cclxuY29uc3QgREFOR0VST1VTX1RBR1MgPSBuZXcgU2V0KFtcclxuICAnc2NyaXB0JyxcclxuICAnc3R5bGUnLFxyXG4gICdpZnJhbWUnLFxyXG4gICdmcmFtZScsXHJcbiAgJ29iamVjdCcsXHJcbiAgJ2VtYmVkJyxcclxuICAnYXBwbGV0JyxcclxuICAnbGluaycsXHJcbiAgJ21ldGEnLFxyXG4gICdiYXNlJyxcclxuICAnZm9ybScsXHJcbiAgJ2lucHV0JyxcclxuICAnYnV0dG9uJyxcclxuICAnc2VsZWN0JyxcclxuICAndGV4dGFyZWEnLFxyXG4gICdzdmcnLFxyXG4gICdtYXRoJyxcclxuICAndGVtcGxhdGUnLFxyXG4gICd0aXRsZScsXHJcbiAgJ2hlYWQnLFxyXG4gICdub3NjcmlwdCcsXHJcbl0pXHJcblxyXG5pbnRlcmZhY2UgUnVsZU1hdGNoPFQ+IHtcclxuICByZWFkb25seSBvd25lcjogVFxyXG4gIHJlYWRvbmx5IHJ1bGU6IFBhcnNlUnVsZVxyXG59XHJcblxyXG5jbGFzcyBSdWxlU2V0PFQ+IHtcclxuICBwcml2YXRlIGJ5VGFnID0gbmV3IE1hcDxzdHJpbmcsIFJ1bGVNYXRjaDxUPltdPigpXHJcblxyXG4gIGFkZChvd25lcjogVCwgcnVsZTogUGFyc2VSdWxlKTogdm9pZCB7XHJcbiAgICBjb25zdCBsaXN0ID0gdGhpcy5ieVRhZy5nZXQocnVsZS50YWcpID8/IFtdXHJcbiAgICAvLyBBdHRyaWJ1dGUtY29uc3RyYWluZWQgcnVsZXMgYXJlIG1vcmUgc3BlY2lmaWM6IHRyeSB0aGVtIGZpcnN0LlxyXG4gICAgaWYgKHJ1bGUuYXR0cmlidXRlKSBsaXN0LnVuc2hpZnQoeyBvd25lciwgcnVsZSB9KVxyXG4gICAgZWxzZSBsaXN0LnB1c2goeyBvd25lciwgcnVsZSB9KVxyXG4gICAgdGhpcy5ieVRhZy5zZXQocnVsZS50YWcsIGxpc3QpXHJcbiAgfVxyXG5cclxuICAvKiogV2hldGhlciBhbnkgcnVsZSBjbGFpbXMgdGhpcyAobG93ZXJjYXNlKSB0YWcgbmFtZS4gKi9cclxuICBoYXNUYWcodGFnOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmJ5VGFnLmhhcyh0YWcpXHJcbiAgfVxyXG5cclxuICAvKiogRmlyc3QgbWF0Y2hpbmcgcnVsZSBmb3IgYW4gZWxlbWVudCwgd2l0aCByZXNvbHZlZCBhdHRyaWJ1dGVzLiAqL1xyXG4gIG1hdGNoKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogeyBvd25lcjogVDsgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgbnVsbCB9IHwgbnVsbCB7XHJcbiAgICBjb25zdCBsaXN0ID0gdGhpcy5ieVRhZy5nZXQoZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCkpXHJcbiAgICBpZiAoIWxpc3QpIHJldHVybiBudWxsXHJcbiAgICBmb3IgKGNvbnN0IHsgb3duZXIsIHJ1bGUgfSBvZiBsaXN0KSB7XHJcbiAgICAgIGlmIChydWxlLmF0dHJpYnV0ZSAmJiAhZWxlbWVudC5oYXNBdHRyaWJ1dGUocnVsZS5hdHRyaWJ1dGUpKSBjb250aW51ZVxyXG4gICAgICBpZiAoIXJ1bGUuZ2V0QXR0cnMpIHJldHVybiB7IG93bmVyLCBhdHRyczogbnVsbCB9XHJcbiAgICAgIGNvbnN0IGF0dHJzID0gcnVsZS5nZXRBdHRycyhlbGVtZW50KVxyXG4gICAgICBpZiAoYXR0cnMgPT09IGZhbHNlKSBjb250aW51ZVxyXG4gICAgICByZXR1cm4geyBvd25lciwgYXR0cnM6IChhdHRycyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPz8gbnVsbCB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbFxyXG4gIH1cclxufVxyXG5cclxuY2xhc3MgSFRNTFBhcnNlciB7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBub2RlUnVsZXMgPSBuZXcgUnVsZVNldDxOb2RlVHlwZT4oKVxyXG4gIHByaXZhdGUgcmVhZG9ubHkgbWFya1J1bGVzID0gbmV3IFJ1bGVTZXQ8TWFya1R5cGU+KClcclxuXHJcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzY2hlbWE6IFNjaGVtYSkge1xyXG4gICAgZm9yIChjb25zdCB0eXBlIG9mIE9iamVjdC52YWx1ZXMoc2NoZW1hLm5vZGVzKSkge1xyXG4gICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgdHlwZS5zcGVjLnBhcnNlSFRNTCA/PyBbXSkgdGhpcy5ub2RlUnVsZXMuYWRkKHR5cGUsIHJ1bGUpXHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IHR5cGUgb2YgT2JqZWN0LnZhbHVlcyhzY2hlbWEubWFya3MpKSB7XHJcbiAgICAgIGZvciAoY29uc3QgcnVsZSBvZiB0eXBlLnNwZWMucGFyc2VIVE1MID8/IFtdKSB0aGlzLm1hcmtSdWxlcy5hZGQodHlwZSwgcnVsZSlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHBhcnNlKHJvb3Q6IGdsb2JhbFRoaXMuTm9kZSk6IEVkaXRvck5vZGUge1xyXG4gICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLnBhcnNlQ2hpbGRyZW4ocm9vdCwgW10sIGZhbHNlKVxyXG4gICAgY29uc3QgZG9jID0gdGhpcy5zY2hlbWEudG9wVHlwZS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5mcm9tKGNoaWxkcmVuKSlcclxuICAgIHJldHVybiBub3JtYWxpemVEb2MoZG9jKVxyXG4gIH1cclxuXHJcbiAgLyoqIFBhcnNlIGVsZW1lbnQgY2hpbGRyZW4gaW50byBhIG1peGVkIG5vZGUgbGlzdDsgbm9ybWFsaXphdGlvbiBzb3J0cyBzdHJheXMuICovXHJcbiAgcHJpdmF0ZSBwYXJzZUNoaWxkcmVuKFxyXG4gICAgcGFyZW50OiBnbG9iYWxUaGlzLk5vZGUsXHJcbiAgICBtYXJrczogcmVhZG9ubHkgTWFya1tdLFxyXG4gICAgaW5saW5lQ29udGV4dDogYm9vbGVhbixcclxuICApOiBFZGl0b3JOb2RlW10ge1xyXG4gICAgY29uc3Qgb3V0OiBFZGl0b3JOb2RlW10gPSBbXVxyXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4ucGFyZW50LmNoaWxkTm9kZXNdKSB7XHJcbiAgICAgIG91dC5wdXNoKC4uLnRoaXMucGFyc2VOb2RlKGNoaWxkLCBtYXJrcywgaW5saW5lQ29udGV4dCkpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gb3V0XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHBhcnNlTm9kZShcclxuICAgIG5vZGU6IGdsb2JhbFRoaXMuTm9kZSxcclxuICAgIG1hcmtzOiByZWFkb25seSBNYXJrW10sXHJcbiAgICBpbmxpbmVDb250ZXh0OiBib29sZWFuLFxyXG4gICk6IEVkaXRvck5vZGVbXSB7XHJcbiAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gMyAvKiBURVhUX05PREUgKi8pIHtcclxuICAgICAgY29uc3QgY29sbGFwc2VkID0gKG5vZGUudGV4dENvbnRlbnQgPz8gJycpLnJlcGxhY2UoL1xccysvZywgJyAnKVxyXG4gICAgICBpZiAoY29sbGFwc2VkID09PSAnJykgcmV0dXJuIFtdXHJcbiAgICAgIGlmIChjb2xsYXBzZWQgPT09ICcgJykge1xyXG4gICAgICAgIC8vIFdoaXRlc3BhY2UgYmV0d2VlbiBibG9ja3MgaXMgbGF5b3V0IG5vaXNlOyBiZXR3ZWVuIGlubGluZSBpdCBjb3VudHMuXHJcbiAgICAgICAgcmV0dXJuIGlubGluZUNvbnRleHQgPyBbdGhpcy5zY2hlbWEudGV4dCgnICcsIG1hcmtzKV0gOiBbXVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBbdGhpcy5zY2hlbWEudGV4dChjb2xsYXBzZWQsIG1hcmtzKV1cclxuICAgIH1cclxuICAgIGlmIChub2RlLm5vZGVUeXBlICE9PSAxIC8qIEVMRU1FTlRfTk9ERSAqLykgcmV0dXJuIFtdXHJcbiAgICBjb25zdCBlbGVtZW50ID0gbm9kZSBhcyBIVE1MRWxlbWVudFxyXG4gICAgY29uc3QgdGFnID0gZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKClcclxuICAgIC8vIEEgc2NoZW1hIHRoYXQgZGVjbGFyZXMgYSBwYXJzZSBydWxlIGZvciBvbmUgb2YgdGhlc2UgKGFuIGVtYmVkXHJcbiAgICAvLyBleHRlbnNpb24ncyBpZnJhbWUgb3IgdmlkZW8pIGhhcyBvcHRlZCBpbjsgaXRzIGBnZXRBdHRyc2AgaXMgdGhlblxyXG4gICAgLy8gcmVzcG9uc2libGUgZm9yIHZldHRpbmcgdGhlIHNvdXJjZS4gRXZlcnl0aGluZyBlbHNlIGlzIGRyb3BwZWQgd2hvbGUuXHJcbiAgICBjb25zdCBkYW5nZXJvdXMgPSBEQU5HRVJPVVNfVEFHUy5oYXModGFnKVxyXG4gICAgaWYgKGRhbmdlcm91cyAmJiAhdGhpcy5ub2RlUnVsZXMuaGFzVGFnKHRhZykpIHJldHVybiBbXVxyXG5cclxuICAgIGNvbnN0IG1hcmtNYXRjaCA9IHRoaXMubWFya1J1bGVzLm1hdGNoKGVsZW1lbnQpXHJcbiAgICBpZiAobWFya01hdGNoKSB7XHJcbiAgICAgIGNvbnN0IG1hcmsgPSBtYXJrTWF0Y2gub3duZXIuY3JlYXRlKG1hcmtNYXRjaC5hdHRycyA/PyB1bmRlZmluZWQpXHJcbiAgICAgIHJldHVybiB0aGlzLnBhcnNlQ2hpbGRyZW4oZWxlbWVudCwgbWFyay5hZGRUb1NldChtYXJrcyksIGlubGluZUNvbnRleHQpXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgbm9kZU1hdGNoID0gdGhpcy5ub2RlUnVsZXMubWF0Y2goZWxlbWVudClcclxuICAgIGlmIChub2RlTWF0Y2gpIHtcclxuICAgICAgY29uc3QgdHlwZSA9IG5vZGVNYXRjaC5vd25lclxyXG4gICAgICBjb25zdCBhdHRycyA9IG5vZGVNYXRjaC5hdHRycyA/PyB1bmRlZmluZWRcclxuICAgICAgaWYgKHR5cGUuc3BlYy5wcmVzZXJ2ZVdoaXRlc3BhY2UpIHtcclxuICAgICAgICAvLyBDb2RlIGJsb2NrczogdGFrZSB0aGUgcmF3IHRleHQsIHZlcmJhdGltLlxyXG4gICAgICAgIGNvbnN0IHRleHQgPSBlbGVtZW50LnRleHRDb250ZW50ID8/ICcnXHJcbiAgICAgICAgY29uc3QgY29udGVudCA9IHRleHQgPyBGcmFnbWVudC5vZih0aGlzLnNjaGVtYS50ZXh0KHRleHQpKSA6IEZyYWdtZW50LmVtcHR5XHJcbiAgICAgICAgcmV0dXJuIFt0eXBlLmNyZWF0ZShhdHRycywgY29udGVudCldXHJcbiAgICAgIH1cclxuICAgICAgaWYgKCF0eXBlLnNwZWMuY29udGVudCkge1xyXG4gICAgICAgIHJldHVybiBbdHlwZS5jcmVhdGUoYXR0cnMpXSAvLyBsZWFmIChociwgYnIpXHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgaW5saW5lID0gdHlwZS5pbmxpbmVDb250ZW50XHJcbiAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5wYXJzZUNoaWxkcmVuKGVsZW1lbnQsIGlubGluZSA/IG1hcmtzIDogW10sIGlubGluZSlcclxuICAgICAgaWYgKGlubGluZSkge1xyXG4gICAgICAgIGNvbnN0IGlubGluZUNoaWxkcmVuID0gY2hpbGRyZW4uZmlsdGVyKChjaGlsZCkgPT4gY2hpbGQuaXNJbmxpbmUpXHJcbiAgICAgICAgcmV0dXJuIFt0eXBlLmNyZWF0ZShhdHRycywgbWVyZ2VJbmxpbmUoRnJhZ21lbnQuZnJvbShpbmxpbmVDaGlsZHJlbikpKV1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gW3R5cGUuY3JlYXRlKGF0dHJzLCBGcmFnbWVudC5mcm9tKGNoaWxkcmVuKSldXHJcbiAgICB9XHJcblxyXG4gICAgLy8gQSBkYW5nZXJvdXMgdGFnIHdob3NlIGNsYWltaW5nIHJ1bGUgcmVmdXNlZCBpdCAoYW4gaWZyYW1lIHBvaW50aW5nXHJcbiAgICAvLyBzb21ld2hlcmUgdGhlIHNjaGVtYSBkb2VzIG5vdCBhbGxvdykgaXMgZHJvcHBlZCBhbG9uZyB3aXRoIGl0cyBzdWJ0cmVlLFxyXG4gICAgLy8gZXhhY3RseSBhcyBhbiB1bmNsYWltZWQgb25lIGlzLiBLZWVwaW5nIHRoZSBjaGlsZHJlbiB3b3VsZCBsZXQgbWFya3VwXHJcbiAgICAvLyBuZXN0ZWQgaW5zaWRlIGEgcmVqZWN0ZWQgZnJhbWUgc2xpcCBpbnRvIHRoZSBkb2N1bWVudC5cclxuICAgIGlmIChkYW5nZXJvdXMpIHJldHVybiBbXVxyXG5cclxuICAgIC8vIFVua25vd24gZWxlbWVudCAoZGl2LCBzcGFuLCBmb250LCBvOnAsIOKApik6IGtlZXAgY29udGVudCwgZHJvcCBmb3JtYXR0aW5nLlxyXG4gICAgcmV0dXJuIHRoaXMucGFyc2VDaGlsZHJlbihlbGVtZW50LCBtYXJrcywgaW5saW5lQ29udGV4dClcclxuICB9XHJcbn1cclxuXHJcbmNvbnN0IHBhcnNlckNhY2hlID0gbmV3IFdlYWtNYXA8U2NoZW1hLCBIVE1MUGFyc2VyPigpXHJcblxyXG4vKipcclxuICogUGFyc2UgYW4gSFRNTCBzdHJpbmcgaW50byBhIG5vcm1hbGl6ZWQgZG9jdW1lbnQuIFJlcXVpcmVzIGEgRE9NXHJcbiAqIGVudmlyb25tZW50IChvciBhbiBleHBsaWNpdCBgRG9jdW1lbnRgLCBlLmcuIGZyb20gaGFwcHktZG9tIGluIHRlc3RzKS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUhUTUwoc2NoZW1hOiBTY2hlbWEsIGh0bWw6IHN0cmluZywgZG9jdW1lbnQ/OiBEb2N1bWVudCk6IEVkaXRvck5vZGUge1xyXG4gIGNvbnN0IGRvbSA9IGRvY3VtZW50ID8/ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdy5kb2N1bWVudCA6IG51bGwpXHJcbiAgaWYgKCFkb20pIHtcclxuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdwYXJzZUhUTUwgbmVlZHMgYSBET00gZW52aXJvbm1lbnQ7IHBhc3MgYSBEb2N1bWVudCBleHBsaWNpdGx5IGluIE5vZGUnKVxyXG4gIH1cclxuICAvLyBBIHRlbXBsYXRlJ3MgY29udGVudCBmcmFnbWVudCBpcyBpbmVydCBieSBzcGVjOiBzY3JpcHRzIG5ldmVyIGV4ZWN1dGVcclxuICAvLyBhbmQgZW1iZWRkZWQgcmVzb3VyY2VzIChpZnJhbWVzLCBpbWFnZXMpIG5ldmVyIGxvYWQgd2hpbGUgd2Ugd2FsayBpdC5cclxuICBjb25zdCB0ZW1wbGF0ZSA9IGRvbS5jcmVhdGVFbGVtZW50KCd0ZW1wbGF0ZScpIGFzIEhUTUxUZW1wbGF0ZUVsZW1lbnRcclxuICB0ZW1wbGF0ZS5pbm5lckhUTUwgPSBodG1sXHJcbiAgbGV0IHBhcnNlciA9IHBhcnNlckNhY2hlLmdldChzY2hlbWEpXHJcbiAgaWYgKCFwYXJzZXIpIHtcclxuICAgIHBhcnNlciA9IG5ldyBIVE1MUGFyc2VyKHNjaGVtYSlcclxuICAgIHBhcnNlckNhY2hlLnNldChzY2hlbWEsIHBhcnNlcilcclxuICB9XHJcbiAgcmV0dXJuIHBhcnNlci5wYXJzZSh0ZW1wbGF0ZS5jb250ZW50KVxyXG59XHJcbiIsICIvKipcclxuICogV2hlcmUgYSBwaWVjZSBvZiBwYXN0ZWQgSFRNTCBjYW1lIGZyb20sIGFuZCBob3cgdG8gY2xlYW4gaXQgdXAuXHJcbiAqXHJcbiAqIE9mZmljZSBzdWl0ZXMgZG8gbm90IHdyaXRlIEhUTUwgZm9yIG90aGVyIHBlb3BsZSB0byByZWFkLiBXb3JkIHNoaXBzIGFuXHJcbiAqIFhNTCBpc2xhbmQsIGNvbmRpdGlvbmFsIGNvbW1lbnRzLCBodW5kcmVkcyBvZiBgbXNvLWAgc3R5bGUgcHJvcGVydGllcyBhbmRcclxuICogbGl0ZXJhbCBidWxsZXQgZ2x5cGhzOyBHb29nbGUgRG9jcyB3cmFwcyB0aGUgd2hvbGUgc2VsZWN0aW9uIGluIGEgYDxiPmAgdGhhdFxyXG4gKiB0dXJucyBldmVyeXRoaW5nIGJvbGQgaW4gYW55IGVkaXRvciB0aGF0IHRha2VzIHRoZSBtYXJrdXAgYXQgZmFjZSB2YWx1ZS5cclxuICogUGFzdGluZyBlaXRoZXIgb25lIHN0cmFpZ2h0IGludG8gYSBkb2N1bWVudCBpbXBvcnRzIHRoZSBtZXNzIGFsb25nIHdpdGggdGhlXHJcbiAqIHdvcmRzLlxyXG4gKlxyXG4gKiBUaGlzIHJ1bnMgKipiZWZvcmUqKiB0aGUgc2FuaXRpemVyLCBub3QgaW5zdGVhZCBvZiBpdC4gTm90aGluZyBoZXJlIGlzIGFcclxuICogc2VjdXJpdHkgbWVhc3VyZS4gVGhlIGFsbG93bGlzdCBpbiBgcGFyc2VIVE1MYCBpcywgYW5kIGl0IHN0aWxsIHJ1bnMgb25cclxuICogd2hhdGV2ZXIgY29tZXMgb3V0LiBUaGlzIGlzIGFib3V0IHRoZSAqcXVhbGl0eSogb2Ygd2hhdCBzdXJ2aXZlcy5cclxuICovXHJcblxyXG4vKiogVGhlIHByb2R1Y2VyIG9mIGEgY2xpcGJvYXJkIHBheWxvYWQsIGFzIGZhciBhcyBpdHMgbWFya3VwIGJldHJheXMuICovXHJcbmV4cG9ydCB0eXBlIFBhc3RlU291cmNlID0gJ3dvcmQnIHwgJ2V4Y2VsJyB8ICdnb29nbGUtZG9jcycgfCAnaHRtbCdcclxuXHJcbi8qKiBgPCEtLVtpZiBndGUgbXNvIDldPuKApjwhW2VuZGlmXS0tPmAgYW5kIGZyaWVuZHMsIGluY2x1ZGluZyB0aGVpciBjb250ZW50cy4gKi9cclxuY29uc3QgQ09ORElUSU9OQUxfQ09NTUVOVCA9IC88IS0tXFxbaWZbXlxcXV0qXFxdPltcXHNcXFNdKj88IVxcW2VuZGlmXFxdLS0+L2dpXHJcbi8qKiBXb3JkJ3MgWE1MIGlzbGFuZDogYDx4bWw+4oCmPC94bWw+YCwgcGx1cyB0aGUgYDx3OuKApj5gIHRhZ3MgaXQgbWF5IGxlYXZlIGxvb3NlLiAqL1xyXG5jb25zdCBYTUxfSVNMQU5EID0gLzx4bWxcXGJbXj5dKj5bXFxzXFxTXSo/PFxcL3htbD4vZ2lcclxuLyoqXHJcbiAqIFdvcmQncyBvd24gc3R5bGVzaGVldDogdGVucyBvZiBraWxvYnl0ZXMgb2YgYG1zby1gIHJ1bGVzIGRlc2NyaWJpbmcgdGhlXHJcbiAqIGRvY3VtZW50IGl0IGNhbWUgZnJvbS4gVGhlIHNhbml0aXplciBkcm9wcyBgPHN0eWxlPmAgYW55d2F5LCBzbyBub3RoaW5nIGlzXHJcbiAqIGxvc3QgYnkgY3V0dGluZyBpdCBoZXJlOyB3aGF0IGlzIGdhaW5lZCBpcyBub3QgY2FycnlpbmcgaXQgdGhyb3VnaCB0aGVcclxuICogcGFyc2VyIGZpcnN0LlxyXG4gKi9cclxuY29uc3QgU1RZTEVfQkxPQ0sgPSAvPHN0eWxlXFxiW14+XSo+W1xcc1xcU10qPzxcXC9zdHlsZT4vZ2lcclxuLyoqIGA8bzpwPjwvbzpwPmA6IE9mZmljZSBwYXJhZ3JhcGggbWFya2VycyB0aGF0IGNhcnJ5IG5vIGNvbnRlbnQuICovXHJcbmNvbnN0IE9GRklDRV9UQUcgPSAvPFxcLz9bYS16XSs6W2Etel1bXj5dKj4vZ2lcclxuLy8gV29yZCBxdW90ZXMgYXR0cmlidXRlcyB3aXRoIGFwb3N0cm9waGVzIGFuZCBvZnRlbiBub3QgYXQgYWxsLCBgY2xhc3M9TXNvTm9ybWFsYFxyXG4vLyBpcyB3aGF0IGl0IHJlYWxseSB3cml0ZXMuIE1hdGNoaW5nIG9ubHkgYGNsYXNzPVwi4oCmXCJgIHdvdWxkIGxlYXZlIGV2ZXJ5IG9uZSBvZlxyXG4vLyB0aGVtIGluIHBsYWNlLCB3aGljaCBpcyB0aGUgd2hvbGUgcG9pbnQgb2YgdGhlc2UgdHdvIHBhc3Nlcy5cclxuLyoqIEEgYHN0eWxlYCBhdHRyaWJ1dGUsIGhvd2V2ZXIgaXQgaGFwcGVucyB0byBiZSBxdW90ZWQuICovXHJcbmNvbnN0IFNUWUxFX0FUVFJJQlVURSA9IC9cXHNzdHlsZVxccyo9XFxzKig/OlwiKFteXCJdKilcInwnKFteJ10qKScpL2dpXHJcbi8qKiBBIGBjbGFzc2AgYXR0cmlidXRlLCBob3dldmVyIGl0IGhhcHBlbnMgdG8gYmUgcXVvdGVkLCBvciBub3QgYXQgYWxsLiAqL1xyXG5jb25zdCBDTEFTU19BVFRSSUJVVEUgPSAvXFxzY2xhc3NcXHMqPVxccyooPzpcIihbXlwiXSopXCJ8JyhbXiddKiknfChbXlxcc1wiJz5dKykpL2dpXHJcbi8qKiBUaGUgc3BhbiBXb3JkIHVzZXMgdG8gaG9sZCBhIGJ1bGxldCBpdCBoYXMgYWxyZWFkeSBkcmF3bi4gKi9cclxuY29uc3QgTVNPX0xJU1RfSUdOT1JFID0gLzxzcGFuXFxiW14+XSptc28tbGlzdFxccyo6XFxzKmlnbm9yZVtePl0qPltcXHNcXFNdKj88XFwvc3Bhbj4vZ2lcclxuLyoqIEdvb2dsZSdzIHdyYXBwZXI6IGEgYDxiPmAgd2hvc2Ugb25seSBqb2IgaXMgdG8gY2FycnkgYW4gaWQuICovXHJcbmNvbnN0IEdPT0dMRV9CT0xEX1dSQVBQRVIgPSAvPGJcXGJbXj5dKmlkXFxzKj1cXHMqXCJkb2NzLWludGVybmFsLWd1aWRbXlwiXSpcIltePl0qPihbXFxzXFxTXSopPFxcL2I+L2lcclxuLyoqIGBmb250LXdlaWdodDo0MDBgIGFuZCBgZm9udC13ZWlnaHQ6bm9ybWFsYCBtZWFuIFwibm90IGJvbGRcIiwgc28gc2F5IG5vdGhpbmcuICovXHJcbmNvbnN0IE5PUk1BTF9XRUlHSFQgPSAvXmZvbnQtd2VpZ2h0XFxzKjpcXHMqKDQwMHxub3JtYWwpJC9pXHJcbi8qKiBBIHNpbmdsZSBDU1MgZGVjbGFyYXRpb24gV29yZCBpbnZlbnRlZCBmb3IgaXRzZWxmLiAqL1xyXG5jb25zdCBNU09fREVDTEFSQVRJT04gPSAvXlxccyptc28tL2lcclxuXHJcbi8qKlxyXG4gKiBXaGljaCBhcHBsaWNhdGlvbiBwcm9kdWNlZCB0aGlzIEhUTUwuXHJcbiAqXHJcbiAqIFRoZSBtYXJrZXJzIGFyZSB0aGUgb25lcyBlYWNoIGFwcGxpY2F0aW9uIHdyaXRlcyBpbnRvIGV2ZXJ5IHBheWxvYWQsIG5vdFxyXG4gKiBoZXVyaXN0aWNzIG92ZXIgdGhlIGNvbnRlbnQ6IGEgZG9jdW1lbnQgdGhhdCBtZXJlbHkgbWVudGlvbnMgV29yZCBpcyBub3RcclxuICogZnJvbSBXb3JkLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdFBhc3RlU291cmNlKGh0bWw6IHN0cmluZyk6IFBhc3RlU291cmNlIHtcclxuICBpZiAoL2lkXFxzKj1cXHMqXCJkb2NzLWludGVybmFsLWd1aWQvaS50ZXN0KGh0bWwpKSByZXR1cm4gJ2dvb2dsZS1kb2NzJ1xyXG4gIGlmICgvdXJuOnNjaGVtYXMtbWljcm9zb2Z0LWNvbTpvZmZpY2U6ZXhjZWwvaS50ZXN0KGh0bWwpKSByZXR1cm4gJ2V4Y2VsJ1xyXG4gIGlmICgvY29udGVudFxccyo9XFxzKlwiP01pY3Jvc29mdCBFeGNlbC9pLnRlc3QoaHRtbCkpIHJldHVybiAnZXhjZWwnXHJcbiAgaWYgKC91cm46c2NoZW1hcy1taWNyb3NvZnQtY29tOm9mZmljZTp3b3JkL2kudGVzdChodG1sKSkgcmV0dXJuICd3b3JkJ1xyXG4gIGlmICgvY29udGVudFxccyo9XFxzKlwiP01pY3Jvc29mdCBXb3JkL2kudGVzdChodG1sKSkgcmV0dXJuICd3b3JkJ1xyXG4gIC8vIGBjbGFzcz1Nc29Ob3JtYWxgIHdpdGhvdXQgdGhlIG5hbWVzcGFjZSBoYXBwZW5zIHdoZW4gb25seSBhIGZyYWdtZW50IG9mXHJcbiAgLy8gdGhlIGNsaXBib2FyZCBwYXlsb2FkIHN1cnZpdmVkIHdoYXRldmVyIHBhc3NlZCBpdCBhbG9uZy5cclxuICBpZiAoL2NsYXNzXFxzKj1cXHMqXCI/TXNvW0EtWl0vLnRlc3QoaHRtbCkpIHJldHVybiAnd29yZCdcclxuICBpZiAoL1xcYm1zby1bYS16LV0rXFxzKjovaS50ZXN0KGh0bWwpKSByZXR1cm4gJ3dvcmQnXHJcbiAgcmV0dXJuICdodG1sJ1xyXG59XHJcblxyXG4vKipcclxuICogU3RyaXAgd2hhdCB0aGUgc291cmNlIGFwcGxpY2F0aW9uIGFkZGVkIGZvciBpdHNlbGYuXHJcbiAqXHJcbiAqIFJldHVybnMgdGhlIGlucHV0IHVuY2hhbmdlZCBmb3Igb3JkaW5hcnkgd2ViIEhUTUw6IHBheWluZyB0aGUgY29zdCBvZiB0aGVzZVxyXG4gKiBwYXNzZXMgb24gZXZlcnkgcGFzdGUsIHRvIGZpeCBtYXJrdXAgdGhhdCB3YXMgbmV2ZXIgYnJva2VuLCBpcyBob3cgYSBwYXN0ZVxyXG4gKiBiZWNvbWVzIG5vdGljZWFibHkgc2xvdy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjbGVhblBhc3RlZEhUTUwoXHJcbiAgaHRtbDogc3RyaW5nLFxyXG4gIHNvdXJjZTogUGFzdGVTb3VyY2UgPSBkZXRlY3RQYXN0ZVNvdXJjZShodG1sKSxcclxuKTogc3RyaW5nIHtcclxuICBpZiAoc291cmNlID09PSAnaHRtbCcpIHJldHVybiBodG1sXHJcbiAgbGV0IGNsZWFuZWQgPSBodG1sXHJcbiAgaWYgKHNvdXJjZSA9PT0gJ2dvb2dsZS1kb2NzJykge1xyXG4gICAgLy8gVGhlIGZhbW91cyBvbmU6IEdvb2dsZSB3cmFwcyB0aGUgc2VsZWN0aW9uIGluIGA8YiBzdHlsZT1cImZvbnQtd2VpZ2h0OlxyXG4gICAgLy8gbm9ybWFsXCI+YC4gQW4gZWRpdG9yIHRoYXQgdHJ1c3RzIHRoZSB0YWcgbWFrZXMgdGhlIGVudGlyZSBwYXN0ZSBib2xkLlxyXG4gICAgY29uc3Qgd3JhcHBlciA9IEdPT0dMRV9CT0xEX1dSQVBQRVIuZXhlYyhjbGVhbmVkKVxyXG4gICAgaWYgKHdyYXBwZXI/LlsxXSAhPT0gdW5kZWZpbmVkKSBjbGVhbmVkID0gd3JhcHBlclsxXVxyXG4gIH0gZWxzZSB7XHJcbiAgICBjbGVhbmVkID0gY2xlYW5lZFxyXG4gICAgICAucmVwbGFjZShDT05ESVRJT05BTF9DT01NRU5ULCAnJylcclxuICAgICAgLnJlcGxhY2UoWE1MX0lTTEFORCwgJycpXHJcbiAgICAgIC5yZXBsYWNlKFNUWUxFX0JMT0NLLCAnJylcclxuICAgICAgLnJlcGxhY2UoTVNPX0xJU1RfSUdOT1JFLCAnJylcclxuICAgICAgLnJlcGxhY2UoT0ZGSUNFX1RBRywgJycpXHJcbiAgfVxyXG4gIHJldHVybiBjbGVhbmVkXHJcbiAgICAucmVwbGFjZShTVFlMRV9BVFRSSUJVVEUsIGNsZWFuU3R5bGVBdHRyaWJ1dGUpXHJcbiAgICAucmVwbGFjZShDTEFTU19BVFRSSUJVVEUsIGNsZWFuQ2xhc3NBdHRyaWJ1dGUpXHJcbn1cclxuXHJcbi8qKiBEcm9wIGBtc28tKmAgYW5kIG5vLW9wIHdlaWdodHM7IGtlZXAgZXZlcnkgZGVjbGFyYXRpb24gYSBicm93c2VyIHVuZGVyc3RhbmRzLiAqL1xyXG5mdW5jdGlvbiBjbGVhblN0eWxlQXR0cmlidXRlKF9tYXRjaDogc3RyaW5nLCBkb3VibGVkPzogc3RyaW5nLCBzaW5nbGU/OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGtlcHQgPSAoZG91YmxlZCA/PyBzaW5nbGUgPz8gJycpXHJcbiAgICAuc3BsaXQoJzsnKVxyXG4gICAgLm1hcCgoZGVjbGFyYXRpb24pID0+IGRlY2xhcmF0aW9uLnRyaW0oKSlcclxuICAgIC5maWx0ZXIoXHJcbiAgICAgIChkZWNsYXJhdGlvbikgPT5cclxuICAgICAgICBkZWNsYXJhdGlvbi5sZW5ndGggPiAwICYmXHJcbiAgICAgICAgIU1TT19ERUNMQVJBVElPTi50ZXN0KGRlY2xhcmF0aW9uKSAmJlxyXG4gICAgICAgICFOT1JNQUxfV0VJR0hULnRlc3QoZGVjbGFyYXRpb24pLFxyXG4gICAgKVxyXG4gIHJldHVybiBrZXB0Lmxlbmd0aCA+IDAgPyBgIHN0eWxlPVwiJHtrZXB0LmpvaW4oJzsgJyl9XCJgIDogJydcclxufVxyXG5cclxuLyoqIERyb3AgYE1zbypgIGNsYXNzIG5hbWVzOyBrZWVwIGFueXRoaW5nIHRoZSBhdXRob3IgYWN0dWFsbHkgY2hvc2UuICovXHJcbmZ1bmN0aW9uIGNsZWFuQ2xhc3NBdHRyaWJ1dGUoXHJcbiAgX21hdGNoOiBzdHJpbmcsXHJcbiAgZG91YmxlZD86IHN0cmluZyxcclxuICBzaW5nbGU/OiBzdHJpbmcsXHJcbiAgYmFyZT86IHN0cmluZyxcclxuKTogc3RyaW5nIHtcclxuICBjb25zdCBrZXB0ID0gKGRvdWJsZWQgPz8gc2luZ2xlID8/IGJhcmUgPz8gJycpXHJcbiAgICAuc3BsaXQoL1xccysvKVxyXG4gICAgLmZpbHRlcigobmFtZSkgPT4gbmFtZS5sZW5ndGggPiAwICYmICEvXk1zby8udGVzdChuYW1lKSlcclxuICByZXR1cm4ga2VwdC5sZW5ndGggPiAwID8gYCBjbGFzcz1cIiR7a2VwdC5qb2luKCcgJyl9XCJgIDogJydcclxufVxyXG4iLCAiaW1wb3J0IHsgRnJhZ21lbnQgfSBmcm9tICcuLi9tb2RlbC9mcmFnbWVudCdcclxuaW1wb3J0IHsgbWVyZ2VJbmxpbmUgfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB0eXBlIHsgTWFyayB9IGZyb20gJy4uL21vZGVsL21hcmsnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IG5vcm1hbGl6ZURvYyB9IGZyb20gJy4uL21vZGVsL25vcm1hbGl6ZSdcclxuaW1wb3J0IHR5cGUgeyBTY2hlbWEgfSBmcm9tICcuLi9tb2RlbC9zY2hlbWEnXHJcbmltcG9ydCB7IHNhZmVIcmVmLCBzYWZlSW1hZ2VTcmMgfSBmcm9tICcuLi9zY2hlbWEvYmFzaWMnXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtkb3duUGFyc2VPcHRpb25zIHtcclxuICAvKiogTm9kZSBuYW1lcyBmb3IgdGFibGVzLCBtYXRjaGluZyBgQHRyZXZpeGFsL2V4dGVuc2lvbi10YWJsZWAuICovXHJcbiAgcmVhZG9ubHkgdGFibGVOYW1lcz86IHtcclxuICAgIHJlYWRvbmx5IHRhYmxlPzogc3RyaW5nXHJcbiAgICByZWFkb25seSByb3c/OiBzdHJpbmdcclxuICAgIHJlYWRvbmx5IGNlbGw/OiBzdHJpbmdcclxuICB9XHJcbn1cclxuXHJcbmludGVyZmFjZSBOYW1lcyB7XHJcbiAgcmVhZG9ubHkgdGFibGU6IHN0cmluZ1xyXG4gIHJlYWRvbmx5IHJvdzogc3RyaW5nXHJcbiAgcmVhZG9ubHkgY2VsbDogc3RyaW5nXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYXJrZG93biAoR0ZNKSBpbXBvcnQgZm9yIHRoZSBzYW1lIHN1YnNldCB7QGxpbmsgc2VyaWFsaXplVG9NYXJrZG93bn1cclxuICogZW1pdHMuIEJsb2NrIHN0cnVjdHVyZSBpcyByZXNvbHZlZCBsaW5lIGJ5IGxpbmUsIHRoZW4gZWFjaCBibG9jaydzIHRleHQgaXNcclxuICogc2Nhbm5lZCBmb3IgaW5saW5lIG1hcmt1cC5cclxuICpcclxuICogU2VjdXJpdHk6IGxpbmsgYW5kIGltYWdlIGRlc3RpbmF0aW9ucyBnbyB0aHJvdWdoIHRoZSBzYW1lIGBzYWZlSHJlZmAgL1xyXG4gKiBgc2FmZUltYWdlU3JjYCBzYW5pdGl6ZXJzIHRoZSBIVE1MIHBhcnNlciBhbmQgdGhlIHNjaGVtYSB1c2UsIHNvIGFcclxuICogYGphdmFzY3JpcHQ6YCBVUkwgaW4gbWFya2Rvd24gaXMgZHJvcHBlZCBleGFjdGx5IGFzIGl0IGlzIGluIEhUTUwuIFRoZVxyXG4gKiBtYXJrIGlzIHNpbXBseSBub3QgYXBwbGllZC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1hcmtkb3duKFxyXG4gIHRleHQ6IHN0cmluZyxcclxuICBzY2hlbWE6IFNjaGVtYSxcclxuICBvcHRpb25zOiBNYXJrZG93blBhcnNlT3B0aW9ucyA9IHt9LFxyXG4pOiBFZGl0b3JOb2RlIHtcclxuICBjb25zdCBuYW1lczogTmFtZXMgPSB7XHJcbiAgICB0YWJsZTogb3B0aW9ucy50YWJsZU5hbWVzPy50YWJsZSA/PyAndGFibGUnLFxyXG4gICAgcm93OiBvcHRpb25zLnRhYmxlTmFtZXM/LnJvdyA/PyAndGFibGVSb3cnLFxyXG4gICAgY2VsbDogb3B0aW9ucy50YWJsZU5hbWVzPy5jZWxsID8/ICd0YWJsZUNlbGwnLFxyXG4gIH1cclxuICBjb25zdCBwYXJzZXIgPSBuZXcgQmxvY2tQYXJzZXIoc2NoZW1hLCBuYW1lcylcclxuICBjb25zdCBibG9ja3MgPSBwYXJzZXIucGFyc2VCbG9ja3ModGV4dC5yZXBsYWNlKC9cXHJcXG4/L2csICdcXG4nKS5zcGxpdCgnXFxuJykpXHJcbiAgY29uc3QgY29udGVudCA9IGJsb2Nrcy5sZW5ndGggPiAwID8gYmxvY2tzIDogW3NjaGVtYS5ub2RlVHlwZSgncGFyYWdyYXBoJykuY3JlYXRlKCldXHJcbiAgcmV0dXJuIG5vcm1hbGl6ZURvYyhzY2hlbWEudG9wVHlwZS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5mcm9tKGNvbnRlbnQpKSlcclxufVxyXG5cclxuLyoqIGAtIGl0ZW1gLCBgKiBpdGVtYCwgYCsgaXRlbWAsIGAxLiBpdGVtYDsgY2FwdHVyZXMgaW5kZW50LCBtYXJrZXIgYW5kIHJlc3QuICovXHJcbmNvbnN0IEJVTExFVF9JVEVNID0gL14oXFxzKikoWy0qK10pKFxccyspKC4qKSQvXHJcbmNvbnN0IE9SREVSRURfSVRFTSA9IC9eKFxccyopKFxcZHsxLDl9KVsuKV0oXFxzKykoLiopJC9cclxuY29uc3QgSEVBRElORyA9IC9eIHswLDN9KCN7MSw2fSkoPzpcXHMrKC4qPykpP1xccyojKlxccyokL1xyXG5jb25zdCBGRU5DRSA9IC9eKFxccyopKGB7Myx9fH57Myx9KVxccyooW15cXHNgXSopXFxzKiQvXHJcbmNvbnN0IFJVTEUgPSAvXiB7MCwzfSg/Oig/Oi1cXHMqKXszLH18KD86XFwqXFxzKil7Myx9fCg/Ol9cXHMqKXszLH0pJC9cclxuY29uc3QgQkxPQ0tRVU9URSA9IC9eIHswLDN9Plxccz8oLiopJC9cclxuY29uc3QgVEFTSyA9IC9eXFxbKFsgeFhdKVxcXVxccysoLiopJC9cclxuY29uc3QgVEFCTEVfREVMSU1JVEVSID0gL15cXHMqXFx8PyhcXHMqOj8tezEsfTo/XFxzKlxcfCkrKFxccyo6Py17MSx9Oj9cXHMqKVxcfD9cXHMqJC9cclxuXHJcbmNsYXNzIEJsb2NrUGFyc2VyIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2NoZW1hOiBTY2hlbWEsXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IG5hbWVzOiBOYW1lcyxcclxuICApIHt9XHJcblxyXG4gIHByaXZhdGUgaGFzKG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIE9iamVjdC5oYXNPd24odGhpcy5zY2hlbWEubm9kZXMsIG5hbWUpXHJcbiAgfVxyXG5cclxuICAvKiogQ29uc3VtZSBsaW5lcyBpbnRvIGJsb2NrcyB1bnRpbCB0aGV5IHJ1biBvdXQuICovXHJcbiAgcGFyc2VCbG9ja3MobGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogRWRpdG9yTm9kZVtdIHtcclxuICAgIGNvbnN0IG91dDogRWRpdG9yTm9kZVtdID0gW11cclxuICAgIGxldCBpbmRleCA9IDBcclxuXHJcbiAgICB3aGlsZSAoaW5kZXggPCBsaW5lcy5sZW5ndGgpIHtcclxuICAgICAgY29uc3QgbGluZSA9IGxpbmVzW2luZGV4XSBhcyBzdHJpbmdcclxuXHJcbiAgICAgIGlmIChsaW5lLnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZmVuY2UgPSBGRU5DRS5leGVjKGxpbmUpXHJcbiAgICAgIGlmIChmZW5jZSkge1xyXG4gICAgICAgIGNvbnN0IFssICwgbWFya2VyLCBsYW5ndWFnZV0gPSBmZW5jZSBhcyB1bmtub3duIGFzIFtzdHJpbmcsIHN0cmluZywgc3RyaW5nLCBzdHJpbmddXHJcbiAgICAgICAgY29uc3QgYm9keTogc3RyaW5nW10gPSBbXVxyXG4gICAgICAgIGluZGV4ICs9IDFcclxuICAgICAgICAvLyBBbiB1bnRlcm1pbmF0ZWQgZmVuY2UgcnVucyB0byB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudCwgcGVyIENvbW1vbk1hcmsuXHJcbiAgICAgICAgd2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoICYmICFpc0ZlbmNlQ2xvc2UobGluZXNbaW5kZXhdIGFzIHN0cmluZywgbWFya2VyKSkge1xyXG4gICAgICAgICAgYm9keS5wdXNoKGxpbmVzW2luZGV4XSBhcyBzdHJpbmcpXHJcbiAgICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpbmRleCA8IGxpbmVzLmxlbmd0aCkgaW5kZXggKz0gMVxyXG4gICAgICAgIG91dC5wdXNoKHRoaXMuY29kZUJsb2NrKGJvZHkuam9pbignXFxuJyksIGxhbmd1YWdlIHx8IG51bGwpKVxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChSVUxFLnRlc3QobGluZSkgJiYgdGhpcy5oYXMoJ2hvcml6b250YWxSdWxlJykpIHtcclxuICAgICAgICBvdXQucHVzaCh0aGlzLnNjaGVtYS5ub2RlVHlwZSgnaG9yaXpvbnRhbFJ1bGUnKS5jcmVhdGUoKSlcclxuICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgaGVhZGluZyA9IEhFQURJTkcuZXhlYyhsaW5lKVxyXG4gICAgICBpZiAoaGVhZGluZykge1xyXG4gICAgICAgIGNvbnN0IGxldmVsID0gKGhlYWRpbmdbMV0gYXMgc3RyaW5nKS5sZW5ndGhcclxuICAgICAgICBvdXQucHVzaCh0aGlzLnNjaGVtYS5ub2RlVHlwZSgnaGVhZGluZycpLmNyZWF0ZSh7IGxldmVsIH0sIHRoaXMuaW5saW5lKGhlYWRpbmdbMl0gPz8gJycpKSlcclxuICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKEJMT0NLUVVPVEUudGVzdChsaW5lKSkge1xyXG4gICAgICAgIGNvbnN0IHF1b3RlZDogc3RyaW5nW10gPSBbXVxyXG4gICAgICAgIHdoaWxlIChpbmRleCA8IGxpbmVzLmxlbmd0aCkge1xyXG4gICAgICAgICAgY29uc3QgbWF0Y2ggPSBCTE9DS1FVT1RFLmV4ZWMobGluZXNbaW5kZXhdIGFzIHN0cmluZylcclxuICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBxdW90ZWQucHVzaChtYXRjaFsxXSBhcyBzdHJpbmcpXHJcbiAgICAgICAgICAgIGluZGV4ICs9IDFcclxuICAgICAgICAgICAgY29udGludWVcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIC8vIEEgbGF6eSBjb250aW51YXRpb24gbGluZSBiZWxvbmdzIHRvIHRoZSBxdW90ZSdzIGxhc3QgcGFyYWdyYXBoLlxyXG4gICAgICAgICAgaWYgKChsaW5lc1tpbmRleF0gYXMgc3RyaW5nKS50cmltKCkgPT09ICcnKSBicmVha1xyXG4gICAgICAgICAgaWYgKHRoaXMuc3RhcnRzTmV3QmxvY2sobGluZXNbaW5kZXhdIGFzIHN0cmluZykpIGJyZWFrXHJcbiAgICAgICAgICBxdW90ZWQucHVzaChsaW5lc1tpbmRleF0gYXMgc3RyaW5nKVxyXG4gICAgICAgICAgaW5kZXggKz0gMVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBpbm5lciA9IHRoaXMucGFyc2VCbG9ja3MocXVvdGVkKVxyXG4gICAgICAgIG91dC5wdXNoKFxyXG4gICAgICAgICAgdGhpcy5zY2hlbWFcclxuICAgICAgICAgICAgLm5vZGVUeXBlKCdibG9ja3F1b3RlJylcclxuICAgICAgICAgICAgLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50LmZyb20oaW5uZXIubGVuZ3RoID4gMCA/IGlubmVyIDogW3RoaXMucGFyYWdyYXBoKCcnKV0pKSxcclxuICAgICAgICApXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgdGFibGUgPSB0aGlzLnRyeVRhYmxlKGxpbmVzLCBpbmRleClcclxuICAgICAgaWYgKHRhYmxlKSB7XHJcbiAgICAgICAgb3V0LnB1c2godGFibGUubm9kZSlcclxuICAgICAgICBpbmRleCA9IHRhYmxlLm5leHRcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBsaXN0ID0gdGhpcy50cnlMaXN0KGxpbmVzLCBpbmRleClcclxuICAgICAgaWYgKGxpc3QpIHtcclxuICAgICAgICBvdXQucHVzaChsaXN0Lm5vZGUpXHJcbiAgICAgICAgaW5kZXggPSBsaXN0Lm5leHRcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBQYXJhZ3JhcGg6IHJ1biB1bnRpbCBhIGJsYW5rIGxpbmUgb3IgdGhlIHN0YXJ0IG9mIGFub3RoZXIgYmxvY2suXHJcbiAgICAgIGNvbnN0IHBhcmFncmFwaDogc3RyaW5nW10gPSBbbGluZV1cclxuICAgICAgaW5kZXggKz0gMVxyXG4gICAgICB3aGlsZSAoaW5kZXggPCBsaW5lcy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCBjYW5kaWRhdGUgPSBsaW5lc1tpbmRleF0gYXMgc3RyaW5nXHJcbiAgICAgICAgaWYgKGNhbmRpZGF0ZS50cmltKCkgPT09ICcnIHx8IHRoaXMuc3RhcnRzTmV3QmxvY2soY2FuZGlkYXRlKSkgYnJlYWtcclxuICAgICAgICBwYXJhZ3JhcGgucHVzaChjYW5kaWRhdGUpXHJcbiAgICAgICAgaW5kZXggKz0gMVxyXG4gICAgICB9XHJcbiAgICAgIG91dC5wdXNoKHRoaXMucGFyYWdyYXBoTGluZXMocGFyYWdyYXBoKSlcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gb3V0XHJcbiAgfVxyXG5cclxuICAvKiogV291bGQgdGhpcyBsaW5lIGJlZ2luIGEgYmxvY2sgb3RoZXIgdGhhbiBhIHBhcmFncmFwaCBjb250aW51YXRpb24/ICovXHJcbiAgcHJpdmF0ZSBzdGFydHNOZXdCbG9jayhsaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIEhFQURJTkcudGVzdChsaW5lKSB8fFxyXG4gICAgICBGRU5DRS50ZXN0KGxpbmUpIHx8XHJcbiAgICAgIFJVTEUudGVzdChsaW5lKSB8fFxyXG4gICAgICBCTE9DS1FVT1RFLnRlc3QobGluZSkgfHxcclxuICAgICAgQlVMTEVUX0lURU0udGVzdChsaW5lKSB8fFxyXG4gICAgICBPUkRFUkVEX0lURU0udGVzdChsaW5lKVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjb2RlQmxvY2sodGV4dDogc3RyaW5nLCBsYW5ndWFnZTogc3RyaW5nIHwgbnVsbCk6IEVkaXRvck5vZGUge1xyXG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hXHJcbiAgICAgIC5ub2RlVHlwZSgnY29kZUJsb2NrJylcclxuICAgICAgLmNyZWF0ZSh7IGxhbmd1YWdlIH0sIHRleHQubGVuZ3RoID4gMCA/IEZyYWdtZW50Lm9mKHRoaXMuc2NoZW1hLnRleHQodGV4dCkpIDogRnJhZ21lbnQuZW1wdHkpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHBhcmFncmFwaCh0ZXh0OiBzdHJpbmcpOiBFZGl0b3JOb2RlIHtcclxuICAgIHJldHVybiB0aGlzLnNjaGVtYS5ub2RlVHlwZSgncGFyYWdyYXBoJykuY3JlYXRlKHVuZGVmaW5lZCwgdGhpcy5pbmxpbmUodGV4dCkpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTZXZlcmFsIHNvdXJjZSBsaW5lcyBmb3JtaW5nIG9uZSBwYXJhZ3JhcGguIEEgbGluZSBlbmRpbmcgaW4gdHdvIHNwYWNlc1xyXG4gICAqIGlzIGEgaGFyZCBicmVhazsgb3RoZXJ3aXNlIHRoZSBsaW5lcyBqb2luIHdpdGggYSBzcGFjZSwgYXMgbWFya2Rvd24gc2F5cy5cclxuICAgKi9cclxuICBwcml2YXRlIHBhcmFncmFwaExpbmVzKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSk6IEVkaXRvck5vZGUge1xyXG4gICAgbGV0IHRleHQgPSAnJ1xyXG4gICAgbGluZXMuZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgY29uc3QgaXNMYXN0ID0gaW5kZXggPT09IGxpbmVzLmxlbmd0aCAtIDFcclxuICAgICAgaWYgKC8gezIsfSQvLnRlc3QobGluZSkgJiYgIWlzTGFzdCkgdGV4dCArPSBgJHtsaW5lLnRyaW1FbmQoKX1cXG5gXHJcbiAgICAgIGVsc2UgdGV4dCArPSBpc0xhc3QgPyBsaW5lLnRyaW0oKSA6IGAke2xpbmUudHJpbSgpfSBgXHJcbiAgICB9KVxyXG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hLm5vZGVUeXBlKCdwYXJhZ3JhcGgnKS5jcmVhdGUodW5kZWZpbmVkLCB0aGlzLmlubGluZSh0ZXh0KSlcclxuICB9XHJcblxyXG4gIC8qKiBBIHJ1biBvZiBsaXN0IGl0ZW1zIGF0IHRoZSBzYW1lIGluZGVudCwgd2l0aCBuZXN0ZWQgbGlzdHMgaW5zaWRlIHRoZW0uICovXHJcbiAgcHJpdmF0ZSB0cnlMaXN0KFxyXG4gICAgbGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdLFxyXG4gICAgc3RhcnQ6IG51bWJlcixcclxuICApOiB7IG5vZGU6IEVkaXRvck5vZGU7IG5leHQ6IG51bWJlciB9IHwgbnVsbCB7XHJcbiAgICBjb25zdCBmaXJzdCA9IGxpbmVzW3N0YXJ0XSBhcyBzdHJpbmdcclxuICAgIGNvbnN0IGJ1bGxldCA9IEJVTExFVF9JVEVNLmV4ZWMoZmlyc3QpXHJcbiAgICBjb25zdCBvcmRlcmVkID0gYnVsbGV0ID8gbnVsbCA6IE9SREVSRURfSVRFTS5leGVjKGZpcnN0KVxyXG4gICAgaWYgKCFidWxsZXQgJiYgIW9yZGVyZWQpIHJldHVybiBudWxsXHJcblxyXG4gICAgLy8gQSBidWxsZXQgbGlzdCB3aG9zZSBmaXJzdCBpdGVtIGNhcnJpZXMgYSBjaGVja2JveCBpcyBhIHRhc2sgbGlzdCwgd2hlblxyXG4gICAgLy8gdGhlIHNjaGVtYSBoYXMgdGhvc2Ugbm9kZXMgLS0gdGhhdCBpcyBob3cgR0ZNIHdyaXRlcyBvbmUuXHJcbiAgICBjb25zdCBpc1Rhc2sgPVxyXG4gICAgICBCb29sZWFuKGJ1bGxldCkgJiZcclxuICAgICAgVEFTSy50ZXN0KChidWxsZXQgYXMgUmVnRXhwRXhlY0FycmF5KVs0XSBhcyBzdHJpbmcpICYmXHJcbiAgICAgIHRoaXMuaGFzKCd0YXNrTGlzdCcpICYmXHJcbiAgICAgIHRoaXMuaGFzKCd0YXNrSXRlbScpXHJcbiAgICBjb25zdCBsaXN0TmFtZSA9IGlzVGFzayA/ICd0YXNrTGlzdCcgOiBidWxsZXQgPyAnYnVsbGV0TGlzdCcgOiAnb3JkZXJlZExpc3QnXHJcbiAgICBjb25zdCBpdGVtTmFtZSA9IGlzVGFzayA/ICd0YXNrSXRlbScgOiAnbGlzdEl0ZW0nXHJcbiAgICBpZiAoIXRoaXMuaGFzKGxpc3ROYW1lKSB8fCAhdGhpcy5oYXMoaXRlbU5hbWUpKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3QgYmFzZUluZGVudCA9ICgoYnVsbGV0ID8/IG9yZGVyZWQpIGFzIFJlZ0V4cEV4ZWNBcnJheSlbMV0/Lmxlbmd0aCA/PyAwXHJcbiAgICBjb25zdCBzdGFydE51bWJlciA9IG9yZGVyZWQgPyBOdW1iZXIucGFyc2VJbnQob3JkZXJlZFsyXSBhcyBzdHJpbmcsIDEwKSA6IG51bGxcclxuXHJcbiAgICBjb25zdCBpdGVtczogRWRpdG9yTm9kZVtdID0gW11cclxuICAgIGxldCBpbmRleCA9IHN0YXJ0XHJcblxyXG4gICAgd2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoKSB7XHJcbiAgICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpbmRleF0gYXMgc3RyaW5nXHJcbiAgICAgIGlmIChsaW5lLnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgICAvLyBBIGJsYW5rIGxpbmUgZW5kcyB0aGUgbGlzdCB1bmxlc3MgdGhlIG5leHQgbGluZSBjb250aW51ZXMgYW4gaXRlbS5cclxuICAgICAgICBjb25zdCBmb2xsb3dpbmcgPSBsaW5lc1tpbmRleCArIDFdXHJcbiAgICAgICAgaWYgKGZvbGxvd2luZyA9PT0gdW5kZWZpbmVkIHx8IGZvbGxvd2luZy50cmltKCkgPT09ICcnKSBicmVha1xyXG4gICAgICAgIGNvbnN0IG5leHRJbmRlbnQgPSBmb2xsb3dpbmcubGVuZ3RoIC0gZm9sbG93aW5nLnRyaW1TdGFydCgpLmxlbmd0aFxyXG4gICAgICAgIGNvbnN0IG5leHRJdGVtID0gQlVMTEVUX0lURU0uZXhlYyhmb2xsb3dpbmcpID8/IE9SREVSRURfSVRFTS5leGVjKGZvbGxvd2luZylcclxuICAgICAgICBpZiAoIW5leHRJdGVtICYmIG5leHRJbmRlbnQgPD0gYmFzZUluZGVudCkgYnJlYWtcclxuICAgICAgICBpZiAobmV4dEl0ZW0gJiYgKG5leHRJdGVtWzFdPy5sZW5ndGggPz8gMCkgPCBiYXNlSW5kZW50KSBicmVha1xyXG4gICAgICAgIGluZGV4ICs9IDFcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBtYXRjaCA9IEJVTExFVF9JVEVNLmV4ZWMobGluZSkgPz8gT1JERVJFRF9JVEVNLmV4ZWMobGluZSlcclxuICAgICAgaWYgKCFtYXRjaCkgYnJlYWtcclxuICAgICAgY29uc3QgaW5kZW50ID0gbWF0Y2hbMV0/Lmxlbmd0aCA/PyAwXHJcbiAgICAgIGlmIChpbmRlbnQgPCBiYXNlSW5kZW50KSBicmVha1xyXG4gICAgICAvLyBBIG1vcmUtaW5kZW50ZWQgbWFya2VyIGJlbG9uZ3MgdG8gdGhlIHByZXZpb3VzIGl0ZW0sIGhhbmRsZWQgYmVsb3cuXHJcbiAgICAgIGlmIChpbmRlbnQgPiBiYXNlSW5kZW50KSBicmVha1xyXG4gICAgICAvLyBBIGRpZmZlcmVudCBsaXN0IGtpbmQgYXQgdGhlIHNhbWUgbGV2ZWwgc3RhcnRzIGEgbmV3IGxpc3QuXHJcbiAgICAgIGNvbnN0IGlzQnVsbGV0ID0gQlVMTEVUX0lURU0udGVzdChsaW5lKVxyXG4gICAgICBpZiAoaXNCdWxsZXQgIT09IEJvb2xlYW4oYnVsbGV0KSkgYnJlYWtcclxuXHJcbiAgICAgIC8vIEV2ZXJ5dGhpbmcgaW5kZW50ZWQgcGFzdCB0aGUgbWFya2VyIGlzIHRoaXMgaXRlbSdzIGNvbnRlbnQuXHJcbiAgICAgIGNvbnN0IG1hcmtlcldpZHRoID1cclxuICAgICAgICAobWF0Y2hbMV0/Lmxlbmd0aCA/PyAwKSArIChtYXRjaFsyXT8ubGVuZ3RoID8/IDApICsgKG1hdGNoWzNdPy5sZW5ndGggPz8gMClcclxuICAgICAgY29uc3QgaXRlbUxpbmVzOiBzdHJpbmdbXSA9IFttYXRjaFs0XSBhcyBzdHJpbmddXHJcbiAgICAgIGluZGV4ICs9IDFcclxuICAgICAgd2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlID0gbGluZXNbaW5kZXhdIGFzIHN0cmluZ1xyXG4gICAgICAgIGlmIChjYW5kaWRhdGUudHJpbSgpID09PSAnJykge1xyXG4gICAgICAgICAgY29uc3QgZm9sbG93aW5nID0gbGluZXNbaW5kZXggKyAxXVxyXG4gICAgICAgICAgaWYgKGZvbGxvd2luZyA9PT0gdW5kZWZpbmVkIHx8IGZvbGxvd2luZy50cmltKCkgPT09ICcnKSBicmVha1xyXG4gICAgICAgICAgY29uc3QgbmV4dEluZGVudCA9IGZvbGxvd2luZy5sZW5ndGggLSBmb2xsb3dpbmcudHJpbVN0YXJ0KCkubGVuZ3RoXHJcbiAgICAgICAgICBpZiAobmV4dEluZGVudCA8IG1hcmtlcldpZHRoKSBicmVha1xyXG4gICAgICAgICAgaXRlbUxpbmVzLnB1c2goJycpXHJcbiAgICAgICAgICBpbmRleCArPSAxXHJcbiAgICAgICAgICBjb250aW51ZVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBjYW5kaWRhdGVJbmRlbnQgPSBjYW5kaWRhdGUubGVuZ3RoIC0gY2FuZGlkYXRlLnRyaW1TdGFydCgpLmxlbmd0aFxyXG4gICAgICAgIGlmIChjYW5kaWRhdGVJbmRlbnQgPCBtYXJrZXJXaWR0aCkgYnJlYWtcclxuICAgICAgICBpdGVtTGluZXMucHVzaChjYW5kaWRhdGUuc2xpY2UobWFya2VyV2lkdGgpKVxyXG4gICAgICAgIGluZGV4ICs9IDFcclxuICAgICAgfVxyXG5cclxuICAgICAgaXRlbXMucHVzaCh0aGlzLmxpc3RJdGVtKGl0ZW1MaW5lcywgaXRlbU5hbWUpKVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpdGVtcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBhdHRycyA9IHN0YXJ0TnVtYmVyICE9PSBudWxsID8geyBzdGFydDogc3RhcnROdW1iZXIgfSA6IHVuZGVmaW5lZFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbm9kZTogdGhpcy5zY2hlbWEubm9kZVR5cGUobGlzdE5hbWUpLmNyZWF0ZShhdHRycywgRnJhZ21lbnQuZnJvbShpdGVtcykpLFxyXG4gICAgICBuZXh0OiBpbmRleCxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKiBPbmUgaXRlbSdzIGxpbmVzLCBpbmNsdWRpbmcgYSBsZWFkaW5nIHRhc2sgbWFya2VyIGFuZCBuZXN0ZWQgYmxvY2tzLiAqL1xyXG4gIHByaXZhdGUgbGlzdEl0ZW0obGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdLCBpdGVtTmFtZTogc3RyaW5nKTogRWRpdG9yTm9kZSB7XHJcbiAgICBjb25zdCBmaXJzdCA9IGxpbmVzWzBdID8/ICcnXHJcbiAgICBjb25zdCB0YXNrID0gVEFTSy5leGVjKGZpcnN0KVxyXG4gICAgY29uc3QgaXRlbVR5cGUgPSB0aGlzLnNjaGVtYS5ub2RlVHlwZShpdGVtTmFtZSlcclxuICAgIGNvbnN0IHN1cHBvcnRzQ2hlY2tlZCA9IE9iamVjdC5oYXNPd24oaXRlbVR5cGUuc3BlYy5hdHRycyA/PyB7fSwgJ2NoZWNrZWQnKVxyXG5cclxuICAgIGlmICh0YXNrICYmIHN1cHBvcnRzQ2hlY2tlZCkge1xyXG4gICAgICBjb25zdCBibG9ja3MgPSB0aGlzLnBhcnNlQmxvY2tzKFt0YXNrWzJdIGFzIHN0cmluZywgLi4ubGluZXMuc2xpY2UoMSldKVxyXG4gICAgICBjb25zdCBjaGVja2VkID0gKHRhc2tbMV0gYXMgc3RyaW5nKS50b0xvd2VyQ2FzZSgpID09PSAneCdcclxuICAgICAgcmV0dXJuIGl0ZW1UeXBlLmNyZWF0ZShcclxuICAgICAgICB7IGNoZWNrZWQgfSxcclxuICAgICAgICBGcmFnbWVudC5mcm9tKGJsb2Nrcy5sZW5ndGggPiAwID8gYmxvY2tzIDogW3RoaXMucGFyYWdyYXBoKCcnKV0pLFxyXG4gICAgICApXHJcbiAgICB9XHJcbiAgICAvLyBBIGNoZWNrYm94IHRoaXMgc2NoZW1hIGNhbm5vdCBtb2RlbCBzdGF5cyBsaXRlcmFsIHRleHQsIHJhdGhlciB0aGFuXHJcbiAgICAvLyBiZWluZyBkcm9wcGVkOiB0aGUgZXNjYXBlZCBmb3JtIHJvdW5kLXRyaXBzIGFzIHdoYXQgdGhlIHVzZXIgd3JvdGUuXHJcbiAgICBjb25zdCBibG9ja3MgPSB0aGlzLnBhcnNlQmxvY2tzKFsuLi5saW5lc10pXHJcbiAgICByZXR1cm4gaXRlbVR5cGUuY3JlYXRlKFxyXG4gICAgICB1bmRlZmluZWQsXHJcbiAgICAgIEZyYWdtZW50LmZyb20oYmxvY2tzLmxlbmd0aCA+IDAgPyBibG9ja3MgOiBbdGhpcy5wYXJhZ3JhcGgoJycpXSksXHJcbiAgICApXHJcbiAgfVxyXG5cclxuICAvKiogQSBHRk0gcGlwZSB0YWJsZTogYSBoZWFkZXIgcm93LCBhIGRlbGltaXRlciByb3csIHRoZW4gYm9keSByb3dzLiAqL1xyXG4gIHByaXZhdGUgdHJ5VGFibGUoXHJcbiAgICBsaW5lczogcmVhZG9ubHkgc3RyaW5nW10sXHJcbiAgICBzdGFydDogbnVtYmVyLFxyXG4gICk6IHsgbm9kZTogRWRpdG9yTm9kZTsgbmV4dDogbnVtYmVyIH0gfCBudWxsIHtcclxuICAgIGlmICghdGhpcy5oYXModGhpcy5uYW1lcy50YWJsZSkgfHwgIXRoaXMuaGFzKHRoaXMubmFtZXMucm93KSB8fCAhdGhpcy5oYXModGhpcy5uYW1lcy5jZWxsKSkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gICAgY29uc3QgaGVhZGVyID0gbGluZXNbc3RhcnRdIGFzIHN0cmluZ1xyXG4gICAgY29uc3QgZGVsaW1pdGVyID0gbGluZXNbc3RhcnQgKyAxXVxyXG4gICAgaWYgKCFoZWFkZXIuaW5jbHVkZXMoJ3wnKSB8fCBkZWxpbWl0ZXIgPT09IHVuZGVmaW5lZCkgcmV0dXJuIG51bGxcclxuICAgIGlmICghVEFCTEVfREVMSU1JVEVSLnRlc3QoZGVsaW1pdGVyKSkgcmV0dXJuIG51bGxcclxuXHJcbiAgICBjb25zdCBhbGlnbnMgPSBzcGxpdFJvdyhkZWxpbWl0ZXIpLm1hcCgoc3BlYykgPT4ge1xyXG4gICAgICBjb25zdCB0cmltbWVkID0gc3BlYy50cmltKClcclxuICAgICAgY29uc3QgbGVmdCA9IHRyaW1tZWQuc3RhcnRzV2l0aCgnOicpXHJcbiAgICAgIGNvbnN0IHJpZ2h0ID0gdHJpbW1lZC5lbmRzV2l0aCgnOicpXHJcbiAgICAgIGlmIChsZWZ0ICYmIHJpZ2h0KSByZXR1cm4gJ2NlbnRlcidcclxuICAgICAgaWYgKGxlZnQpIHJldHVybiAnbGVmdCdcclxuICAgICAgaWYgKHJpZ2h0KSByZXR1cm4gJ3JpZ2h0J1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfSlcclxuXHJcbiAgICBjb25zdCByb3dMaW5lczogc3RyaW5nW10gPSBbaGVhZGVyXVxyXG4gICAgbGV0IGluZGV4ID0gc3RhcnQgKyAyXHJcbiAgICB3aGlsZSAoaW5kZXggPCBsaW5lcy5sZW5ndGgpIHtcclxuICAgICAgY29uc3QgY2FuZGlkYXRlID0gbGluZXNbaW5kZXhdIGFzIHN0cmluZ1xyXG4gICAgICBpZiAoY2FuZGlkYXRlLnRyaW0oKSA9PT0gJycgfHwgIWNhbmRpZGF0ZS5pbmNsdWRlcygnfCcpKSBicmVha1xyXG4gICAgICByb3dMaW5lcy5wdXNoKGNhbmRpZGF0ZSlcclxuICAgICAgaW5kZXggKz0gMVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHJvd3MgPSByb3dMaW5lcy5tYXAoKGxpbmUsIHJvd0luZGV4KSA9PiB7XHJcbiAgICAgIGNvbnN0IGNlbGxzID0gc3BsaXRSb3cobGluZSkubWFwKChjZWxsU291cmNlLCBjb2x1bW5JbmRleCkgPT5cclxuICAgICAgICB0aGlzLnNjaGVtYVxyXG4gICAgICAgICAgLm5vZGVUeXBlKHRoaXMubmFtZXMuY2VsbClcclxuICAgICAgICAgIC5jcmVhdGUoXHJcbiAgICAgICAgICAgIHsgaGVhZGVyOiByb3dJbmRleCA9PT0gMCwgYWxpZ246IGFsaWduc1tjb2x1bW5JbmRleF0gPz8gbnVsbCB9LFxyXG4gICAgICAgICAgICBGcmFnbWVudC5vZih0aGlzLnBhcmFncmFwaChjZWxsU291cmNlLnRyaW0oKS5yZXBsYWNlQWxsKCdcXFxcfCcsICd8JykpKSxcclxuICAgICAgICAgICksXHJcbiAgICAgIClcclxuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hLm5vZGVUeXBlKHRoaXMubmFtZXMucm93KS5jcmVhdGUodW5kZWZpbmVkLCBGcmFnbWVudC5mcm9tKGNlbGxzKSlcclxuICAgIH0pXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbm9kZTogdGhpcy5zY2hlbWEubm9kZVR5cGUodGhpcy5uYW1lcy50YWJsZSkuY3JlYXRlKHVuZGVmaW5lZCwgRnJhZ21lbnQuZnJvbShyb3dzKSksXHJcbiAgICAgIG5leHQ6IGluZGV4LFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFNjYW4gb25lIGJsb2NrJ3MgdGV4dCBmb3IgaW5saW5lIG1hcmt1cCwgcHJvZHVjaW5nIGFuIGlubGluZSBGcmFnbWVudC4gKi9cclxuICBwcml2YXRlIGlubGluZShzb3VyY2U6IHN0cmluZyk6IEZyYWdtZW50IHtcclxuICAgIGNvbnN0IG5vZGVzID0gbmV3IElubGluZVBhcnNlcih0aGlzLnNjaGVtYSwgc291cmNlKS5wYXJzZSgpXHJcbiAgICByZXR1cm4gbWVyZ2VJbmxpbmUoRnJhZ21lbnQuZnJvbShub2RlcykpXHJcbiAgfVxyXG59XHJcblxyXG4vKiogU3BsaXQgYSBwaXBlLXRhYmxlIHJvdyBpbnRvIGl0cyBjZWxscywgaG9ub3VyaW5nIGBcXHxgIGVzY2FwZXMuICovXHJcbmZ1bmN0aW9uIHNwbGl0Um93KGxpbmU6IHN0cmluZyk6IHN0cmluZ1tdIHtcclxuICBjb25zdCB0cmltbWVkID0gbGluZS50cmltKCkucmVwbGFjZSgvXlxcfC8sICcnKS5yZXBsYWNlKC9cXHwkLywgJycpXHJcbiAgY29uc3QgY2VsbHM6IHN0cmluZ1tdID0gW11cclxuICBsZXQgY3VycmVudCA9ICcnXHJcbiAgbGV0IGVzY2FwZWQgPSBmYWxzZVxyXG4gIGZvciAoY29uc3QgY2hhciBvZiB0cmltbWVkKSB7XHJcbiAgICBpZiAoZXNjYXBlZCkge1xyXG4gICAgICAvLyBLZWVwIHRoZSBlc2NhcGU6IHRoZSBjYWxsZXIgdW5lc2NhcGVzIGFmdGVyIHRyaW1taW5nLlxyXG4gICAgICBjdXJyZW50ICs9IGNoYXIgPT09ICd8JyA/ICdcXFxcfCcgOiBgXFxcXCR7Y2hhcn1gXHJcbiAgICAgIGVzY2FwZWQgPSBmYWxzZVxyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG4gICAgaWYgKGNoYXIgPT09ICdcXFxcJykge1xyXG4gICAgICBlc2NhcGVkID0gdHJ1ZVxyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG4gICAgaWYgKGNoYXIgPT09ICd8Jykge1xyXG4gICAgICBjZWxscy5wdXNoKGN1cnJlbnQpXHJcbiAgICAgIGN1cnJlbnQgPSAnJ1xyXG4gICAgICBjb250aW51ZVxyXG4gICAgfVxyXG4gICAgY3VycmVudCArPSBjaGFyXHJcbiAgfVxyXG4gIGNlbGxzLnB1c2goY3VycmVudClcclxuICByZXR1cm4gY2VsbHNcclxufVxyXG5cclxuZnVuY3Rpb24gaXNGZW5jZUNsb3NlKGxpbmU6IHN0cmluZywgbWFya2VyOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICBjb25zdCB0cmltbWVkID0gbGluZS50cmltKClcclxuICBjb25zdCBjaGFyID0gbWFya2VyWzBdIGFzIHN0cmluZ1xyXG4gIHJldHVybiB0cmltbWVkLmxlbmd0aCA+PSBtYXJrZXIubGVuZ3RoICYmIHRyaW1tZWQgPT09IGNoYXIucmVwZWF0KHRyaW1tZWQubGVuZ3RoKVxyXG59XHJcblxyXG4vKipcclxuICogSW5saW5lIHNjYW5uZXIuIFdhbGtzIHRoZSB0ZXh0IG9uY2UsIHJlY29nbml6aW5nIGNvZGUgc3BhbnMgZmlyc3QgKG5vdGhpbmdcclxuICogaW5zaWRlIHRoZW0gaXMgbWFya3VwKSwgdGhlbiBpbWFnZXMsIGxpbmtzLCBhbmQgdGhlIGVtcGhhc2lzIGRlbGltaXRlcnMuXHJcbiAqL1xyXG5jbGFzcyBJbmxpbmVQYXJzZXIge1xyXG4gIHByaXZhdGUgaW5kZXggPSAwXHJcbiAgcHJpdmF0ZSByZWFkb25seSBvdXQ6IEVkaXRvck5vZGVbXSA9IFtdXHJcbiAgcHJpdmF0ZSBidWZmZXIgPSAnJ1xyXG5cclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2NoZW1hOiBTY2hlbWEsXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nLFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBtYXJrczogcmVhZG9ubHkgTWFya1tdID0gW10sXHJcbiAgKSB7fVxyXG5cclxuICBwYXJzZSgpOiBFZGl0b3JOb2RlW10ge1xyXG4gICAgd2hpbGUgKHRoaXMuaW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgY29uc3QgY2hhciA9IHRoaXMuc291cmNlW3RoaXMuaW5kZXhdIGFzIHN0cmluZ1xyXG5cclxuICAgICAgaWYgKGNoYXIgPT09ICdcXFxcJykge1xyXG4gICAgICAgIC8vIEEgYmFja3NsYXNoIGVzY2FwZSBjb250cmlidXRlcyB0aGUgbmV4dCBjaGFyYWN0ZXIgbGl0ZXJhbGx5LlxyXG4gICAgICAgIGNvbnN0IG5leHQgPSB0aGlzLnNvdXJjZVt0aGlzLmluZGV4ICsgMV1cclxuICAgICAgICBpZiAobmV4dCAhPT0gdW5kZWZpbmVkICYmIC9bXFxcXGAqX1tcXF08PiZ+fCQjKy4oKSEtXS8udGVzdChuZXh0KSkge1xyXG4gICAgICAgICAgdGhpcy5idWZmZXIgKz0gbmV4dFxyXG4gICAgICAgICAgdGhpcy5pbmRleCArPSAyXHJcbiAgICAgICAgICBjb250aW51ZVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmJ1ZmZlciArPSBjaGFyXHJcbiAgICAgICAgdGhpcy5pbmRleCArPSAxXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGNoYXIgPT09ICdcXG4nKSB7XHJcbiAgICAgICAgdGhpcy5mbHVzaCgpXHJcbiAgICAgICAgaWYgKHRoaXMuaGFzKCdoYXJkQnJlYWsnKSkgdGhpcy5vdXQucHVzaCh0aGlzLnNjaGVtYS5ub2RlVHlwZSgnaGFyZEJyZWFrJykuY3JlYXRlKCkpXHJcbiAgICAgICAgdGhpcy5pbmRleCArPSAxXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGNoYXIgPT09ICdgJyAmJiB0aGlzLnRyeUNvZGUoKSkgY29udGludWVcclxuICAgICAgaWYgKGNoYXIgPT09ICchJyAmJiB0aGlzLnRyeUltYWdlKCkpIGNvbnRpbnVlXHJcbiAgICAgIGlmIChjaGFyID09PSAnWycgJiYgdGhpcy50cnlMaW5rKCkpIGNvbnRpbnVlXHJcbiAgICAgIGlmICgoY2hhciA9PT0gJyonIHx8IGNoYXIgPT09ICdfJyB8fCBjaGFyID09PSAnficpICYmIHRoaXMudHJ5RW1waGFzaXMoKSkgY29udGludWVcclxuXHJcbiAgICAgIHRoaXMuYnVmZmVyICs9IGNoYXJcclxuICAgICAgdGhpcy5pbmRleCArPSAxXHJcbiAgICB9XHJcbiAgICB0aGlzLmZsdXNoKClcclxuICAgIHJldHVybiB0aGlzLm91dFxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYXMobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gT2JqZWN0Lmhhc093bih0aGlzLnNjaGVtYS5ub2RlcywgbmFtZSlcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFzTWFyayhuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiBPYmplY3QuaGFzT3duKHRoaXMuc2NoZW1hLm1hcmtzLCBuYW1lKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBmbHVzaCgpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmJ1ZmZlci5sZW5ndGggPT09IDApIHJldHVyblxyXG4gICAgdGhpcy5vdXQucHVzaCh0aGlzLnNjaGVtYS50ZXh0KHRoaXMuYnVmZmVyLCB0aGlzLm1hcmtzKSlcclxuICAgIHRoaXMuYnVmZmVyID0gJydcclxuICB9XHJcblxyXG4gIC8qKiBBIGNvZGUgc3BhbjogdGhlIG1hdGNoaW5nIHJ1biBvZiBiYWNrdGlja3MgY2xvc2VzIGl0LiAqL1xyXG4gIHByaXZhdGUgdHJ5Q29kZSgpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGZlbmNlID0gL15gKy8uZXhlYyh0aGlzLnNvdXJjZS5zbGljZSh0aGlzLmluZGV4KSk/LlswXSBhcyBzdHJpbmdcclxuICAgIGNvbnN0IGNsb3NlID0gdGhpcy5zb3VyY2UuaW5kZXhPZihmZW5jZSwgdGhpcy5pbmRleCArIGZlbmNlLmxlbmd0aClcclxuICAgIGlmIChjbG9zZSA9PT0gLTEpIHJldHVybiBmYWxzZVxyXG4gICAgLy8gUmVqZWN0IGEgbG9uZ2VyIHJ1biBhcyB0aGUgY2xvc2VyLCBwZXIgQ29tbW9uTWFyay5cclxuICAgIGlmICh0aGlzLnNvdXJjZVtjbG9zZSArIGZlbmNlLmxlbmd0aF0gPT09ICdgJykgcmV0dXJuIGZhbHNlXHJcbiAgICBsZXQgdGV4dCA9IHRoaXMuc291cmNlLnNsaWNlKHRoaXMuaW5kZXggKyBmZW5jZS5sZW5ndGgsIGNsb3NlKVxyXG4gICAgLy8gQSBzaW5nbGUgbGVhZGluZyBhbmQgdHJhaWxpbmcgc3BhY2UgaXMgc3RyaXBwZWQgd2hlbiBib3RoIGFyZSBwcmVzZW50LlxyXG4gICAgaWYgKHRleHQuc3RhcnRzV2l0aCgnICcpICYmIHRleHQuZW5kc1dpdGgoJyAnKSAmJiB0ZXh0LnRyaW0oKS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHRleHQgPSB0ZXh0LnNsaWNlKDEsIC0xKVxyXG4gICAgfVxyXG4gICAgdGhpcy5mbHVzaCgpXHJcbiAgICBpZiAodGV4dC5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IG1hcmtzID0gdGhpcy5oYXNNYXJrKCdjb2RlJylcclxuICAgICAgICA/IHRoaXMuc2NoZW1hLm1hcmsoJ2NvZGUnKS5hZGRUb1NldCh0aGlzLm1hcmtzKVxyXG4gICAgICAgIDogdGhpcy5tYXJrc1xyXG4gICAgICB0aGlzLm91dC5wdXNoKHRoaXMuc2NoZW1hLnRleHQodGV4dCwgbWFya3MpKVxyXG4gICAgfVxyXG4gICAgdGhpcy5pbmRleCA9IGNsb3NlICsgZmVuY2UubGVuZ3RoXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB0cnlJbWFnZSgpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzLnNvdXJjZVt0aGlzLmluZGV4ICsgMV0gIT09ICdbJykgcmV0dXJuIGZhbHNlXHJcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUJyYWNrZXRMaW5rKHRoaXMuc291cmNlLCB0aGlzLmluZGV4ICsgMSlcclxuICAgIGlmICghcGFyc2VkKSByZXR1cm4gZmFsc2VcclxuICAgIGlmICghdGhpcy5oYXMoJ2ltYWdlJykpIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3Qgc3JjID0gc2FmZUltYWdlU3JjKHBhcnNlZC5kZXN0aW5hdGlvbilcclxuICAgIGlmICghc3JjKSB7XHJcbiAgICAgIC8vIFVuc2FmZSBzb3VyY2U6IGtlZXAgdGhlIGFsdCB0ZXh0IHNvIG5vdGhpbmcgdGhlIHVzZXIgd3JvdGUgaXMgbG9zdC5cclxuICAgICAgdGhpcy5idWZmZXIgKz0gcGFyc2VkLnRleHRcclxuICAgICAgdGhpcy5pbmRleCA9IHBhcnNlZC5uZXh0XHJcbiAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcbiAgICB0aGlzLmZsdXNoKClcclxuICAgIGNvbnN0IGF0dHJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgc3JjLCBhbHQ6IHBhcnNlZC50ZXh0IH1cclxuICAgIGlmIChwYXJzZWQudGl0bGUpIGF0dHJzLnRpdGxlID0gcGFyc2VkLnRpdGxlXHJcbiAgICB0aGlzLm91dC5wdXNoKHRoaXMuc2NoZW1hLm5vZGVUeXBlKCdpbWFnZScpLmNyZWF0ZShhdHRycykpXHJcbiAgICB0aGlzLmluZGV4ID0gcGFyc2VkLm5leHRcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHRyeUxpbmsoKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUJyYWNrZXRMaW5rKHRoaXMuc291cmNlLCB0aGlzLmluZGV4KVxyXG4gICAgaWYgKCFwYXJzZWQpIHJldHVybiBmYWxzZVxyXG4gICAgLy8gVGhlIHNhbWUgc2FuaXRpemVyIHRoZSBzY2hlbWEgYW5kIEhUTUwgcGFyc2VyIHVzZTogYSBgamF2YXNjcmlwdDpgIFVSTFxyXG4gICAgLy8geWllbGRzIG5vIG1hcmssIGFuZCB0aGUgbGluayB0ZXh0IHN1cnZpdmVzIGFzIHBsYWluIHRleHQuXHJcbiAgICBjb25zdCBocmVmID0gc2FmZUhyZWYocGFyc2VkLmRlc3RpbmF0aW9uKVxyXG4gICAgY29uc3QgbWFya3MgPVxyXG4gICAgICBocmVmICYmIHRoaXMuaGFzTWFyaygnbGluaycpXHJcbiAgICAgICAgPyB0aGlzLnNjaGVtYVxyXG4gICAgICAgICAgICAubWFyaygnbGluaycsIHBhcnNlZC50aXRsZSA/IHsgaHJlZiwgdGl0bGU6IHBhcnNlZC50aXRsZSB9IDogeyBocmVmIH0pXHJcbiAgICAgICAgICAgIC5hZGRUb1NldCh0aGlzLm1hcmtzKVxyXG4gICAgICAgIDogdGhpcy5tYXJrc1xyXG4gICAgdGhpcy5mbHVzaCgpXHJcbiAgICBjb25zdCBpbm5lciA9IG5ldyBJbmxpbmVQYXJzZXIodGhpcy5zY2hlbWEsIHBhcnNlZC50ZXh0LCBtYXJrcykucGFyc2UoKVxyXG4gICAgdGhpcy5vdXQucHVzaCguLi5pbm5lcilcclxuICAgIHRoaXMuaW5kZXggPSBwYXJzZWQubmV4dFxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcblxyXG4gIC8qKiBgKipib2xkKipgLCBgKml0YWxpYypgLCBgX2l0YWxpY19gLCBgfn5zdHJpa2V+fmAuICovXHJcbiAgcHJpdmF0ZSB0cnlFbXBoYXNpcygpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IGNoYXIgPSB0aGlzLnNvdXJjZVt0aGlzLmluZGV4XSBhcyBzdHJpbmdcclxuICAgIGNvbnN0IHJ1biA9IC9eKFxcKit8Xyt8fispLy5leGVjKHRoaXMuc291cmNlLnNsaWNlKHRoaXMuaW5kZXgpKT8uWzBdIGFzIHN0cmluZ1xyXG4gICAgY29uc3QgaXNTdHJvbmcgPSBjaGFyICE9PSAnficgJiYgcnVuLmxlbmd0aCA+PSAyXHJcbiAgICBjb25zdCBkZWxpbWl0ZXIgPSBjaGFyID09PSAnficgPyAnfn4nIDogaXNTdHJvbmcgPyBgJHtjaGFyfSR7Y2hhcn1gIDogY2hhclxyXG4gICAgaWYgKGNoYXIgPT09ICd+JyAmJiBydW4ubGVuZ3RoIDwgMikgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgY29uc3QgY29udGVudFN0YXJ0ID0gdGhpcy5pbmRleCArIGRlbGltaXRlci5sZW5ndGhcclxuICAgIGNvbnN0IGNsb3NlID0gZmluZENsb3NpbmcodGhpcy5zb3VyY2UsIGNvbnRlbnRTdGFydCwgZGVsaW1pdGVyKVxyXG4gICAgaWYgKGNsb3NlID09PSAtMSkgcmV0dXJuIGZhbHNlXHJcbiAgICBjb25zdCBpbm5lciA9IHRoaXMuc291cmNlLnNsaWNlKGNvbnRlbnRTdGFydCwgY2xvc2UpXHJcbiAgICBpZiAoaW5uZXIubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2VcclxuXHJcbiAgICBjb25zdCBtYXJrTmFtZSA9IGNoYXIgPT09ICd+JyA/ICdzdHJpa2V0aHJvdWdoJyA6IGlzU3Ryb25nID8gJ2JvbGQnIDogJ2l0YWxpYydcclxuICAgIGNvbnN0IG1hcmtzID0gdGhpcy5oYXNNYXJrKG1hcmtOYW1lKVxyXG4gICAgICA/IHRoaXMuc2NoZW1hLm1hcmsobWFya05hbWUpLmFkZFRvU2V0KHRoaXMubWFya3MpXHJcbiAgICAgIDogdGhpcy5tYXJrc1xyXG4gICAgdGhpcy5mbHVzaCgpXHJcbiAgICB0aGlzLm91dC5wdXNoKC4uLm5ldyBJbmxpbmVQYXJzZXIodGhpcy5zY2hlbWEsIGlubmVyLCBtYXJrcykucGFyc2UoKSlcclxuICAgIHRoaXMuaW5kZXggPSBjbG9zZSArIGRlbGltaXRlci5sZW5ndGhcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG59XHJcblxyXG4vKiogVGhlIGNsb3NpbmcgZGVsaW1pdGVyIGZvciBhbiBlbXBoYXNpcyBydW4sIHNraXBwaW5nIGVzY2FwZXMgYW5kIGNvZGUuICovXHJcbmZ1bmN0aW9uIGZpbmRDbG9zaW5nKHNvdXJjZTogc3RyaW5nLCBmcm9tOiBudW1iZXIsIGRlbGltaXRlcjogc3RyaW5nKTogbnVtYmVyIHtcclxuICBsZXQgaW5kZXggPSBmcm9tXHJcbiAgd2hpbGUgKGluZGV4IDwgc291cmNlLmxlbmd0aCkge1xyXG4gICAgY29uc3QgY2hhciA9IHNvdXJjZVtpbmRleF0gYXMgc3RyaW5nXHJcbiAgICBpZiAoY2hhciA9PT0gJ1xcXFwnKSB7XHJcbiAgICAgIGluZGV4ICs9IDJcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGlmIChjaGFyID09PSAnYCcpIHtcclxuICAgICAgY29uc3QgZmVuY2UgPSAvXmArLy5leGVjKHNvdXJjZS5zbGljZShpbmRleCkpPy5bMF0gYXMgc3RyaW5nXHJcbiAgICAgIGNvbnN0IGNsb3NlID0gc291cmNlLmluZGV4T2YoZmVuY2UsIGluZGV4ICsgZmVuY2UubGVuZ3RoKVxyXG4gICAgICBpbmRleCA9IGNsb3NlID09PSAtMSA/IGluZGV4ICsgZmVuY2UubGVuZ3RoIDogY2xvc2UgKyBmZW5jZS5sZW5ndGhcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGlmIChzb3VyY2Uuc3RhcnRzV2l0aChkZWxpbWl0ZXIsIGluZGV4KSkge1xyXG4gICAgICAvLyBgKmAgbXVzdCBub3QgbWF0Y2ggdGhlIGZpcnN0IGAqYCBvZiBhIGAqKmAgcnVuIHVzZWQgYXMgc3Ryb25nLlxyXG4gICAgICBpZiAoZGVsaW1pdGVyLmxlbmd0aCA9PT0gMSAmJiBzb3VyY2VbaW5kZXggKyAxXSA9PT0gZGVsaW1pdGVyKSB7XHJcbiAgICAgICAgaW5kZXggKz0gMlxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGluZGV4XHJcbiAgICB9XHJcbiAgICBpbmRleCArPSAxXHJcbiAgfVxyXG4gIHJldHVybiAtMVxyXG59XHJcblxyXG4vKipcclxuICogYFt0ZXh0XShkZXN0aW5hdGlvbiBcInRpdGxlXCIpYCBzdGFydGluZyBhdCBgYXRgLiBIYW5kbGVzIG5lc3RlZCBicmFja2V0cyBpblxyXG4gKiB0aGUgdGV4dCBhbmQgYW4gYW5nbGUtYnJhY2tldGVkIGRlc3RpbmF0aW9uLlxyXG4gKi9cclxuZnVuY3Rpb24gcGFyc2VCcmFja2V0TGluayhcclxuICBzb3VyY2U6IHN0cmluZyxcclxuICBhdDogbnVtYmVyLFxyXG4pOiB7IHRleHQ6IHN0cmluZzsgZGVzdGluYXRpb246IHN0cmluZzsgdGl0bGU6IHN0cmluZyB8IG51bGw7IG5leHQ6IG51bWJlciB9IHwgbnVsbCB7XHJcbiAgaWYgKHNvdXJjZVthdF0gIT09ICdbJykgcmV0dXJuIG51bGxcclxuICBsZXQgZGVwdGggPSAwXHJcbiAgbGV0IGluZGV4ID0gYXRcclxuICBsZXQgdGV4dEVuZCA9IC0xXHJcbiAgd2hpbGUgKGluZGV4IDwgc291cmNlLmxlbmd0aCkge1xyXG4gICAgY29uc3QgY2hhciA9IHNvdXJjZVtpbmRleF0gYXMgc3RyaW5nXHJcbiAgICBpZiAoY2hhciA9PT0gJ1xcXFwnKSB7XHJcbiAgICAgIGluZGV4ICs9IDJcclxuICAgICAgY29udGludWVcclxuICAgIH1cclxuICAgIGlmIChjaGFyID09PSAnWycpIGRlcHRoICs9IDFcclxuICAgIGVsc2UgaWYgKGNoYXIgPT09ICddJykge1xyXG4gICAgICBkZXB0aCAtPSAxXHJcbiAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgICAgIHRleHRFbmQgPSBpbmRleFxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGluZGV4ICs9IDFcclxuICB9XHJcbiAgaWYgKHRleHRFbmQgPT09IC0xIHx8IHNvdXJjZVt0ZXh0RW5kICsgMV0gIT09ICcoJykgcmV0dXJuIG51bGxcclxuXHJcbiAgY29uc3QgdGV4dCA9IHNvdXJjZS5zbGljZShhdCArIDEsIHRleHRFbmQpXHJcbiAgbGV0IGN1cnNvciA9IHRleHRFbmQgKyAyXHJcbiAgbGV0IGRlc3RpbmF0aW9uID0gJydcclxuXHJcbiAgaWYgKHNvdXJjZVtjdXJzb3JdID09PSAnPCcpIHtcclxuICAgIGNvbnN0IGNsb3NlID0gc291cmNlLmluZGV4T2YoJz4nLCBjdXJzb3IpXHJcbiAgICBpZiAoY2xvc2UgPT09IC0xKSByZXR1cm4gbnVsbFxyXG4gICAgZGVzdGluYXRpb24gPSBzb3VyY2Uuc2xpY2UoY3Vyc29yICsgMSwgY2xvc2UpXHJcbiAgICBjdXJzb3IgPSBjbG9zZSArIDFcclxuICB9IGVsc2Uge1xyXG4gICAgbGV0IHBhcmVucyA9IDBcclxuICAgIHdoaWxlIChjdXJzb3IgPCBzb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgIGNvbnN0IGNoYXIgPSBzb3VyY2VbY3Vyc29yXSBhcyBzdHJpbmdcclxuICAgICAgaWYgKGNoYXIgPT09ICdcXFxcJykge1xyXG4gICAgICAgIGRlc3RpbmF0aW9uICs9IHNvdXJjZVtjdXJzb3IgKyAxXSA/PyAnJ1xyXG4gICAgICAgIGN1cnNvciArPSAyXHJcbiAgICAgICAgY29udGludWVcclxuICAgICAgfVxyXG4gICAgICBpZiAoY2hhciA9PT0gJygnKSBwYXJlbnMgKz0gMVxyXG4gICAgICBlbHNlIGlmIChjaGFyID09PSAnKScpIHtcclxuICAgICAgICBpZiAocGFyZW5zID09PSAwKSBicmVha1xyXG4gICAgICAgIHBhcmVucyAtPSAxXHJcbiAgICAgIH0gZWxzZSBpZiAoL1xccy8udGVzdChjaGFyKSkgYnJlYWtcclxuICAgICAgZGVzdGluYXRpb24gKz0gY2hhclxyXG4gICAgICBjdXJzb3IgKz0gMVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gQW4gb3B0aW9uYWwgcXVvdGVkIHRpdGxlLCB0aGVuIHRoZSBjbG9zaW5nIHBhcmVuLlxyXG4gIGxldCB0aXRsZTogc3RyaW5nIHwgbnVsbCA9IG51bGxcclxuICB3aGlsZSAoY3Vyc29yIDwgc291cmNlLmxlbmd0aCAmJiAvXFxzLy50ZXN0KHNvdXJjZVtjdXJzb3JdIGFzIHN0cmluZykpIGN1cnNvciArPSAxXHJcbiAgY29uc3QgcXVvdGUgPSBzb3VyY2VbY3Vyc29yXVxyXG4gIGlmIChxdW90ZSA9PT0gJ1wiJyB8fCBxdW90ZSA9PT0gXCInXCIpIHtcclxuICAgIGxldCBjb2xsZWN0ZWQgPSAnJ1xyXG4gICAgY3Vyc29yICs9IDFcclxuICAgIHdoaWxlIChjdXJzb3IgPCBzb3VyY2UubGVuZ3RoICYmIHNvdXJjZVtjdXJzb3JdICE9PSBxdW90ZSkge1xyXG4gICAgICBpZiAoc291cmNlW2N1cnNvcl0gPT09ICdcXFxcJykge1xyXG4gICAgICAgIGNvbGxlY3RlZCArPSBzb3VyY2VbY3Vyc29yICsgMV0gPz8gJydcclxuICAgICAgICBjdXJzb3IgKz0gMlxyXG4gICAgICAgIGNvbnRpbnVlXHJcbiAgICAgIH1cclxuICAgICAgY29sbGVjdGVkICs9IHNvdXJjZVtjdXJzb3JdXHJcbiAgICAgIGN1cnNvciArPSAxXHJcbiAgICB9XHJcbiAgICBpZiAoc291cmNlW2N1cnNvcl0gIT09IHF1b3RlKSByZXR1cm4gbnVsbFxyXG4gICAgdGl0bGUgPSBjb2xsZWN0ZWRcclxuICAgIGN1cnNvciArPSAxXHJcbiAgICB3aGlsZSAoY3Vyc29yIDwgc291cmNlLmxlbmd0aCAmJiAvXFxzLy50ZXN0KHNvdXJjZVtjdXJzb3JdIGFzIHN0cmluZykpIGN1cnNvciArPSAxXHJcbiAgfVxyXG4gIGlmIChzb3VyY2VbY3Vyc29yXSAhPT0gJyknKSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiB7IHRleHQsIGRlc3RpbmF0aW9uLCB0aXRsZSwgbmV4dDogY3Vyc29yICsgMSB9XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcblxyXG4vKipcclxuICogQW5ub3VuY2VtZW50cyB0byBhc3Npc3RpdmUgdGVjaG5vbG9neS5cclxuICpcclxuICogQSBjb250ZW50ZWRpdGFibGUgc3VyZmFjZSBhbHJlYWR5IHJlcG9ydHMgdHlwZWQgY2hhcmFjdGVycyBhbmQgY2FyZXRcclxuICogbW92ZW1lbnQsIHNjcmVlbiByZWFkZXJzIHdhdGNoIHRoZSBET00gZm9yIHRoYXQuIFdoYXQgdGhleSBkbyBub3QgcmVwb3J0IGlzXHJcbiAqICpzdHJ1Y3R1cmUqIGNoYW5naW5nIG91dCBmcm9tIHVuZGVyIHRoZSBjYXJldDogdGhyZWUgYmxvY2tzIGRlbGV0ZWQgYnkgb25lXHJcbiAqIGtleSBwcmVzcywgYSBwYXJhZ3JhcGggYmVjb21pbmcgYSBoZWFkaW5nLCBhIGxpc3QgYXBwZWFyaW5nLiBUaG9zZSBlZGl0cyBhcmVcclxuICogc2lsZW50LCBhbmQgc2lsZW5jZSBhZnRlciBhIGRlc3RydWN0aXZlIGtleSBwcmVzcyBpcyB0aGUgd29yc3QgY2FzZS5cclxuICpcclxuICogVGhpcyBpcyB0aGUgc2hhcmVkIHdheSB0byBzYXkgdGhlbSBvdXQgbG91ZC5cclxuICovXHJcblxyXG4vKiogSG93IHVyZ2VudGx5IGEgbWVzc2FnZSBzaG91bGQgaW50ZXJydXB0LiAqL1xyXG5leHBvcnQgdHlwZSBBbm5vdW5jZVByaW9yaXR5ID0gJ3BvbGl0ZScgfCAnYXNzZXJ0aXZlJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBBbm5vdW5jZXIge1xyXG4gIC8qKiBUaGUgbGl2ZSByZWdpb25zLCBhcHBlbmRlZCB3aGVyZXZlciB0aGUgYW5ub3VuY2VyIHdhcyB0b2xkIHRvIGxpdmUuICovXHJcbiAgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnRcclxuICAvKiogU2F5IHNvbWV0aGluZy4gUmVwZWF0aW5nIHRoZSBzYW1lIHRleHQgc3RpbGwgYW5ub3VuY2VzIGl0LiAqL1xyXG4gIGFubm91bmNlKG1lc3NhZ2U6IHN0cmluZywgcHJpb3JpdHk/OiBBbm5vdW5jZVByaW9yaXR5KTogdm9pZFxyXG4gIC8qKiBFbXB0eSBib3RoIHJlZ2lvbnMgd2l0aG91dCBzYXlpbmcgYW55dGhpbmcuICovXHJcbiAgY2xlYXIoKTogdm9pZFxyXG4gIGRlc3Ryb3koKTogdm9pZFxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEFubm91bmNlck9wdGlvbnMge1xyXG4gIC8qKiBXaGVyZSB0aGUgcmVnaW9ucyBhcmUgYXBwZW5kZWQuIERlZmF1bHRzIHRvIGBkb2N1bWVudC5ib2R5YC4gKi9cclxuICByZWFkb25seSBjb250YWluZXI/OiBIVE1MRWxlbWVudFxyXG4gIC8qKlxyXG4gICAqIEhvdyBsb25nIGEgbWVzc2FnZSBzdGF5cyBpbiB0aGUgcmVnaW9uIGJlZm9yZSBpdCBpcyBjbGVhcmVkLCBpbiBtcy4gTG9uZ1xyXG4gICAqIGVub3VnaCBmb3IgYSByZWFkZXIgdG8gcGljayBpdCB1cCwgc2hvcnQgZW5vdWdoIHRoYXQgYSBsYXRlciBpZGVudGljYWxcclxuICAgKiBtZXNzYWdlIGlzIGEgcmVhbCBjaGFuZ2UuIERlZmF1bHRzIHRvIDEwMDAuXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgY2xlYXJBZnRlck1zPzogbnVtYmVyXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBPZmYtc2NyZWVuIHJhdGhlciB0aGFuIGBkaXNwbGF5OiBub25lYCBvciBgaGlkZGVuYDogYSByZWdpb24gcmVtb3ZlZCBmcm9tXHJcbiAqIHRoZSBhY2Nlc3NpYmlsaXR5IHRyZWUgaXMgbmV2ZXIgcmVhZCwgd2hpY2ggd291bGQgbWFrZSB0aGUgd2hvbGUgdGhpbmcgYVxyXG4gKiBuby1vcCB0aGF0IGxvb2tzIGxpa2UgaXQgd29ya3MuXHJcbiAqL1xyXG5jb25zdCBWSVNVQUxMWV9ISURERU4gPVxyXG4gICdwb3NpdGlvbjphYnNvbHV0ZTt3aWR0aDoxcHg7aGVpZ2h0OjFweDttYXJnaW46LTFweDtwYWRkaW5nOjA7b3ZlcmZsb3c6aGlkZGVuOycgK1xyXG4gICdjbGlwOnJlY3QoMCAwIDAgMCk7Y2xpcC1wYXRoOmluc2V0KDUwJSk7d2hpdGUtc3BhY2U6bm93cmFwO2JvcmRlcjowJ1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFubm91bmNlcihkb2N1bWVudDogRG9jdW1lbnQsIG9wdGlvbnM6IEFubm91bmNlck9wdGlvbnMgPSB7fSk6IEFubm91bmNlciB7XHJcbiAgY29uc3QgY2xlYXJBZnRlck1zID0gb3B0aW9ucy5jbGVhckFmdGVyTXMgPz8gMTAwMFxyXG5cclxuICBjb25zdCByb290ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcclxuICByb290LmNsYXNzTmFtZSA9ICd0cmV2aXhhbC1hbm5vdW5jZXInXHJcbiAgcm9vdC5zZXRBdHRyaWJ1dGUoJ3N0eWxlJywgVklTVUFMTFlfSElEREVOKVxyXG5cclxuICAvLyBPbmUgcmVnaW9uIHBlciBwcmlvcml0eS4gRmxpcHBpbmcgYGFyaWEtbGl2ZWAgb24gYSBzaW5nbGUgcmVnaW9uIGlzXHJcbiAgLy8gdW5yZWxpYWJsZSBhY3Jvc3MgcmVhZGVycywgc2V2ZXJhbCBsYXRjaCB0aGUgdmFsdWUgdGhleSBzYXcgZmlyc3QsIHNvXHJcbiAgLy8gdGhlIHR3byBsaXZlIHNpZGUgYnkgc2lkZSBhbmQgZWFjaCBrZWVwcyBvbmUgc2V0dGluZyBmb3IgZ29vZC5cclxuICBjb25zdCByZWdpb25zOiBSZWNvcmQ8QW5ub3VuY2VQcmlvcml0eSwgSFRNTEVsZW1lbnQ+ID0ge1xyXG4gICAgcG9saXRlOiByZWdpb24oZG9jdW1lbnQsICdwb2xpdGUnKSxcclxuICAgIGFzc2VydGl2ZTogcmVnaW9uKGRvY3VtZW50LCAnYXNzZXJ0aXZlJyksXHJcbiAgfVxyXG4gIHJvb3QuYXBwZW5kKHJlZ2lvbnMucG9saXRlLCByZWdpb25zLmFzc2VydGl2ZSlcclxuICA7KG9wdGlvbnMuY29udGFpbmVyID8/IGRvY3VtZW50LmJvZHkpPy5hcHBlbmRDaGlsZChyb290KVxyXG5cclxuICBsZXQgdGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGxcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGVsZW1lbnQ6IHJvb3QsXHJcbiAgICBhbm5vdW5jZShtZXNzYWdlLCBwcmlvcml0eSA9ICdwb2xpdGUnKSB7XHJcbiAgICAgIGNvbnN0IHRleHQgPSBtZXNzYWdlLnRyaW0oKVxyXG4gICAgICBpZiAoIXRleHQpIHJldHVyblxyXG4gICAgICBjb25zdCB0YXJnZXQgPSByZWdpb25zW3ByaW9yaXR5XSA/PyByZWdpb25zLnBvbGl0ZVxyXG4gICAgICBpZiAodGltZXIgIT09IG51bGwpIGNsZWFyVGltZW91dCh0aW1lcilcclxuICAgICAgLy8gRW1wdHlpbmcgZmlyc3QgaXMgd2hhdCBtYWtlcyB0aGUgc2FtZSBtZXNzYWdlIGFubm91bmNlIHR3aWNlOiBhXHJcbiAgICAgIC8vIHJlYWRlciB3YXRjaGVzIGZvciB0aGUgdGV4dCB0byAqY2hhbmdlKiwgc28gc2V0dGluZyBpdCB0byB0aGUgdmFsdWVcclxuICAgICAgLy8gaXQgYWxyZWFkeSBob2xkcyBzYXlzIG5vdGhpbmcgYXQgYWxsLlxyXG4gICAgICB0YXJnZXQudGV4dENvbnRlbnQgPSAnJ1xyXG4gICAgICB0YXJnZXQudGV4dENvbnRlbnQgPSB0ZXh0XHJcbiAgICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgdGFyZ2V0LnRleHRDb250ZW50ID0gJydcclxuICAgICAgICB0aW1lciA9IG51bGxcclxuICAgICAgfSwgY2xlYXJBZnRlck1zKVxyXG4gICAgfSxcclxuICAgIGNsZWFyKCkge1xyXG4gICAgICBpZiAodGltZXIgIT09IG51bGwpIGNsZWFyVGltZW91dCh0aW1lcilcclxuICAgICAgdGltZXIgPSBudWxsXHJcbiAgICAgIHJlZ2lvbnMucG9saXRlLnRleHRDb250ZW50ID0gJydcclxuICAgICAgcmVnaW9ucy5hc3NlcnRpdmUudGV4dENvbnRlbnQgPSAnJ1xyXG4gICAgfSxcclxuICAgIGRlc3Ryb3koKSB7XHJcbiAgICAgIGlmICh0aW1lciAhPT0gbnVsbCkgY2xlYXJUaW1lb3V0KHRpbWVyKVxyXG4gICAgICB0aW1lciA9IG51bGxcclxuICAgICAgcm9vdC5yZW1vdmUoKVxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlZ2lvbihkb2N1bWVudDogRG9jdW1lbnQsIHByaW9yaXR5OiBBbm5vdW5jZVByaW9yaXR5KTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxyXG4gIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCBwcmlvcml0eSlcclxuICAvLyBSZWFkIHRoZSB3aG9sZSByZWdpb24sIG5vdCB0aGUgY2hhbmdlZCB3b3JkOiBhIHBhcnRpYWwgcmVhZGluZyBvZlxyXG4gIC8vIFwiMyBibG9ja3MgZGVsZXRlZFwiIGlzIHdvcnNlIHRoYW4gbm9uZS5cclxuICBlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1hdG9taWMnLCAndHJ1ZScpXHJcbiAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCBwcmlvcml0eSA9PT0gJ2Fzc2VydGl2ZScgPyAnYWxlcnQnIDogJ3N0YXR1cycpXHJcbiAgcmV0dXJuIGVsZW1lbnRcclxufVxyXG5cclxuLyoqIEVuZ2xpc2ggcGx1cmFsIGZvciB0aGUgc21hbGwgY291bnRzIHRoZXNlIG1lc3NhZ2VzIGFjdHVhbGx5IGNhcnJ5LiAqL1xyXG5mdW5jdGlvbiBjb3VudChuOiBudW1iZXIsIHNpbmd1bGFyOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gIHJldHVybiBgJHtufSAke3Npbmd1bGFyfSR7biA9PT0gMSA/ICcnIDogJ3MnfWBcclxufVxyXG5cclxuLyoqXHJcbiAqIFdoYXQgdG8gc2F5IGFib3V0IGEgZG9jdW1lbnQgY2hhbmdlLCBvciBudWxsIHdoZW4gaXQgc3BlYWtzIGZvciBpdHNlbGYuXHJcbiAqXHJcbiAqIERlbGliZXJhdGVseSBxdWlldC4gVHlwaW5nLCBjYXJldCBtb3ZlbWVudCBhbmQgYSBzaW5nbGUgbmV3IGJsb2NrIGFyZSBhbGxcclxuICogdGhpbmdzIGEgcmVhZGVyIGFscmVhZHkgcmVwb3J0cyBmcm9tIHRoZSBET00sIGFuZCByZXBlYXRpbmcgdGhlbSB0dXJucyB0aGVcclxuICogbGl2ZSByZWdpb24gaW50byBub2lzZSB0aGF0IHVzZXJzIHN3aXRjaCBvZmYuIFdoYXQgaXMgYW5ub3VuY2VkIGlzIHdoYXQgYVxyXG4gKiByZWFkZXIgY2Fubm90IHNlZSBjb21pbmc6IGJsb2NrcyBkaXNhcHBlYXJpbmcsIGFuZCB0aGUgYmxvY2sgdW5kZXIgdGhlXHJcbiAqIGNhcmV0IGJlY29taW5nIGEgZGlmZmVyZW50IGtpbmQgb2YgdGhpbmcuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVEb2NDaGFuZ2UoXHJcbiAgYmVmb3JlOiBFZGl0b3JOb2RlLFxyXG4gIGFmdGVyOiBFZGl0b3JOb2RlLFxyXG4gIGJsb2NrVHlwZUJlZm9yZT86IHN0cmluZyB8IG51bGwsXHJcbiAgYmxvY2tUeXBlQWZ0ZXI/OiBzdHJpbmcgfCBudWxsLFxyXG4pOiBzdHJpbmcgfCBudWxsIHtcclxuICBjb25zdCByZW1vdmVkID0gYmVmb3JlLmNoaWxkQ291bnQgLSBhZnRlci5jaGlsZENvdW50XHJcbiAgaWYgKHJlbW92ZWQgPiAwKSByZXR1cm4gYCR7Y291bnQocmVtb3ZlZCwgJ2Jsb2NrJyl9IGRlbGV0ZWRgXHJcbiAgaWYgKGJsb2NrVHlwZUJlZm9yZSAmJiBibG9ja1R5cGVBZnRlciAmJiBibG9ja1R5cGVCZWZvcmUgIT09IGJsb2NrVHlwZUFmdGVyKSB7XHJcbiAgICByZXR1cm4gcmVhZGFibGVUeXBlKGJsb2NrVHlwZUFmdGVyKVxyXG4gIH1cclxuICByZXR1cm4gbnVsbFxyXG59XHJcblxyXG4vKiogYGNvZGVCbG9ja2AgcmVhZHMgYXMgXCJjb2RlIGJsb2NrXCI7IGEgdHlwZSBuYW1lIGlzIG5vdCBhIGxhYmVsLiAqL1xyXG5mdW5jdGlvbiByZWFkYWJsZVR5cGUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICBjb25zdCBzcGFjZWQgPSBuYW1lLnJlcGxhY2UoLyhbYS16MC05XSkoW0EtWl0pL2csICckMSAkMicpLnRvTG93ZXJDYXNlKClcclxuICByZXR1cm4gc3BhY2VkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc3BhY2VkLnNsaWNlKDEpXHJcbn1cclxuIiwgImltcG9ydCB7IGlubGluZUxlbmd0aCB9IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBQb3NpdGlvbiB9IGZyb20gJy4uL21vZGVsL3Bvc2l0aW9uJ1xyXG5pbXBvcnQgdHlwZSB7IERPTVJlbmRlcmVyIH0gZnJvbSAnLi9yZW5kZXJlcidcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRE9NUG9pbnQge1xyXG4gIHJlYWRvbmx5IG5vZGU6IGdsb2JhbFRoaXMuTm9kZVxyXG4gIHJlYWRvbmx5IG9mZnNldDogbnVtYmVyXHJcbn1cclxuXHJcbmNvbnN0IFRFWFRfTk9ERSA9IDNcclxuY29uc3QgRUxFTUVOVF9OT0RFID0gMVxyXG5cclxuLyoqIFBsYWNlaG9sZGVyIGA8YnI+YHMgYW5kIHdpZGdldCBkZWNvcmF0aW9ucyBvY2N1cHkgbm8gbW9kZWwgb2Zmc2V0cy4gKi9cclxuZnVuY3Rpb24gaXNOb25Db250ZW50KG5vZGU6IGdsb2JhbFRoaXMuTm9kZSk6IGJvb2xlYW4ge1xyXG4gIGlmIChub2RlLm5vZGVUeXBlICE9PSBFTEVNRU5UX05PREUpIHJldHVybiBmYWxzZVxyXG4gIGNvbnN0IGRhdGFzZXQgPSAobm9kZSBhcyBIVE1MRWxlbWVudCkuZGF0YXNldFxyXG4gIHJldHVybiBkYXRhc2V0LnRyZXZpeGFsUGxhY2Vob2xkZXIgPT09ICd0cnVlJyB8fCBkYXRhc2V0LnRyZXZpeGFsV2lkZ2V0ID09PSAndHJ1ZSdcclxufVxyXG5cclxuLyoqIE1vZGVsIG5vZGUgYW4gZWxlbWVudCByZW5kZXJzLCBpZiBhbnkuICovXHJcbmZ1bmN0aW9uIG1vZGVsQXQocmVuZGVyZXI6IERPTVJlbmRlcmVyLCBub2RlOiBnbG9iYWxUaGlzLk5vZGUpOiBFZGl0b3JOb2RlIHwgbnVsbCB7XHJcbiAgcmV0dXJuIHJlbmRlcmVyLm1vZGVsT2YuZ2V0KG5vZGUpID8/IG51bGxcclxufVxyXG5cclxuLyoqIFNpemUgYSBET00gbm9kZSBjb250cmlidXRlcyB0byBpbmxpbmUgb2Zmc2V0cy4gKi9cclxuZnVuY3Rpb24gaW5saW5lRE9NU2l6ZShyZW5kZXJlcjogRE9NUmVuZGVyZXIsIG5vZGU6IGdsb2JhbFRoaXMuTm9kZSk6IG51bWJlciB7XHJcbiAgaWYgKG5vZGUubm9kZVR5cGUgPT09IFRFWFRfTk9ERSkgcmV0dXJuIChub2RlLnRleHRDb250ZW50ID8/ICcnKS5sZW5ndGhcclxuICBpZiAoaXNOb25Db250ZW50KG5vZGUpKSByZXR1cm4gMFxyXG4gIGNvbnN0IG1vZGVsID0gbW9kZWxBdChyZW5kZXJlciwgbm9kZSlcclxuICBpZiAobW9kZWwgJiYgIW1vZGVsLmlzVGV4dCkgcmV0dXJuIDEgLy8gaW5saW5lIGF0b21cclxuICAvLyBNYXJrIHdyYXBwZXI6IHN1bSBvZiBjb250ZW50cy5cclxuICBsZXQgc2l6ZSA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIFsuLi5ub2RlLmNoaWxkTm9kZXNdKSBzaXplICs9IGlubGluZURPTVNpemUocmVuZGVyZXIsIGNoaWxkKVxyXG4gIHJldHVybiBzaXplXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYXAgYSBET00gcG9pbnQgaW5zaWRlIHRoZSB2aWV3IHRvIGEgbW9kZWwgUG9zaXRpb24uIFJldHVybnMgbnVsbCBmb3JcclxuICogcG9pbnRzIG91dHNpZGUgYW55IHJlbmRlcmVkIHRleHRibG9jay5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBwb3NpdGlvbkZyb21ET01Qb2ludChcclxuICByb290OiBIVE1MRWxlbWVudCxcclxuICByZW5kZXJlcjogRE9NUmVuZGVyZXIsXHJcbiAgZG9tTm9kZTogZ2xvYmFsVGhpcy5Ob2RlLFxyXG4gIGRvbU9mZnNldDogbnVtYmVyLFxyXG4pOiBQb3NpdGlvbiB8IG51bGwge1xyXG4gIC8vIEZpbmQgdGhlIHRleHRibG9jayBlbGVtZW50IGNvbnRhaW5pbmcgdGhlIHBvaW50LlxyXG4gIGxldCBibG9ja0VsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGxcclxuICBmb3IgKFxyXG4gICAgbGV0IGN1cnJlbnQ6IGdsb2JhbFRoaXMuTm9kZSB8IG51bGwgPSBkb21Ob2RlO1xyXG4gICAgY3VycmVudCAmJiBjdXJyZW50ICE9PSByb290LnBhcmVudE5vZGU7XHJcbiAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnROb2RlXHJcbiAgKSB7XHJcbiAgICBjb25zdCBtb2RlbCA9IGN1cnJlbnQubm9kZVR5cGUgPT09IEVMRU1FTlRfTk9ERSA/IG1vZGVsQXQocmVuZGVyZXIsIGN1cnJlbnQpIDogbnVsbFxyXG4gICAgaWYgKG1vZGVsPy5pc1RleHRibG9jaykge1xyXG4gICAgICBibG9ja0VsZW1lbnQgPSBjdXJyZW50IGFzIEhUTUxFbGVtZW50XHJcbiAgICAgIGJyZWFrXHJcbiAgICB9XHJcbiAgICBpZiAoY3VycmVudCA9PT0gcm9vdCkgYnJlYWtcclxuICB9XHJcbiAgaWYgKCFibG9ja0VsZW1lbnQpIHtcclxuICAgIC8vIEEgcG9pbnQgb24gYSBjb250YWluZXIgKHRoZSByb290LCBhIGJsb2NrcXVvdGUsIGEgbGlzdCk6IHRoZSBvZmZzZXQgaXNcclxuICAgIC8vIGEgY2hpbGQgaW5kZXguIEJyb3dzZXJzIHJlcG9ydCB3aG9sZS1ibG9jayBzZWxlY3Rpb25zIHRoaXMgd2F5LlxyXG4gICAgcmV0dXJuIHBvc2l0aW9uSW5Db250YWluZXIocm9vdCwgcmVuZGVyZXIsIGRvbU5vZGUsIGRvbU9mZnNldClcclxuICB9XHJcblxyXG4gIGNvbnN0IHBhdGggPSBwYXRoT2ZFbGVtZW50KHJvb3QsIHJlbmRlcmVyLCBibG9ja0VsZW1lbnQpXHJcbiAgaWYgKCFwYXRoKSByZXR1cm4gbnVsbFxyXG5cclxuICBjb25zdCBjb250ZW50ID0gcmVuZGVyZXIuY29udGVudEVsZW1lbnRPZihibG9ja0VsZW1lbnQpXHJcbiAgY29uc3Qgb2Zmc2V0ID0gaW5saW5lT2Zmc2V0T2YocmVuZGVyZXIsIGNvbnRlbnQsIGRvbU5vZGUsIGRvbU9mZnNldClcclxuICByZXR1cm4gb2Zmc2V0ID09PSBudWxsID8gbnVsbCA6IHsgcGF0aCwgb2Zmc2V0IH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlc29sdmUgYSBwb2ludCB3aG9zZSBub2RlIGlzIGEgY29udGFpbmVyIGVsZW1lbnQ6IHRoZSBvZmZzZXQgaXMgYSBjaGlsZFxyXG4gKiBpbmRleCwgc28gZGVzY2VuZCBpbnRvIHRoYXQgY2hpbGQgKG9yIHRoZSBsYXN0IG9uZSwgZm9yIGFuIGVuZC1vZi1jb250YWluZXJcclxuICogb2Zmc2V0KSB1bnRpbCBhIHRleHRibG9jayBpcyByZWFjaGVkLlxyXG4gKi9cclxuZnVuY3Rpb24gcG9zaXRpb25JbkNvbnRhaW5lcihcclxuICByb290OiBIVE1MRWxlbWVudCxcclxuICByZW5kZXJlcjogRE9NUmVuZGVyZXIsXHJcbiAgY29udGFpbmVyOiBnbG9iYWxUaGlzLk5vZGUsXHJcbiAgaW5kZXg6IG51bWJlcixcclxuKTogUG9zaXRpb24gfCBudWxsIHtcclxuICBpZiAoY29udGFpbmVyLm5vZGVUeXBlICE9PSBFTEVNRU5UX05PREUpIHJldHVybiBudWxsXHJcbiAgY29uc3QgY2hpbGRyZW4gPSBbLi4uKGNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCkuY2hpbGRyZW5dLmZpbHRlcigoY2hpbGQpID0+XHJcbiAgICByZW5kZXJlci5tb2RlbE9mLmdldChjaGlsZCksXHJcbiAgKSBhcyBIVE1MRWxlbWVudFtdXHJcbiAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGxcclxuICAvLyBBbiBvZmZzZXQgcGFzdCB0aGUgbGFzdCBjaGlsZCBtZWFucyBcInRoZSBlbmQgb2YgdGhlIGNvbnRhaW5lclwiLlxyXG4gIGNvbnN0IGF0RW5kID0gaW5kZXggPj0gY2hpbGRyZW4ubGVuZ3RoXHJcbiAgY29uc3QgdGFyZ2V0ID0gY2hpbGRyZW5bTWF0aC5taW4oaW5kZXgsIGNoaWxkcmVuLmxlbmd0aCAtIDEpXVxyXG4gIGlmICghdGFyZ2V0KSByZXR1cm4gbnVsbFxyXG5cclxuICBjb25zdCBkZXNjZW5kID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogUG9zaXRpb24gfCBudWxsID0+IHtcclxuICAgIGNvbnN0IG1vZGVsID0gcmVuZGVyZXIubW9kZWxPZi5nZXQoZWxlbWVudClcclxuICAgIGlmIChtb2RlbD8uaXNUZXh0YmxvY2spIHtcclxuICAgICAgY29uc3QgcGF0aCA9IHBhdGhPZkVsZW1lbnQocm9vdCwgcmVuZGVyZXIsIGVsZW1lbnQpXHJcbiAgICAgIGlmICghcGF0aCkgcmV0dXJuIG51bGxcclxuICAgICAgcmV0dXJuIHsgcGF0aCwgb2Zmc2V0OiBhdEVuZCA/IGlubGluZUxlbmd0aChtb2RlbC5jb250ZW50KSA6IDAgfVxyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGVudCA9IHJlbmRlcmVyLmNvbnRlbnRFbGVtZW50T2YoZWxlbWVudClcclxuICAgIGNvbnN0IG5lc3RlZCA9IFsuLi5jb250ZW50LmNoaWxkcmVuXS5maWx0ZXIoKGNoaWxkKSA9PlxyXG4gICAgICByZW5kZXJlci5tb2RlbE9mLmdldChjaGlsZCksXHJcbiAgICApIGFzIEhUTUxFbGVtZW50W11cclxuICAgIGNvbnN0IG5leHQgPSBhdEVuZCA/IG5lc3RlZFtuZXN0ZWQubGVuZ3RoIC0gMV0gOiBuZXN0ZWRbMF1cclxuICAgIHJldHVybiBuZXh0ID8gZGVzY2VuZChuZXh0KSA6IG51bGxcclxuICB9XHJcbiAgcmV0dXJuIGRlc2NlbmQodGFyZ2V0KVxyXG59XHJcblxyXG4vKiogQ2hpbGQtaW5kZXggcGF0aCBvZiBhIHJlbmRlcmVkIGVsZW1lbnQsIGNsaW1iaW5nIHRvIHRoZSB2aWV3IHJvb3QuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXRoT2ZFbGVtZW50KFxyXG4gIHJvb3Q6IEhUTUxFbGVtZW50LFxyXG4gIHJlbmRlcmVyOiBET01SZW5kZXJlcixcclxuICBlbGVtZW50OiBIVE1MRWxlbWVudCxcclxuKTogbnVtYmVyW10gfCBudWxsIHtcclxuICBjb25zdCBwYXRoOiBudW1iZXJbXSA9IFtdXHJcbiAgbGV0IGN1cnJlbnQ6IEhUTUxFbGVtZW50ID0gZWxlbWVudFxyXG4gIHdoaWxlIChjdXJyZW50ICE9PSByb290KSB7XHJcbiAgICBjb25zdCBwYXJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnRcclxuICAgIGlmICghcGFyZW50KSByZXR1cm4gbnVsbFxyXG4gICAgLy8gSW5kZXggYW1vbmcgc2libGluZ3MgdGhhdCByZW5kZXIgbW9kZWwgbm9kZXMgKHBsYWNlaG9sZGVycyBkb24ndCBjb3VudCkuXHJcbiAgICBsZXQgaW5kZXggPSAwXHJcbiAgICBsZXQgZm91bmQgPSBmYWxzZVxyXG4gICAgZm9yIChjb25zdCBzaWJsaW5nIG9mIFsuLi5wYXJlbnQuY2hpbGRyZW5dKSB7XHJcbiAgICAgIGlmIChzaWJsaW5nID09PSBjdXJyZW50KSB7XHJcbiAgICAgICAgZm91bmQgPSB0cnVlXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgfVxyXG4gICAgICBpZiAocmVuZGVyZXIubW9kZWxPZi5nZXQoc2libGluZykpIGluZGV4KytcclxuICAgIH1cclxuICAgIGlmICghZm91bmQpIHJldHVybiBudWxsXHJcbiAgICBwYXRoLnVuc2hpZnQoaW5kZXgpXHJcbiAgICBpZiAocmVuZGVyZXIubW9kZWxPZi5nZXQocGFyZW50KSB8fCBwYXJlbnQgPT09IHJvb3QpIHtcclxuICAgICAgY3VycmVudCA9IHBhcmVudFxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gQ29udGVudCB3cmFwcGVyIChlLmcuIHRoZSBgY29kZWAgaW4gYHByZSA+IGNvZGVgKTogaXRzIHBhcmVudCByZW5kZXJzIHRoZSBub2RlLlxyXG4gICAgICBjb25zdCBvd25lciA9IHBhcmVudC5wYXJlbnRFbGVtZW50XHJcbiAgICAgIGlmICghb3duZXIpIHJldHVybiBudWxsXHJcbiAgICAgIGN1cnJlbnQgPSBvd25lclxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gcGF0aFxyXG59XHJcblxyXG4vKiogSW5saW5lIGNoYXJhY3RlciBvZmZzZXQgb2YgYSBET00gcG9pbnQgd2l0aGluIGEgdGV4dGJsb2NrJ3MgY29udGVudCBlbGVtZW50LiAqL1xyXG5mdW5jdGlvbiBpbmxpbmVPZmZzZXRPZihcclxuICByZW5kZXJlcjogRE9NUmVuZGVyZXIsXHJcbiAgY29udGVudDogSFRNTEVsZW1lbnQsXHJcbiAgdGFyZ2V0Tm9kZTogZ2xvYmFsVGhpcy5Ob2RlLFxyXG4gIHRhcmdldE9mZnNldDogbnVtYmVyLFxyXG4pOiBudW1iZXIgfCBudWxsIHtcclxuICBpZiAodGFyZ2V0Tm9kZSA9PT0gY29udGVudCB8fCB0YXJnZXROb2RlLm5vZGVUeXBlID09PSBFTEVNRU5UX05PREUpIHtcclxuICAgIC8vIEVsZW1lbnQgcG9pbnQ6IHN1bSBzaXplcyBvZiBjaGlsZHJlbiBiZWZvcmUgdGhlIG9mZnNldC5cclxuICAgIGlmICh0YXJnZXROb2RlID09PSBjb250ZW50IHx8IGNvbnRlbnQuY29udGFpbnModGFyZ2V0Tm9kZSkpIHtcclxuICAgICAgbGV0IHN1bSA9IDBcclxuICAgICAgaWYgKHRhcmdldE5vZGUgIT09IGNvbnRlbnQpIHtcclxuICAgICAgICAvLyBDb3VudCBldmVyeXRoaW5nIGJlZm9yZSB0aGUgZWxlbWVudCBpdHNlbGYgZmlyc3QuXHJcbiAgICAgICAgY29uc3QgYmVmb3JlID0gb2Zmc2V0VG9Ob2RlU3RhcnQocmVuZGVyZXIsIGNvbnRlbnQsIHRhcmdldE5vZGUpXHJcbiAgICAgICAgaWYgKGJlZm9yZSA9PT0gbnVsbCkgcmV0dXJuIG51bGxcclxuICAgICAgICBzdW0gPSBiZWZvcmVcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBjaGlsZHJlbiA9IFsuLi50YXJnZXROb2RlLmNoaWxkTm9kZXNdXHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4odGFyZ2V0T2Zmc2V0LCBjaGlsZHJlbi5sZW5ndGgpOyBpKyspIHtcclxuICAgICAgICBzdW0gKz0gaW5saW5lRE9NU2l6ZShyZW5kZXJlciwgY2hpbGRyZW5baV0gYXMgZ2xvYmFsVGhpcy5Ob2RlKVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBzdW1cclxuICAgIH1cclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG4gIC8vIFRleHQgcG9pbnQ6IGRpc3RhbmNlIHRvIHRoZSB0ZXh0IG5vZGUgcGx1cyB0aGUgb2Zmc2V0IHdpdGhpbiBpdC5cclxuICBjb25zdCBiZWZvcmUgPSBvZmZzZXRUb05vZGVTdGFydChyZW5kZXJlciwgY29udGVudCwgdGFyZ2V0Tm9kZSlcclxuICByZXR1cm4gYmVmb3JlID09PSBudWxsID8gbnVsbCA6IGJlZm9yZSArIHRhcmdldE9mZnNldFxyXG59XHJcblxyXG4vKiogSW5saW5lIG9mZnNldCBmcm9tIHRoZSBzdGFydCBvZiBgY29udGVudGAgdG8gdGhlIHN0YXJ0IG9mIGB0YXJnZXRgLiAqL1xyXG5mdW5jdGlvbiBvZmZzZXRUb05vZGVTdGFydChcclxuICByZW5kZXJlcjogRE9NUmVuZGVyZXIsXHJcbiAgY29udGVudDogSFRNTEVsZW1lbnQsXHJcbiAgdGFyZ2V0OiBnbG9iYWxUaGlzLk5vZGUsXHJcbik6IG51bWJlciB8IG51bGwge1xyXG4gIGxldCBzdW0gPSAwXHJcbiAgbGV0IGZvdW5kID0gZmFsc2VcclxuICBjb25zdCB3YWxrID0gKG5vZGU6IGdsb2JhbFRoaXMuTm9kZSk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKGZvdW5kKSByZXR1cm5cclxuICAgIGlmIChub2RlID09PSB0YXJnZXQpIHtcclxuICAgICAgZm91bmQgPSB0cnVlXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IFRFWFRfTk9ERSkge1xyXG4gICAgICBzdW0gKz0gKG5vZGUudGV4dENvbnRlbnQgPz8gJycpLmxlbmd0aFxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGlmIChpc05vbkNvbnRlbnQobm9kZSkpIHJldHVybiAvLyBvY2N1cGllcyBubyBvZmZzZXRzOyBuZXZlciBjb250YWlucyB0aGUgdGFyZ2V0XHJcbiAgICBjb25zdCBtb2RlbCA9IG5vZGUgIT09IGNvbnRlbnQgPyBtb2RlbEF0KHJlbmRlcmVyLCBub2RlKSA6IG51bGxcclxuICAgIGlmIChtb2RlbCAmJiAhbW9kZWwuaXNUZXh0ICYmIG5vZGUgIT09IGNvbnRlbnQpIHtcclxuICAgICAgc3VtICs9IDFcclxuICAgICAgcmV0dXJuIC8vIGF0b21zIGFyZSBvcGFxdWVcclxuICAgIH1cclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgWy4uLm5vZGUuY2hpbGROb2Rlc10pIHtcclxuICAgICAgd2FsayhjaGlsZClcclxuICAgICAgaWYgKGZvdW5kKSByZXR1cm5cclxuICAgIH1cclxuICB9XHJcbiAgd2Fsayhjb250ZW50KVxyXG4gIHJldHVybiBmb3VuZCA/IHN1bSA6IG51bGxcclxufVxyXG5cclxuLyoqXHJcbiAqIE1hcCBhIG1vZGVsIFBvc2l0aW9uIHRvIGEgY29uY3JldGUgRE9NIHBvaW50LCBwcmVmZXJyaW5nIHRleHQgbm9kZXMgc28gdGhlXHJcbiAqIGJyb3dzZXIgY2FyZXQgcmVuZGVycyBjb3JyZWN0bHkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZG9tUG9pbnRGcm9tUG9zaXRpb24oXHJcbiAgcm9vdDogSFRNTEVsZW1lbnQsXHJcbiAgcmVuZGVyZXI6IERPTVJlbmRlcmVyLFxyXG4gIHBvc2l0aW9uOiBQb3NpdGlvbixcclxuKTogRE9NUG9pbnQgfCBudWxsIHtcclxuICAvLyBXYWxrIGRvd24gdGhlIHBhdGggb3ZlciByZW5kZXJlZCBjaGlsZCBlbGVtZW50cy5cclxuICBsZXQgZWxlbWVudDogSFRNTEVsZW1lbnQgPSByb290XHJcbiAgZm9yIChjb25zdCBpbmRleCBvZiBwb3NpdGlvbi5wYXRoKSB7XHJcbiAgICBjb25zdCBjaGlsZHJlbiA9IFsuLi5yZW5kZXJlci5jb250ZW50RWxlbWVudE9mKGVsZW1lbnQpLmNoaWxkcmVuXS5maWx0ZXIoKGNoaWxkKSA9PlxyXG4gICAgICByZW5kZXJlci5tb2RlbE9mLmdldChjaGlsZCksXHJcbiAgICApIGFzIEhUTUxFbGVtZW50W11cclxuICAgIGNvbnN0IG5leHQgPSBjaGlsZHJlbltpbmRleF1cclxuICAgIGlmICghbmV4dCkgcmV0dXJuIG51bGxcclxuICAgIGVsZW1lbnQgPSBuZXh0XHJcbiAgfVxyXG4gIGNvbnN0IG1vZGVsID0gcmVuZGVyZXIubW9kZWxPZi5nZXQoZWxlbWVudClcclxuICBpZiAoIW1vZGVsPy5pc1RleHRibG9jaykge1xyXG4gICAgLy8gRWxlbWVudC1sZXZlbCBwb3NpdGlvbjogb2Zmc2V0IGlzIGEgY2hpbGQgaW5kZXguXHJcbiAgICBjb25zdCBjb250ZW50ID0gcmVuZGVyZXIuY29udGVudEVsZW1lbnRPZihlbGVtZW50KVxyXG4gICAgcmV0dXJuIHsgbm9kZTogY29udGVudCwgb2Zmc2V0OiBNYXRoLm1pbihwb3NpdGlvbi5vZmZzZXQsIGNvbnRlbnQuY2hpbGROb2Rlcy5sZW5ndGgpIH1cclxuICB9XHJcblxyXG4gIGNvbnN0IGNvbnRlbnQgPSByZW5kZXJlci5jb250ZW50RWxlbWVudE9mKGVsZW1lbnQpXHJcbiAgbGV0IHJlbWFpbmluZyA9IHBvc2l0aW9uLm9mZnNldFxyXG4gIGxldCByZXN1bHQ6IERPTVBvaW50IHwgbnVsbCA9IG51bGxcclxuICBjb25zdCB3YWxrID0gKG5vZGU6IGdsb2JhbFRoaXMuTm9kZSk6IGJvb2xlYW4gPT4ge1xyXG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IFRFWFRfTk9ERSkge1xyXG4gICAgICBjb25zdCBsZW5ndGggPSAobm9kZS50ZXh0Q29udGVudCA/PyAnJykubGVuZ3RoXHJcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gbGVuZ3RoKSB7XHJcbiAgICAgICAgcmVzdWx0ID0geyBub2RlLCBvZmZzZXQ6IHJlbWFpbmluZyB9XHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgfVxyXG4gICAgICByZW1haW5pbmcgLT0gbGVuZ3RoXHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgfVxyXG4gICAgaWYgKGlzTm9uQ29udGVudChub2RlKSkgcmV0dXJuIGZhbHNlXHJcbiAgICBjb25zdCBub2RlTW9kZWwgPSBub2RlICE9PSBjb250ZW50ID8gbW9kZWxBdChyZW5kZXJlciwgbm9kZSkgOiBudWxsXHJcbiAgICBpZiAobm9kZU1vZGVsICYmICFub2RlTW9kZWwuaXNUZXh0KSB7XHJcbiAgICAgIGlmIChyZW1haW5pbmcgPT09IDApIHtcclxuICAgICAgICBjb25zdCBwYXJlbnQgPSBub2RlLnBhcmVudE5vZGUgYXMgZ2xvYmFsVGhpcy5Ob2RlXHJcbiAgICAgICAgY29uc3QgaW5kZXggPSBbLi4ucGFyZW50LmNoaWxkTm9kZXNdLmluZGV4T2Yobm9kZSBhcyBDaGlsZE5vZGUpXHJcbiAgICAgICAgcmVzdWx0ID0geyBub2RlOiBwYXJlbnQsIG9mZnNldDogaW5kZXggfVxyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgIH1cclxuICAgICAgcmVtYWluaW5nIC09IDFcclxuICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIFsuLi5ub2RlLmNoaWxkTm9kZXNdKSB7XHJcbiAgICAgIGlmICh3YWxrKGNoaWxkKSkgcmV0dXJuIHRydWVcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZVxyXG4gIH1cclxuICBpZiAod2Fsayhjb250ZW50KSAmJiByZXN1bHQpIHJldHVybiByZXN1bHRcclxuICAvLyBPZmZzZXQgYXQgdGhlIHZlcnkgZW5kIChvciBlbXB0eSBibG9jayk6IHBhcmsgYXQgdGhlIGVuZCBvZiB0aGUgY29udGVudC5cclxuICByZXR1cm4geyBub2RlOiBjb250ZW50LCBvZmZzZXQ6IGNvbnRlbnQuY2hpbGROb2Rlcy5sZW5ndGggfVxyXG59XHJcbiIsICJpbXBvcnQgeyBleGl0UHJlZm9ybWF0dGVkLCBpbmRlbnRJblByZWZvcm1hdHRlZCwgb3V0ZGVudEluUHJlZm9ybWF0dGVkIH0gZnJvbSAnLi4vY29tbWFuZHMvY29tbWFuZHMnXHJcbmltcG9ydCB0eXBlIHsgRWRpdG9yIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvcidcclxuXHJcbi8qKiBBIGtleSBiaW5kaW5nIHJ1bnMgYWdhaW5zdCB0aGUgZWRpdG9yOyByZXR1cm5pbmcgdHJ1ZSBjb25zdW1lcyB0aGUgZXZlbnQuICovXHJcbmV4cG9ydCB0eXBlIEtleUJpbmRpbmcgPSAoZWRpdG9yOiBFZGl0b3IpID0+IGJvb2xlYW5cclxuXHJcbmV4cG9ydCB0eXBlIEtleW1hcCA9IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIEtleUJpbmRpbmc+PlxyXG5cclxuLyoqXHJcbiAqIE5vcm1hbGl6ZSBhIGJpbmRpbmcgbmFtZSBsaWtlIGBcIk1vZC1TaGlmdC16XCJgIHRvIGEgY2Fub25pY2FsIGZvcm0uXHJcbiAqIGBNb2RgIGlzIENtZCBvbiBBcHBsZSBwbGF0Zm9ybXMgYW5kIEN0cmwgZWxzZXdoZXJlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUtleU5hbWUobmFtZTogc3RyaW5nLCBpc01hYzogYm9vbGVhbik6IHN0cmluZyB7XHJcbiAgY29uc3QgcGFydHMgPSBuYW1lLnNwbGl0KCctJylcclxuICBjb25zdCBrZXkgPSBwYXJ0cy5wb3AoKSA/PyAnJ1xyXG4gIGxldCBtb2RzID0gJydcclxuICBmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcclxuICAgIGNvbnN0IGxvd2VyID0gcGFydC50b0xvd2VyQ2FzZSgpXHJcbiAgICBpZiAobG93ZXIgPT09ICdtb2QnKSBtb2RzICs9IGlzTWFjID8gJ20nIDogJ2MnXHJcbiAgICBlbHNlIGlmIChsb3dlciA9PT0gJ2N0cmwnIHx8IGxvd2VyID09PSAnY29udHJvbCcpIG1vZHMgKz0gJ2MnXHJcbiAgICBlbHNlIGlmIChsb3dlciA9PT0gJ21ldGEnIHx8IGxvd2VyID09PSAnY21kJykgbW9kcyArPSAnbSdcclxuICAgIGVsc2UgaWYgKGxvd2VyID09PSAnYWx0JykgbW9kcyArPSAnYSdcclxuICAgIGVsc2UgaWYgKGxvd2VyID09PSAnc2hpZnQnKSBtb2RzICs9ICdzJ1xyXG4gICAgZWxzZSB0aHJvdyBuZXcgUmFuZ2VFcnJvcihgVW5rbm93biBtb2RpZmllciBcIiR7cGFydH1cIiBpbiBrZXkgYmluZGluZyBcIiR7bmFtZX1cImApXHJcbiAgfVxyXG4gIHJldHVybiBgJHtbLi4ubW9kc10uc29ydCgpLmpvaW4oJycpfS0ke2tleS5sZW5ndGggPT09IDEgPyBrZXkudG9Mb3dlckNhc2UoKSA6IGtleX1gXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV2ZW50S2V5TmFtZShldmVudDogS2V5Ym9hcmRFdmVudCk6IHN0cmluZyB7XHJcbiAgbGV0IG1vZHMgPSAnJ1xyXG4gIGlmIChldmVudC5hbHRLZXkpIG1vZHMgKz0gJ2EnXHJcbiAgaWYgKGV2ZW50LmN0cmxLZXkpIG1vZHMgKz0gJ2MnXHJcbiAgaWYgKGV2ZW50Lm1ldGFLZXkpIG1vZHMgKz0gJ20nXHJcbiAgaWYgKGV2ZW50LnNoaWZ0S2V5KSBtb2RzICs9ICdzJ1xyXG4gIGNvbnN0IGtleSA9IGV2ZW50LmtleS5sZW5ndGggPT09IDEgPyBldmVudC5rZXkudG9Mb3dlckNhc2UoKSA6IGV2ZW50LmtleVxyXG4gIHJldHVybiBgJHtbLi4ubW9kc10uc29ydCgpLmpvaW4oJycpfS0ke2tleX1gXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBCdWlsZCBhIGtleWRvd24gaGFuZGxlciBmcm9tIGEga2V5bWFwLiBTaW5nbGUtY2hhcmFjdGVyIGJpbmRpbmdzIHdpdGggb25seVxyXG4gKiBTaGlmdCBoZWxkIGFyZSBpZ25vcmVkICh0aGF0J3MgdHlwaW5nLCBoYW5kbGVkIGJ5IGJlZm9yZWlucHV0KS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBrZXlkb3duSGFuZGxlcihcclxuICBiaW5kaW5nczogS2V5bWFwLFxyXG4gIGVkaXRvcjogRWRpdG9yLFxyXG4gIGlzTWFjOiBib29sZWFuLFxyXG4pOiAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IGJvb2xlYW4ge1xyXG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBuZXcgTWFwPHN0cmluZywgS2V5QmluZGluZz4oKVxyXG4gIGZvciAoY29uc3QgW25hbWUsIGJpbmRpbmddIG9mIE9iamVjdC5lbnRyaWVzKGJpbmRpbmdzKSkge1xyXG4gICAgbm9ybWFsaXplZC5zZXQobm9ybWFsaXplS2V5TmFtZShuYW1lLCBpc01hYyksIGJpbmRpbmcpXHJcbiAgfVxyXG4gIHJldHVybiAoZXZlbnQpID0+IHtcclxuICAgIGNvbnN0IGJpbmRpbmcgPSBub3JtYWxpemVkLmdldChldmVudEtleU5hbWUoZXZlbnQpKVxyXG4gICAgaWYgKCFiaW5kaW5nKSByZXR1cm4gZmFsc2VcclxuICAgIHJldHVybiBiaW5kaW5nKGVkaXRvcilcclxuICB9XHJcbn1cclxuXHJcbi8qKiBUaGUgc3RvY2sgc2hvcnRjdXRzOiBtYXJrcywgdW5kby9yZWRvLCBsaXN0IGluZGVudC4gRW50ZXIvQmFja3NwYWNlIHJpZGUgb24gYmVmb3JlaW5wdXQuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBiYXNlS2V5bWFwKCk6IEtleW1hcCB7XHJcbiAgcmV0dXJuIHtcclxuICAgICdNb2QtYic6IChlZGl0b3IpID0+IGVkaXRvci5jb21tYW5kcy50b2dnbGVNYXJrKCdib2xkJyksXHJcbiAgICAnTW9kLWknOiAoZWRpdG9yKSA9PiBlZGl0b3IuY29tbWFuZHMudG9nZ2xlTWFyaygnaXRhbGljJyksXHJcbiAgICAnTW9kLXUnOiAoZWRpdG9yKSA9PiBlZGl0b3IuY29tbWFuZHMudG9nZ2xlTWFyaygndW5kZXJsaW5lJyksXHJcbiAgICAnTW9kLWUnOiAoZWRpdG9yKSA9PiBlZGl0b3IuY29tbWFuZHMudG9nZ2xlTWFyaygnY29kZScpLFxyXG4gICAgJ01vZC16JzogKGVkaXRvcikgPT4gZWRpdG9yLmNvbW1hbmRzLnVuZG8oKSB8fCB0cnVlLFxyXG4gICAgJ01vZC1TaGlmdC16JzogKGVkaXRvcikgPT4gZWRpdG9yLmNvbW1hbmRzLnJlZG8oKSB8fCB0cnVlLFxyXG4gICAgJ01vZC15JzogKGVkaXRvcikgPT4gZWRpdG9yLmNvbW1hbmRzLnJlZG8oKSB8fCB0cnVlLFxyXG4gICAgLy8gSW4gYSBjb2RlIGJsb2NrIHRoZXNlIGluZGVudCBieSB0d28gc3BhY2VzOyBpbiBhIGxpc3QgdGhleSBpbmRlbnQgdGhlXHJcbiAgICAvLyBpdGVtOyBlbHNld2hlcmUgdGhleSBmYWxsIHRocm91Z2ggdG8gdGhlIGJyb3dzZXIsIHNvIFRhYiBzdGlsbCBtb3Zlc1xyXG4gICAgLy8gZm9jdXMgb3V0IG9mIHRoZSBlZGl0b3IgdGhlIHdheSBrZXlib2FyZCB1c2VycyBleHBlY3QuXHJcbiAgICBUYWI6IChlZGl0b3IpID0+IGVkaXRvci5leGVjKGluZGVudEluUHJlZm9ybWF0dGVkKSB8fCBlZGl0b3IuY29tbWFuZHMuc2lua0xpc3RJdGVtKCksXHJcbiAgICAnU2hpZnQtVGFiJzogKGVkaXRvcikgPT4gZWRpdG9yLmV4ZWMob3V0ZGVudEluUHJlZm9ybWF0dGVkKSB8fCBlZGl0b3IuY29tbWFuZHMubGlmdExpc3RJdGVtKCksXHJcbiAgICAvLyBPdXQgb2YgYSBjb2RlIGJsb2NrIGZyb20gYW55d2hlcmUgaW5zaWRlIGl0OyBlbHNld2hlcmUgdGhlIGtleSBpcyBmcmVlLlxyXG4gICAgJ01vZC1FbnRlcic6IChlZGl0b3IpID0+IGVkaXRvci5leGVjKGV4aXRQcmVmb3JtYXR0ZWQpLFxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBGcmFnbWVudCB9IGZyb20gJy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQgeyBpbmxpbmVTaXplIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvck5vZGUsIFRleHROb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHR5cGUgeyBIVE1MU3BlYyB9IGZyb20gJy4uL21vZGVsL3NjaGVtYSdcclxuXHJcbi8qKiBBbiBpbmxpbmUgcmFuZ2UgaW4gYSB0ZXh0YmxvY2sgcmVuZGVyZWQgd2l0aCBhbiBleHRyYSBjbGFzcyAoc2VhcmNoIG1hdGNoLCDigKYpLiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIElubGluZURlY29yYXRpb24ge1xyXG4gIHJlYWRvbmx5IGZyb206IG51bWJlclxyXG4gIHJlYWRvbmx5IHRvOiBudW1iZXJcclxuICByZWFkb25seSBjbGFzc05hbWU6IHN0cmluZ1xyXG4gIC8qKiBFeHRyYSBpbmxpbmUgQ1NTIG9uIHRoZSBkZWNvcmF0ZWQgc3BhbiAoYSBwZXItcmFuZ2UgaGlnaGxpZ2h0IGNvbG91ciwg4oCmKS4gKi9cclxuICByZWFkb25seSBzdHlsZT86IHN0cmluZ1xyXG4gIC8qKlxyXG4gICAqIEV4dHJhIGF0dHJpYnV0ZXMgb24gdGhlIGRlY29yYXRlZCBzcGFuLCBgZGF0YS1gIGtleXMgZm9yIGEgZmVhdHVyZSB0b1xyXG4gICAqIHJlY29nbmlzZSBpdHMgb3duIHNwYW5zIGJ5LCBgdGl0bGVgLCBgcm9sZWAuXHJcbiAgICpcclxuICAgKiBBIGRlY29yYXRpb24gdGhhdCBjYW4gb25seSBzZXQgYSBjbGFzcyBuYW1lIGNhbiBiZSBzZWVuIGJ1dCBub3RcclxuICAgKiBpZGVudGlmaWVkOiB0aGUgcGFpbnRlZCBzcGFuIGNhcnJpZXMgbm90aGluZyBsaW5raW5nIGl0IGJhY2sgdG8gd2hhdGV2ZXJcclxuICAgKiBwcm9kdWNlZCBpdCwgc28gYSBob3ZlciBjYXJkIG9yIGEgY2xpY2sgbWVudSBoYXMgbm8gd2F5IHRvIGtub3cgd2hpY2ggb2ZcclxuICAgKiBhIGJsb2NrJ3MgZGVjb3JhdGlvbnMgdGhlIHBvaW50ZXIgaXMgb3Zlci5cclxuICAgKi9cclxuICByZWFkb25seSBhdHRycz86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZz4+XHJcbiAgLyoqXHJcbiAgICogWmVyby13aWR0aCB3aWRnZXQgcmVuZGVyZWQgYXQgYGZyb21gIChyZXF1aXJlcyBgZnJvbSA9PT0gdG9gKSwgZS5nLiBhXHJcbiAgICogbWFya2VyIHBpbm5lZCB0byBvbmUgcG9zaXRpb24uIFRoZSBlbGVtZW50IGlzIHdyYXBwZWQgaW4gYSBub24tZWRpdGFibGVcclxuICAgKiBzcGFuIHRoZSBwb3NpdGlvbiBtYXBwZXIgc2tpcHMuXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgd2lkZ2V0PzogKCkgPT4gSFRNTEVsZW1lbnRcclxufVxyXG5cclxuZnVuY3Rpb24gZGVjb3JhdGlvbnNFcShcclxuICBhOiByZWFkb25seSBJbmxpbmVEZWNvcmF0aW9uW10gfCBudWxsLFxyXG4gIGI6IHJlYWRvbmx5IElubGluZURlY29yYXRpb25bXSB8IG51bGwsXHJcbik6IGJvb2xlYW4ge1xyXG4gIGlmIChhID09PSBiKSByZXR1cm4gdHJ1ZVxyXG4gIGlmICghYSB8fCAhYiB8fCBhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZVxyXG4gIHJldHVybiBhLmV2ZXJ5KChkZWNvcmF0aW9uLCBpKSA9PiB7XHJcbiAgICBjb25zdCBvdGhlciA9IGJbaV0gYXMgSW5saW5lRGVjb3JhdGlvblxyXG4gICAgcmV0dXJuIChcclxuICAgICAgZGVjb3JhdGlvbi5mcm9tID09PSBvdGhlci5mcm9tICYmXHJcbiAgICAgIGRlY29yYXRpb24udG8gPT09IG90aGVyLnRvICYmXHJcbiAgICAgIGRlY29yYXRpb24uY2xhc3NOYW1lID09PSBvdGhlci5jbGFzc05hbWUgJiZcclxuICAgICAgZGVjb3JhdGlvbi5zdHlsZSA9PT0gb3RoZXIuc3R5bGUgJiZcclxuICAgICAgc2FtZUF0dHJzKGRlY29yYXRpb24uYXR0cnMsIG90aGVyLmF0dHJzKSAmJlxyXG4gICAgICBkZWNvcmF0aW9uLndpZGdldCA9PT0gb3RoZXIud2lkZ2V0XHJcbiAgICApXHJcbiAgfSlcclxufVxyXG5cclxuLyoqIFdoZXRoZXIgdHdvIGRlY29yYXRpb25zJyBhdHRyaWJ1dGUgbWFwcyB3b3VsZCByZW5kZXIgdGhlIHNhbWUgc3Bhbi4gKi9cclxuZnVuY3Rpb24gc2FtZUF0dHJzKFxyXG4gIGE6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZz4+IHwgdW5kZWZpbmVkLFxyXG4gIGI6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZz4+IHwgdW5kZWZpbmVkLFxyXG4pOiBib29sZWFuIHtcclxuICBpZiAoYSA9PT0gYikgcmV0dXJuIHRydWVcclxuICBpZiAoIWEgfHwgIWIpIHJldHVybiBmYWxzZVxyXG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhhKVxyXG4gIHJldHVybiBrZXlzLmxlbmd0aCA9PT0gT2JqZWN0LmtleXMoYikubGVuZ3RoICYmIGtleXMuZXZlcnkoKGtleSkgPT4gYVtrZXldID09PSBiW2tleV0pXHJcbn1cclxuXHJcbi8qKiBTdXBwbGllcyBkZWNvcmF0aW9ucyBmb3IgYSBibG9jayBub2RlOyBudWxsL2VtcHR5IG1lYW5zIG5vbmUuICovXHJcbmV4cG9ydCB0eXBlIERlY29yYXRpb25Tb3VyY2UgPSAobm9kZTogRWRpdG9yTm9kZSkgPT4gcmVhZG9ubHkgSW5saW5lRGVjb3JhdGlvbltdIHwgbnVsbFxyXG5cclxuLyoqXHJcbiAqIEEgY3VzdG9tIHJlbmRlcmVyIGZvciBvbmUgbm9kZSB0eXBlLiBgZG9tYCBpcyB0aGUgbm9kZSdzIGVsZW1lbnQ7IGNoaWxkcmVuXHJcbiAqIHJlbmRlciBpbnRvIGBjb250ZW50RE9NYCB3aGVuIGdpdmVuLCBvdGhlcndpc2UgdGhlIG5vZGUgaXMgYW4gb3BhcXVlIHdpZGdldFxyXG4gKiB0aGUgZWRpdG9yIG5ldmVyIGVkaXRzIGluc2lkZS4gYHVwZGF0ZWAgcGF0Y2hlcyBpbiBwbGFjZSBmb3IgYSBjaGFuZ2VkIG5vZGVcclxuICogb2YgdGhlIHNhbWUgdHlwZSwgcmV0dXJuIGZhbHNlIHRvIGZvcmNlIGEgcmVidWlsZC5cclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgTm9kZVZpZXdJbnN0YW5jZSB7XHJcbiAgcmVhZG9ubHkgZG9tOiBIVE1MRWxlbWVudFxyXG4gIHJlYWRvbmx5IGNvbnRlbnRET00/OiBIVE1MRWxlbWVudFxyXG4gIHVwZGF0ZT8obm9kZTogRWRpdG9yTm9kZSk6IGJvb2xlYW5cclxuICBkZXN0cm95PygpOiB2b2lkXHJcbn1cclxuXHJcbi8qKiBDcmVhdGVzIHRoZSB2aWV3IGluc3RhbmNlIGZvciBhIG5vZGUgKGFkYXB0ZXJzIGNsb3NlIG92ZXIgdGhlaXIgZWRpdG9yKS4gKi9cclxuZXhwb3J0IHR5cGUgTm9kZVZpZXdDb25zdHJ1Y3RvciA9IChub2RlOiBFZGl0b3JOb2RlKSA9PiBOb2RlVmlld0luc3RhbmNlXHJcblxyXG4vKipcclxuICogTW9kZWwg4oaSIERPTSByZW5kZXJlci4gU3RydWN0dXJhbCBzaGFyaW5nIGluIHRoZSBpbW11dGFibGUgZG9jdW1lbnQgbWFrZXNcclxuICogZGlmZmluZyBjaGVhcDogYSBjaGlsZCB0aGF0IGlzIHJlZmVyZW5jZS1lcXVhbCB0byB3aGF0IGFuIGVsZW1lbnQgYWxyZWFkeVxyXG4gKiBzaG93cyBpcyBza2lwcGVkOyBhIHNhbWUtdHlwZSBibG9jayBpcyBwYXRjaGVkIGluIHBsYWNlOyBhbnl0aGluZyBlbHNlIGlzXHJcbiAqIHJlYnVpbHQuIFRoZSBtYXBwaW5nIGZyb20gRE9NIGVsZW1lbnRzIGJhY2sgdG8gbW9kZWwgbm9kZXMgbGl2ZXMgaW4gYVxyXG4gKiBXZWFrTWFwIGNvbnN1bWVkIGJ5IHBvc2l0aW9uIG1hcHBpbmcgYW5kIHNlbGVjdGlvbiBzeW5jLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIERPTVJlbmRlcmVyIHtcclxuICAvKiogRE9NIGVsZW1lbnQvdGV4dCDihpIgdGhlIG1vZGVsIG5vZGUgaXQgcmVuZGVycy4gKi9cclxuICByZWFkb25seSBtb2RlbE9mID0gbmV3IFdlYWtNYXA8Z2xvYmFsVGhpcy5Ob2RlLCBFZGl0b3JOb2RlPigpXHJcbiAgLyoqIERPTSBlbGVtZW50IOKGkiB0aGUgbW9kZWwgbm9kZSB3aG9zZSBjaGlsZHJlbiBpdCBob2xkcyAoZGlmZmVycyBmb3IgcHJlID4gY29kZSkuICovXHJcbiAgcHJpdmF0ZSByZWFkb25seSBjb250ZW50T2YgPSBuZXcgV2Vha01hcDxnbG9iYWxUaGlzLk5vZGUsIEhUTUxFbGVtZW50PigpXHJcbiAgLyoqIEJ1bXBzIHdoZW4gZGVjb3JhdGlvbnMgY2hhbmdlLCBpbnZhbGlkYXRpbmcgb3RoZXJ3aXNlLXVuY2hhbmdlZCBibG9ja3MuICovXHJcbiAgcHJpdmF0ZSBlcG9jaCA9IDBcclxuICBwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVkRXBvY2ggPSBuZXcgV2Vha01hcDxIVE1MRWxlbWVudCwgbnVtYmVyPigpXHJcbiAgcHJpdmF0ZSBkZWNvcmF0aW9uczogRGVjb3JhdGlvblNvdXJjZSB8IG51bGwgPSBudWxsXHJcbiAgLyoqIERlY29yYXRpb25zIGVhY2ggY29udGVudCBlbGVtZW50IGxhc3QgcmVuZGVyZWQgd2l0aCwgZm9yIGNoZWFwIGNoYW5nZSBjaGVja3MuICovXHJcbiAgcHJpdmF0ZSByZWFkb25seSByZW5kZXJlZERlY29yYXRpb25zID0gbmV3IFdlYWtNYXA8SFRNTEVsZW1lbnQsIHJlYWRvbmx5IElubGluZURlY29yYXRpb25bXT4oKVxyXG4gIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFuY2VzID0gbmV3IFdlYWtNYXA8SFRNTEVsZW1lbnQsIE5vZGVWaWV3SW5zdGFuY2U+KClcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGRvY3VtZW50OiBEb2N1bWVudCxcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgbm9kZVZpZXdzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBOb2RlVmlld0NvbnN0cnVjdG9yPj4gPSB7fSxcclxuICApIHt9XHJcblxyXG4gIC8qKiBJbnN0YWxsIGEgZGVjb3JhdGlvbiBzb3VyY2UgYW5kIGludmFsaWRhdGUgcmVuZGVyZWQgYmxvY2tzLiAqL1xyXG4gIHNldERlY29yYXRpb25zKHNvdXJjZTogRGVjb3JhdGlvblNvdXJjZSB8IG51bGwpOiB2b2lkIHtcclxuICAgIHRoaXMuZGVjb3JhdGlvbnMgPSBzb3VyY2VcclxuICAgIHRoaXMuZXBvY2grK1xyXG4gIH1cclxuXHJcbiAgLyoqIFN5bmMgdGhlIHJvb3QgZWxlbWVudCdzIGNoaWxkcmVuIHdpdGggdGhlIGRvY3VtZW50IG5vZGUncyBjaGlsZHJlbi4gKi9cclxuICByZW5kZXJEb2MoZG9jOiBFZGl0b3JOb2RlLCByb290OiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgdGhpcy5tb2RlbE9mLnNldChyb290LCBkb2MpXHJcbiAgICB0aGlzLmNvbnRlbnRPZi5zZXQocm9vdCwgcm9vdClcclxuICAgIHRoaXMucGF0Y2hDaGlsZHJlbihyb290LCBkb2MuY29udGVudClcclxuICB9XHJcblxyXG4gIC8qKiBUaGUgZWxlbWVudCB0aGF0IGhvbGRzIGEgcmVuZGVyZWQgbm9kZSdzIGNoaWxkcmVuLiAqL1xyXG4gIGNvbnRlbnRFbGVtZW50T2YoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XHJcbiAgICByZXR1cm4gdGhpcy5jb250ZW50T2YuZ2V0KGVsZW1lbnQpID8/IGVsZW1lbnRcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaXNDdXJyZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5yZW5kZXJlZEVwb2NoLmdldChlbGVtZW50KSA9PT0gdGhpcy5lcG9jaFxyXG4gIH1cclxuXHJcbiAgLyoqIFRlYXIgZG93biBub2RlLXZpZXcgaW5zdGFuY2VzIGluIGEgc3VidHJlZSBhYm91dCB0byBsZWF2ZSB0aGUgRE9NLiAqL1xyXG4gIGRlc3Ryb3lWaWV3cyhlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgdGhpcy5pbnN0YW5jZXMuZ2V0KGVsZW1lbnQpPy5kZXN0cm95Py4oKVxyXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4uZWxlbWVudC5jaGlsZHJlbl0pIHRoaXMuZGVzdHJveVZpZXdzKGNoaWxkIGFzIEhUTUxFbGVtZW50KVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZW5kZXJCbG9jayhub2RlOiBFZGl0b3JOb2RlKTogSFRNTEVsZW1lbnQge1xyXG4gICAgY29uc3QgY29uc3RydWN0ID0gdGhpcy5ub2RlVmlld3Nbbm9kZS50eXBlLm5hbWVdXHJcbiAgICBpZiAoY29uc3RydWN0KSB7XHJcbiAgICAgIGNvbnN0IGluc3RhbmNlID0gY29uc3RydWN0KG5vZGUpXHJcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSBpbnN0YW5jZS5kb21cclxuICAgICAgdGhpcy5tb2RlbE9mLnNldChlbGVtZW50LCBub2RlKVxyXG4gICAgICB0aGlzLmNvbnRlbnRPZi5zZXQoZWxlbWVudCwgaW5zdGFuY2UuY29udGVudERPTSA/PyBlbGVtZW50KVxyXG4gICAgICB0aGlzLnJlbmRlcmVkRXBvY2guc2V0KGVsZW1lbnQsIHRoaXMuZXBvY2gpXHJcbiAgICAgIHRoaXMuaW5zdGFuY2VzLnNldChlbGVtZW50LCBpbnN0YW5jZSlcclxuICAgICAgaWYgKGluc3RhbmNlLmNvbnRlbnRET00pIHtcclxuICAgICAgICBpZiAobm9kZS5pc1RleHRibG9jaykgdGhpcy5yZW5kZXJJbmxpbmUoaW5zdGFuY2UuY29udGVudERPTSwgbm9kZSlcclxuICAgICAgICBlbHNlIGlmICghbm9kZS5pc0F0b20pIHRoaXMucGF0Y2hDaGlsZHJlbihpbnN0YW5jZS5jb250ZW50RE9NLCBub2RlLmNvbnRlbnQpXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gT3BhcXVlIHdpZGdldDogdGhlIGVkaXRvciBuZXZlciBlZGl0cyBpbnNpZGUgaXQuXHJcbiAgICAgICAgZWxlbWVudC5jb250ZW50RWRpdGFibGUgPSAnZmFsc2UnXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGVsZW1lbnRcclxuICAgIH1cclxuICAgIGNvbnN0IHNwZWMgPSBub2RlLnR5cGUuc3BlYy50b0hUTUw/Lihub2RlKVxyXG4gICAgY29uc3QgZWxlbWVudCA9IHRoaXMuZG9jdW1lbnQuY3JlYXRlRWxlbWVudChzcGVjPy50YWcgPz8gJ2RpdicpXHJcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoc3BlYz8uYXR0cnMgPz8ge30pKSB7XHJcbiAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKVxyXG4gICAgfVxyXG4gICAgbGV0IGNvbnRlbnQgPSBlbGVtZW50XHJcbiAgICBpZiAoc3BlYz8uY2hpbGRUYWcpIHtcclxuICAgICAgY29udGVudCA9IHRoaXMuZG9jdW1lbnQuY3JlYXRlRWxlbWVudChzcGVjLmNoaWxkVGFnKVxyXG4gICAgICBlbGVtZW50LmFwcGVuZENoaWxkKGNvbnRlbnQpXHJcbiAgICB9XHJcbiAgICB0aGlzLm1vZGVsT2Yuc2V0KGVsZW1lbnQsIG5vZGUpXHJcbiAgICB0aGlzLmNvbnRlbnRPZi5zZXQoZWxlbWVudCwgY29udGVudClcclxuICAgIHRoaXMucmVuZGVyZWRFcG9jaC5zZXQoZWxlbWVudCwgdGhpcy5lcG9jaClcclxuICAgIGlmIChub2RlLmlzQXRvbSkge1xyXG4gICAgICBlbGVtZW50LmNvbnRlbnRFZGl0YWJsZSA9ICdmYWxzZSdcclxuICAgICAgdGhpcy5yZW5kZXJBdG9tQm9keShjb250ZW50LCBzcGVjKVxyXG4gICAgICByZXR1cm4gZWxlbWVudFxyXG4gICAgfVxyXG4gICAgaWYgKG5vZGUuaXNUZXh0YmxvY2spIHtcclxuICAgICAgdGhpcy5yZW5kZXJJbmxpbmUoY29udGVudCwgbm9kZSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMucGF0Y2hDaGlsZHJlbihjb250ZW50LCBub2RlLmNvbnRlbnQpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZWxlbWVudFxyXG4gIH1cclxuXHJcbiAgLyoqIFJlYnVpbGQgYSB0ZXh0YmxvY2sncyBpbmxpbmUgRE9NLCBzcGxpdHRpbmcgcnVucyBhdCBkZWNvcmF0aW9uIGVkZ2VzLiAqL1xyXG4gIHByaXZhdGUgcmVuZGVySW5saW5lKGNvbnRlbnQ6IEhUTUxFbGVtZW50LCBibG9jazogRWRpdG9yTm9kZSk6IHZvaWQge1xyXG4gICAgd2hpbGUgKGNvbnRlbnQuZmlyc3RDaGlsZCkgY29udGVudC5yZW1vdmVDaGlsZChjb250ZW50LmZpcnN0Q2hpbGQpXHJcbiAgICBjb25zdCBmcmFnID0gYmxvY2suY29udGVudFxyXG4gICAgY29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLmRlY29yYXRpb25zPy4oYmxvY2spID8/IFtdXHJcbiAgICB0aGlzLnJlbmRlcmVkRGVjb3JhdGlvbnMuc2V0KGNvbnRlbnQsIGRlY29yYXRpb25zKVxyXG4gICAgY29uc3QgcmFuZ2VzID0gZGVjb3JhdGlvbnMuZmlsdGVyKChkZWNvcmF0aW9uKSA9PiBkZWNvcmF0aW9uLnRvID4gZGVjb3JhdGlvbi5mcm9tKVxyXG4gICAgY29uc3Qgd2lkZ2V0cyA9IGRlY29yYXRpb25zXHJcbiAgICAgIC5maWx0ZXIoKGRlY29yYXRpb24pID0+IGRlY29yYXRpb24ud2lkZ2V0KVxyXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5mcm9tIC0gYi5mcm9tKVxyXG4gICAgbGV0IHdpZGdldEluZGV4ID0gMFxyXG4gICAgY29uc3QgZmx1c2hXaWRnZXRzID0gKHVwVG86IG51bWJlcik6IHZvaWQgPT4ge1xyXG4gICAgICB3aGlsZSAod2lkZ2V0SW5kZXggPCB3aWRnZXRzLmxlbmd0aCkge1xyXG4gICAgICAgIGNvbnN0IGRlY29yYXRpb24gPSB3aWRnZXRzW3dpZGdldEluZGV4XSBhcyBJbmxpbmVEZWNvcmF0aW9uXHJcbiAgICAgICAgaWYgKGRlY29yYXRpb24uZnJvbSA+IHVwVG8pIGJyZWFrXHJcbiAgICAgICAgd2lkZ2V0SW5kZXgrK1xyXG4gICAgICAgIGNvbnN0IHdyYXBwZXIgPSB0aGlzLmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKVxyXG4gICAgICAgIHdyYXBwZXIuY2xhc3NOYW1lID0gZGVjb3JhdGlvbi5jbGFzc05hbWVcclxuICAgICAgICBpZiAoZGVjb3JhdGlvbi5zdHlsZSkgd3JhcHBlci5zZXRBdHRyaWJ1dGUoJ3N0eWxlJywgZGVjb3JhdGlvbi5zdHlsZSlcclxuICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZGVjb3JhdGlvbi5hdHRycyA/PyB7fSkpIHtcclxuICAgICAgICAgIHdyYXBwZXIuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKVxyXG4gICAgICAgIH1cclxuICAgICAgICB3cmFwcGVyLmNvbnRlbnRFZGl0YWJsZSA9ICdmYWxzZSdcclxuICAgICAgICB3cmFwcGVyLmRhdGFzZXQudHJldml4YWxXaWRnZXQgPSAndHJ1ZSdcclxuICAgICAgICBjb25zdCBpbm5lciA9IGRlY29yYXRpb24ud2lkZ2V0Py4oKVxyXG4gICAgICAgIGlmIChpbm5lcikgd3JhcHBlci5hcHBlbmRDaGlsZChpbm5lcilcclxuICAgICAgICBjb250ZW50LmFwcGVuZENoaWxkKHdyYXBwZXIpXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGxldCBvZmZzZXQgPSAwXHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGZyYWcuY2hpbGRyZW4pIHtcclxuICAgICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICAgIGlmICghY2hpbGQuaXNUZXh0KSB7XHJcbiAgICAgICAgZmx1c2hXaWRnZXRzKG9mZnNldClcclxuICAgICAgICBjb25zdCBzcGVjID0gY2hpbGQudHlwZS5zcGVjLnRvSFRNTD8uKGNoaWxkKVxyXG4gICAgICAgIGNvbnN0IGF0b20gPSB0aGlzLmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoc3BlYz8udGFnID8/ICdzcGFuJylcclxuICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoc3BlYz8uYXR0cnMgPz8ge30pKSB7XHJcbiAgICAgICAgICBhdG9tLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSlcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHNwZWM/LmlubmVySFRNTCAhPT0gdW5kZWZpbmVkIHx8IHNwZWM/LnRleHQpIHtcclxuICAgICAgICAgIHRoaXMucmVuZGVyQXRvbUJvZHkoYXRvbSwgc3BlYylcclxuICAgICAgICAgIGF0b20uY29udGVudEVkaXRhYmxlID0gJ2ZhbHNlJyAvLyBsYWJlbGxlZCBjaGlwcyBhcmUgb3BhcXVlIHRvIGVkaXRpbmdcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5tb2RlbE9mLnNldChhdG9tLCBjaGlsZClcclxuICAgICAgICBjb250ZW50LmFwcGVuZENoaWxkKGF0b20pXHJcbiAgICAgICAgb2Zmc2V0ICs9IHNpemVcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IHRleHQgPSBjaGlsZCBhcyBUZXh0Tm9kZVxyXG4gICAgICBmb3IgKGNvbnN0IFtmcm9tLCB0b10gb2Ygc2VnbWVudFJhbmdlKG9mZnNldCwgb2Zmc2V0ICsgc2l6ZSwgZGVjb3JhdGlvbnMpKSB7XHJcbiAgICAgICAgZmx1c2hXaWRnZXRzKGZyb20pXHJcbiAgICAgICAgY29uc3QgcGllY2UgPSB0ZXh0LmN1dChmcm9tIC0gb2Zmc2V0LCB0byAtIG9mZnNldClcclxuICAgICAgICBjb25zdCByZW5kZXJlZCA9IHRoaXMucmVuZGVyVGV4dFJ1bihwaWVjZSlcclxuICAgICAgICBjb25zdCBjb3ZlcmluZyA9IHJhbmdlcy5maWx0ZXIoXHJcbiAgICAgICAgICAoZGVjb3JhdGlvbikgPT4gZGVjb3JhdGlvbi5mcm9tIDw9IGZyb20gJiYgZGVjb3JhdGlvbi50byA+PSB0byxcclxuICAgICAgICApXHJcbiAgICAgICAgaWYgKGNvdmVyaW5nLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGNvbnN0IHNwYW4gPSB0aGlzLmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKVxyXG4gICAgICAgICAgc3Bhbi5jbGFzc05hbWUgPSBjb3ZlcmluZy5tYXAoKGRlY29yYXRpb24pID0+IGRlY29yYXRpb24uY2xhc3NOYW1lKS5qb2luKCcgJylcclxuICAgICAgICAgIGNvbnN0IHN0eWxlID0gY292ZXJpbmdcclxuICAgICAgICAgICAgLm1hcCgoZGVjb3JhdGlvbikgPT4gZGVjb3JhdGlvbi5zdHlsZSlcclxuICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKVxyXG4gICAgICAgICAgICAuam9pbignOycpXHJcbiAgICAgICAgICBpZiAoc3R5bGUpIHNwYW4uc2V0QXR0cmlidXRlKCdzdHlsZScsIHN0eWxlKVxyXG4gICAgICAgICAgZm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGNvdmVyaW5nKSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkZWNvcmF0aW9uLmF0dHJzID8/IHt9KSkge1xyXG4gICAgICAgICAgICAgIHNwYW4uc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBzcGFuLmFwcGVuZENoaWxkKHJlbmRlcmVkKVxyXG4gICAgICAgICAgY29udGVudC5hcHBlbmRDaGlsZChzcGFuKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb250ZW50LmFwcGVuZENoaWxkKHJlbmRlcmVkKVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBvZmZzZXQgKz0gc2l6ZVxyXG4gICAgfVxyXG4gICAgZmx1c2hXaWRnZXRzKG9mZnNldClcclxuICAgIGlmIChmcmFnLmNoaWxkQ291bnQgPT09IDApIHtcclxuICAgICAgLy8gY29udGVudGVkaXRhYmxlIG5lZWRzIHNvbWV0aGluZyB0byBwYXJrIHRoZSBjYXJldCBpbi5cclxuICAgICAgY29uc3QgYnIgPSB0aGlzLmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2JyJylcclxuICAgICAgYnIuZGF0YXNldC50cmV2aXhhbFBsYWNlaG9sZGVyID0gJ3RydWUnXHJcbiAgICAgIGNvbnRlbnQuYXBwZW5kQ2hpbGQoYnIpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbmRlclRleHRSdW4obm9kZTogVGV4dE5vZGUpOiBnbG9iYWxUaGlzLk5vZGUge1xyXG4gICAgbGV0IHJlbmRlcmVkOiBnbG9iYWxUaGlzLk5vZGUgPSB0aGlzLmRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG5vZGUudGV4dClcclxuICAgIHRoaXMubW9kZWxPZi5zZXQocmVuZGVyZWQsIG5vZGUpXHJcbiAgICBmb3IgKGxldCBpID0gbm9kZS5tYXJrcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICBjb25zdCBtYXJrID0gbm9kZS5tYXJrc1tpXVxyXG4gICAgICBjb25zdCBzcGVjID0gbWFyay50eXBlLnNwZWMudG9IVE1MPy4obWFyaylcclxuICAgICAgaWYgKCFzcGVjKSBjb250aW51ZVxyXG4gICAgICBjb25zdCB3cmFwcGVyID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KHNwZWMudGFnKVxyXG4gICAgICBmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoc3BlYy5hdHRycyA/PyB7fSkpIHtcclxuICAgICAgICB3cmFwcGVyLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSlcclxuICAgICAgfVxyXG4gICAgICB3cmFwcGVyLmFwcGVuZENoaWxkKHJlbmRlcmVkKVxyXG4gICAgICByZW5kZXJlZCA9IHdyYXBwZXJcclxuICAgIH1cclxuICAgIHJldHVybiByZW5kZXJlZFxyXG4gIH1cclxuXHJcbiAgLyoqIERpZmYgYW4gZWxlbWVudCdzIGNoaWxkcmVuIGFnYWluc3QgYSBibG9jay1sZXZlbCBmcmFnbWVudC4gKi9cclxuICBwcml2YXRlIHBhdGNoQ2hpbGRyZW4ocGFyZW50OiBIVE1MRWxlbWVudCwgZnJhZzogRnJhZ21lbnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IG9sZEVsZW1lbnRzID0gWy4uLnBhcmVudC5jaGlsZHJlbl0gYXMgSFRNTEVsZW1lbnRbXVxyXG4gICAgY29uc3Qgb2xkTm9kZXMgPSBvbGRFbGVtZW50cy5tYXAoKGVsZW1lbnQpID0+IHRoaXMubW9kZWxPZi5nZXQoZWxlbWVudCkgPz8gbnVsbClcclxuICAgIGNvbnN0IG5leHQgPSBmcmFnLmNoaWxkcmVuXHJcblxyXG4gICAgY29uc3QgdW5jaGFuZ2VkID0gKGluZGV4OiBudW1iZXIsIG5ld0luZGV4OiBudW1iZXIpOiBib29sZWFuID0+IHtcclxuICAgICAgY29uc3QgZWxlbWVudCA9IG9sZEVsZW1lbnRzW2luZGV4XVxyXG4gICAgICByZXR1cm4gZWxlbWVudCAhPT0gdW5kZWZpbmVkICYmIG9sZE5vZGVzW2luZGV4XSA9PT0gbmV4dFtuZXdJbmRleF0gJiYgdGhpcy5pc0N1cnJlbnQoZWxlbWVudClcclxuICAgIH1cclxuICAgIGxldCBzdGFydCA9IDBcclxuICAgIHdoaWxlIChzdGFydCA8IG9sZE5vZGVzLmxlbmd0aCAmJiBzdGFydCA8IG5leHQubGVuZ3RoICYmIHVuY2hhbmdlZChzdGFydCwgc3RhcnQpKSBzdGFydCsrXHJcbiAgICBsZXQgb2xkRW5kID0gb2xkTm9kZXMubGVuZ3RoXHJcbiAgICBsZXQgbmV3RW5kID0gbmV4dC5sZW5ndGhcclxuICAgIHdoaWxlIChvbGRFbmQgPiBzdGFydCAmJiBuZXdFbmQgPiBzdGFydCAmJiB1bmNoYW5nZWQob2xkRW5kIC0gMSwgbmV3RW5kIC0gMSkpIHtcclxuICAgICAgb2xkRW5kLS1cclxuICAgICAgbmV3RW5kLS1cclxuICAgIH1cclxuXHJcbiAgICAvLyBNaWRkbGUgc2VnbWVudDogcGF0Y2ggbGVhZGluZyBwYWlycyBpbiBwbGFjZSAoc2FtZSB0eXBlKSwgdGhlblxyXG4gICAgLy8gaW5zZXJ0IG9yIHJlbW92ZSB0aGUgbGVuZ3RoIGRpZmZlcmVuY2UgYmVmb3JlIHRoZSBjb21tb24gc3VmZml4LlxyXG4gICAgY29uc3Qgc2hhcmVkID0gTWF0aC5taW4ob2xkRW5kIC0gc3RhcnQsIG5ld0VuZCAtIHN0YXJ0KVxyXG4gICAgZm9yIChsZXQgayA9IDA7IGsgPCBzaGFyZWQ7IGsrKykge1xyXG4gICAgICBjb25zdCBlbGVtZW50ID0gb2xkRWxlbWVudHNbc3RhcnQgKyBrXVxyXG4gICAgICBjb25zdCBvbGROb2RlID0gb2xkTm9kZXNbc3RhcnQgKyBrXVxyXG4gICAgICBjb25zdCBub2RlID0gbmV4dFtzdGFydCArIGtdXHJcbiAgICAgIGlmICghZWxlbWVudCB8fCAhbm9kZSkgY29udGludWVcclxuICAgICAgLy8gSW4tcGxhY2UgcGF0Y2hpbmcgYWxzbyByZXF1aXJlcyB0aGUgcmVuZGVyZWQgdGFnIHRvIGJlIHN0YWJsZVxyXG4gICAgICAvLyAoYSB0YWJsZSBjZWxsIGZsaXBzIHRkIOKGlCB0aCB3aGVuIGl0cyBoZWFkZXIgYXR0cmlidXRlIGNoYW5nZXMpO1xyXG4gICAgICAvLyBub2RlIHZpZXdzIGRlY2lkZSBmb3IgdGhlbXNlbHZlcyB2aWEgdGhlaXIgdXBkYXRlKCkgaG9vay5cclxuICAgICAgY29uc3QgaXNWaWV3ID0gdGhpcy5pbnN0YW5jZXMuaGFzKGVsZW1lbnQpXHJcbiAgICAgIGNvbnN0IHRhZyA9IChub2RlLnR5cGUuc3BlYy50b0hUTUw/Lihub2RlKT8udGFnID8/ICdkaXYnKS50b1VwcGVyQ2FzZSgpXHJcbiAgICAgIGlmIChvbGROb2RlICYmIG9sZE5vZGUudHlwZSA9PT0gbm9kZS50eXBlICYmIChpc1ZpZXcgfHwgZWxlbWVudC50YWdOYW1lID09PSB0YWcpKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBhdGNoRWxlbWVudChlbGVtZW50LCBub2RlKSkge1xyXG4gICAgICAgICAgdGhpcy5kZXN0cm95Vmlld3MoZWxlbWVudClcclxuICAgICAgICAgIHBhcmVudC5yZXBsYWNlQ2hpbGQodGhpcy5yZW5kZXJCbG9jayhub2RlKSwgZWxlbWVudClcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5kZXN0cm95Vmlld3MoZWxlbWVudClcclxuICAgICAgICBwYXJlbnQucmVwbGFjZUNoaWxkKHRoaXMucmVuZGVyQmxvY2sobm9kZSksIGVsZW1lbnQpXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnN0IHN1ZmZpeEFuY2hvciA9IG9sZEVsZW1lbnRzW29sZEVuZF0gPz8gbnVsbFxyXG4gICAgZm9yIChsZXQgaSA9IHN0YXJ0ICsgc2hhcmVkOyBpIDwgbmV3RW5kOyBpKyspIHtcclxuICAgICAgY29uc3Qgbm9kZSA9IG5leHRbaV1cclxuICAgICAgaWYgKG5vZGUpIHBhcmVudC5pbnNlcnRCZWZvcmUodGhpcy5yZW5kZXJCbG9jayhub2RlKSwgc3VmZml4QW5jaG9yKVxyXG4gICAgfVxyXG4gICAgZm9yIChsZXQgaSA9IHN0YXJ0ICsgc2hhcmVkOyBpIDwgb2xkRW5kOyBpKyspIHtcclxuICAgICAgY29uc3QgZWxlbWVudCA9IG9sZEVsZW1lbnRzW2ldXHJcbiAgICAgIGlmICghZWxlbWVudCkgY29udGludWVcclxuICAgICAgdGhpcy5kZXN0cm95Vmlld3MoZWxlbWVudClcclxuICAgICAgZWxlbWVudC5yZW1vdmUoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFVwZGF0ZSBhbiBlbGVtZW50IGluIHBsYWNlOyBmYWxzZSBtZWFucyB0aGUgY2FsbGVyIG11c3QgcmVidWlsZCBpdC4gKi9cclxuICBwcml2YXRlIHBhdGNoRWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCwgbm9kZTogRWRpdG9yTm9kZSk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgcHJldmlvdXMgPSB0aGlzLm1vZGVsT2YuZ2V0KGVsZW1lbnQpXHJcbiAgICBjb25zdCB3YXNDdXJyZW50ID0gdGhpcy5pc0N1cnJlbnQoZWxlbWVudClcclxuICAgIGlmIChwcmV2aW91cyA9PT0gbm9kZSAmJiB3YXNDdXJyZW50KSByZXR1cm4gdHJ1ZVxyXG5cclxuICAgIGNvbnN0IGluc3RhbmNlID0gdGhpcy5pbnN0YW5jZXMuZ2V0KGVsZW1lbnQpXHJcbiAgICBpZiAoaW5zdGFuY2UpIHtcclxuICAgICAgaWYgKCFpbnN0YW5jZS51cGRhdGUgfHwgIWluc3RhbmNlLnVwZGF0ZShub2RlKSkgcmV0dXJuIGZhbHNlXHJcbiAgICAgIHRoaXMubW9kZWxPZi5zZXQoZWxlbWVudCwgbm9kZSlcclxuICAgICAgdGhpcy5yZW5kZXJlZEVwb2NoLnNldChlbGVtZW50LCB0aGlzLmVwb2NoKVxyXG4gICAgICBpZiAoaW5zdGFuY2UuY29udGVudERPTSAmJiAhbm9kZS5pc0F0b20pIHtcclxuICAgICAgICBpZiAobm9kZS5pc1RleHRibG9jaykge1xyXG4gICAgICAgICAgaWYgKHRoaXMuaW5saW5lTmVlZHNSZW5kZXIoaW5zdGFuY2UuY29udGVudERPTSwgcHJldmlvdXMsIHdhc0N1cnJlbnQsIG5vZGUpKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVySW5saW5lKGluc3RhbmNlLmNvbnRlbnRET00sIG5vZGUpXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRoaXMucGF0Y2hDaGlsZHJlbihpbnN0YW5jZS5jb250ZW50RE9NLCBub2RlLmNvbnRlbnQpXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc3BlYyA9IG5vZGUudHlwZS5zcGVjLnRvSFRNTD8uKG5vZGUpXHJcbiAgICBjb25zdCBuZXh0QXR0cnMgPSBzcGVjPy5hdHRycyA/PyB7fVxyXG4gICAgaWYgKHByZXZpb3VzKSB7XHJcbiAgICAgIC8vIERyb3AgYXR0cmlidXRlcyB0aGUgcHJldmlvdXMgcmVuZGVyIGVtaXR0ZWQgdGhhdCB0aGUgbmV3IG9uZSBkb2Vzbid0LlxyXG4gICAgICBjb25zdCBvbGRBdHRycyA9IHByZXZpb3VzLnR5cGUuc3BlYy50b0hUTUw/LihwcmV2aW91cyk/LmF0dHJzID8/IHt9XHJcbiAgICAgIGZvciAoY29uc3QgbmFtZSBvZiBPYmplY3Qua2V5cyhvbGRBdHRycykpIHtcclxuICAgICAgICBpZiAoIShuYW1lIGluIG5leHRBdHRycykpIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKG5hbWUpXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhuZXh0QXR0cnMpKSB7XHJcbiAgICAgIC8vIE9ubHkgd2hlbiBpdCBkaWZmZXJzLiBBc3NpZ25pbmcgYW4gYXR0cmlidXRlIHRoZSB2YWx1ZSBpdCBhbHJlYWR5IGhhc1xyXG4gICAgICAvLyBpcyBzdGlsbCBhIHdyaXRlOiBpdCBpbnZhbGlkYXRlcyBzdHlsZSwgaXQgc2hvd3MgdXAgYXMgYSBtdXRhdGlvbiB0b1xyXG4gICAgICAvLyBhbnl0aGluZyBvYnNlcnZpbmcsIGFuZCBvbiBhbiBgPGlmcmFtZT5gIGFzc2lnbmluZyBgc3JjYCByZWxvYWRzIHRoZVxyXG4gICAgICAvLyBmcmFtZSwgc28gYW4gZW1iZWRkZWQgdmlkZW8gcmVzdGFydGVkIGV2ZXJ5IHRpbWUgYW55dGhpbmcgcmUtcmVuZGVyZWRcclxuICAgICAgLy8gdGhlIGRvY3VtZW50LCB3aGljaCBhIGRlY29yYXRpb24gbGF5ZXIgZG9lcyBvbiBhIHRpbWVyLiBUaGF0IGlzIHdoYXQgYVxyXG4gICAgICAvLyByZWFkZXIgc2VlcyBhcyB0aGUgcGFnZSBibGlua2luZy5cclxuICAgICAgaWYgKGVsZW1lbnQuZ2V0QXR0cmlidXRlKG5hbWUpICE9PSB2YWx1ZSkgZWxlbWVudC5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpXHJcbiAgICB9XHJcbiAgICB0aGlzLm1vZGVsT2Yuc2V0KGVsZW1lbnQsIG5vZGUpXHJcbiAgICB0aGlzLnJlbmRlcmVkRXBvY2guc2V0KGVsZW1lbnQsIHRoaXMuZXBvY2gpXHJcbiAgICBjb25zdCBjb250ZW50ID0gdGhpcy5jb250ZW50RWxlbWVudE9mKGVsZW1lbnQpXHJcbiAgICBpZiAobm9kZS5pc0F0b20pIHtcclxuICAgICAgLy8gQW4gYXRvbSdzIGJvZHkgY29tZXMgZnJvbSBpdHMgc3BlYywgc28gaXQgY2hhbmdlcyBvbmx5IHdpdGggaXRzIGF0dHJzLlxyXG4gICAgICBjb25zdCBwcmV2aW91c1NwZWMgPSBwcmV2aW91cyA/IHByZXZpb3VzLnR5cGUuc3BlYy50b0hUTUw/LihwcmV2aW91cykgOiB1bmRlZmluZWRcclxuICAgICAgaWYgKHNwZWM/LmlubmVySFRNTCAhPT0gcHJldmlvdXNTcGVjPy5pbm5lckhUTUwgfHwgc3BlYz8udGV4dCAhPT0gcHJldmlvdXNTcGVjPy50ZXh0KSB7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJBdG9tQm9keShjb250ZW50LCBzcGVjKVxyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKG5vZGUuaXNUZXh0YmxvY2spIHtcclxuICAgICAgaWYgKHRoaXMuaW5saW5lTmVlZHNSZW5kZXIoY29udGVudCwgcHJldmlvdXMsIHdhc0N1cnJlbnQsIG5vZGUpKSB7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJJbmxpbmUoY29udGVudCwgbm9kZSlcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5wYXRjaENoaWxkcmVuKGNvbnRlbnQsIG5vZGUuY29udGVudClcclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICAvKiogRmlsbCBhbiBhdG9tJ3MgZWxlbWVudCBmcm9tIGl0cyBzcGVjOiB0cnVzdGVkIG1hcmt1cCwgb3IgYSB0ZXh0IGxhYmVsLiAqL1xyXG4gIHByaXZhdGUgcmVuZGVyQXRvbUJvZHkoZWxlbWVudDogSFRNTEVsZW1lbnQsIHNwZWM6IEhUTUxTcGVjIHwgdW5kZWZpbmVkKTogdm9pZCB7XHJcbiAgICBpZiAoc3BlYz8uaW5uZXJIVE1MICE9PSB1bmRlZmluZWQpIGVsZW1lbnQuaW5uZXJIVE1MID0gc3BlYy5pbm5lckhUTUxcclxuICAgIGVsc2UgaWYgKHNwZWM/LnRleHQgIT09IHVuZGVmaW5lZCkgZWxlbWVudC50ZXh0Q29udGVudCA9IHNwZWMudGV4dFxyXG4gICAgLy8gQSBzcGVjIHRoYXQgc3RvcHBlZCBvZmZlcmluZyBhIGJvZHkgbWVhbnMgdGhlIGF0b20gbm8gbG9uZ2VyIGhhcyBvbmU7XHJcbiAgICAvLyBsZWF2aW5nIHRoZSBwcmV2aW91cyByZW5kZXIgaW4gcGxhY2Ugd291bGQgc2hvdyBhIHN0YWxlIGxhYmVsLlxyXG4gICAgZWxzZSBlbGVtZW50LnRleHRDb250ZW50ID0gJydcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEEgdGV4dGJsb2NrJ3MgaW5saW5lIERPTSBtdXN0IGJlIHJlYnVpbHQgd2hlbiBpdHMgY29udGVudCBjaGFuZ2VkLCBvclxyXG4gICAqIHdoZW4gdGhlIGRlY29yYXRpb25zIGl0IHJlbmRlcnMgd2l0aCBjaGFuZ2VkLCBlaXRoZXIgZnJvbSBhbiBlcG9jaCBidW1wXHJcbiAgICogb3IgYmVjYXVzZSB0aGlzIG5vZGUgaXRzZWxmIGlzIGRpZmZlcmVudC4gQSBkZWNvcmF0aW9uIHNvdXJjZSBtYXkga2V5IG9mZlxyXG4gICAqIGEgbm9kZSdzIGF0dHJpYnV0ZXMgKGEgY29kZSBibG9jaydzIGBsYW5ndWFnZWAsIHNheSksIHNvIGlkZW50aWNhbFxyXG4gICAqIGNvbnRlbnQgaXMgbm90IG9uIGl0cyBvd24gZW5vdWdoIHRvIHJldXNlIHRoZSByZW5kZXJlZCBpbmxpbmUgRE9NLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgaW5saW5lTmVlZHNSZW5kZXIoXHJcbiAgICBjb250ZW50OiBIVE1MRWxlbWVudCxcclxuICAgIHByZXZpb3VzOiBFZGl0b3JOb2RlIHwgbnVsbCB8IHVuZGVmaW5lZCxcclxuICAgIHdhc0N1cnJlbnQ6IGJvb2xlYW4sXHJcbiAgICBub2RlOiBFZGl0b3JOb2RlLFxyXG4gICk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKCFwcmV2aW91cyB8fCAhcHJldmlvdXMuY29udGVudC5lcShub2RlLmNvbnRlbnQpKSByZXR1cm4gdHJ1ZVxyXG4gICAgLy8gU2FtZSBub2RlIG9iamVjdCBhbmQgYSBjdXJyZW50IGVwb2NoOiBub3RoaW5nIGNhbiBoYXZlIGNoYW5nZWQuXHJcbiAgICBpZiAod2FzQ3VycmVudCAmJiBwcmV2aW91cyA9PT0gbm9kZSkgcmV0dXJuIGZhbHNlXHJcbiAgICBjb25zdCBuZXh0ID0gdGhpcy5kZWNvcmF0aW9ucz8uKG5vZGUpID8/IFtdXHJcbiAgICByZXR1cm4gIWRlY29yYXRpb25zRXEodGhpcy5yZW5kZXJlZERlY29yYXRpb25zLmdldChjb250ZW50KSA/PyBbXSwgbmV4dClcclxuICB9XHJcbn1cclxuXHJcbi8qKiBDdXQgW2Zyb20sIHRvKSBhdCBldmVyeSBkZWNvcmF0aW9uIGJvdW5kYXJ5IHRoYXQgZmFsbHMgaW5zaWRlIGl0LiAqL1xyXG5mdW5jdGlvbiBzZWdtZW50UmFuZ2UoXHJcbiAgZnJvbTogbnVtYmVyLFxyXG4gIHRvOiBudW1iZXIsXHJcbiAgZGVjb3JhdGlvbnM6IHJlYWRvbmx5IElubGluZURlY29yYXRpb25bXSxcclxuKTogW251bWJlciwgbnVtYmVyXVtdIHtcclxuICBjb25zdCBjdXRzID0gbmV3IFNldDxudW1iZXI+KFtmcm9tLCB0b10pXHJcbiAgZm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XHJcbiAgICBpZiAoZGVjb3JhdGlvbi5mcm9tID4gZnJvbSAmJiBkZWNvcmF0aW9uLmZyb20gPCB0bykgY3V0cy5hZGQoZGVjb3JhdGlvbi5mcm9tKVxyXG4gICAgaWYgKGRlY29yYXRpb24udG8gPiBmcm9tICYmIGRlY29yYXRpb24udG8gPCB0bykgY3V0cy5hZGQoZGVjb3JhdGlvbi50bylcclxuICB9XHJcbiAgY29uc3Qgc29ydGVkID0gWy4uLmN1dHNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKVxyXG4gIGNvbnN0IHNlZ21lbnRzOiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXVxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc29ydGVkLmxlbmd0aCAtIDE7IGkrKykge1xyXG4gICAgc2VnbWVudHMucHVzaChbc29ydGVkW2ldIGFzIG51bWJlciwgc29ydGVkW2kgKyAxXSBhcyBudW1iZXJdKVxyXG4gIH1cclxuICByZXR1cm4gc2VnbWVudHNcclxufVxyXG4iLCAiaW1wb3J0IHsgdHlwZSBBbm5vdW5jZXIsIGNyZWF0ZUFubm91bmNlciwgZGVzY3JpYmVEb2NDaGFuZ2UgfSBmcm9tICcuLi9hMTF5L2Fubm91bmNlJ1xyXG5pbXBvcnQge1xyXG4gIHR5cGUgQ29tbWFuZCxcclxuICBjaGFpbkNvbW1hbmRzLFxyXG4gIGRlbGV0ZUJhY2t3YXJkSW5QcmVmb3JtYXR0ZWQsXHJcbiAgZGVsZXRlQ2hhckJhY2t3YXJkLFxyXG4gIGRlbGV0ZUNoYXJGb3J3YXJkLFxyXG4gIGRlbGV0ZVNlbGVjdGlvbixcclxuICBpbnNlcnRDb250ZW50LFxyXG4gIGluc2VydElubGluZU5vZGUsXHJcbiAgaW5zZXJ0TmV3bGluZUluUHJlZm9ybWF0dGVkLFxyXG4gIGluc2VydFRleHQsXHJcbiAgc2V0TWFyayxcclxuICBzcGxpdEJsb2NrLFxyXG4gIHNwbGl0QmxvY2tJblByZWZvcm1hdHRlZCxcclxuICB0b2dnbGVNYXJrLFxyXG4gIHR5cGVJblByZWZvcm1hdHRlZCxcclxufSBmcm9tICcuLi9jb21tYW5kcy9jb21tYW5kcydcclxuaW1wb3J0IHsgbGlua2lmeVRleHQgfSBmcm9tICcuLi9jb21tYW5kcy9saW5rcydcclxuaW1wb3J0IHsgc2V0VGFza0NoZWNrZWQsIHNwbGl0TGlzdEl0ZW0gfSBmcm9tICcuLi9jb21tYW5kcy9saXN0cydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3IgfSBmcm9tICcuLi9lZGl0b3IvZWRpdG9yJ1xyXG5pbXBvcnQgeyB0eXBlIElucHV0UnVsZSwgYXBwbHlJbnB1dFJ1bGVzLCBkZWZhdWx0SW5wdXRSdWxlcyB9IGZyb20gJy4uL2lucHV0LXJ1bGVzL2lucHV0LXJ1bGVzJ1xyXG5pbXBvcnQgeyBibG9ja3NJblJhbmdlIH0gZnJvbSAnLi4vbW9kZWwvYmxvY2tzJ1xyXG5pbXBvcnQgeyBGcmFnbWVudCB9IGZyb20gJy4uL21vZGVsL2ZyYWdtZW50J1xyXG5pbXBvcnQge1xyXG4gIGlubGluZUxlbmd0aCxcclxuICBpbmxpbmVPZmZzZXRGcm9tVGV4dCxcclxuICBtYXJrc0F0SW5saW5lT2Zmc2V0LFxyXG4gIHNsaWNlSW5saW5lLFxyXG59IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHsgbm9kZUZyb21KU09OIH0gZnJvbSAnLi4vbW9kZWwvanNvbidcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JOb2RlIH0gZnJvbSAnLi4vbW9kZWwvbm9kZSdcclxuaW1wb3J0IHsgcG9zIH0gZnJvbSAnLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB7IG5vZGVBdFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBzYWZlSHJlZiB9IGZyb20gJy4uL3NjaGVtYS9iYXNpYydcclxuaW1wb3J0IHR5cGUgeyBTZWFyY2hNYXRjaCB9IGZyb20gJy4uL3NlYXJjaC9maW5kLXJlcGxhY2UnXHJcbmltcG9ydCB7IHNlcmlhbGl6ZVRvSFRNTCB9IGZyb20gJy4uL3NlcmlhbGl6ZS9odG1sJ1xyXG5pbXBvcnQgeyBwYXJzZUhUTUwgfSBmcm9tICcuLi9zZXJpYWxpemUvcGFyc2UtaHRtbCdcclxuaW1wb3J0IHsgY2xlYW5QYXN0ZWRIVE1MIH0gZnJvbSAnLi4vc2VyaWFsaXplL3Bhc3RlLXNvdXJjZSdcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uL3N0YXRlL2VkaXRvci1zdGF0ZSdcclxuaW1wb3J0IHsgVGV4dFNlbGVjdGlvbiB9IGZyb20gJy4uL3N0YXRlL3NlbGVjdGlvbidcclxuaW1wb3J0IHsgUmVwbGFjZUlubGluZVN0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9yZXBsYWNlLWlubGluZSdcclxuaW1wb3J0IHsgZG9tUG9pbnRGcm9tUG9zaXRpb24sIHBhdGhPZkVsZW1lbnQsIHBvc2l0aW9uRnJvbURPTVBvaW50IH0gZnJvbSAnLi9kb20tcG9pbnQnXHJcbmltcG9ydCB7IHR5cGUgS2V5bWFwLCBiYXNlS2V5bWFwLCBrZXlkb3duSGFuZGxlciB9IGZyb20gJy4va2V5bWFwJ1xyXG5pbXBvcnQge1xyXG4gIERPTVJlbmRlcmVyLFxyXG4gIHR5cGUgRGVjb3JhdGlvblNvdXJjZSxcclxuICB0eXBlIElubGluZURlY29yYXRpb24sXHJcbiAgdHlwZSBOb2RlVmlld0luc3RhbmNlLFxyXG59IGZyb20gJy4vcmVuZGVyZXInXHJcblxyXG5jb25zdCBUUkVWSVhBTF9NSU1FID0gJ2FwcGxpY2F0aW9uL3gtdHJldml4YWwranNvbidcclxuXHJcbi8qKiBBIHBhc3RlZCBzdHJpbmcgdGhhdCBpcyBvbmUgVVJMIGFuZCBub3RoaW5nIGVsc2UuICovXHJcbmNvbnN0IEJBUkVfVVJMID0gL14oPzpodHRwcz86XFwvXFwvfHd3d1xcLilbXlxcczw+XCInYF17MiwyMDAwfSQvaVxyXG5cclxuLyoqIENyZWF0ZXMgdGhlIGN1c3RvbSB2aWV3IGZvciBvbmUgbm9kZSB0eXBlLiAqL1xyXG5leHBvcnQgdHlwZSBOb2RlVmlld0ZhY3RvcnkgPSAobm9kZTogRWRpdG9yTm9kZSwgZWRpdG9yOiBFZGl0b3IpID0+IE5vZGVWaWV3SW5zdGFuY2VcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yVmlld09wdGlvbnMge1xyXG4gIHJlYWRvbmx5IGF1dG9mb2N1cz86IGJvb2xlYW5cclxuICAvKiogRXh0cmEga2V5IGJpbmRpbmdzOyB0aGV5IHdpbiBvdmVyIHRoZSBiYXNlIGtleW1hcC4gKi9cclxuICByZWFkb25seSBrZXltYXA/OiBLZXltYXBcclxuICAvKiogVGV4dCBzaG93biB3aGlsZSB0aGUgZG9jdW1lbnQgaXMgZW1wdHkuICovXHJcbiAgcmVhZG9ubHkgcGxhY2Vob2xkZXI/OiBzdHJpbmdcclxuICAvKipcclxuICAgKiBBY2Nlc3NpYmxlIG5hbWUgZm9yIHRoZSBlZGl0aW5nIHN1cmZhY2UuIEl0IGNhcnJpZXMgYHJvbGU9XCJ0ZXh0Ym94XCJgLCBhbmRcclxuICAgKiBhIHRleHRib3ggd2l0aG91dCBhIG5hbWUgaXMgYW5ub3VuY2VkIGFzIGFuIHVubGFiZWxsZWQgZWRpdCBmaWVsZC4gVGhlXHJcbiAgICogcmVhZGVyIGNhbiB0ZWxsIHlvdSBhcmUgaW4gb25lLCBidXQgbm90IHdoYXQgaXQgaXMgZm9yLiBEZWZhdWx0cyB0b1xyXG4gICAqIFwiRG9jdW1lbnRcIjsgZ2l2ZSBpdCB0aGUgbmFtZSBvZiB0aGUgdGhpbmcgYmVpbmcgZWRpdGVkIHdoZXJlIHlvdSBjYW4uXHJcbiAgICovXHJcbiAgcmVhZG9ubHkgYXJpYUxhYmVsPzogc3RyaW5nXHJcbiAgLyoqIFN0YXJ0IHJlYWQtb25seS4gRmxpcCBhdCBydW50aW1lIHdpdGgge0BsaW5rIEVkaXRvclZpZXcuc2V0RWRpdGFibGV9LiAqL1xyXG4gIHJlYWRvbmx5IGVkaXRhYmxlPzogYm9vbGVhblxyXG4gIC8qKiBCcm93c2VyIHNwZWxsIGNoZWNraW5nOyB0aGUgYnJvd3NlcidzIGRlZmF1bHQgd2hlbiBvbWl0dGVkLiAqL1xyXG4gIHJlYWRvbmx5IHNwZWxsY2hlY2s/OiBib29sZWFuXHJcbiAgLyoqIFJlcGxhY2VzIHRoZSBkZWZhdWx0IG1hcmtkb3duLXN0eWxlIGlucHV0IHJ1bGVzIHdoZW4gcHJvdmlkZWQuICovXHJcbiAgcmVhZG9ubHkgaW5wdXRSdWxlcz86IHJlYWRvbmx5IElucHV0UnVsZVtdXHJcbiAgLyoqIEN1c3RvbSByZW5kZXJlcnMgcGVyIG5vZGUgdHlwZSAoZnJhbWV3b3JrIGNvbXBvbmVudHMgaW4gdGhlIGRvY3VtZW50KS4gKi9cclxuICByZWFkb25seSBub2RlVmlld3M/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBOb2RlVmlld0ZhY3Rvcnk+PlxyXG4gIC8qKlxyXG4gICAqIEFubm91bmNlIHN0cnVjdHVyYWwgZWRpdHM6IGJsb2NrcyBkZWxldGVkLCB0aGUgYmxvY2sgdW5kZXIgdGhlIGNhcmV0XHJcbiAgICogYmVjb21pbmcgYSBkaWZmZXJlbnQga2luZCwgdG8gYXNzaXN0aXZlIHRlY2hub2xvZ3kgdGhyb3VnaCBhIGxpdmVcclxuICAgKiByZWdpb24uIE9uIGJ5IGRlZmF1bHQ6IGEgcmVhZGVyIGFscmVhZHkgcmVwb3J0cyB0eXBlZCBjaGFyYWN0ZXJzIGZyb20gdGhlXHJcbiAgICogRE9NLCBidXQgbm90IGEga2V5IHByZXNzIHRoYXQgcmVtb3ZlZCB0aHJlZSBwYXJhZ3JhcGhzLCBhbmQgc2lsZW5jZSBhZnRlclxyXG4gICAqIGEgZGVzdHJ1Y3RpdmUgZWRpdCBpcyB0aGUgd29yc3QgdGhpbmcgdGhpcyBzdXJmYWNlIGNhbiBkby4gUGFzcyBgZmFsc2VgXHJcbiAgICogd2hlbiB0aGUgaG9zdCBwcm92aWRlcyBpdHMgb3duIGxpdmUgcmVnaW9uLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IGFubm91bmNlPzogYm9vbGVhblxyXG59XHJcblxyXG5mdW5jdGlvbiBkZXRlY3RNYWMoKTogYm9vbGVhbiB7XHJcbiAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IgPT09ICd1bmRlZmluZWQnKSByZXR1cm4gZmFsc2VcclxuICBjb25zdCBwbGF0Zm9ybSA9IG5hdmlnYXRvci5wbGF0Zm9ybSA/PyAnJ1xyXG4gIHJldHVybiAvTWFjfGlQKGhvbmV8YWR8b2QpLy50ZXN0KHBsYXRmb3JtIHx8IG5hdmlnYXRvci51c2VyQWdlbnQgfHwgJycpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGUgY29udGVudGVkaXRhYmxlIHZpZXcuIFRoZSBET00gaXMgYSByZW5kZXIgdGFyZ2V0IGFuZCBpbnB1dCBzb3VyY2Ugb25seTpcclxuICogYGJlZm9yZWlucHV0YCBpbnRlbnRzIGFyZSBpbnRlcmNlcHRlZCBhbmQgdHVybmVkIGludG8gY29tbWFuZHM7IElNRVxyXG4gKiBjb21wb3NpdGlvbiBsZXRzIHRoZSBET00gbGVhZCwgdGhlbiByZWNvbmNpbGVzIGF0IGBjb21wb3NpdGlvbmVuZGA7IGFcclxuICogTXV0YXRpb25PYnNlcnZlciByZXBhaXJzIGFueXRoaW5nIHVuZXhwZWN0ZWQgYmFjayBpbnRvIHRoZSBtb2RlbC5cclxuICovXHJcbi8qKiBgTm9kZS5URVhUX05PREVgLCB3aXRob3V0IHJlYWNoaW5nIGZvciB0aGUgRE9NIGNvbnN0YW50IGF0IHJ1bnRpbWUuICovXHJcbmNvbnN0IFRFWFRfTk9ERSA9IDNcclxuXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3JWaWV3IHtcclxuICByZWFkb25seSBkb206IEhUTUxFbGVtZW50XHJcbiAgLyoqIEFkdmFuY2VkIEFQSTogdGhlIHJlbmRlcmVyJ3MgRE9N4oaUbW9kZWwgbWFwcGluZywgdXNlZCBieSBhZGFwdGVycy4gKi9cclxuICByZWFkb25seSByZW5kZXJlcjogRE9NUmVuZGVyZXJcclxuICBwcml2YXRlIHJlYWRvbmx5IGRvY3VtZW50OiBEb2N1bWVudFxyXG4gIHByaXZhdGUgcmVhZG9ubHkgaGFuZGxlS2V5OiAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IGJvb2xlYW5cclxuICBwcml2YXRlIHJlYWRvbmx5IHVuc3Vic2NyaWJlOiAoKSA9PiB2b2lkXHJcbiAgcHJpdmF0ZSByZWFkb25seSBpbnB1dFJ1bGVzOiByZWFkb25seSBJbnB1dFJ1bGVbXVxyXG4gIHByaXZhdGUgcmVhZG9ubHkgcGxhY2Vob2xkZXI6IHN0cmluZyB8IG51bGxcclxuICBwcml2YXRlIG9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyIHwgbnVsbCA9IG51bGxcclxuICBwcml2YXRlIGNvbXBvc2luZyA9IGZhbHNlXHJcbiAgcHJpdmF0ZSB1cGRhdGluZ0RPTSA9IGZhbHNlXHJcbiAgcHJpdmF0ZSBkZXN0cm95ZWQgPSBmYWxzZVxyXG4gIHByaXZhdGUgZWRpdGFibGUgPSB0cnVlXHJcbiAgcHJpdmF0ZSBwYXN0ZVBsYWluT25jZSA9IGZhbHNlXHJcbiAgcHJpdmF0ZSBoaWdobGlnaHRzOiByZWFkb25seSBTZWFyY2hNYXRjaFtdID0gW11cclxuICBwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25MYXllcnMgPSBuZXcgTWFwPHN0cmluZywgRGVjb3JhdGlvblNvdXJjZT4oKVxyXG4gIHByaXZhdGUgcmVhZG9ubHkga2V5ZG93bkludGVyY2VwdG9ycyA9IG5ldyBTZXQ8KGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiBib29sZWFuPigpXHJcbiAgcHJpdmF0ZSByZWFkb25seSBhbm5vdW5jZXI6IEFubm91bmNlciB8IG51bGxcclxuICBwcml2YXRlIHJlYWRvbmx5IHN0b3BBbm5vdW5jaW5nOiAoKCkgPT4gdm9pZCkgfCBudWxsXHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcmVhZG9ubHkgZWRpdG9yOiBFZGl0b3IsXHJcbiAgICBwbGFjZTogSFRNTEVsZW1lbnQsXHJcbiAgICBvcHRpb25zOiBFZGl0b3JWaWV3T3B0aW9ucyA9IHt9LFxyXG4gICkge1xyXG4gICAgdGhpcy5kb2N1bWVudCA9IHBsYWNlLm93bmVyRG9jdW1lbnRcclxuICAgIHRoaXMuZG9tID0gdGhpcy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxyXG4gICAgdGhpcy5kb20uY2xhc3NOYW1lID0gJ3RyZXZpeGFsLWNvbnRlbnQnXHJcbiAgICB0aGlzLmRvbS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAndGV4dGJveCcpXHJcbiAgICB0aGlzLmRvbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbXVsdGlsaW5lJywgJ3RydWUnKVxyXG4gICAgdGhpcy5kb20uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgb3B0aW9ucy5hcmlhTGFiZWwgPz8gJ0RvY3VtZW50JylcclxuICAgIGNvbnN0IGNvbnN0cnVjdG9yczogUmVjb3JkPHN0cmluZywgKG5vZGU6IEVkaXRvck5vZGUpID0+IE5vZGVWaWV3SW5zdGFuY2U+ID0ge31cclxuICAgIGZvciAoY29uc3QgW25hbWUsIGZhY3RvcnldIG9mIE9iamVjdC5lbnRyaWVzKG9wdGlvbnMubm9kZVZpZXdzID8/IHt9KSkge1xyXG4gICAgICBjb25zdHJ1Y3RvcnNbbmFtZV0gPSAobm9kZSkgPT4gZmFjdG9yeShub2RlLCBlZGl0b3IpXHJcbiAgICB9XHJcbiAgICB0aGlzLnJlbmRlcmVyID0gbmV3IERPTVJlbmRlcmVyKHRoaXMuZG9jdW1lbnQsIGNvbnN0cnVjdG9ycylcclxuICAgIGlmICghZWRpdG9yLnZpZXcpIGVkaXRvci52aWV3ID0gdGhpc1xyXG4gICAgdGhpcy5pbnB1dFJ1bGVzID0gb3B0aW9ucy5pbnB1dFJ1bGVzID8/IGRlZmF1bHRJbnB1dFJ1bGVzKClcclxuICAgIHRoaXMuYW5ub3VuY2VyID1cclxuICAgICAgb3B0aW9ucy5hbm5vdW5jZSA9PT0gZmFsc2UgPyBudWxsIDogY3JlYXRlQW5ub3VuY2VyKHRoaXMuZG9jdW1lbnQsIHsgY29udGFpbmVyOiBwbGFjZSB9KVxyXG4gICAgdGhpcy5zdG9wQW5ub3VuY2luZyA9IHRoaXMuYW5ub3VuY2VyID8gdGhpcy53YXRjaEZvckFubm91bmNlbWVudHModGhpcy5hbm5vdW5jZXIpIDogbnVsbFxyXG4gICAgdGhpcy5wbGFjZWhvbGRlciA9IG9wdGlvbnMucGxhY2Vob2xkZXIgPz8gbnVsbFxyXG4gICAgaWYgKHRoaXMucGxhY2Vob2xkZXIpIHRoaXMuZG9tLmRhdGFzZXQudHJldml4YWxQbGFjZWhvbGRlciA9IHRoaXMucGxhY2Vob2xkZXJcclxuICAgIHBsYWNlLmFwcGVuZENoaWxkKHRoaXMuZG9tKVxyXG4gICAgdGhpcy5zZXRFZGl0YWJsZShvcHRpb25zLmVkaXRhYmxlICE9PSBmYWxzZSlcclxuICAgIGlmIChvcHRpb25zLnNwZWxsY2hlY2sgIT09IHVuZGVmaW5lZCkgdGhpcy5zZXRTcGVsbGNoZWNrKG9wdGlvbnMuc3BlbGxjaGVjaylcclxuXHJcbiAgICB0aGlzLmhhbmRsZUtleSA9IGtleWRvd25IYW5kbGVyKFxyXG4gICAgICB7XHJcbiAgICAgICAgLi4uYmFzZUtleW1hcCgpLFxyXG4gICAgICAgICdNb2QtU2hpZnQtdic6ICgpID0+IHtcclxuICAgICAgICAgIHRoaXMucGFzdGVQbGFpbk9uY2UgPSB0cnVlXHJcbiAgICAgICAgICByZXR1cm4gZmFsc2UgLy8gbGV0IHRoZSBuYXRpdmUgcGFzdGUgcHJvY2VlZDsgb25QYXN0ZSBwaWNrcyB1cCB0aGUgZmxhZ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLi4uKG9wdGlvbnMua2V5bWFwID8/IHt9KSxcclxuICAgICAgfSxcclxuICAgICAgZWRpdG9yLFxyXG4gICAgICBkZXRlY3RNYWMoKSxcclxuICAgIClcclxuXHJcbiAgICB0aGlzLmRvbS5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmVpbnB1dCcsIHRoaXMub25CZWZvcmVJbnB1dCBhcyBFdmVudExpc3RlbmVyKVxyXG4gICAgdGhpcy5kb20uYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93biBhcyBFdmVudExpc3RlbmVyKVxyXG4gICAgdGhpcy5kb20uYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duKVxyXG4gICAgdGhpcy5kb20uYWRkRXZlbnRMaXN0ZW5lcignY29tcG9zaXRpb25zdGFydCcsIHRoaXMub25Db21wb3NpdGlvblN0YXJ0KVxyXG4gICAgdGhpcy5kb20uYWRkRXZlbnRMaXN0ZW5lcignY29tcG9zaXRpb25lbmQnLCB0aGlzLm9uQ29tcG9zaXRpb25FbmQpXHJcbiAgICB0aGlzLmRvbS5hZGRFdmVudExpc3RlbmVyKCdjb3B5JywgdGhpcy5vbkNvcHkgYXMgRXZlbnRMaXN0ZW5lcilcclxuICAgIHRoaXMuZG9tLmFkZEV2ZW50TGlzdGVuZXIoJ2N1dCcsIHRoaXMub25DdXQgYXMgRXZlbnRMaXN0ZW5lcilcclxuICAgIHRoaXMuZG9tLmFkZEV2ZW50TGlzdGVuZXIoJ3Bhc3RlJywgdGhpcy5vblBhc3RlIGFzIEV2ZW50TGlzdGVuZXIpXHJcbiAgICB0aGlzLmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3NlbGVjdGlvbmNoYW5nZScsIHRoaXMub25TZWxlY3Rpb25DaGFuZ2UpXHJcblxyXG4gICAgaWYgKHR5cGVvZiBNdXRhdGlvbk9ic2VydmVyICE9PSAndW5kZWZpbmVkJykge1xyXG4gICAgICB0aGlzLm9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIodGhpcy5vbk11dGF0aW9ucylcclxuICAgICAgdGhpcy5vYnNlcnZlci5vYnNlcnZlKHRoaXMuZG9tLCB7IGNoaWxkTGlzdDogdHJ1ZSwgY2hhcmFjdGVyRGF0YTogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMudW5zdWJzY3JpYmUgPSBlZGl0b3Iub24oJ3RyYW5zYWN0aW9uJywgKCkgPT4gdGhpcy51cGRhdGUoKSlcclxuICAgIHRoaXMudXBkYXRlKClcclxuICAgIGlmIChvcHRpb25zLmF1dG9mb2N1cykgdGhpcy5mb2N1cygpXHJcbiAgfVxyXG5cclxuICAvKiogUmUtcmVuZGVyIGZyb20gdGhlIGVkaXRvciBzdGF0ZSBhbmQgcHVzaCB0aGUgc2VsZWN0aW9uIGludG8gdGhlIERPTS4gKi9cclxuICB1cGRhdGUoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQgfHwgdGhpcy5jb21wb3NpbmcpIHJldHVyblxyXG4gICAgdGhpcy53aXRoRE9NVXBkYXRlKCgpID0+IHRoaXMucmVuZGVyZXIucmVuZGVyRG9jKHRoaXMuZWRpdG9yLnN0YXRlLmRvYywgdGhpcy5kb20pKVxyXG4gICAgdGhpcy51cGRhdGVQbGFjZWhvbGRlcigpXHJcbiAgICB0aGlzLnN5bmNTZWxlY3Rpb25Ub0RPTSgpXHJcbiAgfVxyXG5cclxuICAvKiogVG9nZ2xlIHJlYWQtb25seSBtb2RlLiAqL1xyXG4gIHNldEVkaXRhYmxlKGVkaXRhYmxlOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICB0aGlzLmVkaXRhYmxlID0gZWRpdGFibGVcclxuICAgIHRoaXMuZG9tLmNvbnRlbnRFZGl0YWJsZSA9IFN0cmluZyhlZGl0YWJsZSlcclxuICAgIHRoaXMuZG9tLnNldEF0dHJpYnV0ZSgnYXJpYS1yZWFkb25seScsIFN0cmluZyghZWRpdGFibGUpKVxyXG4gIH1cclxuXHJcbiAgZ2V0IGlzRWRpdGFibGUoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0YWJsZVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVHVybiB0aGUgYnJvd3NlcidzIHNwZWxsIGNoZWNraW5nIG9mIHRoZSBzdXJmYWNlIG9uIG9yIG9mZi4gU2V0IGFzIHRoZVxyXG4gICAqIGNvbnRlbnQgYXR0cmlidXRlIHJhdGhlciB0aGFuIHRoZSBJREwgcHJvcGVydHksIHNvIGl0IHN1cnZpdmVzIGEgRE9NIHRoYXRcclxuICAgKiBkb2VzIG5vdCByZWZsZWN0IGBzcGVsbGNoZWNrYCAoYW5kIHNob3dzIHVwIGluIHRoZSBtYXJrdXAgZm9yIHRlc3RzKS5cclxuICAgKlxyXG4gICAqIFN3aXRjaGluZyBpdCBvZmYgaXMgZW5vdWdoIG9uIGl0cyBvd24uIFRoZSBicm93c2VyIGRyb3BzIHRoZSBtYXJrcyBpdCBoYXNcclxuICAgKiBhbHJlYWR5IGRyYXduLiBTd2l0Y2hpbmcgaXQgYmFjayBvbiBpcyBub3Q6IHRoZSB0ZXh0IGlzIG5vdCBuZXcgdG8gdGhlXHJcbiAgICogc3BlbGwgY2hlY2tlciwgc28gbm90aGluZyBpcyByZS1zY2FubmVkIGFuZCB0aGUgc3VyZmFjZSBzdGF5cyB1bm1hcmtlZFxyXG4gICAqIHVudGlsIHRoZSBuZXh0IGVkaXQgaGFwcGVucyB0byB0b3VjaCBhIGJsb2NrLiBgcmVmcmVzaFRleHROb2Rlc2AgYmVsb3cgaXNcclxuICAgKiB3aGF0IG1ha2VzIGl0IGxvb2sgbmV3LlxyXG4gICAqL1xyXG4gIHNldFNwZWxsY2hlY2soZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgY29uc3QgY2hhbmdlZCA9IHRoaXMuc3BlbGxjaGVjayAhPT0gZW5hYmxlZFxyXG4gICAgdGhpcy5kb20uc2V0QXR0cmlidXRlKCdzcGVsbGNoZWNrJywgU3RyaW5nKGVuYWJsZWQpKVxyXG4gICAgaWYgKCFjaGFuZ2VkIHx8ICFlbmFibGVkKSByZXR1cm5cclxuICAgIHRoaXMud2l0aERPTVVwZGF0ZSgoKSA9PiB0aGlzLnJlZnJlc2hUZXh0Tm9kZXModGhpcy5kb20pKVxyXG4gICAgLy8gUmVwbGFjaW5nIHRoZSBub2RlcyBkcm9wcyB0aGUgRE9NIHNlbGVjdGlvbjsgc3RhdGUgc3RpbGwgaGFzIGl0LlxyXG4gICAgdGhpcy5zeW5jU2VsZWN0aW9uVG9ET00oKVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3dhcCBldmVyeSByZW5kZXJlZCB0ZXh0IG5vZGUgZm9yIGFuIGlkZW50aWNhbCBmcmVzaCBvbmUsIHNvIHRoZSBicm93c2VyXHJcbiAgICogdHJlYXRzIHRoZSB0ZXh0IGFzIG5ld2x5IGFycml2ZWQgYW5kIHNwZWxsIGNoZWNrcyBpdCBhZ2Fpbi4gT25seSB0ZXh0IGlzXHJcbiAgICogcmVwbGFjZWQ6IGVsZW1lbnRzIGtlZXAgdGhlaXIgaWRlbnRpdHksIHNvIGEgbm9kZSB2aWV3LCBhbiBlbWJlZGRlZFxyXG4gICAqIGlmcmFtZSwgYSBkaWFncmFtLCBpcyBub3QgdG9ybiBkb3duIGFuZCByZWJ1aWx0IGJlaGluZCB0aGUgdXNlcidzIGJhY2suXHJcbiAgICpcclxuICAgKiBOb3RoaW5nIGNoZWFwZXIgd29ya3MuIEZsaXBwaW5nIHRoZSBhdHRyaWJ1dGUsIGEgYmx1ci9mb2N1cyBjeWNsZSxcclxuICAgKiBkZXRhY2hpbmcgdGhlIHN1cmZhY2UgYW5kIHJlLXRvZ2dsaW5nIGBjb250ZW50ZWRpdGFibGVgIGFsbCBsZWF2ZSB0aGVcclxuICAgKiBleGlzdGluZyB0ZXh0IHVuY2hlY2tlZC5cclxuICAgKi9cclxuICBwcml2YXRlIHJlZnJlc2hUZXh0Tm9kZXMocGFyZW50OiBnbG9iYWxUaGlzLk5vZGUpOiB2b2lkIHtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgWy4uLnBhcmVudC5jaGlsZE5vZGVzXSkge1xyXG4gICAgICBpZiAoY2hpbGQubm9kZVR5cGUgIT09IFRFWFRfTk9ERSkge1xyXG4gICAgICAgIHRoaXMucmVmcmVzaFRleHROb2RlcyhjaGlsZClcclxuICAgICAgICBjb250aW51ZVxyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGZyZXNoID0gdGhpcy5kb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShjaGlsZC50ZXh0Q29udGVudCA/PyAnJylcclxuICAgICAgLy8gVGhlIHJlbmRlcmVyIG1hcHMgcmVuZGVyZWQgdGV4dCBiYWNrIHRvIHRoZSBtb2RlbCBub2RlIGl0IGNhbWUgZnJvbTtcclxuICAgICAgLy8gd2l0aG91dCBjYXJyeWluZyB0aGF0IG92ZXIsIHBvc2l0aW9uIG1hcHBpbmcgbG9zZXMgdGhlIGFuY2hvci5cclxuICAgICAgY29uc3QgbW9kZWwgPSB0aGlzLnJlbmRlcmVyLm1vZGVsT2YuZ2V0KGNoaWxkKVxyXG4gICAgICBpZiAobW9kZWwpIHRoaXMucmVuZGVyZXIubW9kZWxPZi5zZXQoZnJlc2gsIG1vZGVsKVxyXG4gICAgICA7KGNoaWxkIGFzIGdsb2JhbFRoaXMuVGV4dCkucmVwbGFjZVdpdGgoZnJlc2gpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKiogV2hldGhlciB0aGUgc3VyZmFjZSBpcyBzcGVsbCBjaGVja2VkOyB0aGUgYnJvd3NlciBkZWZhdWx0IHVudGlsIHNldC4gKi9cclxuICBnZXQgc3BlbGxjaGVjaygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmRvbS5nZXRBdHRyaWJ1dGUoJ3NwZWxsY2hlY2snKSAhPT0gJ2ZhbHNlJ1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSGlnaGxpZ2h0IGlubGluZSByYW5nZXMgKGZpbmQgJiByZXBsYWNlIG1hdGNoZXMpIGFzIGRlY29yYXRpb25zLCBuZXZlclxyXG4gICAqIHN0b3JlZCBpbiB0aGUgZG9jdW1lbnQuIFBhc3MgYW4gZW1wdHkgYXJyYXkgdG8gY2xlYXIuXHJcbiAgICovXHJcbiAgc2V0SGlnaGxpZ2h0cyhtYXRjaGVzOiByZWFkb25seSBTZWFyY2hNYXRjaFtdKTogdm9pZCB7XHJcbiAgICB0aGlzLmhpZ2hsaWdodHMgPSBtYXRjaGVzXHJcbiAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhpcy5zZXREZWNvcmF0aW9uTGF5ZXIoJ3NlYXJjaCcsIG51bGwpXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgY29uc3QgYnlOb2RlID0gbmV3IFdlYWtNYXA8RWRpdG9yTm9kZSwgSW5saW5lRGVjb3JhdGlvbltdPigpXHJcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuICAgICAgY29uc3Qgbm9kZSA9IG5vZGVBdFBhdGgodGhpcy5lZGl0b3Iuc3RhdGUuZG9jLCBtYXRjaC5wYXRoKVxyXG4gICAgICBpZiAoIW5vZGUpIGNvbnRpbnVlXHJcbiAgICAgIGNvbnN0IGxpc3QgPSBieU5vZGUuZ2V0KG5vZGUpID8/IFtdXHJcbiAgICAgIGxpc3QucHVzaCh7IGZyb206IG1hdGNoLmZyb20sIHRvOiBtYXRjaC50bywgY2xhc3NOYW1lOiAndHJldml4YWwtc2VhcmNoLW1hdGNoJyB9KVxyXG4gICAgICBieU5vZGUuc2V0KG5vZGUsIGxpc3QpXHJcbiAgICB9XHJcbiAgICB0aGlzLnNldERlY29yYXRpb25MYXllcignc2VhcmNoJywgKG5vZGUpID0+IGJ5Tm9kZS5nZXQobm9kZSkgPz8gbnVsbClcclxuICB9XHJcblxyXG4gIGdldCBjdXJyZW50SGlnaGxpZ2h0cygpOiByZWFkb25seSBTZWFyY2hNYXRjaFtdIHtcclxuICAgIHJldHVybiB0aGlzLmhpZ2hsaWdodHNcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEluc3RhbGwgKG9yIGNsZWFyLCB3aXRoIGBudWxsYCkgYW4gaW5kZXBlbmRlbnQgZGVjb3JhdGlvbiBsYXllci5cclxuICAgKiBFeHRlbnNpb25zIGVhY2ggb3duIGEga2V5OiBjb2RlIGhpZ2hsaWdodGluZywgc2VhcmNoIG1hdGNoZXMgYW5kXHJcbiAgICogdHJhY2stY2hhbmdlIHJhbmdlcyBjb21wb3NlIHdpdGhvdXQgY2xvYmJlcmluZyBvbmUgYW5vdGhlci5cclxuICAgKi9cclxuICBzZXREZWNvcmF0aW9uTGF5ZXIoa2V5OiBzdHJpbmcsIHNvdXJjZTogRGVjb3JhdGlvblNvdXJjZSB8IG51bGwpOiB2b2lkIHtcclxuICAgIGlmIChzb3VyY2UpIHRoaXMuZGVjb3JhdGlvbkxheWVycy5zZXQoa2V5LCBzb3VyY2UpXHJcbiAgICBlbHNlIGlmICghdGhpcy5kZWNvcmF0aW9uTGF5ZXJzLmRlbGV0ZShrZXkpKSByZXR1cm5cclxuICAgIGlmICh0aGlzLmRlY29yYXRpb25MYXllcnMuc2l6ZSA9PT0gMCkge1xyXG4gICAgICB0aGlzLnJlbmRlcmVyLnNldERlY29yYXRpb25zKG51bGwpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCBsYXllcnMgPSBbLi4udGhpcy5kZWNvcmF0aW9uTGF5ZXJzLnZhbHVlcygpXVxyXG4gICAgICB0aGlzLnJlbmRlcmVyLnNldERlY29yYXRpb25zKChub2RlKSA9PiB7XHJcbiAgICAgICAgbGV0IHJlc3VsdDogSW5saW5lRGVjb3JhdGlvbltdIHwgbnVsbCA9IG51bGxcclxuICAgICAgICBmb3IgKGNvbnN0IGxheWVyIG9mIGxheWVycykge1xyXG4gICAgICAgICAgY29uc3QgZGVjb3JhdGlvbnMgPSBsYXllcihub2RlKVxyXG4gICAgICAgICAgaWYgKGRlY29yYXRpb25zICYmIGRlY29yYXRpb25zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0ID8gcmVzdWx0LmNvbmNhdChkZWNvcmF0aW9ucykgOiBbLi4uZGVjb3JhdGlvbnNdXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHRcclxuICAgICAgfSlcclxuICAgIH1cclxuICAgIHRoaXMudXBkYXRlKClcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEludGVyY2VwdCBrZXlkb3duIGJlZm9yZSB0aGUga2V5bWFwIHJ1bnM7IHJldHVybiB0cnVlIHRvIGNvbnN1bWUgdGhlXHJcbiAgICogZXZlbnQgKHN1Z2dlc3Rpb24gcG9wdXBzIHRha2UgRW50ZXIvQXJyb3dzIHdoaWxlIG9wZW4pLiBSZXR1cm5zIGFcclxuICAgKiBkaXNwb3Nlci5cclxuICAgKi9cclxuICBhZGRLZXlkb3duSW50ZXJjZXB0b3IoaW50ZXJjZXB0b3I6IChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4gYm9vbGVhbik6ICgpID0+IHZvaWQge1xyXG4gICAgdGhpcy5rZXlkb3duSW50ZXJjZXB0b3JzLmFkZChpbnRlcmNlcHRvcilcclxuICAgIHJldHVybiAoKSA9PiB0aGlzLmtleWRvd25JbnRlcmNlcHRvcnMuZGVsZXRlKGludGVyY2VwdG9yKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB1cGRhdGVQbGFjZWhvbGRlcigpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5wbGFjZWhvbGRlcikgcmV0dXJuXHJcbiAgICBjb25zdCBkb2MgPSB0aGlzLmVkaXRvci5zdGF0ZS5kb2NcclxuICAgIGNvbnN0IGVtcHR5ID1cclxuICAgICAgZG9jLmNoaWxkQ291bnQgPT09IDEgJiYgZG9jLmNoaWxkKDApLmlzVGV4dGJsb2NrICYmIGlubGluZUxlbmd0aChkb2MuY2hpbGQoMCkuY29udGVudCkgPT09IDBcclxuICAgIGlmIChlbXB0eSkge1xyXG4gICAgICB0aGlzLmRvbS5kYXRhc2V0LnRyZXZpeGFsRW1wdHkgPSAndHJ1ZSdcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGRlbGV0ZSB0aGlzLmRvbS5kYXRhc2V0LnRyZXZpeGFsRW1wdHlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdpdmUgdGhlIHN1cmZhY2Uga2V5Ym9hcmQgZm9jdXMgKip3aXRob3V0IG1vdmluZyB0aGUgcGFnZSoqLlxyXG4gICAqXHJcbiAgICogQSBiYXJlIGBIVE1MRWxlbWVudC5mb2N1cygpYCBzY3JvbGxzIHRoZSBjYXJldCBpbnRvIHZpZXcsIGFuZCB0aGUgY2FyZXRcclxuICAgKiBjYW4gYmUgdGhvdXNhbmRzIG9mIHBpeGVscyBmcm9tIHdoYXRldmVyIHRoZSByZWFkZXIgaXMgYWN0dWFsbHkgbG9va2luZ1xyXG4gICAqIGF0LiBFdmVyeSBjYWxsZXIgb2YgdGhpcyBtZXRob2QgaXMgaGFuZGluZyBmb2N1cyBiYWNrIGFmdGVyIGEgcGllY2Ugb2ZcclxuICAgKiBjaHJvbWUgdG9vayBpdCAoYSBtZW51LCB0aGUgY29tbWFuZCBwYWxldHRlLCBhIGRpYWxvZykgYW5kIG5vbmUgb2YgdGhlbVxyXG4gICAqIG1lYW5zIFwidGFrZSBtZSB0byB0aGUgY2FyZXRcIjogdGhlIHBhZ2Ugc2ltcGx5IGp1bXBlZC4gU28gZm9jdXMgbW92ZXMgYW5kXHJcbiAgICogdGhlIHZpZXdwb3J0IGRvZXMgbm90LiBUbyBkZWxpYmVyYXRlbHkgcmV2ZWFsIHRoZSBjYXJldCwgd2hpY2ggaXMgYVxyXG4gICAqIGRpZmZlcmVudCBpbnRlbnRpb24sIGNhbGwge0BsaW5rIHNjcm9sbFNlbGVjdGlvbkludG9WaWV3fS5cclxuICAgKi9cclxuICBmb2N1cygpOiB2b2lkIHtcclxuICAgIC8vIFRoZSBET00gZ2V0cyB0aGUgc2VsZWN0aW9uIGJlZm9yZSB0aGUgZm9jdXMgY2FsbCwgbm90IG9ubHkgYWZ0ZXIgaXQ6XHJcbiAgICAvLyBmb2N1c2luZyBhbiBlbXB0eSBjb250ZW50ZWRpdGFibGUgbWFrZXMgdGhlIGJyb3dzZXIgcGxhY2UgYSBjYXJldCBvZlxyXG4gICAgLy8gaXRzIG93biBhbmQgcmVwb3J0IGl0LCBhbmQgYSBgc2VsZWN0aW9uY2hhbmdlYCBkZWxpdmVyZWQgc3luY2hyb25vdXNseVxyXG4gICAgLy8gd291bGQgdGhlbiBvdmVyd3JpdGUgdGhlIG1vZGVsIHdpdGggdGhhdCBjYXJldC4gV3JpdGluZyBmaXJzdCBtZWFuc1xyXG4gICAgLy8gd2hhdGV2ZXIgaXMgcmVhZCBiYWNrIGlzIGFscmVhZHkgdGhlIHNlbGVjdGlvbiB3ZSBpbnRlbmQuXHJcbiAgICB0aGlzLnN5bmNTZWxlY3Rpb25Ub0RPTSgpXHJcbiAgICB0aGlzLndpdGhET01VcGRhdGUoKCkgPT4gdGhpcy5kb20uZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pKVxyXG4gICAgdGhpcy5zeW5jU2VsZWN0aW9uVG9ET00oKVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU2Nyb2xsIHRoZSBjYXJldCBpbnRvIHZpZXcsIHRoZSBsZWFzdCB0aGUgc2Nyb2xsZXJzIGludm9sdmVkIGFsbG93LlxyXG4gICAqXHJcbiAgICogVGhlIGNvdW50ZXJwYXJ0IHRvIHtAbGluayBmb2N1c306IG5hdmlnYXRpb24gKGFuIG91dGxpbmUgZW50cnksIGEgc2VhcmNoXHJcbiAgICogaGl0KSBtZWFucyB0byBtb3ZlIHRoZSByZWFkZXIsIHNvIGl0IHNheXMgc28gcmF0aGVyIHRoYW4gcmVseWluZyBvbiBhXHJcbiAgICogc2lkZSBlZmZlY3Qgb2YgZm9jdXNpbmcuXHJcbiAgICovXHJcbiAgc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcob3B0aW9uczogU2Nyb2xsSW50b1ZpZXdPcHRpb25zID0geyBibG9jazogJ25lYXJlc3QnIH0pOiB2b2lkIHtcclxuICAgIGNvbnN0IHBvaW50ID0gZG9tUG9pbnRGcm9tUG9zaXRpb24odGhpcy5kb20sIHRoaXMucmVuZGVyZXIsIHRoaXMuZWRpdG9yLnN0YXRlLnNlbGVjdGlvbi5mcm9tKVxyXG4gICAgY29uc3Qgbm9kZSA9IHBvaW50Py5ub2RlXHJcbiAgICBjb25zdCBlbGVtZW50ID0gbm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQgPyBub2RlIDogKG5vZGU/LnBhcmVudEVsZW1lbnQgPz8gbnVsbClcclxuICAgIGVsZW1lbnQ/LnNjcm9sbEludG9WaWV3Py4ob3B0aW9ucylcclxuICB9XHJcblxyXG4gIGRlc3Ryb3koKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQpIHJldHVyblxyXG4gICAgdGhpcy5kZXN0cm95ZWQgPSB0cnVlXHJcbiAgICB0aGlzLnVuc3Vic2NyaWJlKClcclxuICAgIHRoaXMub2JzZXJ2ZXI/LmRpc2Nvbm5lY3QoKVxyXG4gICAgdGhpcy5kb20ucmVtb3ZlRXZlbnRMaXN0ZW5lcignYmVmb3JlaW5wdXQnLCB0aGlzLm9uQmVmb3JlSW5wdXQgYXMgRXZlbnRMaXN0ZW5lcilcclxuICAgIHRoaXMuZG9tLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMub25Nb3VzZURvd24gYXMgRXZlbnRMaXN0ZW5lcilcclxuICAgIHRoaXMuZG9tLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLm9uS2V5RG93bilcclxuICAgIHRoaXMuZG9tLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvbXBvc2l0aW9uc3RhcnQnLCB0aGlzLm9uQ29tcG9zaXRpb25TdGFydClcclxuICAgIHRoaXMuZG9tLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvbXBvc2l0aW9uZW5kJywgdGhpcy5vbkNvbXBvc2l0aW9uRW5kKVxyXG4gICAgdGhpcy5kb20ucmVtb3ZlRXZlbnRMaXN0ZW5lcignY29weScsIHRoaXMub25Db3B5IGFzIEV2ZW50TGlzdGVuZXIpXHJcbiAgICB0aGlzLmRvbS5yZW1vdmVFdmVudExpc3RlbmVyKCdjdXQnLCB0aGlzLm9uQ3V0IGFzIEV2ZW50TGlzdGVuZXIpXHJcbiAgICB0aGlzLmRvbS5yZW1vdmVFdmVudExpc3RlbmVyKCdwYXN0ZScsIHRoaXMub25QYXN0ZSBhcyBFdmVudExpc3RlbmVyKVxyXG4gICAgdGhpcy5kb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdzZWxlY3Rpb25jaGFuZ2UnLCB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKVxyXG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBbLi4udGhpcy5kb20uY2hpbGRyZW5dKSB7XHJcbiAgICAgIHRoaXMucmVuZGVyZXIuZGVzdHJveVZpZXdzKGNoaWxkIGFzIEhUTUxFbGVtZW50KVxyXG4gICAgfVxyXG4gICAgdGhpcy5zdG9wQW5ub3VuY2luZz8uKClcclxuICAgIHRoaXMuYW5ub3VuY2VyPy5kZXN0cm95KClcclxuICAgIHRoaXMuZG9tLnJlbW92ZSgpXHJcbiAgICBpZiAodGhpcy5lZGl0b3IudmlldyA9PT0gdGhpcykgdGhpcy5lZGl0b3IudmlldyA9IG51bGxcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNheSBvdXQgbG91ZCB3aGF0IHRoZSBET00gYWxvbmUgZG9lcyBub3QgcmVwb3J0LiBTdHJ1Y3R1cmFsIG9ubHkuIFNlZVxyXG4gICAqIHtAbGluayBkZXNjcmliZURvY0NoYW5nZX0gZm9yIHdoeSB0aGlzIGlzIGRlbGliZXJhdGVseSBxdWlldC5cclxuICAgKi9cclxuICBwcml2YXRlIHdhdGNoRm9yQW5ub3VuY2VtZW50cyhhbm5vdW5jZXI6IEFubm91bmNlcik6ICgpID0+IHZvaWQge1xyXG4gICAgY29uc3QgYmxvY2tUeXBlQXQgPSAoc3RhdGU6IEVkaXRvclN0YXRlKTogc3RyaW5nIHwgbnVsbCA9PlxyXG4gICAgICBub2RlQXRQYXRoKHN0YXRlLmRvYywgc3RhdGUuc2VsZWN0aW9uLmZyb20ucGF0aCk/LnR5cGUubmFtZSA/PyBudWxsXHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3Iub25UcmFuc2FjdGlvbigoeyBiZWZvcmUsIHN0YXRlIH0pID0+IHtcclxuICAgICAgaWYgKHRoaXMuZGVzdHJveWVkKSByZXR1cm5cclxuICAgICAgY29uc3QgbWVzc2FnZSA9IGRlc2NyaWJlRG9jQ2hhbmdlKFxyXG4gICAgICAgIGJlZm9yZS5kb2MsXHJcbiAgICAgICAgc3RhdGUuZG9jLFxyXG4gICAgICAgIGJsb2NrVHlwZUF0KGJlZm9yZSksXHJcbiAgICAgICAgYmxvY2tUeXBlQXQoc3RhdGUpLFxyXG4gICAgICApXHJcbiAgICAgIGlmIChtZXNzYWdlKSBhbm5vdW5jZXIuYW5ub3VuY2UobWVzc2FnZSlcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSByZW5kZXJpbmdcclxuXHJcbiAgcHJpdmF0ZSB3aXRoRE9NVXBkYXRlKGZuOiAoKSA9PiB2b2lkKTogdm9pZCB7XHJcbiAgICB0aGlzLnVwZGF0aW5nRE9NID0gdHJ1ZVxyXG4gICAgdHJ5IHtcclxuICAgICAgZm4oKVxyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgLy8gRHJvcCB0aGUgbXV0YXRpb24gcmVjb3JkcyBvdXIgb3duIHJlbmRlciBqdXN0IHByb2R1Y2VkLlxyXG4gICAgICB0aGlzLm9ic2VydmVyPy50YWtlUmVjb3JkcygpXHJcbiAgICAgIHRoaXMudXBkYXRpbmdET00gPSBmYWxzZVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gc2VsZWN0aW9uXHJcblxyXG4gIHByaXZhdGUgc3luY1NlbGVjdGlvblRvRE9NKCk6IHZvaWQge1xyXG4gICAgY29uc3Qgc2VsZWN0aW9uID0gdGhpcy5lZGl0b3Iuc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uKSkgcmV0dXJuXHJcbiAgICBjb25zdCBkb21TZWxlY3Rpb24gPSB0aGlzLmRvY3VtZW50LmdldFNlbGVjdGlvbj8uKClcclxuICAgIGlmICghZG9tU2VsZWN0aW9uIHx8IHR5cGVvZiBkb21TZWxlY3Rpb24uc2V0QmFzZUFuZEV4dGVudCAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuXHJcbiAgICBjb25zdCBhbmNob3IgPSBkb21Qb2ludEZyb21Qb3NpdGlvbih0aGlzLmRvbSwgdGhpcy5yZW5kZXJlciwgc2VsZWN0aW9uLmFuY2hvcilcclxuICAgIGNvbnN0IGhlYWQgPSBkb21Qb2ludEZyb21Qb3NpdGlvbih0aGlzLmRvbSwgdGhpcy5yZW5kZXJlciwgc2VsZWN0aW9uLmhlYWQpXHJcbiAgICBpZiAoIWFuY2hvciB8fCAhaGVhZCkgcmV0dXJuXHJcbiAgICBpZiAoXHJcbiAgICAgIGRvbVNlbGVjdGlvbi5hbmNob3JOb2RlID09PSBhbmNob3Iubm9kZSAmJlxyXG4gICAgICBkb21TZWxlY3Rpb24uYW5jaG9yT2Zmc2V0ID09PSBhbmNob3Iub2Zmc2V0ICYmXHJcbiAgICAgIGRvbVNlbGVjdGlvbi5mb2N1c05vZGUgPT09IGhlYWQubm9kZSAmJlxyXG4gICAgICBkb21TZWxlY3Rpb24uZm9jdXNPZmZzZXQgPT09IGhlYWQub2Zmc2V0XHJcbiAgICApIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICAvLyBPbmx5IHN0ZWVyIHRoZSBicm93c2VyIGNhcmV0IHdoaWxlIHdlIG93biBmb2N1cy5cclxuICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuZG9jdW1lbnQuYWN0aXZlRWxlbWVudFxyXG4gICAgaWYgKGFjdGl2ZSAhPT0gdGhpcy5kb20gJiYgIXRoaXMuZG9tLmNvbnRhaW5zKGFjdGl2ZSkpIHJldHVyblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gV3JpdGluZyB0aGUgc2VsZWN0aW9uIGNhbiBpdHNlbGYgcmFpc2UgYHNlbGVjdGlvbmNoYW5nZWAsIGFuZCBzb21lXHJcbiAgICAgIC8vIGVuZ2luZXMgZGVsaXZlciBpdCBzeW5jaHJvbm91c2x5LCBtaWQtd3JpdGUsIHdpdGggdGhlIGFuY2hvciBtb3ZlZFxyXG4gICAgICAvLyBhbmQgdGhlIGZvY3VzIG5vdCB5ZXQuIFJlYWRpbmcgdGhhdCBiYWNrIHdvdWxkIGNvbGxhcHNlIHRoZSB2ZXJ5XHJcbiAgICAgIC8vIHJhbmdlIGJlaW5nIHdyaXR0ZW4sIHNvIG91ciBvd24gd3JpdGVzIGFyZSBtYXJrZWQgYXMgb3Vycy5cclxuICAgICAgdGhpcy53aXRoRE9NVXBkYXRlKCgpID0+IHtcclxuICAgICAgICBkb21TZWxlY3Rpb24uc2V0QmFzZUFuZEV4dGVudChhbmNob3Iubm9kZSwgYW5jaG9yLm9mZnNldCwgaGVhZC5ub2RlLCBoZWFkLm9mZnNldClcclxuICAgICAgfSlcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICAvLyBTZWxlY3Rpb24gQVBJcyB2YXJ5IGFjcm9zcyBlbnZpcm9ubWVudHM7IHRoZSBtb2RlbCBzdGF5cyBjb3JyZWN0LlxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVsbCB0aGUgYnJvd3NlciBzZWxlY3Rpb24gaW50byB0aGUgbW9kZWwuIGBzZWxlY3Rpb25jaGFuZ2VgIGlzXHJcbiAgICogYXN5bmNocm9ub3VzLCBzbyBhbnl0aGluZyBhY3Rpbmcgb3V0c2lkZSB0aGUgaW5wdXQgcGlwZWxpbmUsIGEgdG9vbGJhclxyXG4gICAqIGJ1dHRvbiwgd2hpY2ggc3VwcHJlc3NlcyBmb2N1cyBjaGFuZ2VzLCBtdXN0IGNhbGwgdGhpcyBmaXJzdCB0byBhdm9pZFxyXG4gICAqIG9wZXJhdGluZyBvbiBhIHN0YWxlIHNlbGVjdGlvbi5cclxuICAgKi9cclxuICBzeW5jU2VsZWN0aW9uRnJvbURPTSgpOiB2b2lkIHtcclxuICAgIHRoaXMub25TZWxlY3Rpb25DaGFuZ2UoKVxyXG4gIH1cclxuXHJcbiAgLyoqIFJlYWQgdGhlIERPTSBzZWxlY3Rpb24gaW50byB0aGUgZWRpdG9yIHN0YXRlIChpZGVtcG90ZW50KS4gKi9cclxuICBwcml2YXRlIG9uU2VsZWN0aW9uQ2hhbmdlID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkIHx8IHRoaXMuY29tcG9zaW5nIHx8IHRoaXMudXBkYXRpbmdET00pIHJldHVyblxyXG4gICAgY29uc3QgZG9tU2VsZWN0aW9uID0gdGhpcy5kb2N1bWVudC5nZXRTZWxlY3Rpb24/LigpXHJcbiAgICBjb25zdCBhbmNob3JOb2RlID0gZG9tU2VsZWN0aW9uPy5hbmNob3JOb2RlXHJcbiAgICBpZiAoIWRvbVNlbGVjdGlvbiB8fCAhYW5jaG9yTm9kZSB8fCAhdGhpcy5kb20uY29udGFpbnMoYW5jaG9yTm9kZSkpIHJldHVyblxyXG4gICAgY29uc3QgYW5jaG9yID0gcG9zaXRpb25Gcm9tRE9NUG9pbnQoXHJcbiAgICAgIHRoaXMuZG9tLFxyXG4gICAgICB0aGlzLnJlbmRlcmVyLFxyXG4gICAgICBhbmNob3JOb2RlLFxyXG4gICAgICBkb21TZWxlY3Rpb24uYW5jaG9yT2Zmc2V0LFxyXG4gICAgKVxyXG4gICAgY29uc3QgaGVhZCA9IGRvbVNlbGVjdGlvbi5mb2N1c05vZGVcclxuICAgICAgPyBwb3NpdGlvbkZyb21ET01Qb2ludChcclxuICAgICAgICAgIHRoaXMuZG9tLFxyXG4gICAgICAgICAgdGhpcy5yZW5kZXJlcixcclxuICAgICAgICAgIGRvbVNlbGVjdGlvbi5mb2N1c05vZGUsXHJcbiAgICAgICAgICBkb21TZWxlY3Rpb24uZm9jdXNPZmZzZXQsXHJcbiAgICAgICAgKVxyXG4gICAgICA6IGFuY2hvclxyXG4gICAgaWYgKCFhbmNob3IgfHwgIWhlYWQpIHJldHVyblxyXG4gICAgY29uc3QgbmV4dCA9IG5ldyBUZXh0U2VsZWN0aW9uKGFuY2hvciwgaGVhZClcclxuICAgIGlmICh0aGlzLmVkaXRvci5zdGF0ZS5zZWxlY3Rpb24uZXEobmV4dCkpIHJldHVyblxyXG4gICAgdGhpcy5lZGl0b3IuZGlzcGF0Y2godGhpcy5lZGl0b3Iuc3RhdGUudHIuc2V0U2VsZWN0aW9uKG5leHQpKVxyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIGlucHV0XHJcblxyXG4gIC8qKlxyXG4gICAqIEEgdGFzayBpdGVtJ3MgY2hlY2tib3ggaXMgYSBDU1MgbWFya2VyIGluIHRoZSBpdGVtJ3MgbGVmdCBndXR0ZXIsIG5vdCBhXHJcbiAgICogcmVhbCBgPGlucHV0PmAuIEFuIGlucHV0IGluc2lkZSBjb250ZW50ZWRpdGFibGUgd291bGQgdGFrZSBmb2N1cywgc2l0IGluXHJcbiAgICogdGhlIG1vZGVsJ3MgY29vcmRpbmF0ZSBzcGFjZSBhbmQgaGF2ZSB0byBiZSBrZXB0IGluIHN5bmMuIFRoYXQgbGVhdmVzXHJcbiAgICogZ2VvbWV0cnkgYXMgdGhlIHdheSB0byByZWNvZ25pc2UgYSBjbGljayBvbiBpdDogYSBwcmVzcyB3aG9zZSB0YXJnZXQgaXNcclxuICAgKiB0aGUgYDxsaT5gIGl0c2VsZiAodGhlIGd1dHRlciBob2xkcyBubyB0ZXh0KSBhbmQgd2hvc2UgeCBmYWxscyBsZWZ0IG9mXHJcbiAgICogdGhlIGNvbnRlbnQgYm94IGlzIGEgY2hlY2tib3ggcHJlc3MuXHJcbiAgICpcclxuICAgKiBgbW91c2Vkb3duYCByYXRoZXIgdGhhbiBgY2xpY2tgLCBhbmQgcHJldmVudERlZmF1bHQsIHNvIHRoZSBicm93c2VyIG5ldmVyXHJcbiAgICogbW92ZXMgdGhlIGNhcmV0IGludG8gdGhlIGl0ZW0sIHRvZ2dsaW5nIGEgdGFzayBtdXN0IG5vdCBkaXN0dXJiIHdoZXJlXHJcbiAgICogdGhlIHVzZXIgd2FzIHR5cGluZy5cclxuICAgKi9cclxuICBwcml2YXRlIG9uTW91c2VEb3duID0gKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQgfHwgIXRoaXMuZWRpdGFibGUgfHwgZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm5cclxuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldFxyXG4gICAgaWYgKCF0YXJnZXQgfHwgKHRhcmdldCBhcyBnbG9iYWxUaGlzLk5vZGUpLm5vZGVUeXBlICE9PSAxKSByZXR1cm5cclxuICAgIGNvbnN0IGVsZW1lbnQgPSB0YXJnZXQgYXMgSFRNTEVsZW1lbnRcclxuICAgIGNvbnN0IG1vZGVsID0gdGhpcy5yZW5kZXJlci5tb2RlbE9mLmdldChlbGVtZW50KVxyXG4gICAgaWYgKG1vZGVsPy50eXBlLm5hbWUgIT09ICd0YXNrSXRlbScpIHJldHVyblxyXG4gICAgY29uc3QgYm94ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxyXG4gICAgY29uc3QgZ3V0dGVyID0gTnVtYmVyLnBhcnNlRmxvYXQoXHJcbiAgICAgIChlbGVtZW50Lm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXc/LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkucGFkZGluZ0xlZnQgPz8gJzAnKSB8fCAnMCcsXHJcbiAgICApXHJcbiAgICBjb25zdCBpbkd1dHRlciA9IE51bWJlci5pc0Zpbml0ZShndXR0ZXIpXHJcbiAgICAgID8gZXZlbnQuY2xpZW50WCA8IGJveC5sZWZ0ICsgZ3V0dGVyXHJcbiAgICAgIDogZXZlbnQuY2xpZW50WCA8IGJveC5sZWZ0XHJcbiAgICBpZiAoIWluR3V0dGVyKSByZXR1cm5cclxuICAgIGNvbnN0IHBhdGggPSBwYXRoT2ZFbGVtZW50KHRoaXMuZG9tLCB0aGlzLnJlbmRlcmVyLCBlbGVtZW50KVxyXG4gICAgaWYgKCFwYXRoKSByZXR1cm5cclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICAgIHRoaXMuZWRpdG9yLmV4ZWMoc2V0VGFza0NoZWNrZWQocGF0aCwgbW9kZWwuYXR0cnMuY2hlY2tlZCAhPT0gdHJ1ZSkpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9uS2V5RG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkIHx8IHRoaXMuY29tcG9zaW5nIHx8ICF0aGlzLmVkaXRhYmxlKSByZXR1cm5cclxuICAgIC8vIHNlbGVjdGlvbmNoYW5nZSBpcyBhc3luYzsgbWFrZSBzdXJlIGJpbmRpbmdzIHNlZSB0aGUgY3VycmVudCBzZWxlY3Rpb24uXHJcbiAgICB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKClcclxuICAgIGZvciAoY29uc3QgaW50ZXJjZXB0b3Igb2YgdGhpcy5rZXlkb3duSW50ZXJjZXB0b3JzKSB7XHJcbiAgICAgIGlmIChpbnRlcmNlcHRvcihldmVudCkpIHtcclxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGlmICh0aGlzLmhhbmRsZUtleShldmVudCkpIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICB9XHJcblxyXG4gIHByaXZhdGUgb25CZWZvcmVJbnB1dCA9IChldmVudDogSW5wdXRFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkKSByZXR1cm5cclxuICAgIGlmICghdGhpcy5lZGl0YWJsZSkge1xyXG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgY29uc3QgdHlwZSA9IGV2ZW50LmlucHV0VHlwZVxyXG4gICAgaWYgKHRoaXMuY29tcG9zaW5nIHx8IHR5cGUgPT09ICdpbnNlcnRDb21wb3NpdGlvblRleHQnKSByZXR1cm4gLy8gdGhlIElNRSBsZWFkc1xyXG4gICAgLy8gTWFrZSBzdXJlIHRoZSBtb2RlbCBzZWxlY3Rpb24gbWF0Y2hlcyB0aGUgRE9NIGJlZm9yZSBhY3Rpbmcgb24gaW50ZW50LlxyXG4gICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSgpXHJcblxyXG4gICAgY29uc3QgY29uc3VtZSA9IChjb21tYW5kOiBDb21tYW5kIHwgbnVsbCk6IHZvaWQgPT4ge1xyXG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICAgIGlmIChjb21tYW5kKSB0aGlzLmVkaXRvci5leGVjKGNvbW1hbmQpXHJcbiAgICB9XHJcblxyXG4gICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgIGNhc2UgJ2luc2VydFRleHQnOlxyXG4gICAgICBjYXNlICdpbnNlcnRSZXBsYWNlbWVudFRleHQnOiB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IGV2ZW50LmRhdGEgPz8gZXZlbnQuZGF0YVRyYW5zZmVyPy5nZXREYXRhKCd0ZXh0L3BsYWluJykgPz8gJydcclxuICAgICAgICBpZiAoIXRleHQpIHtcclxuICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFBhdHRlcm4gc2hvcnRjdXRzIChcIiMjIFwiLCBcIi0gXCIsIFwiLS1cIiwg4oCmKSBydW4gaW5zdGVhZCBvZiB0aGUgaW5zZXJ0LlxyXG4gICAgICAgIGNvbnN0IHJ1bGVUciA9IGFwcGx5SW5wdXRSdWxlcyh0aGlzLmVkaXRvci5zdGF0ZSwgdGV4dCwgdGhpcy5pbnB1dFJ1bGVzKVxyXG4gICAgICAgIGlmIChydWxlVHIpIHtcclxuICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICAgICAgICAgIHRoaXMuZWRpdG9yLmRpc3BhdGNoKHJ1bGVUcilcclxuICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEluIGEgY29kZSBibG9jaywgYnJhY2tldHMgYW5kIHF1b3RlcyBwYWlyIHVwIHRoZSB3YXkgYSBjb2RlIGVkaXRvcidzIGRvLlxyXG4gICAgICAgIGNvbnN1bWUoY2hhaW5Db21tYW5kcyh0eXBlSW5QcmVmb3JtYXR0ZWQodGV4dCksIGluc2VydFRleHQodGV4dCkpKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIH1cclxuICAgICAgY2FzZSAnaW5zZXJ0UGFyYWdyYXBoJzpcclxuICAgICAgICBjb25zdW1lKGNoYWluQ29tbWFuZHMoc3BsaXRCbG9ja0luUHJlZm9ybWF0dGVkLCBzcGxpdExpc3RJdGVtLCBzcGxpdEJsb2NrKSlcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdpbnNlcnRMaW5lQnJlYWsnOlxyXG4gICAgICAgIGNvbnN1bWUoY2hhaW5Db21tYW5kcyhpbnNlcnROZXdsaW5lSW5QcmVmb3JtYXR0ZWQsIGluc2VydElubGluZU5vZGUoJ2hhcmRCcmVhaycpKSlcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdkZWxldGVDb250ZW50QmFja3dhcmQnOlxyXG4gICAgICAgIGNvbnN1bWUoY2hhaW5Db21tYW5kcyhkZWxldGVCYWNrd2FyZEluUHJlZm9ybWF0dGVkLCBkZWxldGVDaGFyQmFja3dhcmQpKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2RlbGV0ZVdvcmRCYWNrd2FyZCc6XHJcbiAgICAgIGNhc2UgJ2RlbGV0ZVNvZnRMaW5lQmFja3dhcmQnOlxyXG4gICAgICAgIGNvbnN1bWUoZGVsZXRlQ2hhckJhY2t3YXJkKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2RlbGV0ZUNvbnRlbnRGb3J3YXJkJzpcclxuICAgICAgY2FzZSAnZGVsZXRlV29yZEZvcndhcmQnOlxyXG4gICAgICAgIGNvbnN1bWUoZGVsZXRlQ2hhckZvcndhcmQpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnZGVsZXRlQnlDdXQnOlxyXG4gICAgICBjYXNlICdkZWxldGVCeURyYWcnOlxyXG4gICAgICAgIGNvbnN1bWUoZGVsZXRlU2VsZWN0aW9uKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2hpc3RvcnlVbmRvJzpcclxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICAgICAgdGhpcy5lZGl0b3IudW5kbygpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnaGlzdG9yeVJlZG8nOlxyXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICAgICAgICB0aGlzLmVkaXRvci5yZWRvKClcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdmb3JtYXRCb2xkJzpcclxuICAgICAgICBjb25zdW1lKHRvZ2dsZU1hcmsoJ2JvbGQnKSlcclxuICAgICAgICBicmVha1xyXG4gICAgICBjYXNlICdmb3JtYXRJdGFsaWMnOlxyXG4gICAgICAgIGNvbnN1bWUodG9nZ2xlTWFyaygnaXRhbGljJykpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgY2FzZSAnZm9ybWF0VW5kZXJsaW5lJzpcclxuICAgICAgICBjb25zdW1lKHRvZ2dsZU1hcmsoJ3VuZGVybGluZScpKVxyXG4gICAgICAgIGJyZWFrXHJcbiAgICAgIGNhc2UgJ2luc2VydEZyb21QYXN0ZSc6IHtcclxuICAgICAgICAvLyBGYWxsYmFjayB3aGVuIG5vIGBwYXN0ZWAgZXZlbnQgZmlyZWQgZmlyc3QgKGl0IHVzdWFsbHkgZG9lcykuXHJcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKVxyXG4gICAgICAgIGlmIChldmVudC5kYXRhVHJhbnNmZXIpIHRoaXMuaW5zZXJ0RnJvbUNsaXBib2FyZChldmVudC5kYXRhVHJhbnNmZXIpXHJcbiAgICAgICAgYnJlYWtcclxuICAgICAgfVxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIC8vIFVua25vd24gaW50ZW50IG11c3Qgbm90IGNvcnJ1cHQgdGhlIERPTSB0aGUgbW9kZWwgb3ducy5cclxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBjbGlwYm9hcmRcclxuXHJcbiAgcHJpdmF0ZSBvbkNvcHkgPSAoZXZlbnQ6IENsaXBib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQgfHwgIWV2ZW50LmNsaXBib2FyZERhdGEpIHJldHVyblxyXG4gICAgaWYgKHRoaXMud3JpdGVDbGlwYm9hcmQoZXZlbnQuY2xpcGJvYXJkRGF0YSkpIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICB9XHJcblxyXG4gIHByaXZhdGUgb25DdXQgPSAoZXZlbnQ6IENsaXBib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQgfHwgIWV2ZW50LmNsaXBib2FyZERhdGEpIHJldHVyblxyXG4gICAgaWYgKCF0aGlzLndyaXRlQ2xpcGJvYXJkKGV2ZW50LmNsaXBib2FyZERhdGEpKSByZXR1cm5cclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KClcclxuICAgIGlmICh0aGlzLmVkaXRhYmxlKSB0aGlzLmVkaXRvci5leGVjKGRlbGV0ZVNlbGVjdGlvbilcclxuICB9XHJcblxyXG4gIHByaXZhdGUgb25QYXN0ZSA9IChldmVudDogQ2xpcGJvYXJkRXZlbnQpOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCB8fCAhdGhpcy5lZGl0YWJsZSB8fCAhZXZlbnQuY2xpcGJvYXJkRGF0YSkgcmV0dXJuXHJcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpXHJcbiAgICB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKClcclxuICAgIHRoaXMuaW5zZXJ0RnJvbUNsaXBib2FyZChldmVudC5jbGlwYm9hcmREYXRhKVxyXG4gIH1cclxuXHJcbiAgLyoqIFNlcmlhbGl6ZSB0aGUgc2VsZWN0ZWQgYmxvY2tzIGFzIEhUTUwsIHBsYWluIHRleHQgYW5kIFRyZXZpeGFsIEpTT04uICovXHJcbiAgcHJpdmF0ZSB3cml0ZUNsaXBib2FyZChkYXRhOiBEYXRhVHJhbnNmZXIpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5lZGl0b3Iuc3RhdGVcclxuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gICAgaWYgKHNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIGZhbHNlXHJcbiAgICBjb25zdCBibG9ja3MgPSBibG9ja3NJblJhbmdlKHN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20sIHNlbGVjdGlvbi50bylcclxuICAgICAgLmZpbHRlcigoYmxvY2spID0+IGJsb2NrLmZyb20gPCBibG9jay50bylcclxuICAgICAgLm1hcCgoYmxvY2spID0+IGJsb2NrLm5vZGUud2l0aENvbnRlbnQoc2xpY2VJbmxpbmUoYmxvY2subm9kZS5jb250ZW50LCBibG9jay5mcm9tLCBibG9jay50bykpKVxyXG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPT09IDApIHJldHVybiBmYWxzZVxyXG4gICAgZGF0YS5zZXREYXRhKCd0ZXh0L2h0bWwnLCBibG9ja3MubWFwKChub2RlKSA9PiBzZXJpYWxpemVUb0hUTUwobm9kZSkpLmpvaW4oJycpKVxyXG4gICAgZGF0YS5zZXREYXRhKCd0ZXh0L3BsYWluJywgYmxvY2tzLm1hcCgobm9kZSkgPT4gbm9kZS50ZXh0Q29udGVudCkuam9pbignXFxuJykpXHJcbiAgICBkYXRhLnNldERhdGEoVFJFVklYQUxfTUlNRSwgSlNPTi5zdHJpbmdpZnkoYmxvY2tzLm1hcCgobm9kZSkgPT4gbm9kZS50b0pTT04oKSkpKVxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcblxyXG4gIC8qKiBQYXN0ZSBwaXBlbGluZTogb3duIEpTT04sIHRoZW4gc2FuaXRpemVkIEhUTUwsIHRoZW4gcGxhaW4gdGV4dC4gKi9cclxuICBwcml2YXRlIGluc2VydEZyb21DbGlwYm9hcmQoZGF0YTogRGF0YVRyYW5zZmVyKTogdm9pZCB7XHJcbiAgICBjb25zdCBwbGFpbk9ubHkgPSB0aGlzLnBhc3RlUGxhaW5PbmNlXHJcbiAgICB0aGlzLnBhc3RlUGxhaW5PbmNlID0gZmFsc2VcclxuICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuZWRpdG9yLnNjaGVtYVxyXG5cclxuICAgIC8vIEEgYmxvY2sgdGhhdCBrZWVwcyBpdHMgd2hpdGVzcGFjZSBob2xkcyBzb3VyY2UsIG5vdCBwcm9zZTogd2hhdGV2ZXIgdGhlXHJcbiAgICAvLyBjbGlwYm9hcmQgYWxzbyBvZmZlcnMsIHdoYXQgYmVsb25ncyB0aGVyZSBpcyB0aGUgcGxhaW4gdGV4dCBleGFjdGx5IGFzXHJcbiAgICAvLyBpdCBzdGFuZHMsIG5ld2xpbmVzIGluY2x1ZGVkLCBhbmQgbmV2ZXIgc3BsaXQgaW50byBwYXJhZ3JhcGhzLlxyXG4gICAgaWYgKHRoaXMucHJlc2VydmVzV2hpdGVzcGFjZUF0U2VsZWN0aW9uKCkpIHtcclxuICAgICAgY29uc3Qgc291cmNlID0gZGF0YS5nZXREYXRhKCd0ZXh0L3BsYWluJylcclxuICAgICAgaWYgKHNvdXJjZSkgdGhpcy5lZGl0b3IuZXhlYyhpbnNlcnRUZXh0KHNvdXJjZSkpXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGlmICghcGxhaW5Pbmx5KSB7XHJcbiAgICAgIGNvbnN0IHJhdyA9IGRhdGEuZ2V0RGF0YShUUkVWSVhBTF9NSU1FKVxyXG4gICAgICBpZiAocmF3KSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGNvbnN0IHBhcnNlZDogdW5rbm93biA9IEpTT04ucGFyc2UocmF3KVxyXG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xyXG4gICAgICAgICAgICBjb25zdCBub2RlcyA9IHBhcnNlZC5tYXAoKGpzb24pID0+IG5vZGVGcm9tSlNPTihzY2hlbWEsIGpzb24pKVxyXG4gICAgICAgICAgICB0aGlzLmVkaXRvci5leGVjKGluc2VydENvbnRlbnQobm9kZXMpKVxyXG4gICAgICAgICAgICByZXR1cm5cclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgIC8vIENvcnJ1cHQgcGF5bG9hZDogZmFsbCB0aHJvdWdoIHRvIEhUTUwvcGxhaW4uXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGh0bWwgPSBkYXRhLmdldERhdGEoJ3RleHQvaHRtbCcpXHJcbiAgICAgIGlmIChodG1sKSB7XHJcbiAgICAgICAgLy8gV29yZCBhbmQgR29vZ2xlIERvY3Mgd3JpdGUgbWFya3VwIGZvciB0aGVtc2VsdmVzLCBub3QgZm9yIGFcclxuICAgICAgICAvLyBkb2N1bWVudCB0aGF0IGhhcyB0byBsaXZlIHdpdGggaXQuIENsZWFuZWQgYmVmb3JlIHBhcnNpbmcsIG5ldmVyXHJcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBpdC4gVGhlIGFsbG93bGlzdCBiZWxvdyBpcyBzdGlsbCB3aGF0IG1ha2VzIGl0IHNhZmUuXHJcbiAgICAgICAgY29uc3QgcGFyc2VkID0gcGFyc2VIVE1MKHNjaGVtYSwgY2xlYW5QYXN0ZWRIVE1MKGh0bWwpLCB0aGlzLmRvY3VtZW50KVxyXG4gICAgICAgIHRoaXMuZWRpdG9yLmV4ZWMoaW5zZXJ0Q29udGVudChwYXJzZWQuY29udGVudC5jaGlsZHJlbikpXHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0ZXh0ID0gZGF0YS5nZXREYXRhKCd0ZXh0L3BsYWluJylcclxuICAgIGlmICghdGV4dCkgcmV0dXJuXHJcbiAgICBjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoL1xccj9cXG4vKVxyXG4gICAgY29uc3QgbGlua2FibGUgPSB0aGlzLmxpbmtzQWxsb3dlZEF0U2VsZWN0aW9uKClcclxuICAgIGlmIChsaW5lcy5sZW5ndGggPT09IDEpIHtcclxuICAgICAgY29uc3QgdHJpbW1lZCA9IHRleHQudHJpbSgpXHJcbiAgICAgIC8vIEEgVVJMIHBhc3RlZCBvdmVyIHNlbGVjdGVkIHRleHQgbGlua3MgdGhhdCB0ZXh0LCB0aGUgZ2VzdHVyZSBldmVyeVxyXG4gICAgICAvLyBlZGl0b3Igc2luY2UgdGhlIGZpcnN0IHdpa2kgaGFzIHRhdWdodCBwZW9wbGUgdG8gZXhwZWN0LlxyXG4gICAgICBpZiAobGlua2FibGUgJiYgIXRoaXMuZWRpdG9yLnN0YXRlLnNlbGVjdGlvbi5lbXB0eSAmJiBCQVJFX1VSTC50ZXN0KHRyaW1tZWQpKSB7XHJcbiAgICAgICAgY29uc3QgaHJlZiA9IHNhZmVIcmVmKC9ed3d3XFwuL2kudGVzdCh0cmltbWVkKSA/IGBodHRwczovLyR7dHJpbW1lZH1gIDogdHJpbW1lZClcclxuICAgICAgICBpZiAoaHJlZiAmJiB0aGlzLmVkaXRvci5leGVjKHNldE1hcmsoJ2xpbmsnLCB7IGhyZWYgfSkpKSByZXR1cm5cclxuICAgICAgfVxyXG4gICAgICBjb25zdCBsaW5rZWQgPSBsaW5rYWJsZSA/IGxpbmtpZnlUZXh0KHNjaGVtYSwgdGV4dCkgOiBudWxsXHJcbiAgICAgIHRoaXMuZWRpdG9yLmV4ZWMobGlua2VkID8gaW5zZXJ0Q29udGVudChsaW5rZWQpIDogaW5zZXJ0VGV4dCh0ZXh0KSlcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBjb25zdCBwYXJhZ3JhcGggPSBzY2hlbWEuZmlyc3RUZXh0YmxvY2tUeXBlKClcclxuICAgIGNvbnN0IG5vZGVzID0gbGluZXMubWFwKChsaW5lKSA9PiB7XHJcbiAgICAgIGlmICghbGluZSkgcmV0dXJuIHBhcmFncmFwaC5jcmVhdGUoKVxyXG4gICAgICBjb25zdCBpbmxpbmUgPSAobGlua2FibGUgPyBsaW5raWZ5VGV4dChzY2hlbWEsIGxpbmUpIDogbnVsbCkgPz8gW3NjaGVtYS50ZXh0KGxpbmUpXVxyXG4gICAgICByZXR1cm4gcGFyYWdyYXBoLmNyZWF0ZSh1bmRlZmluZWQsIEZyYWdtZW50LmZyb20oaW5saW5lKSlcclxuICAgIH0pXHJcbiAgICB0aGlzLmVkaXRvci5leGVjKGluc2VydENvbnRlbnQobm9kZXMpKVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXRoZXIgdGhlIGJsb2NrIGF0IHRoZSBzZWxlY3Rpb24gc3RvcmVzIGl0cyB0ZXh0IHZlcmJhdGltIChhIGNvZGUgYmxvY2spLiAqL1xyXG4gIHByaXZhdGUgcHJlc2VydmVzV2hpdGVzcGFjZUF0U2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHRoaXMuZWRpdG9yLnN0YXRlLmRvYywgdGhpcy5lZGl0b3Iuc3RhdGUuc2VsZWN0aW9uLmZyb20ucGF0aClcclxuICAgIHJldHVybiBibG9jaz8udHlwZS5zcGVjLnByZXNlcnZlV2hpdGVzcGFjZSA9PT0gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgLyoqIFdoZXRoZXIgdGhlIGJsb2NrIGF0IHRoZSBzZWxlY3Rpb24gdGFrZXMgbGluayBtYXJrcyAoY29kZSBibG9ja3MgZG8gbm90KS4gKi9cclxuICBwcml2YXRlIGxpbmtzQWxsb3dlZEF0U2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgdHlwZSA9IHRoaXMuZWRpdG9yLnNjaGVtYS5tYXJrcy5saW5rXHJcbiAgICBpZiAoIXR5cGUpIHJldHVybiBmYWxzZVxyXG4gICAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHRoaXMuZWRpdG9yLnN0YXRlLmRvYywgdGhpcy5lZGl0b3Iuc3RhdGUuc2VsZWN0aW9uLmZyb20ucGF0aClcclxuICAgIHJldHVybiBibG9jaz8uaXNUZXh0YmxvY2sgPT09IHRydWUgJiYgYmxvY2sudHlwZS5hbGxvd3NNYXJrVHlwZSh0eXBlKVxyXG4gIH1cclxuXHJcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIGNvbXBvc2l0aW9uXHJcblxyXG4gIHByaXZhdGUgb25Db21wb3NpdGlvblN0YXJ0ID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKCF0aGlzLmRlc3Ryb3llZCkgdGhpcy5jb21wb3NpbmcgPSB0cnVlXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9uQ29tcG9zaXRpb25FbmQgPSAoKTogdm9pZCA9PiB7XHJcbiAgICBpZiAodGhpcy5kZXN0cm95ZWQgfHwgIXRoaXMuY29tcG9zaW5nKSByZXR1cm5cclxuICAgIHRoaXMuY29tcG9zaW5nID0gZmFsc2VcclxuICAgIGNvbnN0IGRvbVNlbGVjdGlvbiA9IHRoaXMuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uPy4oKVxyXG4gICAgY29uc3QgYW5jaG9yTm9kZSA9IGRvbVNlbGVjdGlvbj8uYW5jaG9yTm9kZSA/PyBudWxsXHJcbiAgICBjb25zdCBibG9jayA9IChhbmNob3JOb2RlID8gdGhpcy5ibG9ja0VsZW1lbnRBcm91bmQoYW5jaG9yTm9kZSkgOiBudWxsKSA/PyB0aGlzLmZpbmREaXJ0eUJsb2NrKClcclxuICAgIGlmIChibG9jaykge1xyXG4gICAgICB0aGlzLnJlcGFpckJsb2NrKGJsb2NrKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy51cGRhdGUoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqIEZpcnN0IHJlbmRlcmVkIHRleHRibG9jayB3aG9zZSBET00gdGV4dCBubyBsb25nZXIgbWF0Y2hlcyBpdHMgbW9kZWwuICovXHJcbiAgcHJpdmF0ZSBmaW5kRGlydHlCbG9jaygpOiBIVE1MRWxlbWVudCB8IG51bGwge1xyXG4gICAgY29uc3Qgd2FsayA9IChlbGVtZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgbnVsbCA9PiB7XHJcbiAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5yZW5kZXJlci5tb2RlbE9mLmdldChlbGVtZW50KVxyXG4gICAgICBpZiAobW9kZWw/LmlzVGV4dGJsb2NrKSB7XHJcbiAgICAgICAgY29uc3QgY29udGVudCA9IHRoaXMucmVuZGVyZXIuY29udGVudEVsZW1lbnRPZihlbGVtZW50KVxyXG4gICAgICAgIHJldHVybiAoY29udGVudC50ZXh0Q29udGVudCA/PyAnJykgPT09IG1vZGVsLnRleHRDb250ZW50ID8gbnVsbCA6IGVsZW1lbnRcclxuICAgICAgfVxyXG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIFsuLi5lbGVtZW50LmNoaWxkcmVuXSkge1xyXG4gICAgICAgIGNvbnN0IGRpcnR5ID0gd2FsayhjaGlsZCBhcyBIVE1MRWxlbWVudClcclxuICAgICAgICBpZiAoZGlydHkpIHJldHVybiBkaXJ0eVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIFsuLi50aGlzLmRvbS5jaGlsZHJlbl0pIHtcclxuICAgICAgY29uc3QgZGlydHkgPSB3YWxrKGNoaWxkIGFzIEhUTUxFbGVtZW50KVxyXG4gICAgICBpZiAoZGlydHkpIHJldHVybiBkaXJ0eVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIG11dGF0aW9uc1xyXG5cclxuICBwcml2YXRlIG9uTXV0YXRpb25zID0gKHJlY29yZHM6IE11dGF0aW9uUmVjb3JkW10pOiB2b2lkID0+IHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCB8fCB0aGlzLnVwZGF0aW5nRE9NIHx8IHRoaXMuY29tcG9zaW5nIHx8IHJlY29yZHMubGVuZ3RoID09PSAwKSByZXR1cm5cclxuICAgIGNvbnN0IGJsb2NrcyA9IG5ldyBTZXQ8SFRNTEVsZW1lbnQ+KClcclxuICAgIGxldCBmYWxsYmFjayA9IGZhbHNlXHJcbiAgICBmb3IgKGNvbnN0IHJlY29yZCBvZiByZWNvcmRzKSB7XHJcbiAgICAgIGNvbnN0IGJsb2NrID0gdGhpcy5ibG9ja0VsZW1lbnRBcm91bmQocmVjb3JkLnRhcmdldClcclxuICAgICAgaWYgKGJsb2NrKSBibG9ja3MuYWRkKGJsb2NrKVxyXG4gICAgICBlbHNlIGZhbGxiYWNrID0gdHJ1ZVxyXG4gICAgfVxyXG4gICAgY29uc3QgW29ubHldID0gYmxvY2tzXHJcbiAgICBpZiAoIWZhbGxiYWNrICYmIGJsb2Nrcy5zaXplID09PSAxICYmIG9ubHkpIHtcclxuICAgICAgdGhpcy5yZXBhaXJCbG9jayhvbmx5KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gVW5hdHRyaWJ1dGFibGUgbXV0YXRpb25zOiB0aGUgbW9kZWwgaXMgdGhlIHNvdXJjZSBvZiB0cnV0aC5cclxuICAgICAgdGhpcy51cGRhdGUoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBibG9ja0VsZW1lbnRBcm91bmQobm9kZTogZ2xvYmFsVGhpcy5Ob2RlKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcclxuICAgIGZvciAoXHJcbiAgICAgIGxldCBjdXJyZW50OiBnbG9iYWxUaGlzLk5vZGUgfCBudWxsID0gbm9kZTtcclxuICAgICAgY3VycmVudCAmJiBjdXJyZW50ICE9PSB0aGlzLmRvbS5wYXJlbnROb2RlO1xyXG4gICAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnROb2RlXHJcbiAgICApIHtcclxuICAgICAgY29uc3QgbW9kZWwgPSB0aGlzLnJlbmRlcmVyLm1vZGVsT2YuZ2V0KGN1cnJlbnQpXHJcbiAgICAgIGlmIChtb2RlbD8uaXNUZXh0YmxvY2spIHJldHVybiBjdXJyZW50IGFzIEhUTUxFbGVtZW50XHJcbiAgICAgIGlmIChjdXJyZW50ID09PSB0aGlzLmRvbSkgYnJlYWtcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZWNvbmNpbGUgb25lIHRleHRibG9jaydzIERPTSBiYWNrIGludG8gdGhlIG1vZGVsIHdpdGggYSBwcmVmaXgvc3VmZml4XHJcbiAgICogdGV4dCBkaWZmLiBUaGUgcmVjb3ZlcnkgcGF0aCBmb3IgSU1FIGNvbW1pdHMsIGF1dG9jb3JyZWN0IGFuZCBicm93c2VyXHJcbiAgICogZXh0ZW5zaW9ucy5cclxuICAgKi9cclxuICBwcml2YXRlIHJlcGFpckJsb2NrKGJsb2NrRWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IHBhdGggPSBwYXRoT2ZFbGVtZW50KHRoaXMuZG9tLCB0aGlzLnJlbmRlcmVyLCBibG9ja0VsZW1lbnQpXHJcbiAgICBjb25zdCBibG9jayA9IHBhdGggPyBub2RlQXRQYXRoKHRoaXMuZWRpdG9yLnN0YXRlLmRvYywgcGF0aCkgOiBudWxsXHJcbiAgICBpZiAoIXBhdGggfHwgIWJsb2NrPy5pc1RleHRibG9jaykge1xyXG4gICAgICB0aGlzLnVwZGF0ZSgpIC8vIHVubWFwcGFibGUgc3RydWN0dXJlOiBmdWxsIHJlLXJlbmRlciBmcm9tIHN0YXRlXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGVudCA9IHRoaXMucmVuZGVyZXIuY29udGVudEVsZW1lbnRPZihibG9ja0VsZW1lbnQpXHJcbiAgICAvLyBBIGJsb2NrIG1heSBob2xkIGlubGluZSBhdG9tcywgYSBoYXJkIGJyZWFrLCBhbiBpbmxpbmUgbWF0aCBub2RlLiBUaGVpclxyXG4gICAgLy8gcmVuZGVyZWQgdGV4dCBpcyBwYXJ0IG9mIHdoYXQgd2UgZGlmZiwgYnV0IHRoZXkgb3duIHBvc2l0aW9ucyB0aGUgdGV4dFxyXG4gICAgLy8gc2NhbGUga25vd3Mgbm90aGluZyBhYm91dCwgc28gdGhlIGRpZmYgaXMgbWFwcGVkIGJhY2sgdGhyb3VnaFxyXG4gICAgLy8gYGlubGluZU9mZnNldEZyb21UZXh0YC4gSWYgb25lIGhhcyBiZWVuIGFkZGVkIG9yIHJlbW92ZWQgdGhlIHRleHQgZGlmZlxyXG4gICAgLy8gY2Fubm90IGRlc2NyaWJlIHRoZSBjaGFuZ2UgYXQgYWxsLCBhbmQgdGhlIHNhZmUgYW5zd2VyIGlzIHRvIHJlLXJlbmRlci5cclxuICAgIGlmICh0aGlzLmF0b21zQ2hhbmdlZChjb250ZW50LCBibG9jaykpIHtcclxuICAgICAgdGhpcy51cGRhdGUoKVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGNvbnN0IG5ld1RleHQgPSBjb250ZW50LnRleHRDb250ZW50ID8/ICcnXHJcbiAgICBjb25zdCBvbGRUZXh0ID0gYmxvY2sudGV4dENvbnRlbnRcclxuICAgIGlmIChuZXdUZXh0ID09PSBvbGRUZXh0KSB7XHJcbiAgICAgIHRoaXMudXBkYXRlKClcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBsZXQgc3RhcnQgPSAwXHJcbiAgICB3aGlsZSAoc3RhcnQgPCBvbGRUZXh0Lmxlbmd0aCAmJiBzdGFydCA8IG5ld1RleHQubGVuZ3RoICYmIG9sZFRleHRbc3RhcnRdID09PSBuZXdUZXh0W3N0YXJ0XSkge1xyXG4gICAgICBzdGFydCsrXHJcbiAgICB9XHJcbiAgICBsZXQgb2xkRW5kID0gb2xkVGV4dC5sZW5ndGhcclxuICAgIGxldCBuZXdFbmQgPSBuZXdUZXh0Lmxlbmd0aFxyXG4gICAgd2hpbGUgKG9sZEVuZCA+IHN0YXJ0ICYmIG5ld0VuZCA+IHN0YXJ0ICYmIG9sZFRleHRbb2xkRW5kIC0gMV0gPT09IG5ld1RleHRbbmV3RW5kIC0gMV0pIHtcclxuICAgICAgb2xkRW5kLS1cclxuICAgICAgbmV3RW5kLS1cclxuICAgIH1cclxuICAgIGNvbnN0IGluc2VydGVkID0gbmV3VGV4dC5zbGljZShzdGFydCwgbmV3RW5kKVxyXG4gICAgY29uc3QgZnJvbSA9IGlubGluZU9mZnNldEZyb21UZXh0KGJsb2NrLmNvbnRlbnQsIHN0YXJ0KVxyXG4gICAgY29uc3QgdG8gPSBpbmxpbmVPZmZzZXRGcm9tVGV4dChibG9jay5jb250ZW50LCBvbGRFbmQpXHJcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZWRpdG9yLnN0YXRlXHJcbiAgICBjb25zdCBtYXJrcyA9IG1hcmtzQXRJbmxpbmVPZmZzZXQoYmxvY2suY29udGVudCwgZnJvbSkuZmlsdGVyKChtYXJrKSA9PlxyXG4gICAgICBibG9jay50eXBlLmFsbG93c01hcmtUeXBlKG1hcmsudHlwZSksXHJcbiAgICApXHJcbiAgICBjb25zdCBmcmFnbWVudCA9IGluc2VydGVkID8gRnJhZ21lbnQub2Yoc3RhdGUuc2NoZW1hLnRleHQoaW5zZXJ0ZWQsIG1hcmtzKSkgOiBGcmFnbWVudC5lbXB0eVxyXG4gICAgY29uc3QgdHIgPSBzdGF0ZS50ci5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChwYXRoLCBmcm9tLCB0bywgZnJhZ21lbnQpKVxyXG5cclxuICAgIGNvbnN0IGRvbVNlbGVjdGlvbiA9IHRoaXMuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uPy4oKVxyXG4gICAgY29uc3QgY2FyZXQgPVxyXG4gICAgICBkb21TZWxlY3Rpb24/LmFuY2hvck5vZGUgJiYgdGhpcy5kb20uY29udGFpbnMoZG9tU2VsZWN0aW9uLmFuY2hvck5vZGUpXHJcbiAgICAgICAgPyBwb3NpdGlvbkZyb21ET01Qb2ludChcclxuICAgICAgICAgICAgdGhpcy5kb20sXHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIsXHJcbiAgICAgICAgICAgIGRvbVNlbGVjdGlvbi5hbmNob3JOb2RlLFxyXG4gICAgICAgICAgICBkb21TZWxlY3Rpb24uYW5jaG9yT2Zmc2V0LFxyXG4gICAgICAgICAgKVxyXG4gICAgICAgIDogbnVsbFxyXG4gICAgdHIuc2V0U2VsZWN0aW9uKG5ldyBUZXh0U2VsZWN0aW9uKGNhcmV0ID8/IHBvcyhwYXRoLCBmcm9tICsgaW5zZXJ0ZWQubGVuZ3RoKSkpXHJcbiAgICB0aGlzLmVkaXRvci5kaXNwYXRjaCh0cilcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFdoZXRoZXIgdGhlIGlubGluZSBhdG9tcyByZW5kZXJlZCBmb3IgYSBibG9jayBzdGlsbCBtYXRjaCBpdHMgbW9kZWwsIGJ5XHJcbiAgICogY291bnQuIENvbXBvc2l0aW9uIG9ubHkgZXZlciByZXdyaXRlcyB0ZXh0LCBzbyBhIG1pc21hdGNoIG1lYW5zIHRoZVxyXG4gICAqIGJyb3dzZXIgZGlkIHNvbWV0aGluZyB0aGUgdGV4dCBkaWZmIGNhbm5vdCBleHByZXNzLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXRvbXNDaGFuZ2VkKGNvbnRlbnQ6IEhUTUxFbGVtZW50LCBibG9jazogRWRpdG9yTm9kZSk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgZXhwZWN0ZWQgPSBibG9jay5jb250ZW50LmNoaWxkcmVuLmZpbHRlcigoY2hpbGQpID0+ICFjaGlsZC5pc1RleHQpLmxlbmd0aFxyXG4gICAgbGV0IGZvdW5kID0gMFxyXG4gICAgZm9yIChjb25zdCBlbGVtZW50IG9mIGNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnKicpKSB7XHJcbiAgICAgIGlmICh0aGlzLnJlbmRlcmVyLm1vZGVsT2YuZ2V0KGVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpPy5pc0F0b20pIGZvdW5kKytcclxuICAgIH1cclxuICAgIHJldHVybiBmb3VuZCAhPT0gZXhwZWN0ZWRcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB0eXBlIHsgRWRpdG9yIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvcidcclxuaW1wb3J0IHsgaW5saW5lU2l6ZSB9IGZyb20gJy4uL21vZGVsL2lubGluZSdcclxuaW1wb3J0IHR5cGUgeyBUZXh0Tm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB0eXBlIHsgUGF0aCB9IGZyb20gJy4uL21vZGVsL3RyZWUnXHJcbmltcG9ydCB7IG5vZGVBdFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgdHlwZSB7IEVkaXRvclN0YXRlIH0gZnJvbSAnLi4vc3RhdGUvZWRpdG9yLXN0YXRlJ1xyXG5pbXBvcnQgeyBUZXh0U2VsZWN0aW9uIH0gZnJvbSAnLi4vc3RhdGUvc2VsZWN0aW9uJ1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUcmlnZ2VyT3B0aW9ucyB7XHJcbiAgLyoqIFRoZSB0cmlnZ2VyIHNlcXVlbmNlLCBlLmcuIGAnQCdgLCBgJy8nYCwgYCc6J2AuICovXHJcbiAgcmVhZG9ubHkgY2hhcjogc3RyaW5nXHJcbiAgLyoqIEFsbG93IHdoaXRlc3BhY2UgaW5zaWRlIHRoZSBxdWVyeSAobXVsdGktd29yZCBpdGVtIG5hbWVzKS4gKi9cclxuICByZWFkb25seSBhbGxvd1NwYWNlcz86IGJvb2xlYW5cclxuICAvKiogT25seSBtYXRjaCB3aGVuIHRoZSB0cmlnZ2VyIHNpdHMgYXQgdGhlIHZlcnkgc3RhcnQgb2YgdGhlIGJsb2NrLiAqL1xyXG4gIHJlYWRvbmx5IHN0YXJ0T2ZCbG9jaz86IGJvb2xlYW5cclxufVxyXG5cclxuLyoqIEFuIGFjdGl2ZSB0cmlnZ2VyOiBgW2Zyb20sIHRvKWAgc3BhbnMgdGhlIHRyaWdnZXIgY2hhciBwbHVzIHRoZSBxdWVyeS4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBUcmlnZ2VyTWF0Y2gge1xyXG4gIHJlYWRvbmx5IHBhdGg6IFBhdGhcclxuICByZWFkb25seSBmcm9tOiBudW1iZXJcclxuICByZWFkb25seSB0bzogbnVtYmVyXHJcbiAgcmVhZG9ubHkgcXVlcnk6IHN0cmluZ1xyXG59XHJcblxyXG4vKipcclxuICogRmluZCBhbiBhY3RpdmUgdHJpZ2dlciBlbmRpbmcgYXQgdGhlIGNhcmV0LiBUaGUgc2NhbiBjb3ZlcnMgdGhlIGNvbnRpZ3VvdXNcclxuICogdGV4dCBydW4gYmVmb3JlIHRoZSBjYXJldCAoaW5saW5lIGF0b21zIGJyZWFrIGl0KSBhbmQgcmVxdWlyZXMgdGhlIHRyaWdnZXJcclxuICogY2hhciB0byBvcGVuIHRoZSBibG9jayBvciBmb2xsb3cgd2hpdGVzcGFjZS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBmaW5kVHJpZ2dlcihzdGF0ZTogRWRpdG9yU3RhdGUsIG9wdGlvbnM6IFRyaWdnZXJPcHRpb25zKTogVHJpZ2dlck1hdGNoIHwgbnVsbCB7XHJcbiAgY29uc3Qgc2VsZWN0aW9uID0gc3RhdGUuc2VsZWN0aW9uXHJcbiAgaWYgKCEoc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbikgfHwgIXNlbGVjdGlvbi5lbXB0eSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBwYXRoID0gc2VsZWN0aW9uLmhlYWQucGF0aFxyXG4gIGNvbnN0IGNhcmV0ID0gc2VsZWN0aW9uLmhlYWQub2Zmc2V0XHJcbiAgY29uc3QgYmxvY2sgPSBub2RlQXRQYXRoKHN0YXRlLmRvYywgcGF0aClcclxuICBpZiAoIWJsb2NrPy5pc1RleHRibG9jaykgcmV0dXJuIG51bGxcclxuXHJcbiAgLy8gQ29udGlndW91cyB0ZXh0IGltbWVkaWF0ZWx5IGJlZm9yZSB0aGUgY2FyZXQuXHJcbiAgbGV0IHRleHQgPSAnJ1xyXG4gIGxldCBvZmZzZXQgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jb250ZW50LmNoaWxkcmVuKSB7XHJcbiAgICBpZiAob2Zmc2V0ID49IGNhcmV0KSBicmVha1xyXG4gICAgY29uc3Qgc2l6ZSA9IGlubGluZVNpemUoY2hpbGQpXHJcbiAgICBpZiAoY2hpbGQuaXNUZXh0KSB7XHJcbiAgICAgIHRleHQgKz0gKGNoaWxkIGFzIFRleHROb2RlKS50ZXh0LnNsaWNlKDAsIE1hdGgubWF4KDAsIGNhcmV0IC0gb2Zmc2V0KSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRleHQgPSAnJyAvLyBhdG9tcyB0ZXJtaW5hdGUgdGhlIHJ1bjsgcmVzdGFydCBhZnRlciB0aGVtXHJcbiAgICB9XHJcbiAgICBvZmZzZXQgKz0gc2l6ZVxyXG4gIH1cclxuICBjb25zdCBiYXNlID0gY2FyZXQgLSB0ZXh0Lmxlbmd0aFxyXG5cclxuICBjb25zdCBpbmRleCA9IHRleHQubGFzdEluZGV4T2Yob3B0aW9ucy5jaGFyKVxyXG4gIGlmIChpbmRleCA8IDApIHJldHVybiBudWxsXHJcbiAgaWYgKG9wdGlvbnMuc3RhcnRPZkJsb2NrICYmIGJhc2UgKyBpbmRleCAhPT0gMCkgcmV0dXJuIG51bGxcclxuICBjb25zdCBiZWZvcmUgPSBpbmRleCA+IDAgPyB0ZXh0W2luZGV4IC0gMV0gOiB1bmRlZmluZWRcclxuICBpZiAoYmVmb3JlICE9PSB1bmRlZmluZWQgJiYgIS9cXHMvLnRlc3QoYmVmb3JlKSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBxdWVyeSA9IHRleHQuc2xpY2UoaW5kZXggKyBvcHRpb25zLmNoYXIubGVuZ3RoKVxyXG4gIGlmICghb3B0aW9ucy5hbGxvd1NwYWNlcyAmJiAvXFxzLy50ZXN0KHF1ZXJ5KSkgcmV0dXJuIG51bGxcclxuICByZXR1cm4geyBwYXRoLCBmcm9tOiBiYXNlICsgaW5kZXgsIHRvOiBjYXJldCwgcXVlcnkgfVxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFN1Z2dlc3Rpb25PcHRpb25zIGV4dGVuZHMgVHJpZ2dlck9wdGlvbnMge1xyXG4gIC8qKiBBIHRyaWdnZXIgYmVjYW1lIGFjdGl2ZS4gKi9cclxuICByZWFkb25seSBvblN0YXJ0PzogKG1hdGNoOiBUcmlnZ2VyTWF0Y2gpID0+IHZvaWRcclxuICAvKiogVGhlIHF1ZXJ5IG9mIHRoZSBhY3RpdmUgdHJpZ2dlciBjaGFuZ2VkLiAqL1xyXG4gIHJlYWRvbmx5IG9uVXBkYXRlPzogKG1hdGNoOiBUcmlnZ2VyTWF0Y2gpID0+IHZvaWRcclxuICAvKiogVGhlIHRyaWdnZXIgd2FzIGRpc21pc3NlZCAoZGVsZXRlZCwgY2FyZXQgbGVmdCwgZWRpdG9yIGJsdXJyZWQgaXQpLiAqL1xyXG4gIHJlYWRvbmx5IG9uRXhpdD86ICgpID0+IHZvaWRcclxuICAvKiogQ29uc3VtZSBrZXlzIHdoaWxlIGFjdGl2ZSAocG9wdXAgbmF2aWdhdGlvbikuIFJldHVybiB0cnVlIHdoZW4gaGFuZGxlZC4gKi9cclxuICByZWFkb25seSBvbktleURvd24/OiAoZXZlbnQ6IEtleWJvYXJkRXZlbnQsIG1hdGNoOiBUcmlnZ2VyTWF0Y2gpID0+IGJvb2xlYW5cclxufVxyXG5cclxuLyoqIFBvcHVwIHN0YXRlIGhhbmRlZCB0byB7QGxpbmsgU3VnZ2VzdGlvbkxpc3RPcHRpb25zLm9uU3RhdGV9LiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFN1Z2dlc3Rpb25MaXN0U3RhdGU8VD4ge1xyXG4gIHJlYWRvbmx5IGl0ZW1zOiByZWFkb25seSBUW11cclxuICByZWFkb25seSBzZWxlY3RlZEluZGV4OiBudW1iZXJcclxuICByZWFkb25seSBtYXRjaDogVHJpZ2dlck1hdGNoXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgU3VnZ2VzdGlvbkxpc3RPcHRpb25zPFQ+IGV4dGVuZHMgVHJpZ2dlck9wdGlvbnMge1xyXG4gIC8qKiBJdGVtcyBmb3IgYSBxdWVyeTsgYXN5bmMgcHJvdmlkZXJzIGFyZSByYWNlZCAoc3RhbGUgcmVzdWx0cyBkcm9wcGVkKS4gKi9cclxuICByZWFkb25seSBpdGVtczogKHF1ZXJ5OiBzdHJpbmcpID0+IHJlYWRvbmx5IFRbXSB8IFByb21pc2U8cmVhZG9ubHkgVFtdPlxyXG4gIC8qKiBSZW5kZXIgaG9vazogdGhlIGN1cnJlbnQgcG9wdXAgc3RhdGUsIG9yIG51bGwgd2hlbiBjbG9zZWQuICovXHJcbiAgcmVhZG9ubHkgb25TdGF0ZTogKHN0YXRlOiBTdWdnZXN0aW9uTGlzdFN0YXRlPFQ+IHwgbnVsbCkgPT4gdm9pZFxyXG4gIC8qKiBBbiBpdGVtIHdhcyBjaG9zZW4gKEVudGVyL1RhYiwgb3IgcHJvZ3JhbW1hdGljYWxseSB2aWEgYHNlbGVjdGApLiAqL1xyXG4gIHJlYWRvbmx5IG9uU2VsZWN0OiAoaXRlbTogVCwgbWF0Y2g6IFRyaWdnZXJNYXRjaCkgPT4gdm9pZFxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFN1Z2dlc3Rpb25MaXN0SGFuZGxlIHtcclxuICAvKiogQ2hvb3NlIGFuIGl0ZW0gKG1vdXNlIGNsaWNrIGluIGEgcG9wdXApLiAqL1xyXG4gIHNlbGVjdChpbmRleDogbnVtYmVyKTogdm9pZFxyXG4gIGRpc3Bvc2UoKTogdm9pZFxyXG59XHJcblxyXG4vKipcclxuICogVGhlIGZ1bGwgcG9wdXAgZHJpdmVyIHNoYXJlZCBieSB0aGUgc2xhc2ggYW5kIGVtb2ppIHRyaWdnZXJzOiB0cmlnZ2VyXHJcbiAqIHdhdGNoaW5nLCBpdGVtIGZldGNoaW5nLCBrZXlib2FyZCBuYXZpZ2F0aW9uIChhcnJvd3MsIEVudGVyL1RhYiwgRXNjYXBlKS5cclxuICogVUktZnJlZTogcmVuZGVyIHRocm91Z2ggYG9uU3RhdGVgLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHN1Z2dlc3Rpb25MaXN0PFQ+KFxyXG4gIGVkaXRvcjogRWRpdG9yLFxyXG4gIG9wdGlvbnM6IFN1Z2dlc3Rpb25MaXN0T3B0aW9uczxUPixcclxuKTogU3VnZ2VzdGlvbkxpc3RIYW5kbGUge1xyXG4gIGxldCBzdGF0ZTogU3VnZ2VzdGlvbkxpc3RTdGF0ZTxUPiB8IG51bGwgPSBudWxsXHJcbiAgbGV0IGRpc21pc3NlZCA9IGZhbHNlXHJcbiAgbGV0IGZldGNoSWQgPSAwXHJcblxyXG4gIGNvbnN0IHNldFN0YXRlID0gKG5leHQ6IFN1Z2dlc3Rpb25MaXN0U3RhdGU8VD4gfCBudWxsKTogdm9pZCA9PiB7XHJcbiAgICBzdGF0ZSA9IG5leHRcclxuICAgIG9wdGlvbnMub25TdGF0ZShuZXh0KVxyXG4gIH1cclxuXHJcbiAgY29uc3QgbG9hZCA9IChtYXRjaDogVHJpZ2dlck1hdGNoKTogdm9pZCA9PiB7XHJcbiAgICBjb25zdCBpZCA9ICsrZmV0Y2hJZFxyXG4gICAgUHJvbWlzZS5yZXNvbHZlKG9wdGlvbnMuaXRlbXMobWF0Y2gucXVlcnkpKS50aGVuKFxyXG4gICAgICAoaXRlbXMpID0+IHtcclxuICAgICAgICBpZiAoaWQgIT09IGZldGNoSWQgfHwgZGlzbWlzc2VkKSByZXR1cm5cclxuICAgICAgICBzZXRTdGF0ZSh7IGl0ZW1zLCBzZWxlY3RlZEluZGV4OiAwLCBtYXRjaCB9KVxyXG4gICAgICB9LFxyXG4gICAgICAoKSA9PiB7XHJcbiAgICAgICAgaWYgKGlkID09PSBmZXRjaElkKSBzZXRTdGF0ZShudWxsKVxyXG4gICAgICB9LFxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgcGljayA9IChpbmRleDogbnVtYmVyKTogdm9pZCA9PiB7XHJcbiAgICBjb25zdCBjdXJyZW50ID0gc3RhdGVcclxuICAgIGNvbnN0IGl0ZW0gPSBjdXJyZW50Py5pdGVtc1tpbmRleF1cclxuICAgIGlmICghY3VycmVudCB8fCBpdGVtID09PSB1bmRlZmluZWQpIHJldHVyblxyXG4gICAgc2V0U3RhdGUobnVsbClcclxuICAgIGRpc21pc3NlZCA9IHRydWUgLy8gdGhlIGluc2VydCBlZGl0cyB0aGUgZG9jOyBpZ25vcmUgdW50aWwgdGhlIHRyaWdnZXIgZXhpdHNcclxuICAgIG9wdGlvbnMub25TZWxlY3QoaXRlbSwgY3VycmVudC5tYXRjaClcclxuICB9XHJcblxyXG4gIGNvbnN0IGRpc3Bvc2UgPSBzdWdnZXN0aW9uKGVkaXRvciwge1xyXG4gICAgY2hhcjogb3B0aW9ucy5jaGFyLFxyXG4gICAgYWxsb3dTcGFjZXM6IG9wdGlvbnMuYWxsb3dTcGFjZXMsXHJcbiAgICBzdGFydE9mQmxvY2s6IG9wdGlvbnMuc3RhcnRPZkJsb2NrLFxyXG4gICAgb25TdGFydDogKG1hdGNoKSA9PiB7XHJcbiAgICAgIGRpc21pc3NlZCA9IGZhbHNlXHJcbiAgICAgIGxvYWQobWF0Y2gpXHJcbiAgICB9LFxyXG4gICAgb25VcGRhdGU6IChtYXRjaCkgPT4ge1xyXG4gICAgICBpZiAoIWRpc21pc3NlZCkgbG9hZChtYXRjaClcclxuICAgIH0sXHJcbiAgICBvbkV4aXQ6ICgpID0+IHtcclxuICAgICAgZmV0Y2hJZCsrXHJcbiAgICAgIGRpc21pc3NlZCA9IGZhbHNlXHJcbiAgICAgIHNldFN0YXRlKG51bGwpXHJcbiAgICB9LFxyXG4gICAgb25LZXlEb3duOiAoZXZlbnQpID0+IHtcclxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VzY2FwZScpIHtcclxuICAgICAgICBpZiAoIXN0YXRlICYmIGRpc21pc3NlZCkgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgZmV0Y2hJZCsrXHJcbiAgICAgICAgZGlzbWlzc2VkID0gdHJ1ZVxyXG4gICAgICAgIHNldFN0YXRlKG51bGwpXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgfVxyXG4gICAgICBpZiAoIXN0YXRlIHx8IHN0YXRlLml0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlXHJcbiAgICAgIGNvbnN0IHsgaXRlbXMsIHNlbGVjdGVkSW5kZXgsIG1hdGNoIH0gPSBzdGF0ZVxyXG4gICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyB8fCBldmVudC5rZXkgPT09ICdBcnJvd1VwJykge1xyXG4gICAgICAgIGNvbnN0IGRlbHRhID0gZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyA/IDEgOiAtMVxyXG4gICAgICAgIGNvbnN0IG5leHQgPSAoc2VsZWN0ZWRJbmRleCArIGRlbHRhICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aFxyXG4gICAgICAgIHNldFN0YXRlKHsgaXRlbXMsIHNlbGVjdGVkSW5kZXg6IG5leHQsIG1hdGNoIH0pXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgfVxyXG4gICAgICBpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInIHx8IGV2ZW50LmtleSA9PT0gJ1RhYicpIHtcclxuICAgICAgICBwaWNrKHNlbGVjdGVkSW5kZXgpXHJcbiAgICAgICAgcmV0dXJuIHRydWVcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gZmFsc2VcclxuICAgIH0sXHJcbiAgfSlcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHNlbGVjdDogcGljayxcclxuICAgIGRpc3Bvc2U6ICgpID0+IHtcclxuICAgICAgZGlzcG9zZSgpXHJcbiAgICAgIHNldFN0YXRlKG51bGwpXHJcbiAgICB9LFxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFdhdGNoIHRoZSBlZGl0b3IgZm9yIGEgdHJpZ2dlciBjaGFyYWN0ZXIgYW5kIGRyaXZlIHN1Z2dlc3Rpb24tcG9wdXBcclxuICogY2FsbGJhY2tzLiBLZXlib2FyZCBpbnRlcmNlcHRpb24gYXR0YWNoZXMgb25jZSBhIHZpZXcgZXhpc3RzLiBSZXR1cm5zIGFcclxuICogZGlzcG9zZXIuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc3VnZ2VzdGlvbihlZGl0b3I6IEVkaXRvciwgb3B0aW9uczogU3VnZ2VzdGlvbk9wdGlvbnMpOiAoKSA9PiB2b2lkIHtcclxuICBsZXQgYWN0aXZlOiBUcmlnZ2VyTWF0Y2ggfCBudWxsID0gbnVsbFxyXG4gIGxldCBkZXRhY2hLZXlzOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbFxyXG5cclxuICBjb25zdCBhdHRhY2hLZXlzID0gKCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKGRldGFjaEtleXMgfHwgIWVkaXRvci52aWV3KSByZXR1cm5cclxuICAgIGRldGFjaEtleXMgPSBlZGl0b3Iudmlldy5hZGRLZXlkb3duSW50ZXJjZXB0b3IoKGV2ZW50KSA9PiB7XHJcbiAgICAgIGlmICghYWN0aXZlKSByZXR1cm4gZmFsc2VcclxuICAgICAgcmV0dXJuIG9wdGlvbnMub25LZXlEb3duPy4oZXZlbnQsIGFjdGl2ZSkgPz8gZmFsc2VcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuICBjb25zdCBjaGVjayA9ICgpOiB2b2lkID0+IHtcclxuICAgIGF0dGFjaEtleXMoKVxyXG4gICAgY29uc3QgbWF0Y2ggPSBmaW5kVHJpZ2dlcihlZGl0b3Iuc3RhdGUsIG9wdGlvbnMpXHJcbiAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgY29uc3Qgc3RhcnRlZCA9IGFjdGl2ZSA9PT0gbnVsbFxyXG4gICAgICBhY3RpdmUgPSBtYXRjaFxyXG4gICAgICBpZiAoc3RhcnRlZCkgb3B0aW9ucy5vblN0YXJ0Py4obWF0Y2gpXHJcbiAgICAgIGVsc2Ugb3B0aW9ucy5vblVwZGF0ZT8uKG1hdGNoKVxyXG4gICAgfSBlbHNlIGlmIChhY3RpdmUpIHtcclxuICAgICAgYWN0aXZlID0gbnVsbFxyXG4gICAgICBvcHRpb25zLm9uRXhpdD8uKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNvbnN0IHVuc3Vic2NyaWJlID0gZWRpdG9yLm9uKCd0cmFuc2FjdGlvbicsIGNoZWNrKVxyXG4gIGF0dGFjaEtleXMoKVxyXG4gIHJldHVybiAoKSA9PiB7XHJcbiAgICB1bnN1YnNjcmliZSgpXHJcbiAgICBkZXRhY2hLZXlzPy4oKVxyXG4gICAgaWYgKGFjdGl2ZSkge1xyXG4gICAgICBhY3RpdmUgPSBudWxsXHJcbiAgICAgIG9wdGlvbnMub25FeGl0Py4oKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgc2V0TWFyaywgdW5zZXRNYXJrIH0gZnJvbSAnLi4vY29tbWFuZHMvY29tbWFuZHMnXHJcbmltcG9ydCB0eXBlIHsgQXR0cnMgfSBmcm9tICcuLi9tb2RlbC9hdHRycydcclxuaW1wb3J0IHR5cGUgeyBFZGl0b3IsIEVkaXRvclNuYXBzaG90IH0gZnJvbSAnLi9lZGl0b3InXHJcblxyXG4vKipcclxuICogQSBjYXB0dXJlZCBzZXQgb2YgZm9ybWF0dGluZzogdGhlIGlubGluZSBtYXJrcyB3aXRoIHRoZWlyIGF0dHJpYnV0ZXMsIGFuZFxyXG4gKiBvcHRpb25hbGx5IHRoZSBibG9jayB0eXBlIGFuZCBpdHMgbGF5b3V0LiBQbGFpbiBkYXRhLCBzbyBhbiBhcHBsaWNhdGlvbiBjYW5cclxuICogc3RvcmUgaXQsIHNob3cgaXQsIG9yIGFwcGx5IGl0IGxhdGVyLlxyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBDb3BpZWRGb3JtYXQge1xyXG4gIC8qKiBNYXJrIG5hbWUg4oaSIGF0dHJpYnV0ZXMsIGZvciBldmVyeSBtYXJrIGFjdGl2ZSBhdCB0aGUgY29weSBwb2ludC4gKi9cclxuICByZWFkb25seSBtYXJrczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgQXR0cnM+PlxyXG4gIC8qKiBCbG9jayB0eXBlIG5hbWUsIHdoZW4gYmxvY2sgZm9ybWF0dGluZyB3YXMgaW5jbHVkZWQuICovXHJcbiAgcmVhZG9ubHkgYmxvY2tUeXBlOiBzdHJpbmcgfCBudWxsXHJcbiAgcmVhZG9ubHkgYmxvY2tBdHRyczogQXR0cnMgfCBudWxsXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRm9ybWF0UGFpbnRlck9wdGlvbnMge1xyXG4gIC8qKlxyXG4gICAqIENvcHkgdGhlIGJsb2NrIHR5cGUgYW5kIGFsaWdubWVudCBhcyB3ZWxsIGFzIHRoZSBpbmxpbmUgbWFya3MuXHJcbiAgICogT24gYnkgZGVmYXVsdDogaXQgaXMgd2hhdCB1c2VycyBleHBlY3QgZnJvbSBhIGZvcm1hdCBwYWludGVyLlxyXG4gICAqL1xyXG4gIHJlYWRvbmx5IGluY2x1ZGVCbG9jaz86IGJvb2xlYW5cclxuICAvKiogTm90aWZpZWQgd2hlbmV2ZXIgdGhlIGFybWVkIHN0YXRlIGNoYW5nZXMsIGZvciBidXR0b24gc3R5bGluZy4gKi9cclxuICByZWFkb25seSBvbkNoYW5nZT86IChzdGF0ZTogRm9ybWF0UGFpbnRlclN0YXRlKSA9PiB2b2lkXHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRm9ybWF0UGFpbnRlclN0YXRlIHtcclxuICAvKiogVGhlIGNhcHR1cmVkIGZvcm1hdCwgb3IgbnVsbCB3aGVuIG5vdGhpbmcgaGFzIGJlZW4gY29waWVkLiAqL1xyXG4gIHJlYWRvbmx5IGZvcm1hdDogQ29waWVkRm9ybWF0IHwgbnVsbFxyXG4gIC8qKiBUcnVlIHdoaWxlIHRoZSBwYWludGVyIHdpbGwgYXBwbHkgdG8gdGhlIG5leHQgc2VsZWN0aW9uLiAqL1xyXG4gIHJlYWRvbmx5IGFybWVkOiBib29sZWFuXHJcbiAgLyoqIFRydWUgd2hlbiBhcm1lZCB1bnRpbCBleHBsaWNpdGx5IHR1cm5lZCBvZmYsIHJhdGhlciB0aGFuIGZvciBvbmUgdXNlLiAqL1xyXG4gIHJlYWRvbmx5IGxvY2tlZDogYm9vbGVhblxyXG59XHJcblxyXG4vKiogTWFya3MgdGhhdCBkZXNjcmliZSBmb3JtYXR0aW5nLiBMaW5rcyBhbmQgc3VnZ2VzdGlvbnMgYXJlIG5vdCBzdHlsaW5nLiAqL1xyXG5jb25zdCBOT05fRk9STUFUVElORyA9IG5ldyBTZXQoWydsaW5rJywgJ2luc2VydGlvbicsICdkZWxldGlvbicsICdjb21tZW50J10pXHJcblxyXG4vKipcclxuICogQ29waWVzIGZvcm1hdHRpbmcgZnJvbSBvbmUgcGxhY2UgaW4gdGhlIGRvY3VtZW50IGFuZCBhcHBsaWVzIGl0IHRvIGFub3RoZXI6XHJcbiAqIHRoZSBcImZvcm1hdCBwYWludGVyXCIgZXZlcnkgd29yZCBwcm9jZXNzb3IgaGFzLlxyXG4gKlxyXG4gKiBTaW5nbGUtYXJtIGFwcGxpZXMgb25jZSBhbmQgZGlzYXJtczsge0BsaW5rIGNvcHlBbmRMb2NrfSBzdGF5cyBhcm1lZCB1bnRpbFxyXG4gKiB0dXJuZWQgb2ZmLCB3aGljaCBpcyB0aGUgZG91YmxlLWNsaWNrIGJlaGF2aW91ciB1c2VycyBleHBlY3QuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgRm9ybWF0UGFpbnRlciB7XHJcbiAgcHJpdmF0ZSBmb3JtYXQ6IENvcGllZEZvcm1hdCB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSBhcm1lZCA9IGZhbHNlXHJcbiAgcHJpdmF0ZSBsb2NrZWQgPSBmYWxzZVxyXG5cclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBFZGl0b3IsXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IEZvcm1hdFBhaW50ZXJPcHRpb25zID0ge30sXHJcbiAgKSB7fVxyXG5cclxuICBnZXQgc3RhdGUoKTogRm9ybWF0UGFpbnRlclN0YXRlIHtcclxuICAgIHJldHVybiB7IGZvcm1hdDogdGhpcy5mb3JtYXQsIGFybWVkOiB0aGlzLmFybWVkLCBsb2NrZWQ6IHRoaXMubG9ja2VkIH1cclxuICB9XHJcblxyXG4gIC8qKiBDYXB0dXJlIHRoZSBmb3JtYXR0aW5nIGF0IHRoZSBjdXJyZW50IHNlbGVjdGlvbiBhbmQgYXJtIGZvciBvbmUgdXNlLiAqL1xyXG4gIGNvcHkoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5jYXB0dXJlKGZhbHNlKVxyXG4gIH1cclxuXHJcbiAgLyoqIENhcHR1cmUgYW5kIHN0YXkgYXJtZWQgdW50aWwge0BsaW5rIGNhbmNlbH0sIHRoZSBkb3VibGUtY2xpY2sgbW9kZS4gKi9cclxuICBjb3B5QW5kTG9jaygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmNhcHR1cmUodHJ1ZSlcclxuICB9XHJcblxyXG4gIC8qKiBEaXNhcm0gd2l0aG91dCBjbGVhcmluZyB3aGF0IHdhcyBjb3BpZWQuICovXHJcbiAgY2FuY2VsKCk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmFybWVkICYmICF0aGlzLmxvY2tlZCkgcmV0dXJuXHJcbiAgICB0aGlzLmFybWVkID0gZmFsc2VcclxuICAgIHRoaXMubG9ja2VkID0gZmFsc2VcclxuICAgIHRoaXMuZW1pdCgpXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBcHBseSB0aGUgY2FwdHVyZWQgZm9ybWF0dGluZyB0byB0aGUgY3VycmVudCBzZWxlY3Rpb24uIERpc2FybXNcclxuICAgKiBhZnRlcndhcmRzIHVubGVzcyBsb2NrZWQuIFJldHVybnMgZmFsc2Ugd2hlbiBub3RoaW5nIHdhcyBhcHBsaWVkLlxyXG4gICAqL1xyXG4gIGFwcGx5KCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgZm9ybWF0ID0gdGhpcy5mb3JtYXRcclxuICAgIGlmICghZm9ybWF0KSByZXR1cm4gZmFsc2VcclxuXHJcbiAgICBjb25zdCBzbmFwc2hvdCA9IHRoaXMuZWRpdG9yLmdldFNuYXBzaG90KClcclxuICAgIGNvbnN0IGNoYWluID0gdGhpcy5lZGl0b3IuY2hhaW4oKVxyXG5cclxuICAgIC8vIFJlbW92ZSB0aGUgZm9ybWF0dGluZyBhbHJlYWR5IHRoZXJlLCBzbyB0aGUgcmVzdWx0IGlzIHRoZSBjb3BpZWQgc3R5bGVcclxuICAgIC8vIHJhdGhlciB0aGFuIGEgbWVyZ2Ugb2YgdGhlIHR3by5cclxuICAgIGZvciAoY29uc3QgbmFtZSBvZiBzbmFwc2hvdC5hY3RpdmVNYXJrcykge1xyXG4gICAgICBpZiAoIU5PTl9GT1JNQVRUSU5HLmhhcyhuYW1lKSAmJiAhKG5hbWUgaW4gZm9ybWF0Lm1hcmtzKSkge1xyXG4gICAgICAgIGNoYWluLmNvbW1hbmQodW5zZXRNYXJrKG5hbWUpKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBhdHRyc10gb2YgT2JqZWN0LmVudHJpZXMoZm9ybWF0Lm1hcmtzKSkge1xyXG4gICAgICBjaGFpbi5jb21tYW5kKHNldE1hcmsobmFtZSwgYXR0cnMpKVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChmb3JtYXQuYmxvY2tUeXBlKSB7XHJcbiAgICAgIGNoYWluLnNldEJsb2NrVHlwZShmb3JtYXQuYmxvY2tUeXBlLCBmb3JtYXQuYmxvY2tBdHRycyA/PyB1bmRlZmluZWQpXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYXBwbGllZCA9IGNoYWluLnJ1bigpXHJcbiAgICBpZiAoIXRoaXMubG9ja2VkKSB7XHJcbiAgICAgIHRoaXMuYXJtZWQgPSBmYWxzZVxyXG4gICAgICB0aGlzLmVtaXQoKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGFwcGxpZWRcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FwdHVyZShsb2NrZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHNuYXBzaG90ID0gdGhpcy5lZGl0b3IuZ2V0U25hcHNob3QoKVxyXG4gICAgdGhpcy5mb3JtYXQgPSBmb3JtYXRGcm9tU25hcHNob3Qoc25hcHNob3QsIHRoaXMub3B0aW9ucy5pbmNsdWRlQmxvY2sgIT09IGZhbHNlKVxyXG4gICAgdGhpcy5hcm1lZCA9IHRydWVcclxuICAgIHRoaXMubG9ja2VkID0gbG9ja2VkXHJcbiAgICB0aGlzLmVtaXQoKVxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZW1pdCgpOiB2b2lkIHtcclxuICAgIHRoaXMub3B0aW9ucy5vbkNoYW5nZT8uKHRoaXMuc3RhdGUpXHJcbiAgfVxyXG59XHJcblxyXG4vKiogRXh0cmFjdCB0aGUgZm9ybWF0dGluZyBoYWxmIG9mIGEgc25hcHNob3QuIEV4cG9ydGVkIGZvciB0ZXN0aW5nIGFuZCByZXVzZS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEZyb21TbmFwc2hvdChzbmFwc2hvdDogRWRpdG9yU25hcHNob3QsIGluY2x1ZGVCbG9jayA9IHRydWUpOiBDb3BpZWRGb3JtYXQge1xyXG4gIGNvbnN0IG1hcmtzOiBSZWNvcmQ8c3RyaW5nLCBBdHRycz4gPSB7fVxyXG4gIGZvciAoY29uc3QgbmFtZSBvZiBzbmFwc2hvdC5hY3RpdmVNYXJrcykge1xyXG4gICAgaWYgKE5PTl9GT1JNQVRUSU5HLmhhcyhuYW1lKSkgY29udGludWVcclxuICAgIG1hcmtzW25hbWVdID0gc25hcHNob3QubWFya0F0dHJzW25hbWVdID8/IHt9XHJcbiAgfVxyXG5cclxuICBpZiAoIWluY2x1ZGVCbG9jaykgcmV0dXJuIHsgbWFya3MsIGJsb2NrVHlwZTogbnVsbCwgYmxvY2tBdHRyczogbnVsbCB9XHJcblxyXG4gIC8vIENhcnJ5IHRoZSBsYXlvdXQgYXR0cmlidXRlcywgYnV0IG5vdCBjb250ZW50LWJlYXJpbmcgb25lcyBsaWtlIGEgY29kZVxyXG4gIC8vIGJsb2NrJ3MgbGFuZ3VhZ2UsIHBhc3RpbmcgYSBzdHlsZSBzaG91bGQgbm90IGNoYW5nZSB3aGF0IGEgYmxvY2sgbWVhbnMuXHJcbiAgY29uc3QgYmxvY2tBdHRyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fVxyXG4gIGlmIChzbmFwc2hvdC5hbGlnbiAhPT0gbnVsbCkgYmxvY2tBdHRycy5hbGlnbiA9IHNuYXBzaG90LmFsaWduXHJcbiAgaWYgKHNuYXBzaG90LmluZGVudCkgYmxvY2tBdHRycy5pbmRlbnQgPSBzbmFwc2hvdC5pbmRlbnRcclxuICBjb25zdCBsZXZlbCA9IHNuYXBzaG90LmJsb2NrQXR0cnM/LmxldmVsXHJcbiAgaWYgKHR5cGVvZiBsZXZlbCA9PT0gJ251bWJlcicpIGJsb2NrQXR0cnMubGV2ZWwgPSBsZXZlbFxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgbWFya3MsXHJcbiAgICBibG9ja1R5cGU6IHNuYXBzaG90LmJsb2NrVHlwZSxcclxuICAgIGJsb2NrQXR0cnM6IE9iamVjdC5rZXlzKGJsb2NrQXR0cnMpLmxlbmd0aCA+IDAgPyBibG9ja0F0dHJzIDogbnVsbCxcclxuICB9XHJcbn1cclxuXHJcbi8qKiBBIHNob3J0IGh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uIG9mIGEgY29waWVkIGZvcm1hdCwgZm9yIGEgdG9vbHRpcC4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGRlc2NyaWJlRm9ybWF0KGZvcm1hdDogQ29waWVkRm9ybWF0IHwgbnVsbCk6IHN0cmluZyB7XHJcbiAgaWYgKCFmb3JtYXQpIHJldHVybiAnTm90aGluZyBjb3BpZWQnXHJcbiAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW11cclxuICBpZiAoZm9ybWF0LmJsb2NrVHlwZSAmJiBmb3JtYXQuYmxvY2tUeXBlICE9PSAncGFyYWdyYXBoJykgcGFydHMucHVzaChmb3JtYXQuYmxvY2tUeXBlKVxyXG4gIHBhcnRzLnB1c2goLi4uT2JqZWN0LmtleXMoZm9ybWF0Lm1hcmtzKSlcclxuICByZXR1cm4gcGFydHMubGVuZ3RoID4gMCA/IHBhcnRzLmpvaW4oJywgJykgOiAnUGxhaW4gdGV4dCdcclxufVxyXG4iLCAiaW1wb3J0IHR5cGUgeyBFZGl0b3IgfSBmcm9tICcuLi9lZGl0b3IvZWRpdG9yJ1xyXG5cclxuLyoqXHJcbiAqIFRoZSBkb2N1bWVudCBhIHBpZWNlIG9mIGZsb2F0aW5nIGNocm9tZSBzaG91bGQgYnVpbGQgaXRzZWxmIGludG8uXHJcbiAqXHJcbiAqIEV2ZXJ5IGRyb3Bkb3duLCBwb3BvdmVyLCB0b29sYmFyIGFuZCBoYW5kbGUgbmVlZHMgdGhlIHNhbWUgdGhpbmcgYW5kIHVzZWQgdG9cclxuICogd29yayBpdCBvdXQgdGhlIHNhbWUgdGhyZWUgbGluZXMgYXQgYSB0aW1lOiB0aGUgdmlldydzIG93biBlbGVtZW50IGlmIHRoZVxyXG4gKiBlZGl0b3IgaGFzIGEgdmlldywgb3RoZXJ3aXNlIHdoYXRldmVyIGNvbnRhaW5lciB0aGUgY2FsbGVyIHdhcyBnaXZlbiwgYW5kXHJcbiAqIHRoZSBkb2N1bWVudCB0aGF0IGVsZW1lbnQgYmVsb25ncyB0by5cclxuICpcclxuICogSXQgdGhyb3dzIHJhdGhlciB0aGFuIHJldHVybmluZyBudWxsIGJlY2F1c2UgdGhlcmUgaXMgbm90aGluZyB1c2VmdWwgYVxyXG4gKiBjb250cm9sIGNhbiBkbyB3aXRob3V0IG9uZS4gSXQgd291bGQgaGF2ZSB0byBidWlsZCBpbnRvIGEgZG9jdW1lbnQgaXRcclxuICogaW52ZW50ZWQsIHdoaWNoIG5vIGhvc3Qgd291bGQgZXZlciBzZWUuIGBjYWxsZXJgIGlzIGluIHRoZSBtZXNzYWdlIGJlY2F1c2VcclxuICogYSBob3N0IHdpcmluZyBzaXggb2YgdGhlc2UgaW4gYSByb3cgbmVlZHMgdG8ga25vdyB3aGljaCBvZiB0aGVtIGl0IGNhbGxlZFxyXG4gKiBiZWZvcmUgdGhlIGVkaXRvciBoYWQgYSB2aWV3LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGVkaXRvckRvY3VtZW50KFxyXG4gIGVkaXRvcjogRWRpdG9yLFxyXG4gIGNvbnRhaW5lcjogRWxlbWVudCB8IG51bGwgfCB1bmRlZmluZWQsXHJcbiAgY2FsbGVyOiBzdHJpbmcsXHJcbik6IERvY3VtZW50IHtcclxuICBjb25zdCBob3N0ID0gZWRpdG9yLnZpZXc/LmRvbSA/PyBjb250YWluZXJcclxuICBjb25zdCBkb2N1bWVudCA9IGhvc3Q/Lm93bmVyRG9jdW1lbnRcclxuICBpZiAoIWRvY3VtZW50KSB0aHJvdyBuZXcgRXJyb3IoYCR7Y2FsbGVyfTogdGhlIGVkaXRvciBtdXN0IGhhdmUgYSB2aWV3YClcclxuICByZXR1cm4gZG9jdW1lbnRcclxufVxyXG4iLCAiLyoqXHJcbiAqIEVycm9ycyBzaGFyZWQgYWNyb3NzIHRoZSB3b3Jrc3BhY2UuXHJcbiAqXHJcbiAqIGBVcGxvYWRFcnJvcmAgbGl2ZXMgaGVyZSByYXRoZXIgdGhhbiBpbiB0aGUgZXh0ZW5zaW9uIHRoYXQgcmFpc2VzIGl0IGJlY2F1c2VcclxuICogdHdvIG9mIHRoZW0gZG8sIGBAdHJldml4YWwvZXh0ZW5zaW9uLWltYWdlYCBhbmQgYEB0cmV2aXhhbC9leHRlbnNpb24tZW1iZWRgLFxyXG4gKiBhbmQgZWFjaCB1c2VkIHRvIGRlY2xhcmUgaXRzIG93bi4gVHdvIGNsYXNzZXMgb2YgdGhlIHNhbWUgbmFtZSBhcmUgdHdvXHJcbiAqIGRpZmZlcmVudCBjbGFzc2VzIGF0IHJ1bnRpbWU6IGBjYXRjaCAoZXJyb3IpIHsgZXJyb3IgaW5zdGFuY2VvZiBVcGxvYWRFcnJvciB9YFxyXG4gKiB3cml0dGVuIGFnYWluc3Qgb25lIG9mIHRoZW0gc2lsZW50bHkgc2tpcHMgdGhlIG90aGVyJ3MuIENvcmUgaXMgdGhlIG9ubHlcclxuICogcGFja2FnZSBib3RoIGFscmVhZHkgZGVwZW5kIG9uLCBzbyBpdCBpcyB3aGVyZSB0aGUgb25lIGRlZmluaXRpb24gY2FuIHNpdC5cclxuICovXHJcblxyXG4vKiogQSBzdG9yYWdlIGJhY2tlbmQgcmVmdXNlZCBvciBmYWlsZWQgYW4gdXBsb2FkLiAqL1xyXG5leHBvcnQgY2xhc3MgVXBsb2FkRXJyb3IgZXh0ZW5kcyBFcnJvciB7XHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBtZXNzYWdlOiBzdHJpbmcsXHJcbiAgICBvdmVycmlkZSByZWFkb25seSBjYXVzZT86IHVua25vd24sXHJcbiAgKSB7XHJcbiAgICBzdXBlcihtZXNzYWdlKVxyXG4gICAgdGhpcy5uYW1lID0gJ1VwbG9hZEVycm9yJ1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEEgY2FwYWJpbGl0eSB0aGlzIGNvZGUgbmVlZHMgaXMgbWlzc2luZyBmcm9tIHRoZSBydW50aW1lIGl0IGlzIGluLlxyXG4gKlxyXG4gKiBOb3QgYSBidWcgYW5kIG5vdCBiYWQgaW5wdXQ6IFdlYkNyeXB0byBpcyBhYnNlbnQgb24gYW4gaW5zZWN1cmUgb3JpZ2luLFxyXG4gKiBgRGVjb21wcmVzc2lvblN0cmVhbWAgb24gYW4gb2xkZXIgYnJvd3NlciwgYSBjYW52YXMgb24gYSBzZXJ2ZXIuIEEgaG9zdCB0aGF0XHJcbiAqIGNhdGNoZXMgdGhpcyBjYW4gc2F5IFwidGhpcyBicm93c2VyIGNhbm5vdCBkbyB0aGF0XCIgYW5kIGRpc2FibGUgdGhlIGJ1dHRvbixcclxuICogd2hpY2ggaXMgYSBkaWZmZXJlbnQgYW5zd2VyIGZyb20gXCJ0aGF0IGZpbGUgaXMgYnJva2VuXCIsIHNvIGl0IGlzIGFcclxuICogZGlmZmVyZW50IGNsYXNzLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFVuc3VwcG9ydGVkRW52aXJvbm1lbnRFcnJvciBleHRlbmRzIEVycm9yIHtcclxuICBjb25zdHJ1Y3RvcihcclxuICAgIG1lc3NhZ2U6IHN0cmluZyxcclxuICAgIG92ZXJyaWRlIHJlYWRvbmx5IGNhdXNlPzogdW5rbm93bixcclxuICApIHtcclxuICAgIHN1cGVyKG1lc3NhZ2UpXHJcbiAgICB0aGlzLm5hbWUgPSAnVW5zdXBwb3J0ZWRFbnZpcm9ubWVudEVycm9yJ1xyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHtcclxuICB0eXBlIENhc2VNb2RlLFxyXG4gIHR5cGUgQ29tbWFuZCxcclxuICBjbGVhckFsbEZvcm1hdHRpbmcsXHJcbiAgY2xlYXJCbG9ja0Zvcm1hdHRpbmcsXHJcbiAgY2xlYXJGb3JtYXR0aW5nLFxyXG4gIGNvbnZlcnRDYXNlLFxyXG4gIGRlbGV0ZVNlbGVjdGlvbixcclxuICBpbmRlbnRCbG9ja3MsXHJcbiAgaW5zZXJ0QmxvY2tBZnRlcixcclxuICBpbnNlcnRJbmxpbmVOb2RlLFxyXG4gIGluc2VydFRleHQsXHJcbiAgaXNNYXJrQWN0aXZlLFxyXG4gIGpvaW5CYWNrd2FyZCxcclxuICBsaWZ0LFxyXG4gIHNlbGVjdEFsbCxcclxuICBzZXRCbG9ja0F0dHJzLFxyXG4gIHNldEJsb2NrVHlwZSxcclxuICBzZXRMZXR0ZXJTcGFjaW5nLFxyXG4gIHNldExpbmVIZWlnaHQsXHJcbiAgc2V0TWFyayxcclxuICBzZXRQYXJhZ3JhcGhTcGFjaW5nLFxyXG4gIHNldFRleHRBbGlnbixcclxuICBzcGxpdEJsb2NrLFxyXG4gIHRvZ2dsZU1hcmssXHJcbiAgdG9nZ2xlU21hbGxDYXBzLFxyXG4gIHVuc2V0TWFyayxcclxuICB3cmFwSW4sXHJcbn0gZnJvbSAnLi4vY29tbWFuZHMvY29tbWFuZHMnXHJcbmltcG9ydCB7XHJcbiAgY29udGludWVOdW1iZXJpbmcsXHJcbiAgY29udGludWVOdW1iZXJpbmdGcm9tUHJldmlvdXMsXHJcbiAgbGlmdExpc3RJdGVtLFxyXG4gIHJlc3RhcnROdW1iZXJpbmcsXHJcbiAgc2V0TGlzdFN0eWxlLFxyXG4gIHNpbmtMaXN0SXRlbSxcclxuICBzcGxpdExpc3RJdGVtLFxyXG4gIHRvZ2dsZUxpc3QsXHJcbiAgdG9nZ2xlVGFza0NoZWNrZWQsXHJcbiAgdG9nZ2xlVGFza0xpc3QsXHJcbn0gZnJvbSAnLi4vY29tbWFuZHMvbGlzdHMnXHJcbmltcG9ydCB7IEFERF9UT19ISVNUT1JZLCBIaXN0b3J5LCB0eXBlIEhpc3RvcnlFbnRyeSwgdHlwZSBIaXN0b3J5T3B0aW9ucyB9IGZyb20gJy4uL2hpc3RvcnkvaGlzdG9yeSdcclxuaW1wb3J0IHR5cGUgeyBJbnB1dFJ1bGUgfSBmcm9tICcuLi9pbnB1dC1ydWxlcy9pbnB1dC1ydWxlcydcclxuaW1wb3J0IHsgdHlwZSBBdHRycywgYXR0cnNFcSB9IGZyb20gJy4uL21vZGVsL2F0dHJzJ1xyXG5pbXBvcnQgeyBibG9ja3NJblJhbmdlIH0gZnJvbSAnLi4vbW9kZWwvYmxvY2tzJ1xyXG5pbXBvcnQgeyBjaGFyYWN0ZXJDb3VudCwgcGFyYWdyYXBoQ291bnQsIHNlbnRlbmNlQ291bnQsIHdvcmRDb3VudCB9IGZyb20gJy4uL21vZGVsL2NvdW50cydcclxuaW1wb3J0IHsgbWFya3NBdElubGluZU9mZnNldCwgcmFuZ2VzV2l0aE1hcmsgfSBmcm9tICcuLi9tb2RlbC9pbmxpbmUnXHJcbmltcG9ydCB7IHR5cGUgRG9jSlNPTiwgbm9kZUZyb21KU09OIH0gZnJvbSAnLi4vbW9kZWwvanNvbidcclxuaW1wb3J0IHsgRWRpdG9yTm9kZSB9IGZyb20gJy4uL21vZGVsL25vZGUnXHJcbmltcG9ydCB7IG5vcm1hbGl6ZURvYyB9IGZyb20gJy4uL21vZGVsL25vcm1hbGl6ZSdcclxuaW1wb3J0IHsgcG9zIH0gZnJvbSAnLi4vbW9kZWwvcG9zaXRpb24nXHJcbmltcG9ydCB0eXBlIHsgU2NoZW1hIH0gZnJvbSAnLi4vbW9kZWwvc2NoZW1hJ1xyXG5pbXBvcnQgeyB0eXBlIFBhdGgsIG5vZGVBdFBhdGggfSBmcm9tICcuLi9tb2RlbC90cmVlJ1xyXG5pbXBvcnQgeyBzZXJpYWxpemVUb0hUTUwsIHNlcmlhbGl6ZVRvVGV4dCB9IGZyb20gJy4uL3NlcmlhbGl6ZS9odG1sJ1xyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uL3N0YXRlL2VkaXRvci1zdGF0ZSdcclxuaW1wb3J0IHsgdHlwZSBTZWxlY3Rpb24sIFRleHRTZWxlY3Rpb24sIHNlbGVjdGlvbk5lYXIgfSBmcm9tICcuLi9zdGF0ZS9zZWxlY3Rpb24nXHJcbmltcG9ydCB7IFJlcGxhY2VOb2Rlc1N0ZXAgfSBmcm9tICcuLi9zdGF0ZS9zdGVwcy9yZXBsYWNlLW5vZGVzJ1xyXG5pbXBvcnQgdHlwZSB7IFRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vc3RhdGUvdHJhbnNhY3Rpb24nXHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIHR5cGUgTm9kZVZpZXdGYWN0b3J5IH0gZnJvbSAnLi4vdmlldy9lZGl0b3ItdmlldydcclxuaW1wb3J0IHR5cGUgeyBLZXltYXAgfSBmcm9tICcuLi92aWV3L2tleW1hcCdcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yQ2hhbmdlIHtcclxuICByZWFkb25seSBlZGl0b3I6IEVkaXRvclxyXG4gIHJlYWRvbmx5IGpzb246IERvY0pTT05cclxuICByZWFkb25seSBodG1sOiBzdHJpbmdcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JPcHRpb25zIHtcclxuICByZWFkb25seSBzY2hlbWE6IFNjaGVtYVxyXG4gIC8qKiBJbml0aWFsIGNvbnRlbnQgYXMgY2Fub25pY2FsIEpTT04uICovXHJcbiAgcmVhZG9ubHkgY29udGVudD86IERvY0pTT05cclxuICByZWFkb25seSBkb2M/OiBFZGl0b3JOb2RlXHJcbiAgLyoqIE1vdW50IHBvaW50IGZvciB0aGUgY29udGVudGVkaXRhYmxlIHZpZXcuIE9taXQgZm9yIGEgaGVhZGxlc3MgZWRpdG9yLiAqL1xyXG4gIHJlYWRvbmx5IGVsZW1lbnQ/OiBIVE1MRWxlbWVudCB8IG51bGxcclxuICByZWFkb25seSBhdXRvZm9jdXM/OiBib29sZWFuXHJcbiAgLyoqIEV4dHJhIGtleSBiaW5kaW5ncyBmb3IgdGhlIHZpZXc7IHRoZXkgd2luIG92ZXIgdGhlIGJhc2Uga2V5bWFwLiAqL1xyXG4gIHJlYWRvbmx5IGtleW1hcD86IEtleW1hcFxyXG4gIC8qKiBUZXh0IHNob3duIHdoaWxlIHRoZSBkb2N1bWVudCBpcyBlbXB0eS4gKi9cclxuICByZWFkb25seSBwbGFjZWhvbGRlcj86IHN0cmluZ1xyXG4gIC8qKiBBY2Nlc3NpYmxlIG5hbWUgZm9yIHRoZSBzdXJmYWNlOyBzZWUge0BsaW5rIEVkaXRvclZpZXdPcHRpb25zLmFyaWFMYWJlbH0uICovXHJcbiAgcmVhZG9ubHkgYXJpYUxhYmVsPzogc3RyaW5nXHJcbiAgLyoqIFN0YXJ0IHJlYWQtb25seS4gRmxpcCBhdCBydW50aW1lIHdpdGgge0BsaW5rIEVkaXRvci5zZXRFZGl0YWJsZX0uICovXHJcbiAgcmVhZG9ubHkgZWRpdGFibGU/OiBib29sZWFuXHJcbiAgLyoqXHJcbiAgICogQnJvd3NlciBzcGVsbCBjaGVja2luZyBvbiB0aGUgZWRpdGluZyBzdXJmYWNlLiBMZWZ0IHRvIHRoZSBicm93c2VyJ3NcclxuICAgKiBkZWZhdWx0IHdoZW4gb21pdHRlZDsgZmxpcCBhdCBydW50aW1lIHdpdGgge0BsaW5rIEVkaXRvci5zZXRTcGVsbGNoZWNrfS5cclxuICAgKi9cclxuICByZWFkb25seSBzcGVsbGNoZWNrPzogYm9vbGVhblxyXG4gIC8qKiBSZWplY3QgZWRpdHMgdGhhdCB3b3VsZCBwdXNoIHRoZSBjaGFyYWN0ZXIgY291bnQgcGFzdCB0aGlzIGxpbWl0LiAqL1xyXG4gIHJlYWRvbmx5IG1heExlbmd0aD86IG51bWJlclxyXG4gIC8qKiBSZXBsYWNlcyB0aGUgZGVmYXVsdCBtYXJrZG93bi1zdHlsZSBpbnB1dCBydWxlcyB3aGVuIHByb3ZpZGVkLiAqL1xyXG4gIHJlYWRvbmx5IGlucHV0UnVsZXM/OiByZWFkb25seSBJbnB1dFJ1bGVbXVxyXG4gIC8qKiBDdXN0b20gcmVuZGVyZXJzIHBlciBub2RlIHR5cGUgKGZyYW1ld29yayBjb21wb25lbnRzIGluIHRoZSBkb2N1bWVudCkuICovXHJcbiAgcmVhZG9ubHkgbm9kZVZpZXdzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgTm9kZVZpZXdGYWN0b3J5Pj5cclxuICAvKipcclxuICAgKiBBbm5vdW5jZSBzdHJ1Y3R1cmFsIGVkaXRzIHRvIGFzc2lzdGl2ZSB0ZWNobm9sb2d5OyBzZWVcclxuICAgKiB7QGxpbmsgRWRpdG9yVmlld09wdGlvbnMuYW5ub3VuY2V9LiBPbiBieSBkZWZhdWx0LiBJZ25vcmVkIHdpdGhvdXQgYW5cclxuICAgKiBgZWxlbWVudGA6IGEgaGVhZGxlc3MgZWRpdG9yIGhhcyBubyBsaXZlIHJlZ2lvbiB0byB3cml0ZSB0by5cclxuICAgKi9cclxuICByZWFkb25seSBhbm5vdW5jZT86IGJvb2xlYW5cclxuICByZWFkb25seSBvbkNoYW5nZT86IChjaGFuZ2U6IEVkaXRvckNoYW5nZSkgPT4gdm9pZFxyXG4gIHJlYWRvbmx5IGhpc3Rvcnk/OiBIaXN0b3J5T3B0aW9uc1xyXG59XHJcblxyXG5leHBvcnQgdHlwZSBFZGl0b3JFdmVudCA9ICd0cmFuc2FjdGlvbicgfCAndXBkYXRlJyB8ICdzZWxlY3Rpb25VcGRhdGUnXHJcblxyXG4vKiogUGF5bG9hZCBkZWxpdmVyZWQgdG8ge0BsaW5rIEVkaXRvci5vblRyYW5zYWN0aW9ufSBsaXN0ZW5lcnMuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNhY3Rpb25FdmVudCB7XHJcbiAgcmVhZG9ubHkgZWRpdG9yOiBFZGl0b3JcclxuICByZWFkb25seSB0cmFuc2FjdGlvbjogVHJhbnNhY3Rpb25cclxuICAvKiogU3RhdGUgdGhlIHRyYW5zYWN0aW9uIHdhcyBhcHBsaWVkIHRvLiAqL1xyXG4gIHJlYWRvbmx5IGJlZm9yZTogRWRpdG9yU3RhdGVcclxuICAvKiogU3RhdGUgYWZ0ZXIgYXBwbHlpbmcgaXQgKD09PSBgZWRpdG9yLnN0YXRlYCBhdCBlbWl0IHRpbWUpLiAqL1xyXG4gIHJlYWRvbmx5IHN0YXRlOiBFZGl0b3JTdGF0ZVxyXG59XHJcblxyXG4vKipcclxuICogUmV3cml0ZXMgYSB0cmFuc2FjdGlvbiBiZWZvcmUgaXQgaXMgYXBwbGllZCAodHJhY2sgY2hhbmdlcyB0dXJucyBlZGl0c1xyXG4gKiBpbnRvIHN1Z2dlc3Rpb25zKS4gUmV0dXJuIG51bGwgdG8ga2VlcCB0aGUgdHJhbnNhY3Rpb24gYXMtaXMuIFRoZVxyXG4gKiByZXBsYWNlbWVudCBtdXN0IHN0YXJ0IGZyb20gdGhlIHNhbWUgc3RhdGUuXHJcbiAqL1xyXG5leHBvcnQgdHlwZSBEaXNwYXRjaFRyYW5zZm9ybSA9ICh0cjogVHJhbnNhY3Rpb24sIHN0YXRlOiBFZGl0b3JTdGF0ZSkgPT4gVHJhbnNhY3Rpb24gfCBudWxsXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNldENvbnRlbnRPcHRpb25zIHtcclxuICAvKiogUmVjb3JkIHRoZSByZXBsYWNlbWVudCBhcyBhbiB1bmRvYWJsZSBzdGVwIGluc3RlYWQgb2YgY2xlYXJpbmcgaGlzdG9yeS4gKi9cclxuICByZWFkb25seSBhZGRUb0hpc3Rvcnk/OiBib29sZWFuXHJcbn1cclxuXHJcbi8qKiBUb29sYmFyLWZhY2luZyBzbmFwc2hvdCBvZiB0aGUgY3VycmVudCBzdGF0ZS4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JTbmFwc2hvdCB7XHJcbiAgcmVhZG9ubHkgYWN0aXZlTWFya3M6IHJlYWRvbmx5IHN0cmluZ1tdXHJcbiAgLyoqIEF0dHJpYnV0ZXMgb2YgZWFjaCBhY3RpdmUgbWFyaywga2V5ZWQgYnkgbWFyayBuYW1lIChmb250IHNpemUsIGNvbG9y4oCmKS4gKi9cclxuICByZWFkb25seSBtYXJrQXR0cnM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIEF0dHJzPj5cclxuICByZWFkb25seSBibG9ja1R5cGU6IHN0cmluZyB8IG51bGxcclxuICByZWFkb25seSBibG9ja0F0dHJzOiBBdHRycyB8IG51bGxcclxuICAvKiogVHlwZSBuYW1lIG9mIHRoZSBsaXN0IHdyYXBwaW5nIHRoZSBzZWxlY3Rpb24sIHdoZW4gaW5zaWRlIG9uZS4gKi9cclxuICByZWFkb25seSBsaXN0VHlwZTogc3RyaW5nIHwgbnVsbFxyXG4gIC8qKiBUZXh0IGFsaWdubWVudCBvZiB0aGUgYmxvY2sgaG9sZGluZyB0aGUgc2VsZWN0aW9uIGhlYWQuICovXHJcbiAgcmVhZG9ubHkgYWxpZ246IHN0cmluZyB8IG51bGxcclxuICAvKiogSW5kZW50IGxldmVsIG9mIHRoZSBibG9jayBob2xkaW5nIHRoZSBzZWxlY3Rpb24gaGVhZC4gKi9cclxuICByZWFkb25seSBpbmRlbnQ6IG51bWJlclxyXG4gIHJlYWRvbmx5IGNhblVuZG86IGJvb2xlYW5cclxuICByZWFkb25seSBjYW5SZWRvOiBib29sZWFuXHJcbiAgcmVhZG9ubHkgc2VsZWN0aW9uRW1wdHk6IGJvb2xlYW5cclxufVxyXG5cclxuLyoqXHJcbiAqIFRoZSBoZWFkbGVzcyBlZGl0b3I6IG93bnMgdGhlIHN0YXRlLCBkaXNwYXRjaGVzIHRyYW5zYWN0aW9ucywgcmVjb3Jkc1xyXG4gKiBoaXN0b3J5IGFuZCBleHBvc2VzIGNvbW1hbmRzLiBBIERPTSB2aWV3IGF0dGFjaGVzIHRvIGl0IHdoZW4gYW4gZWxlbWVudFxyXG4gKiBpcyBzdXBwbGllZC5cclxuICovXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3Ige1xyXG4gIHN0YXRlOiBFZGl0b3JTdGF0ZVxyXG4gIHJlYWRvbmx5IGNvbW1hbmRzOiBFZGl0b3JDb21tYW5kc1xyXG4gIC8qKiBUaGUgYXR0YWNoZWQgRE9NIHZpZXcsIHdoZW4gYW4gYGVsZW1lbnRgIHdhcyBzdXBwbGllZC4gKi9cclxuICB2aWV3OiBFZGl0b3JWaWV3IHwgbnVsbCA9IG51bGxcclxuICBwcml2YXRlIHJlYWRvbmx5IGhpc3Rvcnk6IEhpc3RvcnlcclxuICBwcml2YXRlIHJlYWRvbmx5IG9uQ2hhbmdlPzogKGNoYW5nZTogRWRpdG9yQ2hhbmdlKSA9PiB2b2lkXHJcbiAgcHJpdmF0ZSByZWFkb25seSBtYXhMZW5ndGg6IG51bWJlciB8IG51bGxcclxuICBwcml2YXRlIGxpc3RlbmVycyA9IG5ldyBNYXA8RWRpdG9yRXZlbnQsIFNldDwoKSA9PiB2b2lkPj4oKVxyXG4gIHByaXZhdGUgdHhMaXN0ZW5lcnMgPSBuZXcgU2V0PChldmVudDogVHJhbnNhY3Rpb25FdmVudCkgPT4gdm9pZD4oKVxyXG4gIHByaXZhdGUgdHJhbnNmb3JtczogRGlzcGF0Y2hUcmFuc2Zvcm1bXSA9IFtdXHJcbiAgcHJpdmF0ZSBkZXN0cm95ZWQgPSBmYWxzZVxyXG4gIHByaXZhdGUgc25hcHNob3RDYWNoZTogRWRpdG9yU25hcHNob3QgfCBudWxsID0gbnVsbFxyXG4gIC8qKiBUaGUgbGFzdCBzbmFwc2hvdCBoYW5kZWQgb3V0LCBrZXB0IHNvIGFuIHVuY2hhbmdlZCBvbmUgY2FuIGJlIHJldXNlZC4gKi9cclxuICBwcml2YXRlIGxhc3RTbmFwc2hvdDogRWRpdG9yU25hcHNob3QgfCBudWxsID0gbnVsbFxyXG5cclxuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBFZGl0b3JPcHRpb25zKSB7XHJcbiAgICB0aGlzLnN0YXRlID0gRWRpdG9yU3RhdGUuY3JlYXRlKHtcclxuICAgICAgc2NoZW1hOiBvcHRpb25zLnNjaGVtYSxcclxuICAgICAgZG9jOiBvcHRpb25zLmRvYyxcclxuICAgICAgY29udGVudDogb3B0aW9ucy5jb250ZW50LFxyXG4gICAgfSlcclxuICAgIHRoaXMuaGlzdG9yeSA9IG5ldyBIaXN0b3J5KG9wdGlvbnMuaGlzdG9yeSlcclxuICAgIHRoaXMub25DaGFuZ2UgPSBvcHRpb25zLm9uQ2hhbmdlXHJcbiAgICB0aGlzLm1heExlbmd0aCA9IG9wdGlvbnMubWF4TGVuZ3RoID8/IG51bGxcclxuICAgIHRoaXMuY29tbWFuZHMgPSBuZXcgRWRpdG9yQ29tbWFuZHModGhpcylcclxuICAgIGlmIChvcHRpb25zLmVsZW1lbnQpIHtcclxuICAgICAgdGhpcy52aWV3ID0gbmV3IEVkaXRvclZpZXcodGhpcywgb3B0aW9ucy5lbGVtZW50LCB7XHJcbiAgICAgICAgYXV0b2ZvY3VzOiBvcHRpb25zLmF1dG9mb2N1cyxcclxuICAgICAgICBrZXltYXA6IG9wdGlvbnMua2V5bWFwLFxyXG4gICAgICAgIHBsYWNlaG9sZGVyOiBvcHRpb25zLnBsYWNlaG9sZGVyLFxyXG4gICAgICAgIGFyaWFMYWJlbDogb3B0aW9ucy5hcmlhTGFiZWwsXHJcbiAgICAgICAgZWRpdGFibGU6IG9wdGlvbnMuZWRpdGFibGUsXHJcbiAgICAgICAgc3BlbGxjaGVjazogb3B0aW9ucy5zcGVsbGNoZWNrLFxyXG4gICAgICAgIGlucHV0UnVsZXM6IG9wdGlvbnMuaW5wdXRSdWxlcyxcclxuICAgICAgICBub2RlVmlld3M6IG9wdGlvbnMubm9kZVZpZXdzLFxyXG4gICAgICAgIGFubm91bmNlOiBvcHRpb25zLmFubm91bmNlLFxyXG4gICAgICB9KVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0IHNjaGVtYSgpOiBTY2hlbWEge1xyXG4gICAgcmV0dXJuIHRoaXMuc3RhdGUuc2NoZW1hXHJcbiAgfVxyXG5cclxuICBnZXQgaXNEZXN0cm95ZWQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5kZXN0cm95ZWRcclxuICB9XHJcblxyXG4gIC8qKiBSdW4gYSBjb21tYW5kIGFnYWluc3QgdGhlIGN1cnJlbnQgc3RhdGU7IGRpc3BhdGNoZXMgd2hlbiBpdCBhcHBsaWVzLiAqL1xyXG4gIGV4ZWMoY29tbWFuZDogQ29tbWFuZCk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkKSByZXR1cm4gZmFsc2VcclxuICAgIC8vIFRoZSBicm93c2VyIHJlcG9ydHMgc2VsZWN0aW9uIGNoYW5nZXMgYXN5bmNocm9ub3VzbHksIHNvIGEgY29tbWFuZFxyXG4gICAgLy8gdHJpZ2dlcmVkIG91dHNpZGUgdGhlIGlucHV0IHBpcGVsaW5lIChhIHRvb2xiYXIgY2xpY2spIG11c3Qgc2VlIHRoZVxyXG4gICAgLy8gbGl2ZSBzZWxlY3Rpb24gcmF0aGVyIHRoYW4gdGhlIGxhc3Qgb25lIHRoZSB2aWV3IG9ic2VydmVkLlxyXG4gICAgdGhpcy52aWV3Py5zeW5jU2VsZWN0aW9uRnJvbURPTSgpXHJcbiAgICBjb25zdCB0ciA9IGNvbW1hbmQodGhpcy5zdGF0ZSlcclxuICAgIGlmICghdHIpIHJldHVybiBmYWxzZVxyXG4gICAgdGhpcy5kaXNwYXRjaCh0cilcclxuICAgIHJldHVybiB0cnVlXHJcbiAgfVxyXG5cclxuICBkaXNwYXRjaCh0cjogVHJhbnNhY3Rpb24pOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmRlc3Ryb3llZCkgcmV0dXJuXHJcbiAgICBjb25zdCBiZWZvcmUgPSB0aGlzLnN0YXRlXHJcbiAgICBsZXQgdHJhbnNhY3Rpb24gPSB0clxyXG4gICAgZm9yIChjb25zdCB0cmFuc2Zvcm0gb2YgdGhpcy50cmFuc2Zvcm1zKSB7XHJcbiAgICAgIHRyYW5zYWN0aW9uID0gdHJhbnNmb3JtKHRyYW5zYWN0aW9uLCBiZWZvcmUpID8/IHRyYW5zYWN0aW9uXHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5tYXhMZW5ndGggIT09IG51bGwgJiYgdHJhbnNhY3Rpb24uZG9jQ2hhbmdlZCkge1xyXG4gICAgICBjb25zdCBuZXh0ID0gY2hhcmFjdGVyQ291bnQodHJhbnNhY3Rpb24uZG9jKVxyXG4gICAgICBpZiAobmV4dCA+IHRoaXMubWF4TGVuZ3RoICYmIG5leHQgPiBjaGFyYWN0ZXJDb3VudChiZWZvcmUuZG9jKSkgcmV0dXJuXHJcbiAgICB9XHJcbiAgICB0aGlzLmhpc3RvcnkucmVjb3JkKHRyYW5zYWN0aW9uLCBiZWZvcmUuc2VsZWN0aW9uKVxyXG4gICAgdGhpcy5zdGF0ZSA9IGJlZm9yZS5hcHBseSh0cmFuc2FjdGlvbilcclxuICAgIHRoaXMuc25hcHNob3RDYWNoZSA9IG51bGxcclxuICAgIHRoaXMuZW1pdCgndHJhbnNhY3Rpb24nKVxyXG4gICAgZm9yIChjb25zdCBsaXN0ZW5lciBvZiBbLi4udGhpcy50eExpc3RlbmVyc10pIHtcclxuICAgICAgbGlzdGVuZXIoeyBlZGl0b3I6IHRoaXMsIHRyYW5zYWN0aW9uLCBiZWZvcmUsIHN0YXRlOiB0aGlzLnN0YXRlIH0pXHJcbiAgICB9XHJcbiAgICBpZiAodHJhbnNhY3Rpb24uZG9jQ2hhbmdlZCkge1xyXG4gICAgICB0aGlzLmVtaXQoJ3VwZGF0ZScpXHJcbiAgICAgIHRoaXMub25DaGFuZ2U/Lih7IGVkaXRvcjogdGhpcywganNvbjogdGhpcy5nZXRKU09OKCksIGh0bWw6IHRoaXMuZ2V0SFRNTCgpIH0pXHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMuc3RhdGUuc2VsZWN0aW9uLmVxKGJlZm9yZS5zZWxlY3Rpb24pKSB0aGlzLmVtaXQoJ3NlbGVjdGlvblVwZGF0ZScpXHJcbiAgfVxyXG5cclxuICAvKiogTGlzdGVuIHRvIGFwcGxpZWQgdHJhbnNhY3Rpb25zIHdpdGggdGhlaXIgYmVmb3JlL2FmdGVyIHN0YXRlcy4gKi9cclxuICBvblRyYW5zYWN0aW9uKGxpc3RlbmVyOiAoZXZlbnQ6IFRyYW5zYWN0aW9uRXZlbnQpID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcclxuICAgIHRoaXMudHhMaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKVxyXG4gICAgcmV0dXJuICgpID0+IHRoaXMudHhMaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKVxyXG4gIH1cclxuXHJcbiAgLyoqIFJlZ2lzdGVyIGEgdHJhbnNmb3JtIHRoYXQgY2FuIHJld3JpdGUgdHJhbnNhY3Rpb25zIGJlZm9yZSB0aGV5IGFwcGx5LiAqL1xyXG4gIGFkZERpc3BhdGNoVHJhbnNmb3JtKHRyYW5zZm9ybTogRGlzcGF0Y2hUcmFuc2Zvcm0pOiAoKSA9PiB2b2lkIHtcclxuICAgIHRoaXMudHJhbnNmb3Jtcy5wdXNoKHRyYW5zZm9ybSlcclxuICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgIHRoaXMudHJhbnNmb3JtcyA9IHRoaXMudHJhbnNmb3Jtcy5maWx0ZXIoKGVudHJ5KSA9PiBlbnRyeSAhPT0gdHJhbnNmb3JtKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqIFN0YXJ0IGEgY2hhaW5lZCBjb21tYW5kIHNlcXVlbmNlOiBgZWRpdG9yLmNoYWluKCkuZm9jdXMoKS5zZXRIZWFkaW5nKDIpLnJ1bigpYC4gKi9cclxuICBjaGFpbigpOiBDaGFpbiB7XHJcbiAgICByZXR1cm4gbmV3IENoYWluKHRoaXMpXHJcbiAgfVxyXG5cclxuICB1bmRvKCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgdHIgPSB0aGlzLmhpc3RvcnkudW5kbyh0aGlzLnN0YXRlKVxyXG4gICAgaWYgKCF0cikgcmV0dXJuIGZhbHNlXHJcbiAgICB0aGlzLmRpc3BhdGNoKHRyKVxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcblxyXG4gIHJlZG8oKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCB0ciA9IHRoaXMuaGlzdG9yeS5yZWRvKHRoaXMuc3RhdGUpXHJcbiAgICBpZiAoIXRyKSByZXR1cm4gZmFsc2VcclxuICAgIHRoaXMuZGlzcGF0Y2godHIpXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgZ2V0IGNhblVuZG8oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5oaXN0b3J5LmNhblVuZG9cclxuICB9XHJcblxyXG4gIGdldCBjYW5SZWRvKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuaGlzdG9yeS5jYW5SZWRvXHJcbiAgfVxyXG5cclxuICAvKiogVGhlIHVuZG8gYW5kIHJlZG8gc3RhY2tzIGFzIGEgaGlzdG9yeSBwYW5lbCBsaXN0cyB0aGVtLiAqL1xyXG4gIGhpc3RvcnlFbnRyaWVzKCk6IHtcclxuICAgIHJlYWRvbmx5IHVuZG86IHJlYWRvbmx5IEhpc3RvcnlFbnRyeVtdXHJcbiAgICByZWFkb25seSByZWRvOiByZWFkb25seSBIaXN0b3J5RW50cnlbXVxyXG4gIH0ge1xyXG4gICAgcmV0dXJuIHsgdW5kbzogdGhpcy5oaXN0b3J5LnVuZG9FbnRyaWVzLCByZWRvOiB0aGlzLmhpc3RvcnkucmVkb0VudHJpZXMgfVxyXG4gIH1cclxuXHJcbiAgLyoqIEZvcmdldCBldmVyeSB1bmRvIGFuZCByZWRvIGdyb3VwLiAqL1xyXG4gIGNsZWFySGlzdG9yeSgpOiB2b2lkIHtcclxuICAgIHRoaXMuaGlzdG9yeS5jbGVhcigpXHJcbiAgICB0aGlzLnNuYXBzaG90Q2FjaGUgPSBudWxsXHJcbiAgICB0aGlzLmVtaXQoJ3RyYW5zYWN0aW9uJylcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlcGxhY2UgdGhlIHdob2xlIGRvY3VtZW50OiBsb2FkaW5nIGEgc2F2ZWQgZmlsZSwgc3dpdGNoaW5nIGRvY3VtZW50cyxcclxuICAgKiByZXN0b3JpbmcgYSBkcmFmdC4gVGhhdCBpcyBub3QgYW4gZWRpdCBvZiB0aGUgY3VycmVudCB0ZXh0LCBzbyBieSBkZWZhdWx0XHJcbiAgICogdGhlIGNoYW5nZSBzdGF5cyBvdXQgb2YgdGhlIHVuZG8gaGlzdG9yeSBhbmQgdGhlIGhpc3RvcnkgaXMgY2xlYXJlZDtcclxuICAgKiBwYXNzIGBhZGRUb0hpc3Rvcnk6IHRydWVgIHRvIG1ha2UgdGhlIHJlcGxhY2VtZW50IHVuZG9hYmxlIGluc3RlYWQuXHJcbiAgICovXHJcbiAgc2V0Q29udGVudChjb250ZW50OiBEb2NKU09OIHwgRWRpdG9yTm9kZSwgb3B0aW9uczogU2V0Q29udGVudE9wdGlvbnMgPSB7fSk6IHZvaWQge1xyXG4gICAgaWYgKHRoaXMuZGVzdHJveWVkKSByZXR1cm5cclxuICAgIGNvbnN0IGRvYyA9IG5vcm1hbGl6ZURvYyhcclxuICAgICAgY29udGVudCBpbnN0YW5jZW9mIEVkaXRvck5vZGUgPyBjb250ZW50IDogbm9kZUZyb21KU09OKHRoaXMuc2NoZW1hLCBjb250ZW50KSxcclxuICAgIClcclxuICAgIGNvbnN0IHRyID0gdGhpcy5zdGF0ZS50clxyXG4gICAgdHIuc3RlcChuZXcgUmVwbGFjZU5vZGVzU3RlcChbXSwgMCwgdGhpcy5zdGF0ZS5kb2MuY2hpbGRDb3VudCwgZG9jLmNvbnRlbnQpKVxyXG4gICAgdHIuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbk5lYXIodHIuZG9jLCBwb3MoWzBdLCAwKSkpXHJcbiAgICBpZiAob3B0aW9ucy5hZGRUb0hpc3RvcnkgIT09IHRydWUpIHRyLnNldE1ldGEoQUREX1RPX0hJU1RPUlksIGZhbHNlKVxyXG4gICAgdGhpcy5kaXNwYXRjaCh0cilcclxuICAgIGlmIChvcHRpb25zLmFkZFRvSGlzdG9yeSAhPT0gdHJ1ZSkgdGhpcy5oaXN0b3J5LmNsZWFyKClcclxuICB9XHJcblxyXG4gIGdldEpTT04oKTogRG9jSlNPTiB7XHJcbiAgICByZXR1cm4gdGhpcy5zdGF0ZS5kb2MudG9KU09OKClcclxuICB9XHJcblxyXG4gIGdldEhUTUwoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiBzZXJpYWxpemVUb0hUTUwodGhpcy5zdGF0ZS5kb2MpXHJcbiAgfVxyXG5cclxuICBnZXRUZXh0KCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gc2VyaWFsaXplVG9UZXh0KHRoaXMuc3RhdGUuZG9jKVxyXG4gIH1cclxuXHJcbiAgZ2V0Q2hhcmFjdGVyQ291bnQoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBjaGFyYWN0ZXJDb3VudCh0aGlzLnN0YXRlLmRvYylcclxuICB9XHJcblxyXG4gIGdldFdvcmRDb3VudCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIHdvcmRDb3VudCh0aGlzLnN0YXRlLmRvYylcclxuICB9XHJcblxyXG4gIGdldFNlbnRlbmNlQ291bnQoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBzZW50ZW5jZUNvdW50KHRoaXMuc3RhdGUuZG9jKVxyXG4gIH1cclxuXHJcbiAgZ2V0UGFyYWdyYXBoQ291bnQoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBwYXJhZ3JhcGhDb3VudCh0aGlzLnN0YXRlLmRvYylcclxuICB9XHJcblxyXG4gIC8qKiBUb2dnbGUgcmVhZC1vbmx5IG1vZGUgb24gdGhlIGF0dGFjaGVkIHZpZXcuICovXHJcbiAgc2V0RWRpdGFibGUoZWRpdGFibGU6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIHRoaXMudmlldz8uc2V0RWRpdGFibGUoZWRpdGFibGUpXHJcbiAgfVxyXG5cclxuICAvKiogVHVybiB0aGUgYnJvd3NlcidzIHNwZWxsIGNoZWNraW5nIG9mIHRoZSBlZGl0aW5nIHN1cmZhY2Ugb24gb3Igb2ZmLiAqL1xyXG4gIHNldFNwZWxsY2hlY2soZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgdGhpcy52aWV3Py5zZXRTcGVsbGNoZWNrKGVuYWJsZWQpXHJcbiAgfVxyXG5cclxuICBnZXQgaXNFZGl0YWJsZSgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnZpZXc/LmlzRWRpdGFibGUgPz8gdHJ1ZVxyXG4gIH1cclxuXHJcbiAgaXNBY3RpdmUobWFya05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIGlzTWFya0FjdGl2ZSh0aGlzLnN0YXRlLCBtYXJrTmFtZSlcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFRvb2xiYXItZmFjaW5nIHNuYXBzaG90LlxyXG4gICAqXHJcbiAgICogUmVmZXJlbmNlLXN0YWJsZSB3aGlsZSBpdHMgKmNvbnRlbnRzKiBhcmUgdW5jaGFuZ2VkLCBub3QgbWVyZWx5IGJldHdlZW5cclxuICAgKiB0cmFuc2FjdGlvbnMsIHNvIHR5cGluZyBhIGNoYXJhY3RlciByZXR1cm5zIHRoZSB2ZXJ5IHNhbWUgb2JqZWN0LCBhbmQgYVxyXG4gICAqIHRvb2xiYXIgc3Vic2NyaWJlZCB0aHJvdWdoIGB1c2VTeW5jRXh0ZXJuYWxTdG9yZWAsIGEgc2lnbmFsIG9yIGEgc3RvcmVcclxuICAgKiBkb2VzIG5vdCByZS1yZW5kZXIgb24gZXZlcnkga2V5c3Ryb2tlLiBJdCBjaGFuZ2VzIGlkZW50aXR5IHdoZW4gc29tZXRoaW5nXHJcbiAgICogYSB0b29sYmFyIHdvdWxkIGFjdHVhbGx5IGRyYXcgZGlmZmVyZW50bHkgY2hhbmdlczogYSBtYXJrLCB0aGUgYmxvY2tcclxuICAgKiB0eXBlLCB3aGV0aGVyIHVuZG8gaXMgYXZhaWxhYmxlLlxyXG4gICAqXHJcbiAgICogU3Vic2NyaWJlcnMgYXJlIHN0aWxsIG5vdGlmaWVkIHBlciB0cmFuc2FjdGlvbjsgd2hhdCB0aGlzIGRlY2lkZXMgaXNcclxuICAgKiB3aGV0aGVyIHRoZXkgaGF2ZSBhbnl0aGluZyBuZXcgdG8gbG9vayBhdC5cclxuICAgKi9cclxuICBnZXRTbmFwc2hvdCgpOiBFZGl0b3JTbmFwc2hvdCB7XHJcbiAgICBpZiAodGhpcy5zbmFwc2hvdENhY2hlKSByZXR1cm4gdGhpcy5zbmFwc2hvdENhY2hlXHJcbiAgICBjb25zdCBzZWxlY3Rpb246IFNlbGVjdGlvbiA9IHRoaXMuc3RhdGUuc2VsZWN0aW9uXHJcbiAgICBsZXQgYmxvY2sgPSBub2RlQXRQYXRoKHRoaXMuc3RhdGUuZG9jLCBzZWxlY3Rpb24uZnJvbS5wYXRoKVxyXG4gICAgaWYgKGJsb2NrICYmICFibG9jay5pc1RleHRibG9jaykge1xyXG4gICAgICAvLyBEb2MtbGV2ZWwgc2VsZWN0aW9uOiBkZXNjcmliZSB0aGUgZmlyc3QgY292ZXJlZCBjaGlsZCBpbnN0ZWFkLlxyXG4gICAgICBibG9jayA9IGJsb2NrLmNvbnRlbnQubWF5YmVDaGlsZChzZWxlY3Rpb24uZnJvbS5vZmZzZXQpID8/IGJsb2NrXHJcbiAgICB9XHJcbiAgICBjb25zdCB0ZXh0YmxvY2sgPSBibG9jaz8uaXNUZXh0YmxvY2sgPyBibG9jayA6IG51bGxcclxuICAgIGNvbnN0IGFjdGl2ZU1hcmtzID0gT2JqZWN0LmtleXModGhpcy5zdGF0ZS5zY2hlbWEubWFya3MpLmZpbHRlcigobmFtZSkgPT5cclxuICAgICAgaXNNYXJrQWN0aXZlKHRoaXMuc3RhdGUsIG5hbWUpLFxyXG4gICAgKVxyXG4gICAgY29uc3QgbWFya0F0dHJzOiBSZWNvcmQ8c3RyaW5nLCBBdHRycz4gPSB7fVxyXG4gICAgZm9yIChjb25zdCBuYW1lIG9mIGFjdGl2ZU1hcmtzKSB7XHJcbiAgICAgIGNvbnN0IGF0dHJzID0gYWN0aXZlTWFya0F0dHJzKHRoaXMuc3RhdGUsIG5hbWUpXHJcbiAgICAgIGlmIChhdHRycykgbWFya0F0dHJzW25hbWVdID0gYXR0cnNcclxuICAgIH1cclxuICAgIGNvbnN0IGluZGVudCA9IHRleHRibG9jaz8uYXR0cnMuaW5kZW50XHJcbiAgICBjb25zdCBuZXh0OiBFZGl0b3JTbmFwc2hvdCA9IHtcclxuICAgICAgYWN0aXZlTWFya3MsXHJcbiAgICAgIG1hcmtBdHRycyxcclxuICAgICAgYmxvY2tUeXBlOiB0ZXh0YmxvY2s/LnR5cGUubmFtZSA/PyBudWxsLFxyXG4gICAgICBibG9ja0F0dHJzOiB0ZXh0YmxvY2s/LmF0dHJzID8/IG51bGwsXHJcbiAgICAgIGxpc3RUeXBlOiBlbmNsb3NpbmdMaXN0VHlwZSh0aGlzLnN0YXRlLmRvYywgc2VsZWN0aW9uLmZyb20ucGF0aCksXHJcbiAgICAgIGFsaWduOiB0eXBlb2YgdGV4dGJsb2NrPy5hdHRycy5hbGlnbiA9PT0gJ3N0cmluZycgPyB0ZXh0YmxvY2suYXR0cnMuYWxpZ24gOiBudWxsLFxyXG4gICAgICBpbmRlbnQ6IHR5cGVvZiBpbmRlbnQgPT09ICdudW1iZXInID8gaW5kZW50IDogMCxcclxuICAgICAgY2FuVW5kbzogdGhpcy5jYW5VbmRvLFxyXG4gICAgICBjYW5SZWRvOiB0aGlzLmNhblJlZG8sXHJcbiAgICAgIHNlbGVjdGlvbkVtcHR5OiBzZWxlY3Rpb24uZW1wdHksXHJcbiAgICB9XHJcbiAgICAvLyBIYW5kIGJhY2sgdGhlIHByZXZpb3VzIG9iamVjdCB3aGVuIG5vdGhpbmcgYSB0b29sYmFyIGRyYXdzIGhhcyBjaGFuZ2VkLlxyXG4gICAgLy8gVGhlIGNvbXBhcmlzb24gY29zdHMgYSBoYW5kZnVsIG9mIHNjYWxhciBjaGVja3M7IHRoZSBhbHRlcm5hdGl2ZSBjb3N0c1xyXG4gICAgLy8gYSByZS1yZW5kZXIgb2YgZXZlcnkgc3Vic2NyaWJlciwgb24gZXZlcnkga2V5c3Ryb2tlLlxyXG4gICAgY29uc3QgcmV1c2FibGUgPSB0aGlzLmxhc3RTbmFwc2hvdCAmJiBzbmFwc2hvdHNFcXVhbCh0aGlzLmxhc3RTbmFwc2hvdCwgbmV4dClcclxuICAgIHRoaXMuc25hcHNob3RDYWNoZSA9IHJldXNhYmxlID8gKHRoaXMubGFzdFNuYXBzaG90IGFzIEVkaXRvclNuYXBzaG90KSA6IG5leHRcclxuICAgIHRoaXMubGFzdFNuYXBzaG90ID0gdGhpcy5zbmFwc2hvdENhY2hlXHJcbiAgICByZXR1cm4gdGhpcy5zbmFwc2hvdENhY2hlXHJcbiAgfVxyXG5cclxuICAvKiogU3Vic2NyaWJlIHRvIHN0YXRlIGNoYW5nZXMgKHRoZSBjb250cmFjdCBleHRlcm5hbCBzdG9yZXMgZXhwZWN0KS4gKi9cclxuICBzdWJzY3JpYmUobGlzdGVuZXI6ICgpID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcclxuICAgIHJldHVybiB0aGlzLm9uKCd0cmFuc2FjdGlvbicsIGxpc3RlbmVyKVxyXG4gIH1cclxuXHJcbiAgb24oZXZlbnQ6IEVkaXRvckV2ZW50LCBsaXN0ZW5lcjogKCkgPT4gdm9pZCk6ICgpID0+IHZvaWQge1xyXG4gICAgbGV0IHNldCA9IHRoaXMubGlzdGVuZXJzLmdldChldmVudClcclxuICAgIGlmICghc2V0KSB7XHJcbiAgICAgIHNldCA9IG5ldyBTZXQoKVxyXG4gICAgICB0aGlzLmxpc3RlbmVycy5zZXQoZXZlbnQsIHNldClcclxuICAgIH1cclxuICAgIHNldC5hZGQobGlzdGVuZXIpXHJcbiAgICByZXR1cm4gKCkgPT4gc2V0LmRlbGV0ZShsaXN0ZW5lcilcclxuICB9XHJcblxyXG4gIGRlc3Ryb3koKTogdm9pZCB7XHJcbiAgICB0aGlzLnZpZXc/LmRlc3Ryb3koKVxyXG4gICAgdGhpcy52aWV3ID0gbnVsbFxyXG4gICAgdGhpcy5kZXN0cm95ZWQgPSB0cnVlXHJcbiAgICB0aGlzLmxpc3RlbmVycy5jbGVhcigpXHJcbiAgICB0aGlzLnR4TGlzdGVuZXJzLmNsZWFyKClcclxuICAgIHRoaXMudHJhbnNmb3JtcyA9IFtdXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGVtaXQoZXZlbnQ6IEVkaXRvckV2ZW50KTogdm9pZCB7XHJcbiAgICBmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIHRoaXMubGlzdGVuZXJzLmdldChldmVudCkgPz8gW10pIGxpc3RlbmVyKClcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBOYW1lIG9mIHRoZSBsaXN0IHR5cGUgd3JhcHBpbmcgYSBibG9jaywgaWYgYW55LiBUaGUgYmxvY2sgaXRzZWxmIGlzIGFcclxuICogdGV4dGJsb2NrIGluc2lkZSBhIGBsaXN0SXRlbWAsIHNvIHRoZSBsaXN0IGlzIHR3byBsZXZlbHMgdXAuXHJcbiAqL1xyXG5mdW5jdGlvbiBlbmNsb3NpbmdMaXN0VHlwZShkb2M6IEVkaXRvck5vZGUsIHBhdGg6IFBhdGgpOiBzdHJpbmcgfCBudWxsIHtcclxuICBpZiAocGF0aC5sZW5ndGggPCAzKSByZXR1cm4gbnVsbFxyXG4gIGNvbnN0IGl0ZW0gPSBub2RlQXRQYXRoKGRvYywgcGF0aC5zbGljZSgwLCAtMSkpXHJcbiAgaWYgKGl0ZW0/LnR5cGUubmFtZSAhPT0gJ2xpc3RJdGVtJyAmJiBpdGVtPy50eXBlLm5hbWUgIT09ICd0YXNrSXRlbScpIHJldHVybiBudWxsXHJcbiAgcmV0dXJuIG5vZGVBdFBhdGgoZG9jLCBwYXRoLnNsaWNlKDAsIC0yKSk/LnR5cGUubmFtZSA/PyBudWxsXHJcbn1cclxuXHJcbi8qKiBBdHRyaWJ1dGVzIG9mIHRoZSBmaXJzdCBtYXJrIG9mIGBuYW1lYCBjb3ZlcmluZyB0aGUgc2VsZWN0aW9uLCBpZiBhbnkuICovXHJcbmZ1bmN0aW9uIGFjdGl2ZU1hcmtBdHRycyhzdGF0ZTogRWRpdG9yU3RhdGUsIG5hbWU6IHN0cmluZyk6IEF0dHJzIHwgbnVsbCB7XHJcbiAgY29uc3QgdHlwZSA9IHN0YXRlLnNjaGVtYS5tYXJrc1tuYW1lXVxyXG4gIGlmICghdHlwZSkgcmV0dXJuIG51bGxcclxuICBjb25zdCBzZWxlY3Rpb24gPSBzdGF0ZS5zZWxlY3Rpb25cclxuICBpZiAoc2VsZWN0aW9uLmVtcHR5ICYmIHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRleHRTZWxlY3Rpb24pIHtcclxuICAgIGNvbnN0IGJsb2NrID0gbm9kZUF0UGF0aChzdGF0ZS5kb2MsIHNlbGVjdGlvbi5oZWFkLnBhdGgpXHJcbiAgICBjb25zdCBtYXJrcyA9XHJcbiAgICAgIHN0YXRlLnN0b3JlZE1hcmtzID8/XHJcbiAgICAgIChibG9jaz8uaXNUZXh0YmxvY2sgPyBtYXJrc0F0SW5saW5lT2Zmc2V0KGJsb2NrLmNvbnRlbnQsIHNlbGVjdGlvbi5oZWFkLm9mZnNldCkgOiBbXSlcclxuICAgIHJldHVybiBtYXJrcy5maW5kKChtYXJrKSA9PiBtYXJrLnR5cGUgPT09IHR5cGUpPy5hdHRycyA/PyBudWxsXHJcbiAgfVxyXG4gIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzSW5SYW5nZShzdGF0ZS5kb2MsIHNlbGVjdGlvbi5mcm9tLCBzZWxlY3Rpb24udG8pKSB7XHJcbiAgICBpZiAoYmxvY2suZnJvbSA+PSBibG9jay50bykgY29udGludWVcclxuICAgIGNvbnN0IFtyYW5nZV0gPSByYW5nZXNXaXRoTWFyayhibG9jay5ub2RlLmNvbnRlbnQsIGJsb2NrLmZyb20sIGJsb2NrLnRvLCB0eXBlKVxyXG4gICAgaWYgKHJhbmdlKSByZXR1cm4gcmFuZ2UubWFyay5hdHRyc1xyXG4gIH1cclxuICByZXR1cm4gbnVsbFxyXG59XHJcblxyXG4vKiogQm91bmQsIGJvb2xlYW4tcmV0dXJuaW5nIHZlcnNpb25zIG9mIHRoZSBwdXJlIGNvbW1hbmRzLiAqL1xyXG4vKiogV2hldGhlciB0d28gc25hcHNob3RzIHdvdWxkIG1ha2UgYSB0b29sYmFyIGRyYXcgdGhlIHNhbWUgdGhpbmcuICovXHJcbmZ1bmN0aW9uIHNuYXBzaG90c0VxdWFsKGE6IEVkaXRvclNuYXBzaG90LCBiOiBFZGl0b3JTbmFwc2hvdCk6IGJvb2xlYW4ge1xyXG4gIHJldHVybiAoXHJcbiAgICBhLmJsb2NrVHlwZSA9PT0gYi5ibG9ja1R5cGUgJiZcclxuICAgIGEubGlzdFR5cGUgPT09IGIubGlzdFR5cGUgJiZcclxuICAgIGEuYWxpZ24gPT09IGIuYWxpZ24gJiZcclxuICAgIGEuaW5kZW50ID09PSBiLmluZGVudCAmJlxyXG4gICAgYS5jYW5VbmRvID09PSBiLmNhblVuZG8gJiZcclxuICAgIGEuY2FuUmVkbyA9PT0gYi5jYW5SZWRvICYmXHJcbiAgICBhLnNlbGVjdGlvbkVtcHR5ID09PSBiLnNlbGVjdGlvbkVtcHR5ICYmXHJcbiAgICBzYW1lU3RyaW5ncyhhLmFjdGl2ZU1hcmtzLCBiLmFjdGl2ZU1hcmtzKSAmJlxyXG4gICAgc2FtZUF0dHJzKGEuYmxvY2tBdHRycywgYi5ibG9ja0F0dHJzKSAmJlxyXG4gICAgc2FtZUF0dHJNYXAoYS5tYXJrQXR0cnMsIGIubWFya0F0dHJzKVxyXG4gIClcclxufVxyXG5cclxuZnVuY3Rpb24gc2FtZVN0cmluZ3MoYTogcmVhZG9ubHkgc3RyaW5nW10sIGI6IHJlYWRvbmx5IHN0cmluZ1tdKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIGEubGVuZ3RoID09PSBiLmxlbmd0aCAmJiBhLmV2ZXJ5KCh2YWx1ZSwgaW5kZXgpID0+IHZhbHVlID09PSBiW2luZGV4XSlcclxufVxyXG5cclxuZnVuY3Rpb24gc2FtZUF0dHJzKGE6IEF0dHJzIHwgbnVsbCwgYjogQXR0cnMgfCBudWxsKTogYm9vbGVhbiB7XHJcbiAgaWYgKGEgPT09IGIpIHJldHVybiB0cnVlXHJcbiAgaWYgKCFhIHx8ICFiKSByZXR1cm4gZmFsc2VcclxuICByZXR1cm4gYXR0cnNFcShhLCBiKVxyXG59XHJcblxyXG5mdW5jdGlvbiBzYW1lQXR0ck1hcChcclxuICBhOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBBdHRycz4+LFxyXG4gIGI6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIEF0dHJzPj4sXHJcbik6IGJvb2xlYW4ge1xyXG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhhKVxyXG4gIGlmIChrZXlzLmxlbmd0aCAhPT0gT2JqZWN0LmtleXMoYikubGVuZ3RoKSByZXR1cm4gZmFsc2VcclxuICByZXR1cm4ga2V5cy5ldmVyeSgoa2V5KSA9PiB7XHJcbiAgICBjb25zdCBvdGhlciA9IGJba2V5XVxyXG4gICAgcmV0dXJuIG90aGVyICE9PSB1bmRlZmluZWQgJiYgYXR0cnNFcShhW2tleV0gYXMgQXR0cnMsIG90aGVyKVxyXG4gIH0pXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBFZGl0b3JDb21tYW5kcyB7XHJcbiAgY29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IEVkaXRvcikge31cclxuXHJcbiAgaW5zZXJ0VGV4dCh0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGluc2VydFRleHQodGV4dCkpXHJcbiAgfVxyXG5cclxuICBkZWxldGVTZWxlY3Rpb24oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhkZWxldGVTZWxlY3Rpb24pXHJcbiAgfVxyXG5cclxuICB0b2dnbGVNYXJrKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWModG9nZ2xlTWFyayhuYW1lLCBhdHRycykpXHJcbiAgfVxyXG5cclxuICAvKiogQXBwbHkgYSBtYXJrIHdpdGggYXR0cmlidXRlcywgcmVwbGFjaW5nIGFueSBleGlzdGluZyBvbmUgb2YgaXRzIHR5cGUuICovXHJcbiAgc2V0TWFyayhuYW1lOiBzdHJpbmcsIGF0dHJzOiBBdHRycyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoc2V0TWFyayhuYW1lLCBhdHRycykpXHJcbiAgfVxyXG5cclxuICB1bnNldE1hcmsobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyh1bnNldE1hcmsobmFtZSkpXHJcbiAgfVxyXG5cclxuICBzZXRGb250RmFtaWx5KGZhbWlseTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zZXRNYXJrKCdmb250RmFtaWx5JywgeyBmYW1pbHkgfSlcclxuICB9XHJcblxyXG4gIHNldEZvbnRTaXplKHNpemU6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuc2V0TWFyaygnZm9udFNpemUnLCB7IHNpemUgfSlcclxuICB9XHJcblxyXG4gIHNldFRleHRDb2xvcihjb2xvcjogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zZXRNYXJrKCd0ZXh0Q29sb3InLCB7IGNvbG9yIH0pXHJcbiAgfVxyXG5cclxuICBzZXRCYWNrZ3JvdW5kQ29sb3IoY29sb3I6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuc2V0TWFyaygnYmFja2dyb3VuZENvbG9yJywgeyBjb2xvciB9KVxyXG4gIH1cclxuXHJcbiAgc2V0TGluayhocmVmOiBzdHJpbmcsIHRpdGxlPzogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zZXRNYXJrKCdsaW5rJywgdGl0bGUgPyB7IGhyZWYsIHRpdGxlIH0gOiB7IGhyZWYgfSlcclxuICB9XHJcblxyXG4gIHVuc2V0TGluaygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnVuc2V0TWFyaygnbGluaycpXHJcbiAgfVxyXG5cclxuICBjbGVhckZvcm1hdHRpbmcoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhjbGVhckZvcm1hdHRpbmcpXHJcbiAgfVxyXG5cclxuICBjbGVhckJsb2NrRm9ybWF0dGluZygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGNsZWFyQmxvY2tGb3JtYXR0aW5nKVxyXG4gIH1cclxuXHJcbiAgY2xlYXJBbGxGb3JtYXR0aW5nKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoY2xlYXJBbGxGb3JtYXR0aW5nKVxyXG4gIH1cclxuXHJcbiAgc2V0VGV4dEFsaWduKGFsaWduOiAnbGVmdCcgfCAnY2VudGVyJyB8ICdyaWdodCcgfCAnanVzdGlmeScgfCBudWxsKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzZXRUZXh0QWxpZ24oYWxpZ24pKVxyXG4gIH1cclxuXHJcbiAgLyoqIExpbmUgaGVpZ2h0IG9uIHRoZSBzZWxlY3RlZCBibG9ja3M7IGEgYmFyZSBudW1iZXIgaXMgYSBtdWx0aXBsaWVyLiAqL1xyXG4gIHNldExpbmVIZWlnaHQodmFsdWU6IHN0cmluZyB8IG51bWJlciB8IG51bGwpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHNldExpbmVIZWlnaHQodmFsdWUpKVxyXG4gIH1cclxuXHJcbiAgLyoqIFNwYWNlIGFib3ZlIGFuZC9vciBiZWxvdyB0aGUgc2VsZWN0ZWQgYmxvY2tzLiAqL1xyXG4gIHNldFBhcmFncmFwaFNwYWNpbmcob3B0czogeyBiZWZvcmU/OiBzdHJpbmcgfCBudWxsOyBhZnRlcj86IHN0cmluZyB8IG51bGwgfSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoc2V0UGFyYWdyYXBoU3BhY2luZyhvcHRzKSlcclxuICB9XHJcblxyXG4gIC8qKiBMZXR0ZXIgc3BhY2luZyBvbiB0aGUgc2VsZWN0aW9uOyBgbnVsbGAgcmVtb3ZlcyBpdC4gKi9cclxuICBzZXRMZXR0ZXJTcGFjaW5nKHNwYWNpbmc6IHN0cmluZyB8IG51bGwpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHNldExldHRlclNwYWNpbmcoc3BhY2luZykpXHJcbiAgfVxyXG5cclxuICB0b2dnbGVTbWFsbENhcHMoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyh0b2dnbGVTbWFsbENhcHMpXHJcbiAgfVxyXG5cclxuICAvKiogUmV3cml0ZSB0aGUgc2VsZWN0ZWQgdGV4dCB0byB1cHBlciwgbG93ZXIgb3IgdGl0bGUgY2FzZS4gKi9cclxuICBjb252ZXJ0Q2FzZShtb2RlOiBDYXNlTW9kZSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoY29udmVydENhc2UobW9kZSkpXHJcbiAgfVxyXG5cclxuICBpbmRlbnQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhpbmRlbnRCbG9ja3MoMSkpXHJcbiAgfVxyXG5cclxuICBvdXRkZW50KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoaW5kZW50QmxvY2tzKC0xKSlcclxuICB9XHJcblxyXG4gIHNldEJsb2NrQXR0cnMoYXR0cnM6IEF0dHJzKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzZXRCbG9ja0F0dHJzKGF0dHJzKSlcclxuICB9XHJcblxyXG4gIHNldEJsb2NrVHlwZShuYW1lOiBzdHJpbmcsIGF0dHJzPzogQXR0cnMpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHNldEJsb2NrVHlwZShuYW1lLCBhdHRycykpXHJcbiAgfVxyXG5cclxuICBzZXRQYXJhZ3JhcGgoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zZXRCbG9ja1R5cGUoJ3BhcmFncmFwaCcpXHJcbiAgfVxyXG5cclxuICBzZXRIZWFkaW5nKGxldmVsOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnNldEJsb2NrVHlwZSgnaGVhZGluZycsIHsgbGV2ZWwgfSlcclxuICB9XHJcblxyXG4gIHNwbGl0QmxvY2soKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzcGxpdEJsb2NrKVxyXG4gIH1cclxuXHJcbiAgam9pbkJhY2t3YXJkKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoam9pbkJhY2t3YXJkKVxyXG4gIH1cclxuXHJcbiAgaW5zZXJ0SGFyZEJyZWFrKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMoaW5zZXJ0SW5saW5lTm9kZSgnaGFyZEJyZWFrJykpXHJcbiAgfVxyXG5cclxuICBpbnNlcnRIb3Jpem9udGFsUnVsZSgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGluc2VydEJsb2NrQWZ0ZXIoJ2hvcml6b250YWxSdWxlJykpXHJcbiAgfVxyXG5cclxuICB3cmFwSW4obmFtZTogc3RyaW5nLCBhdHRycz86IEF0dHJzKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyh3cmFwSW4obmFtZSwgYXR0cnMpKVxyXG4gIH1cclxuXHJcbiAgdG9nZ2xlQnVsbGV0TGlzdCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHRvZ2dsZUxpc3QoJ2J1bGxldExpc3QnKSlcclxuICB9XHJcblxyXG4gIHRvZ2dsZU9yZGVyZWRMaXN0KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWModG9nZ2xlTGlzdCgnb3JkZXJlZExpc3QnKSlcclxuICB9XHJcblxyXG4gIHRvZ2dsZVRhc2tMaXN0KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWModG9nZ2xlVGFza0xpc3QpXHJcbiAgfVxyXG5cclxuICAvKiogRmxpcCB0aGUgZG9uZSBzdGF0ZSBvZiB0aGUgdGFzayBpdGVtIGhvbGRpbmcgdGhlIHNlbGVjdGlvbi4gKi9cclxuICB0b2dnbGVUYXNrQ2hlY2tlZCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHRvZ2dsZVRhc2tDaGVja2VkKVxyXG4gIH1cclxuXHJcbiAgLyoqIFNldCB0aGUgbWFya2VyIHN0eWxlIG9mIHRoZSBsaXN0IGF0IHRoZSBzZWxlY3Rpb247IGBudWxsYCBjbGVhcnMgaXQuICovXHJcbiAgc2V0TGlzdFN0eWxlKHN0eWxlOiBzdHJpbmcgfCBudWxsKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzZXRMaXN0U3R5bGUoc3R5bGUpKVxyXG4gIH1cclxuXHJcbiAgcmVzdGFydE51bWJlcmluZygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHJlc3RhcnROdW1iZXJpbmcpXHJcbiAgfVxyXG5cclxuICBjb250aW51ZU51bWJlcmluZyhzdGFydDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhjb250aW51ZU51bWJlcmluZyhzdGFydCkpXHJcbiAgfVxyXG5cclxuICBjb250aW51ZU51bWJlcmluZ0Zyb21QcmV2aW91cygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKGNvbnRpbnVlTnVtYmVyaW5nRnJvbVByZXZpb3VzKVxyXG4gIH1cclxuXHJcbiAgc3BsaXRMaXN0SXRlbSgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHNwbGl0TGlzdEl0ZW0pXHJcbiAgfVxyXG5cclxuICBzaW5rTGlzdEl0ZW0oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhzaW5rTGlzdEl0ZW0pXHJcbiAgfVxyXG5cclxuICBsaWZ0TGlzdEl0ZW0oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IuZXhlYyhsaWZ0TGlzdEl0ZW0pXHJcbiAgfVxyXG5cclxuICBzZXRDb2RlQmxvY2soKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5zZXRCbG9ja1R5cGUoJ2NvZGVCbG9jaycpXHJcbiAgfVxyXG5cclxuICBsaWZ0KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLmV4ZWMobGlmdClcclxuICB9XHJcblxyXG4gIHNlbGVjdEFsbCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmVkaXRvci5leGVjKHNlbGVjdEFsbClcclxuICB9XHJcblxyXG4gIHVuZG8oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5lZGl0b3IudW5kbygpXHJcbiAgfVxyXG5cclxuICByZWRvKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZWRpdG9yLnJlZG8oKVxyXG4gIH1cclxufVxyXG5cclxuLyoqIFF1ZXVlZCBjb21tYW5kIGNoYWluaW5nLiBgcnVuKClgIGV4ZWN1dGVzIGluIG9yZGVyLCByZXBvcnRzIG92ZXJhbGwgc3VjY2Vzcy4gKi9cclxuZXhwb3J0IGNsYXNzIENoYWluIHtcclxuICBwcml2YXRlIHJlYWRvbmx5IHF1ZXVlOiAoKCkgPT4gYm9vbGVhbilbXSA9IFtdXHJcblxyXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBFZGl0b3IpIHt9XHJcblxyXG4gIC8qKiBGb2N1cyB0aGUgYXR0YWNoZWQgdmlldyAobm8tb3AgZm9yIGhlYWRsZXNzIGVkaXRvcnMpLiAqL1xyXG4gIGZvY3VzKCk6IHRoaXMge1xyXG4gICAgdGhpcy5xdWV1ZS5wdXNoKCgpID0+IHtcclxuICAgICAgdGhpcy5lZGl0b3Iudmlldz8uZm9jdXMoKVxyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBjb21tYW5kKGNvbW1hbmQ6IENvbW1hbmQpOiB0aGlzIHtcclxuICAgIHRoaXMucXVldWUucHVzaCgoKSA9PiB0aGlzLmVkaXRvci5leGVjKGNvbW1hbmQpKVxyXG4gICAgcmV0dXJuIHRoaXNcclxuICB9XHJcblxyXG4gIGluc2VydFRleHQodGV4dDogc3RyaW5nKTogdGhpcyB7XHJcbiAgICB0aGlzLnF1ZXVlLnB1c2goKCkgPT4gdGhpcy5lZGl0b3IuY29tbWFuZHMuaW5zZXJ0VGV4dCh0ZXh0KSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICB0b2dnbGVNYXJrKG5hbWU6IHN0cmluZywgYXR0cnM/OiBBdHRycyk6IHRoaXMge1xyXG4gICAgdGhpcy5xdWV1ZS5wdXNoKCgpID0+IHRoaXMuZWRpdG9yLmNvbW1hbmRzLnRvZ2dsZU1hcmsobmFtZSwgYXR0cnMpKVxyXG4gICAgcmV0dXJuIHRoaXNcclxuICB9XHJcblxyXG4gIHNldEJsb2NrVHlwZShuYW1lOiBzdHJpbmcsIGF0dHJzPzogQXR0cnMpOiB0aGlzIHtcclxuICAgIHRoaXMucXVldWUucHVzaCgoKSA9PiB0aGlzLmVkaXRvci5jb21tYW5kcy5zZXRCbG9ja1R5cGUobmFtZSwgYXR0cnMpKVxyXG4gICAgcmV0dXJuIHRoaXNcclxuICB9XHJcblxyXG4gIHNldEhlYWRpbmcobGV2ZWw6IG51bWJlcik6IHRoaXMge1xyXG4gICAgdGhpcy5xdWV1ZS5wdXNoKCgpID0+IHRoaXMuZWRpdG9yLmNvbW1hbmRzLnNldEhlYWRpbmcobGV2ZWwpKVxyXG4gICAgcmV0dXJuIHRoaXNcclxuICB9XHJcblxyXG4gIHNldFBhcmFncmFwaCgpOiB0aGlzIHtcclxuICAgIHRoaXMucXVldWUucHVzaCgoKSA9PiB0aGlzLmVkaXRvci5jb21tYW5kcy5zZXRQYXJhZ3JhcGgoKSlcclxuICAgIHJldHVybiB0aGlzXHJcbiAgfVxyXG5cclxuICBydW4oKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5xdWV1ZS5yZWR1Y2UoKG9rLCBzdGVwKSA9PiBzdGVwKCkgJiYgb2ssIHRydWUpXHJcbiAgfVxyXG59XHJcblxyXG4vKiogQ3JlYXRlIGFuIGVkaXRvcjsgb21pdCBgZWxlbWVudGAgZm9yIGEgaGVhZGxlc3Mgb25lLiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRWRpdG9yKG9wdGlvbnM6IEVkaXRvck9wdGlvbnMpOiBFZGl0b3Ige1xyXG4gIHJldHVybiBuZXcgRWRpdG9yKG9wdGlvbnMpXHJcbn1cclxuIiwgImltcG9ydCB7XHJcbiAgQUREX1RPX0hJU1RPUlksXHJcbiAgQWRkTWFya1N0ZXAsXHJcbiAgdHlwZSBEaXNwYXRjaFRyYW5zZm9ybSxcclxuICB0eXBlIEVkaXRvcixcclxuICB0eXBlIEVkaXRvck5vZGUsXHJcbiAgRnJhZ21lbnQsXHJcbiAgdHlwZSBNYXJrLFxyXG4gIHR5cGUgTWFya1NwZWMsXHJcbiAgdHlwZSBNYXJrVHlwZSxcclxuICB0eXBlIFBhdGgsXHJcbiAgdHlwZSBQb3NpdGlvbixcclxuICBSZW1vdmVNYXJrU3RlcCxcclxuICBSZXBsYWNlSW5saW5lU3RlcCxcclxuICB0eXBlIFRleHROb2RlLFxyXG4gIFRleHRTZWxlY3Rpb24sXHJcbiAgdHlwZSBUcmFuc2FjdGlvbixcclxuICBpbmxpbmVMZW5ndGgsXHJcbiAgaW5saW5lU2l6ZSxcclxuICBub2RlQXRQYXRoLFxyXG4gIHBhdGhzRXF1YWwsXHJcbiAgcG9zLFxyXG4gIHJhbmdlc1dpdGhNYXJrLFxyXG4gIHRleHRibG9ja3MsXHJcbn0gZnJvbSAnQHRyZXZpeGFsL2NvcmUnXHJcblxyXG4vKiogTWV0YSBrZXkgbWFya2luZyB0cmFuc2FjdGlvbnMgdGhlIHRyYW5zZm9ybSBtdXN0IG5vdCByZXdyaXRlLiAqL1xyXG5leHBvcnQgY29uc3QgVFJBQ0tfQ0hBTkdFU19NRVRBID0gJ3RyYWNrQ2hhbmdlcyQnXHJcblxyXG4vKipcclxuICogVGhlIGBpbnNlcnRpb25gIC8gYGRlbGV0aW9uYCBtYXJrIHNwZWNzLiBNZXJnZSBpbnRvIHlvdXIgc2NoZW1hOlxyXG4gKiBgbWFya3M6IHsgLi4uZGVmYXVsdE1hcmtzKCksIC4uLnRyYWNrQ2hhbmdlc01hcmtzKCkgfWAuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdHJhY2tDaGFuZ2VzTWFya3MoKTogUmVjb3JkPHN0cmluZywgTWFya1NwZWM+IHtcclxuICBjb25zdCBhdHRycyA9IHsgYXV0aG9yOiB7IGRlZmF1bHQ6ICcnIH0sIHRpbWVzdGFtcDogeyBkZWZhdWx0OiAwIH0gfVxyXG4gIGNvbnN0IGh0bWxBdHRycyA9IChtYXJrOiBNYXJrLCBjbGFzc05hbWU6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPT4gKHtcclxuICAgIGNsYXNzOiBjbGFzc05hbWUsXHJcbiAgICAnZGF0YS10cmV2aXhhbC1hdXRob3InOiBTdHJpbmcobWFyay5hdHRycy5hdXRob3IgPz8gJycpLFxyXG4gICAgJ2RhdGEtdHJldml4YWwtdGltZXN0YW1wJzogU3RyaW5nKE51bWJlcihtYXJrLmF0dHJzLnRpbWVzdGFtcCA/PyAwKSB8fCAwKSxcclxuICB9KVxyXG4gIGNvbnN0IHBhcnNlZEF0dHJzID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA9PiAoe1xyXG4gICAgYXV0aG9yOiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS10cmV2aXhhbC1hdXRob3InKSA/PyAnJyxcclxuICAgIHRpbWVzdGFtcDogTnVtYmVyKGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLXRyZXZpeGFsLXRpbWVzdGFtcCcpID8/ICcwJykgfHwgMCxcclxuICB9KVxyXG4gIHJldHVybiB7XHJcbiAgICBpbnNlcnRpb246IHtcclxuICAgICAgYXR0cnMsXHJcbiAgICAgIGV4Y2x1ZGVzOiAnZGVsZXRpb24nLFxyXG4gICAgICB0b0hUTUw6IChtYXJrKSA9PiAoeyB0YWc6ICdpbnMnLCBhdHRyczogaHRtbEF0dHJzKG1hcmssICd0cmV2aXhhbC1pbnNlcnRpb24nKSB9KSxcclxuICAgICAgcGFyc2VIVE1MOiBbeyB0YWc6ICdpbnMnLCBnZXRBdHRyczogcGFyc2VkQXR0cnMgfV0sXHJcbiAgICB9LFxyXG4gICAgZGVsZXRpb246IHtcclxuICAgICAgYXR0cnMsXHJcbiAgICAgIGV4Y2x1ZGVzOiAnaW5zZXJ0aW9uJyxcclxuICAgICAgdG9IVE1MOiAobWFyaykgPT4gKHsgdGFnOiAnZGVsJywgYXR0cnM6IGh0bWxBdHRycyhtYXJrLCAndHJldml4YWwtZGVsZXRpb24nKSB9KSxcclxuICAgICAgLy8gYGRlbGAgaXMgYWxzbyB0aGUgc3RyaWtldGhyb3VnaCBtYXJrJ3MgdGFnIGluIHRoZSBkZWZhdWx0IHNjaGVtYSwgYW5kXHJcbiAgICAgIC8vIHJ1bGVzIHRoYXQgcmVxdWlyZSBhbiBhdHRyaWJ1dGUgYXJlIHRyaWVkIGZpcnN0LCBzbyBhbiBhdHRyaWJ1dGVkXHJcbiAgICAgIC8vIGBkZWxgIHBhcnNlcyBiYWNrIGFzIGEgc3VnZ2VzdGlvbiByYXRoZXIgdGhhbiBhcyBzdHJ1Y2stdGhyb3VnaCB0ZXh0LlxyXG4gICAgICBwYXJzZUhUTUw6IFtcclxuICAgICAgICB7IHRhZzogJ2RlbCcsIGF0dHJpYnV0ZTogJ2RhdGEtdHJldml4YWwtYXV0aG9yJywgZ2V0QXR0cnM6IHBhcnNlZEF0dHJzIH0sXHJcbiAgICAgICAgeyB0YWc6ICdkZWwnLCBnZXRBdHRyczogcGFyc2VkQXR0cnMgfSxcclxuICAgICAgXSxcclxuICAgIH0sXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFN1Z2dlc3Rpb25SYW5nZSB7XHJcbiAgcmVhZG9ubHkgcGF0aDogUGF0aFxyXG4gIHJlYWRvbmx5IGZyb206IG51bWJlclxyXG4gIHJlYWRvbmx5IHRvOiBudW1iZXJcclxuICByZWFkb25seSBraW5kOiAnaW5zZXJ0aW9uJyB8ICdkZWxldGlvbidcclxuICByZWFkb25seSBhdXRob3I6IHN0cmluZ1xyXG4gIHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyXHJcbiAgcmVhZG9ubHkgbWFyazogTWFya1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRyYWNrQ2hhbmdlc09wdGlvbnMge1xyXG4gIC8qKiBBdHRyaWJ1dGVkIGF1dGhvciBmb3IgbmV3IHN1Z2dlc3Rpb25zLiAqL1xyXG4gIHJlYWRvbmx5IGF1dGhvcjogc3RyaW5nXHJcbiAgLyoqIENsb2NrIG92ZXJyaWRlIGZvciBkZXRlcm1pbmlzdGljIHRlc3RzLiAqL1xyXG4gIHJlYWRvbmx5IG5vdz86ICgpID0+IG51bWJlclxyXG59XHJcblxyXG4vKiogVGhlIHR3byBzdWdnZXN0aW9uIG1hcmsgdHlwZXMgb2YgdGhlIGFjdGl2ZSBzY2hlbWEuICovXHJcbmludGVyZmFjZSBTdWdnZXN0aW9uVHlwZXMge1xyXG4gIHJlYWRvbmx5IGluc2VydGlvbjogTWFya1R5cGVcclxuICByZWFkb25seSBkZWxldGlvbjogTWFya1R5cGVcclxufVxyXG5cclxuLyoqIFdoYXQgZGVsZXRpbmcgb25lIHN0cmV0Y2ggb2YgYW4gZWRpdGVkIHJhbmdlIHNob3VsZCBhY3R1YWxseSBkbyB0byBpdC4gKi9cclxudHlwZSBEZWxldGlvbkVmZmVjdCA9ICdyZW1vdmUnIHwgJ2tlZXAnIHwgJ3N0cmlrZSdcclxuXHJcbmludGVyZmFjZSBEZWxldGlvblNlZ21lbnQge1xyXG4gIHJlYWRvbmx5IGZyb206IG51bWJlclxyXG4gIHJlYWRvbmx5IHRvOiBudW1iZXJcclxuICByZWFkb25seSBlZmZlY3Q6IERlbGV0aW9uRWZmZWN0XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEZWxldGluZyBtZWFucyBkaWZmZXJlbnQgdGhpbmdzIHRvIGRpZmZlcmVudCB0ZXh0IG9uY2UgdGhlIHJhbmdlIGFscmVhZHlcclxuICogY2FycmllcyBzdWdnZXN0aW9ucy4gVGV4dCB0aGlzIGF1dGhvciBvbmx5IGp1c3Qgc3VnZ2VzdGVkIG5ldmVyIHJlYWNoZWQgdGhlXHJcbiAqIGRvY3VtZW50LCBzbyB0YWtpbmcgaXQgYmFjayBsZWF2ZXMgbm90aGluZyBiZWhpbmQuIFRleHQgc29tZW9uZSBoYXMgYWxyZWFkeVxyXG4gKiBzdHJ1Y2sgaXMgc3Bva2VuIGZvcjogcmUtbWFya2luZyBpdCB3b3VsZCByZXdyaXRlIHRoYXQgYXV0aG9yJ3MgYXR0cmlidXRpb25cclxuICogYW5kLCBiZWNhdXNlIGEgc3RyaWtlIGhhcyB0byBzdGFydCBzb21ld2hlcmUsIHB1c2ggdGhlIGRlbGV0aW9uIG91dCBwYXN0XHJcbiAqIHdoYXQgd2FzIGFjdHVhbGx5IGRlbGV0ZWQuIEV2ZXJ5dGhpbmcgZWxzZSBpcyBvcmlnaW5hbCB0ZXh0LCB3aGljaCBoYXMgdG9cclxuICogc3Vydml2ZSB1bmRlciBhIGRlbGV0aW9uIG1hcmsgc28gYSByZXZpZXdlciBjYW4gc3RpbGwgcmVzdG9yZSBpdC5cclxuICovXHJcbmZ1bmN0aW9uIGVmZmVjdE9mKG5vZGU6IEVkaXRvck5vZGUsIHR5cGVzOiBTdWdnZXN0aW9uVHlwZXMsIGF1dGhvcjogc3RyaW5nKTogRGVsZXRpb25FZmZlY3Qge1xyXG4gIGlmICghbm9kZS5pc1RleHQpIHJldHVybiAnc3RyaWtlJ1xyXG4gIGNvbnN0IG93biA9IG5vZGUubWFya3Muc29tZShcclxuICAgIChtYXJrKSA9PiBtYXJrLnR5cGUgPT09IHR5cGVzLmluc2VydGlvbiAmJiBtYXJrLmF0dHJzLmF1dGhvciA9PT0gYXV0aG9yLFxyXG4gIClcclxuICBpZiAob3duKSByZXR1cm4gJ3JlbW92ZSdcclxuICByZXR1cm4gbm9kZS5tYXJrcy5zb21lKChtYXJrKSA9PiBtYXJrLnR5cGUgPT09IHR5cGVzLmRlbGV0aW9uKSA/ICdrZWVwJyA6ICdzdHJpa2UnXHJcbn1cclxuXHJcbi8qKiBTcGxpdCBbZnJvbSwgdG8pIGludG8gbWF4aW1hbCBydW5zIHRoYXQgc2hhcmUgb25lIHtAbGluayBEZWxldGlvbkVmZmVjdH0uICovXHJcbmZ1bmN0aW9uIGNsYXNzaWZ5RGVsZXRpb24oXHJcbiAgYmxvY2s6IEVkaXRvck5vZGUsXHJcbiAgZnJvbTogbnVtYmVyLFxyXG4gIHRvOiBudW1iZXIsXHJcbiAgdHlwZXM6IFN1Z2dlc3Rpb25UeXBlcyxcclxuICBhdXRob3I6IHN0cmluZyxcclxuKTogcmVhZG9ubHkgRGVsZXRpb25TZWdtZW50W10ge1xyXG4gIGNvbnN0IHNlZ21lbnRzOiBEZWxldGlvblNlZ21lbnRbXSA9IFtdXHJcbiAgbGV0IG9mZnNldCA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGJsb2NrLmNvbnRlbnQuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IHN0YXJ0ID0gb2Zmc2V0XHJcbiAgICBvZmZzZXQgKz0gaW5saW5lU2l6ZShjaGlsZClcclxuICAgIGlmIChzdGFydCA+PSB0byB8fCBvZmZzZXQgPD0gZnJvbSkgY29udGludWVcclxuICAgIGNvbnN0IGVmZmVjdCA9IGVmZmVjdE9mKGNoaWxkLCB0eXBlcywgYXV0aG9yKVxyXG4gICAgY29uc3QgY2xpcHBlZCA9IHsgZnJvbTogTWF0aC5tYXgoc3RhcnQsIGZyb20pLCB0bzogTWF0aC5taW4ob2Zmc2V0LCB0byksIGVmZmVjdCB9XHJcbiAgICBjb25zdCBsYXN0ID0gc2VnbWVudHNbc2VnbWVudHMubGVuZ3RoIC0gMV1cclxuICAgIGlmIChsYXN0ICYmIGxhc3QudG8gPT09IGNsaXBwZWQuZnJvbSAmJiBsYXN0LmVmZmVjdCA9PT0gZWZmZWN0KSB7XHJcbiAgICAgIHNlZ21lbnRzW3NlZ21lbnRzLmxlbmd0aCAtIDFdID0geyBmcm9tOiBsYXN0LmZyb20sIHRvOiBjbGlwcGVkLnRvLCBlZmZlY3QgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc2VnbWVudHMucHVzaChjbGlwcGVkKVxyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gc2VnbWVudHNcclxufVxyXG5cclxuLyoqXHJcbiAqIEhhbmQgdGhlIGNhbGxlcidzIG1ldGFkYXRhIHRvIHRoZSB0cmFuc2FjdGlvbiB0aGF0IHJlcGxhY2VzIHRoZWlycy4gVGhlXHJcbiAqIHJld3JpdGUgZGlzY2FyZHMgdGhlIG9yaWdpbmFsIHdob2xlc2FsZSwgc28gbWV0YSBsZWZ0IGJlaGluZCBpcyBtZXRhIGxvc3Q6XHJcbiAqIGFuIGlucHV0IHJ1bGUgdGhhdCBvcGVucyBpdHMgb3duIHVuZG8gZ3JvdXAgYW5kIGxhYmVscyBpdCBtdXN0IHN0aWxsIGRvXHJcbiAqIGJvdGggd2hlbiBzdWdnZXN0aW9uIG1vZGUgdHVybnMgaXRzIGVkaXQgaW50byBhIHN1Z2dlc3Rpb24uXHJcbiAqXHJcbiAqIEV2ZXJ5dGhpbmcgaXMgY2FycmllZCwgbm90IGEgbGlzdCBvZiBrZXlzIHRoaXMgcGFja2FnZSBoYXBwZW5zIHRvIGtub3dcclxuICogYWJvdXQuIE1ldGEgaXMgaG93IG9uZSBleHRlbnNpb24gdGVsbHMgdGhlIHJlc3Qgb2YgdGhlIGVkaXRvciB3aGVyZSBhXHJcbiAqIHRyYW5zYWN0aW9uIGNhbWUgZnJvbSwgYW5kIHRoZSBrZXlzIG1vc3QgZXhwZW5zaXZlIHRvIGRyb3AgYXJlIHRoZSBvbmVzXHJcbiAqIHdyaXR0ZW4gc29tZXdoZXJlIGVsc2U6IGB3b3Jrc3BhY2UkbWlycm9yYCBtYXJrcyBhIHRyYW5zYWN0aW9uIHJlcGxheWVkXHJcbiAqIGZyb20gdGhlIG90aGVyIHBhbmUgb2YgYSBzcGxpdCB2aWV3LCBhbmQgbG9zaW5nIGl0IHNlbmRzIHRoZSByZXdyaXR0ZW5cclxuICogZWRpdCBzdHJhaWdodCBiYWNrIGludG8gdGhlIHBhbmUgaXQgY2FtZSBmcm9tLiBPbmx5IHRoaXMgcGFja2FnZSdzIG93blxyXG4gKiBtYXJrZXIgaXMgd2l0aGhlbGQsIGJlY2F1c2UgdGhlIHJlcGxhY2VtZW50IGlzIG5vdCB0aGUgY2FsbGVyJ3NcclxuICogYWxyZWFkeS10cmFja2VkIHRyYW5zYWN0aW9uLiBJdCBpcyB0aGUgb25lIGJlaW5nIHRyYWNrZWQgbm93LlxyXG4gKi9cclxuZnVuY3Rpb24gY2FycnlNZXRhKG91dDogVHJhbnNhY3Rpb24sIHNvdXJjZTogVHJhbnNhY3Rpb24pOiBUcmFuc2FjdGlvbiB7XHJcbiAgZm9yIChjb25zdCBrZXkgb2Ygc291cmNlLm1ldGFLZXlzKCkpIHtcclxuICAgIGlmIChrZXkgPT09IFRSQUNLX0NIQU5HRVNfTUVUQSkgY29udGludWVcclxuICAgIG91dC5zZXRNZXRhKGtleSwgc291cmNlLmdldE1ldGEoa2V5KSlcclxuICB9XHJcbiAgcmV0dXJuIG91dFxyXG59XHJcblxyXG4vKiogTWFya3Mgb2YgdGhlIGNoYXJhY3RlciBvY2N1cHlpbmcgW2luZGV4LCBpbmRleCsxKSwgaWYgaXQgaXMgdGV4dC4gKi9cclxuZnVuY3Rpb24gbWFya3NPZkNoYXJBdChibG9jazogRWRpdG9yTm9kZSwgaW5kZXg6IG51bWJlcik6IHJlYWRvbmx5IE1hcmtbXSB8IG51bGwge1xyXG4gIGlmIChpbmRleCA8IDApIHJldHVybiBudWxsXHJcbiAgbGV0IG9mZnNldCA9IDBcclxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGJsb2NrLmNvbnRlbnQuY2hpbGRyZW4pIHtcclxuICAgIGNvbnN0IHNpemUgPSBpbmxpbmVTaXplKGNoaWxkKVxyXG4gICAgaWYgKGluZGV4IDwgb2Zmc2V0ICsgc2l6ZSkgcmV0dXJuIGNoaWxkLmlzVGV4dCA/IGNoaWxkLm1hcmtzIDogbnVsbFxyXG4gICAgb2Zmc2V0ICs9IHNpemVcclxuICB9XHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuZnVuY3Rpb24gcmFuZ2VJc0FsbFRleHQoYmxvY2s6IEVkaXRvck5vZGUsIGZyb206IG51bWJlciwgdG86IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gIGxldCBvZmZzZXQgPSAwXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBibG9jay5jb250ZW50LmNoaWxkcmVuKSB7XHJcbiAgICBjb25zdCBzaXplID0gaW5saW5lU2l6ZShjaGlsZClcclxuICAgIGlmIChvZmZzZXQgPCB0byAmJiBvZmZzZXQgKyBzaXplID4gZnJvbSAmJiAhY2hpbGQuaXNUZXh0KSByZXR1cm4gZmFsc2VcclxuICAgIG9mZnNldCArPSBzaXplXHJcbiAgfVxyXG4gIHJldHVybiB0cnVlXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTdWdnZXN0aW9uIG1vZGU6IHdoaWxlIGVuYWJsZWQsIGVkaXRzIGJlY29tZSBhdHRyaWJ1dGVkIHN1Z2dlc3Rpb25zXHJcbiAqIGluc3RlYWQgb2YgZGlyZWN0IGNoYW5nZXMsIGRlbGV0ZWQgdGV4dCBzdGF5cyB3aXRoIGEgYGRlbGV0aW9uYCBtYXJrLFxyXG4gKiB0eXBlZCB0ZXh0IGNhcnJpZXMgYW4gYGluc2VydGlvbmAgbWFyay4gQWNjZXB0L3JlamVjdCBvbmUgb3IgYWxsLlxyXG4gKlxyXG4gKiB2MCBzY29wZSAoc2VlIEFEUi0wMDA4KTogc2luZ2xlLXRleHRibG9jayBlZGl0cyBhcmUgdHJhY2tlZDsgc3RydWN0dXJhbFxyXG4gKiB0cmFuc2FjdGlvbnMgKEVudGVyLCBibG9jayBqb2lucywgd3JhcHMpIGFwcGx5IGRpcmVjdGx5LlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFRyYWNrQ2hhbmdlcyB7XHJcbiAgcHJpdmF0ZSBkZXRhY2g6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsXHJcbiAgcHJpdmF0ZSByZWFkb25seSBsaXN0ZW5lcnMgPSBuZXcgU2V0PChlbmFibGVkOiBib29sZWFuKSA9PiB2b2lkPigpXHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IEVkaXRvcixcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogVHJhY2tDaGFuZ2VzT3B0aW9ucyxcclxuICApIHt9XHJcblxyXG4gIGdldCBpc0VuYWJsZWQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5kZXRhY2ggIT09IG51bGxcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFN1YnNjcmliZSB0byBzdWdnZXN0aW9uIG1vZGUgYmVpbmcgc3dpdGNoZWQgb24gb3Igb2ZmLiBSZXR1cm5zIGEgZGlzcG9zZXIuXHJcbiAgICpcclxuICAgKiBTd2l0Y2hpbmcgbW9kZXMgY2hhbmdlcyBubyBkb2N1bWVudCwgc28gaXQgcmFpc2VzIG5vIHRyYW5zYWN0aW9uLCBhbmRcclxuICAgKiBhbnl0aGluZyB3YXRjaGluZyB0aGUgZWRpdG9yIGFsb25lIG5ldmVyIGhlYXJzIGFib3V0IGl0LiBBIHJldmlldyBiYXJcclxuICAgKiBidWlsdCB0aGF0IHdheSBzaXRzIHJlYWRpbmcgXCJvZmZcIiB3aGlsZSBldmVyeSBrZXlzdHJva2UgaXMgaW4gZmFjdCBiZWluZ1xyXG4gICAqIHJlY29yZGVkIGFzIGEgc3VnZ2VzdGlvbiwgd2hpY2ggaXMgdGhlIHdvcnN0IHdheSBmb3IgdGhpcyBmZWF0dXJlIHRvIGJlXHJcbiAgICogd3JvbmcsIGJlY2F1c2UgdGhlIHVzZXIgYmVsaWV2ZXMgdGhlaXIgZWRpdHMgYXJlIGdvaW5nIGluIGRpcmVjdGx5LlxyXG4gICAqL1xyXG4gIG9uRW5hYmxlZENoYW5nZShsaXN0ZW5lcjogKGVuYWJsZWQ6IGJvb2xlYW4pID0+IHZvaWQpOiAoKSA9PiB2b2lkIHtcclxuICAgIHRoaXMubGlzdGVuZXJzLmFkZChsaXN0ZW5lcilcclxuICAgIHJldHVybiAoKSA9PiB0aGlzLmxpc3RlbmVycy5kZWxldGUobGlzdGVuZXIpXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFubm91bmNlKCk6IHZvaWQge1xyXG4gICAgY29uc3QgZW5hYmxlZCA9IHRoaXMuaXNFbmFibGVkXHJcbiAgICBmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIFsuLi50aGlzLmxpc3RlbmVyc10pIGxpc3RlbmVyKGVuYWJsZWQpXHJcbiAgfVxyXG5cclxuICBlbmFibGUoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5kZXRhY2gpIHJldHVyblxyXG4gICAgdGhpcy5kZXRhY2ggPSB0aGlzLmVkaXRvci5hZGREaXNwYXRjaFRyYW5zZm9ybSh0aGlzLnRyYW5zZm9ybSlcclxuICAgIHRoaXMuYW5ub3VuY2UoKVxyXG4gIH1cclxuXHJcbiAgZGlzYWJsZSgpOiB2b2lkIHtcclxuICAgIGlmICghdGhpcy5kZXRhY2gpIHJldHVyblxyXG4gICAgdGhpcy5kZXRhY2goKVxyXG4gICAgdGhpcy5kZXRhY2ggPSBudWxsXHJcbiAgICB0aGlzLmFubm91bmNlKClcclxuICB9XHJcblxyXG4gIC8qKiBBbGwgcGVuZGluZyBzdWdnZXN0aW9ucywgaW4gZG9jdW1lbnQgb3JkZXIuICovXHJcbiAgc3VnZ2VzdGlvbnMoKTogcmVhZG9ubHkgU3VnZ2VzdGlvblJhbmdlW10ge1xyXG4gICAgY29uc3Qgb3V0OiBTdWdnZXN0aW9uUmFuZ2VbXSA9IFtdXHJcbiAgICBjb25zdCBzY2hlbWEgPSB0aGlzLmVkaXRvci5zY2hlbWFcclxuICAgIGZvciAoY29uc3QgeyBwYXRoLCBub2RlIH0gb2YgdGV4dGJsb2Nrcyh0aGlzLmVkaXRvci5zdGF0ZS5kb2MpKSB7XHJcbiAgICAgIGNvbnN0IGxlbmd0aCA9IGlubGluZUxlbmd0aChub2RlLmNvbnRlbnQpXHJcbiAgICAgIGZvciAoY29uc3Qga2luZCBvZiBbJ2luc2VydGlvbicsICdkZWxldGlvbiddIGFzIGNvbnN0KSB7XHJcbiAgICAgICAgY29uc3QgdHlwZSA9IHNjaGVtYS5tYXJrc1traW5kXVxyXG4gICAgICAgIGlmICghdHlwZSkgY29udGludWVcclxuICAgICAgICBmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlc1dpdGhNYXJrKG5vZGUuY29udGVudCwgMCwgbGVuZ3RoLCB0eXBlKSkge1xyXG4gICAgICAgICAgb3V0LnB1c2goe1xyXG4gICAgICAgICAgICBwYXRoLFxyXG4gICAgICAgICAgICBmcm9tOiByYW5nZS5mcm9tLFxyXG4gICAgICAgICAgICB0bzogcmFuZ2UudG8sXHJcbiAgICAgICAgICAgIGtpbmQsXHJcbiAgICAgICAgICAgIGF1dGhvcjogU3RyaW5nKHJhbmdlLm1hcmsuYXR0cnMuYXV0aG9yID8/ICcnKSxcclxuICAgICAgICAgICAgdGltZXN0YW1wOiBOdW1iZXIocmFuZ2UubWFyay5hdHRycy50aW1lc3RhbXAgPz8gMCksXHJcbiAgICAgICAgICAgIG1hcms6IHJhbmdlLm1hcmssXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG91dC5zb3J0KChhLCBiKSA9PiBjb21wYXJlUGF0aHMoYS5wYXRoLCBiLnBhdGgpIHx8IGEuZnJvbSAtIGIuZnJvbSlcclxuICB9XHJcblxyXG4gIGdldCBoYXNTdWdnZXN0aW9ucygpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLnN1Z2dlc3Rpb25zKCkubGVuZ3RoID4gMFxyXG4gIH1cclxuXHJcbiAgYWNjZXB0QWxsKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHkodGhpcy5zdWdnZXN0aW9ucygpLCAnYWNjZXB0JylcclxuICB9XHJcblxyXG4gIHJlamVjdEFsbCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5KHRoaXMuc3VnZ2VzdGlvbnMoKSwgJ3JlamVjdCcpXHJcbiAgfVxyXG5cclxuICAvKiogQWNjZXB0IGEgc3BlY2lmaWMgc2V0IG9mIHN1Z2dlc3Rpb24gcmFuZ2VzIChlLmcuIG9uZSBhdXRob3IncykuICovXHJcbiAgYWNjZXB0KHN1Z2dlc3Rpb25zOiByZWFkb25seSBTdWdnZXN0aW9uUmFuZ2VbXSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHkoc3VnZ2VzdGlvbnMsICdhY2NlcHQnKVxyXG4gIH1cclxuXHJcbiAgcmVqZWN0KHN1Z2dlc3Rpb25zOiByZWFkb25seSBTdWdnZXN0aW9uUmFuZ2VbXSk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHkoc3VnZ2VzdGlvbnMsICdyZWplY3QnKVxyXG4gIH1cclxuXHJcbiAgLyoqIEFjY2VwdCB0aGUgc3VnZ2VzdGlvbiBzcGFuIGNvbnRhaW5pbmcgYHBvc2l0aW9uYC4gKi9cclxuICBhY2NlcHRBdChwb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5KHRoaXMuYXQocG9zaXRpb24pLCAnYWNjZXB0JylcclxuICB9XHJcblxyXG4gIHJlamVjdEF0KHBvc2l0aW9uOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMuYXBwbHkodGhpcy5hdChwb3NpdGlvbiksICdyZWplY3QnKVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhdChwb3NpdGlvbjogUG9zaXRpb24pOiByZWFkb25seSBTdWdnZXN0aW9uUmFuZ2VbXSB7XHJcbiAgICBjb25zdCBmb3VuZCA9IHRoaXMuc3VnZ2VzdGlvbnMoKS5maW5kKFxyXG4gICAgICAoc3VnZ2VzdGlvbikgPT5cclxuICAgICAgICBwYXRoc0VxdWFsKHN1Z2dlc3Rpb24ucGF0aCwgcG9zaXRpb24ucGF0aCkgJiZcclxuICAgICAgICBzdWdnZXN0aW9uLmZyb20gPD0gcG9zaXRpb24ub2Zmc2V0ICYmXHJcbiAgICAgICAgcG9zaXRpb24ub2Zmc2V0IDw9IHN1Z2dlc3Rpb24udG8sXHJcbiAgICApXHJcbiAgICByZXR1cm4gZm91bmQgPyBbZm91bmRdIDogW11cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXBwbHkoc3VnZ2VzdGlvbnM6IHJlYWRvbmx5IFN1Z2dlc3Rpb25SYW5nZVtdLCBtb2RlOiAnYWNjZXB0JyB8ICdyZWplY3QnKTogYm9vbGVhbiB7XHJcbiAgICBpZiAoc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2VcclxuICAgIGNvbnN0IHRyID0gdGhpcy5lZGl0b3Iuc3RhdGUudHIuc2V0TWV0YShUUkFDS19DSEFOR0VTX01FVEEsIHRydWUpXHJcbiAgICAvLyBQZXIgYmxvY2ssIGJhY2sgdG8gZnJvbnQsIHNvIGVhcmxpZXIgb2Zmc2V0cyBzdGF5IHZhbGlkIHdoaWxlIHdlIGVkaXQuXHJcbiAgICBjb25zdCBvcmRlcmVkID0gWy4uLnN1Z2dlc3Rpb25zXS5zb3J0KChhLCBiKSA9PiB7XHJcbiAgICAgIGNvbnN0IGJ5UGF0aCA9IGNvbXBhcmVQYXRocyhiLnBhdGgsIGEucGF0aClcclxuICAgICAgcmV0dXJuIGJ5UGF0aCAhPT0gMCA/IGJ5UGF0aCA6IGIuZnJvbSAtIGEuZnJvbVxyXG4gICAgfSlcclxuICAgIGZvciAoY29uc3Qgc3VnZ2VzdGlvbiBvZiBvcmRlcmVkKSB7XHJcbiAgICAgIGNvbnN0IGtlZXBUZXh0ID0gKHN1Z2dlc3Rpb24ua2luZCA9PT0gJ2luc2VydGlvbicpID09PSAobW9kZSA9PT0gJ2FjY2VwdCcpXHJcbiAgICAgIGlmIChrZWVwVGV4dCkge1xyXG4gICAgICAgIHRyLnN0ZXAoXHJcbiAgICAgICAgICBuZXcgUmVtb3ZlTWFya1N0ZXAoc3VnZ2VzdGlvbi5wYXRoLCBzdWdnZXN0aW9uLmZyb20sIHN1Z2dlc3Rpb24udG8sIHN1Z2dlc3Rpb24ubWFyayksXHJcbiAgICAgICAgKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRyLnN0ZXAoXHJcbiAgICAgICAgICBuZXcgUmVwbGFjZUlubGluZVN0ZXAoc3VnZ2VzdGlvbi5wYXRoLCBzdWdnZXN0aW9uLmZyb20sIHN1Z2dlc3Rpb24udG8sIEZyYWdtZW50LmVtcHR5KSxcclxuICAgICAgICApXHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHRoaXMuZWRpdG9yLmRpc3BhdGNoKHRyKVxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcblxyXG4gIHByaXZhdGUgdHJhbnNmb3JtOiBEaXNwYXRjaFRyYW5zZm9ybSA9ICh0ciwgc3RhdGUpID0+IHtcclxuICAgIGlmICghdHIuZG9jQ2hhbmdlZCB8fCB0ci5nZXRNZXRhKEFERF9UT19ISVNUT1JZKSA9PT0gZmFsc2UpIHJldHVybiBudWxsXHJcbiAgICBpZiAodHIuZ2V0TWV0YShUUkFDS19DSEFOR0VTX01FVEEpKSByZXR1cm4gbnVsbFxyXG4gICAgY29uc3Qgc3RlcCA9IG5vcm1hbGl6ZUlubGluZUVkaXQodHIuc3RlcHMpXHJcbiAgICBpZiAoIXN0ZXApIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBzY2hlbWEgPSBzdGF0ZS5zY2hlbWFcclxuICAgIGNvbnN0IGluc2VydGlvbiA9IHNjaGVtYS5tYXJrcy5pbnNlcnRpb25cclxuICAgIGNvbnN0IGRlbGV0aW9uID0gc2NoZW1hLm1hcmtzLmRlbGV0aW9uXHJcbiAgICBpZiAoIWluc2VydGlvbiB8fCAhZGVsZXRpb24pIHJldHVybiBudWxsXHJcbiAgICBjb25zdCBibG9jayA9IG5vZGVBdFBhdGgoc3RhdGUuZG9jLCBzdGVwLmJsb2NrUGF0aClcclxuICAgIGlmICghYmxvY2s/LmlzVGV4dGJsb2NrIHx8ICFibG9jay50eXBlLmFsbG93c01hcmtUeXBlKGRlbGV0aW9uKSkgcmV0dXJuIG51bGxcclxuICAgIGlmIChzdGVwLmluc2VydC5jaGlsZHJlbi5zb21lKChjaGlsZCkgPT4gIWNoaWxkLmlzVGV4dCkpIHJldHVybiBudWxsXHJcbiAgICBpZiAoc3RlcC5mcm9tIDwgc3RlcC50byAmJiAhcmFuZ2VJc0FsbFRleHQoYmxvY2ssIHN0ZXAuZnJvbSwgc3RlcC50bykpIHJldHVybiBudWxsXHJcblxyXG4gICAgY29uc3QgYXV0aG9yID0gdGhpcy5vcHRpb25zLmF1dGhvclxyXG4gICAgY29uc3QgdGltZXN0YW1wID0gdGhpcy5vcHRpb25zLm5vdz8uKCkgPz8gRGF0ZS5ub3coKVxyXG4gICAgLy8gUmV1c2UgdGhlIGFkamFjZW50IHN1Z2dlc3Rpb24gbWFyayB3aGVuIHRoZSBzYW1lIGF1dGhvciBrZWVwcyBnb2luZyxcclxuICAgIC8vIHNvIGNvbnNlY3V0aXZlIGtleXN0cm9rZXMgbWVyZ2UgaW50byBvbmUgc3BhbiAob25lIHN1Z2dlc3Rpb24pLlxyXG4gICAgY29uc3QgcmV1c2FibGUgPSAoaW5kZXg6IG51bWJlciwgdHlwZTogTWFya1R5cGUpOiBNYXJrIHwgbnVsbCA9PlxyXG4gICAgICBtYXJrc09mQ2hhckF0KGJsb2NrLCBpbmRleCk/LmZpbmQoXHJcbiAgICAgICAgKG1hcmspID0+IG1hcmsudHlwZSA9PT0gdHlwZSAmJiBtYXJrLmF0dHJzLmF1dGhvciA9PT0gYXV0aG9yLFxyXG4gICAgICApID8/IG51bGxcclxuXHJcbiAgICBjb25zdCBzZWdtZW50cyA9XHJcbiAgICAgIHN0ZXAuZnJvbSA8IHN0ZXAudG9cclxuICAgICAgICA/IGNsYXNzaWZ5RGVsZXRpb24oYmxvY2ssIHN0ZXAuZnJvbSwgc3RlcC50bywgeyBpbnNlcnRpb24sIGRlbGV0aW9uIH0sIGF1dGhvcilcclxuICAgICAgICA6IFtdXHJcbiAgICBjb25zdCB2YW5pc2hpbmcgPSBzZWdtZW50cy5yZWR1Y2UoXHJcbiAgICAgICh0b3RhbCwgc2VnbWVudCkgPT5cclxuICAgICAgICBzZWdtZW50LmVmZmVjdCA9PT0gJ3JlbW92ZScgPyB0b3RhbCArIChzZWdtZW50LnRvIC0gc2VnbWVudC5mcm9tKSA6IHRvdGFsLFxyXG4gICAgICAwLFxyXG4gICAgKVxyXG4gICAgLy8gUmVwbGFjZW1lbnQgdGV4dCBiZWxvbmdzIHdoZXJlIHRoZSBlZGl0ZWQgcmFuZ2UgZW5kcyBvbmNlIHRoZSBwYXJ0cyBvZlxyXG4gICAgLy8gaXQgdGhhdCB2YW5pc2ggYXJlIGdvbmUsIGFmdGVyIHRoZSBzdHJ1Y2sgb3JpZ2luYWwsIG5ldmVyIGJlZm9yZSBpdC5cclxuICAgIGNvbnN0IGluc2VydEF0ID0gc3RlcC50byAtIHZhbmlzaGluZ1xyXG5cclxuICAgIC8vIE1lcmdlIGludG8gYW4gYWRqYWNlbnQgc3BhbiBvZiB0aGlzIGF1dGhvcidzIG93biBzdWdnZXN0aW9uIHdoZW4gdGhlcmVcclxuICAgIC8vIGlzIG9uZSwgc28gY29uc2VjdXRpdmUgZWRpdHMgcmVhZCBhcyBvbmUuIE9ubHkgdGhlIHR3byBlbmRzIG9mIHRoZVxyXG4gICAgLy8gZWRpdGVkIHJhbmdlIGNhbiBjYXJyeSBpdDogZXZlcnl0aGluZyBpbnNpZGUgdGhhdCBzdXJ2aXZlZCB0aGUgZGVsZXRpb25cclxuICAgIC8vIGlzIGVpdGhlciBvcmlnaW5hbCB0ZXh0IG9yIHNvbWVvbmUncyBzdHJpa2UsIGFuZCBhIGNoYXJhY3RlciBvZiB0aGlzXHJcbiAgICAvLyBhdXRob3IncyBvd24gcGVuZGluZyBpbnNlcnRpb24gY2xhc3NpZmllcyBhcyBgcmVtb3ZlYCByYXRoZXIgdGhhblxyXG4gICAgLy8gc3Vydml2aW5nIGF0IGFsbC5cclxuICAgIGNvbnN0IGluc2VydGlvbk1hcmsgPVxyXG4gICAgICByZXVzYWJsZShzdGVwLmZyb20gLSAxLCBpbnNlcnRpb24pID8/XHJcbiAgICAgIHJldXNhYmxlKHN0ZXAudG8sIGluc2VydGlvbikgPz9cclxuICAgICAgc2NoZW1hLm1hcmsoJ2luc2VydGlvbicsIHsgYXV0aG9yLCB0aW1lc3RhbXAgfSlcclxuICAgIGNvbnN0IG1hcmtlZEluc2VydCA9IEZyYWdtZW50LmZyb20oXHJcbiAgICAgIHN0ZXAuaW5zZXJ0LmNoaWxkcmVuLm1hcCgoY2hpbGQpID0+IHtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gY2hpbGQgYXMgVGV4dE5vZGVcclxuICAgICAgICByZXR1cm4gc2NoZW1hLnRleHQodGV4dC50ZXh0LCBpbnNlcnRpb25NYXJrLmFkZFRvU2V0KHRleHQubWFya3MpKVxyXG4gICAgICB9KSxcclxuICAgIClcclxuICAgIGNvbnN0IG91dCA9IGNhcnJ5TWV0YShzdGF0ZS50ciwgdHIpXHJcbiAgICBjb25zdCBjYXJldEF0ID0gKG9mZnNldDogbnVtYmVyKTogdm9pZCA9PiB7XHJcbiAgICAgIG91dC5zZXRTZWxlY3Rpb24obmV3IFRleHRTZWxlY3Rpb24ocG9zKHN0ZXAuYmxvY2tQYXRoLCBvZmZzZXQpKSlcclxuICAgIH1cclxuXHJcbiAgICAvLyBQdXJlIGluc2VydGlvbjoga2VlcCBpdCwgbWFya2VkLlxyXG4gICAgaWYgKHN0ZXAuZnJvbSA9PT0gc3RlcC50bykge1xyXG4gICAgICBpZiAobWFya2VkSW5zZXJ0LmNoaWxkQ291bnQgPT09IDApIHJldHVybiBudWxsXHJcbiAgICAgIG91dC5zdGVwKG5ldyBSZXBsYWNlSW5saW5lU3RlcChzdGVwLmJsb2NrUGF0aCwgc3RlcC5mcm9tLCBzdGVwLmZyb20sIG1hcmtlZEluc2VydCkpXHJcbiAgICAgIGNhcmV0QXQoc3RlcC5mcm9tICsgaW5saW5lTGVuZ3RoKG1hcmtlZEluc2VydCkpXHJcbiAgICAgIHJldHVybiBvdXRcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBoZWFkID1cclxuICAgICAgc3RhdGUuc2VsZWN0aW9uIGluc3RhbmNlb2YgVGV4dFNlbGVjdGlvbiAmJlxyXG4gICAgICBwYXRoc0VxdWFsKHN0YXRlLnNlbGVjdGlvbi5oZWFkLnBhdGgsIHN0ZXAuYmxvY2tQYXRoKVxyXG4gICAgICAgID8gc3RhdGUuc2VsZWN0aW9uLmhlYWQub2Zmc2V0XHJcbiAgICAgICAgOiBudWxsXHJcbiAgICBjb25zdCBiYWNrd2FyZCA9IGhlYWQgPT09IHN0ZXAudG9cclxuXHJcbiAgICAvLyBCYWNrIHRvIGZyb250LCBzbyBldmVyeSBzZWdtZW50IHN0aWxsIGFkZHJlc3NlcyB0aGUgYmxvY2sgdGhlXHJcbiAgICAvLyBjbGFzc2lmaWNhdGlvbiB3YXMgbWFkZSBhZ2FpbnN0IHdoaWxlIGVhcmxpZXIgb25lcyBhcmUgYmVpbmcgZWRpdGVkLlxyXG4gICAgZm9yIChsZXQgaW5kZXggPSBzZWdtZW50cy5sZW5ndGggLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XHJcbiAgICAgIGNvbnN0IHNlZ21lbnQgPSBzZWdtZW50c1tpbmRleF0gYXMgRGVsZXRpb25TZWdtZW50XHJcbiAgICAgIGlmIChzZWdtZW50LmVmZmVjdCA9PT0gJ3JlbW92ZScpIHtcclxuICAgICAgICBvdXQuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAoc3RlcC5ibG9ja1BhdGgsIHNlZ21lbnQuZnJvbSwgc2VnbWVudC50bywgRnJhZ21lbnQuZW1wdHkpKVxyXG4gICAgICB9IGVsc2UgaWYgKHNlZ21lbnQuZWZmZWN0ID09PSAnc3RyaWtlJykge1xyXG4gICAgICAgIGNvbnN0IG1hcmsgPVxyXG4gICAgICAgICAgcmV1c2FibGUoc2VnbWVudC50bywgZGVsZXRpb24pID8/XHJcbiAgICAgICAgICByZXVzYWJsZShzZWdtZW50LmZyb20gLSAxLCBkZWxldGlvbikgPz9cclxuICAgICAgICAgIHNjaGVtYS5tYXJrKCdkZWxldGlvbicsIHsgYXV0aG9yLCB0aW1lc3RhbXAgfSlcclxuICAgICAgICBvdXQuc3RlcChuZXcgQWRkTWFya1N0ZXAoc3RlcC5ibG9ja1BhdGgsIHNlZ21lbnQuZnJvbSwgc2VnbWVudC50bywgbWFyaykpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAobWFya2VkSW5zZXJ0LmNoaWxkQ291bnQgPiAwKSB7XHJcbiAgICAgIC8vIFJlcGxhY2VtZW50OiBzdHJ1Y2sgb3JpZ2luYWwsIHN1Z2dlc3RlZCB0ZXh0IHJpZ2h0IGFmdGVyIGl0LlxyXG4gICAgICBvdXQuc3RlcChuZXcgUmVwbGFjZUlubGluZVN0ZXAoc3RlcC5ibG9ja1BhdGgsIGluc2VydEF0LCBpbnNlcnRBdCwgbWFya2VkSW5zZXJ0KSlcclxuICAgICAgY2FyZXRBdChpbnNlcnRBdCArIGlubGluZUxlbmd0aChtYXJrZWRJbnNlcnQpKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gTm90aGluZyBpcyByZS1zdHJ1Y2sgb3ZlciBhIHJhbmdlIHRoYXQgd2FzIGFscmVhZHkgc3RydWNrLCBzbyB0aGVcclxuICAgICAgLy8gY2FyZXQgc2ltcGx5IHN0ZXBzIGFjcm9zcyBpdCwgYXMgaXQgd291bGQgYWNyb3NzIHRleHQgcmVhbGx5IGdvbmUuXHJcbiAgICAgIGNhcmV0QXQoYmFja3dhcmQgPyBzdGVwLmZyb20gOiBpbnNlcnRBdClcclxuICAgIH1cclxuICAgIHJldHVybiBvdXRcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZWNvZ25pemUgYSB0cmFuc2FjdGlvbiBhcyBvbmUgaW5saW5lIGVkaXQ6IGVpdGhlciBhIHNpbmdsZVxyXG4gKiBSZXBsYWNlSW5saW5lU3RlcCwgb3IgdGhlIGRlbGV0ZStpbnNlcnQgcGFpciBjb21tYW5kcyBlbWl0IHdoZW4gdHlwaW5nXHJcbiAqIG92ZXIgYSBzYW1lLWJsb2NrIHNlbGVjdGlvbi5cclxuICovXHJcbmZ1bmN0aW9uIG5vcm1hbGl6ZUlubGluZUVkaXQoc3RlcHM6IHJlYWRvbmx5IHVua25vd25bXSk6IFJlcGxhY2VJbmxpbmVTdGVwIHwgbnVsbCB7XHJcbiAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgcmV0dXJuIHN0ZXBzWzBdIGluc3RhbmNlb2YgUmVwbGFjZUlubGluZVN0ZXAgPyBzdGVwc1swXSA6IG51bGxcclxuICB9XHJcbiAgaWYgKHN0ZXBzLmxlbmd0aCA9PT0gMikge1xyXG4gICAgY29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gc3RlcHNcclxuICAgIGlmIChcclxuICAgICAgZmlyc3QgaW5zdGFuY2VvZiBSZXBsYWNlSW5saW5lU3RlcCAmJlxyXG4gICAgICBzZWNvbmQgaW5zdGFuY2VvZiBSZXBsYWNlSW5saW5lU3RlcCAmJlxyXG4gICAgICBwYXRoc0VxdWFsKGZpcnN0LmJsb2NrUGF0aCwgc2Vjb25kLmJsb2NrUGF0aCkgJiZcclxuICAgICAgZmlyc3QuaW5zZXJ0LmNoaWxkQ291bnQgPT09IDAgJiZcclxuICAgICAgZmlyc3QuZnJvbSA8IGZpcnN0LnRvICYmXHJcbiAgICAgIHNlY29uZC5mcm9tID09PSBzZWNvbmQudG8gJiZcclxuICAgICAgc2Vjb25kLmZyb20gPT09IGZpcnN0LmZyb21cclxuICAgICkge1xyXG4gICAgICByZXR1cm4gbmV3IFJlcGxhY2VJbmxpbmVTdGVwKGZpcnN0LmJsb2NrUGF0aCwgZmlyc3QuZnJvbSwgZmlyc3QudG8sIHNlY29uZC5pbnNlcnQpXHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBudWxsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbXBhcmVQYXRocyhhOiBQYXRoLCBiOiBQYXRoKTogbnVtYmVyIHtcclxuICBjb25zdCBsZW5ndGggPSBNYXRoLm1pbihhLmxlbmd0aCwgYi5sZW5ndGgpXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xyXG4gICAgY29uc3QgZGVsdGEgPSAoYVtpXSBhcyBudW1iZXIpIC0gKGJbaV0gYXMgbnVtYmVyKVxyXG4gICAgaWYgKGRlbHRhICE9PSAwKSByZXR1cm4gZGVsdGFcclxuICB9XHJcbiAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGhcclxufVxyXG5cclxuZXhwb3J0IHtcclxuICB0eXBlIFRyYWNrQ2hhbmdlc0JhcixcclxuICB0eXBlIFRyYWNrQ2hhbmdlc0Jhck9wdGlvbnMsXHJcbiAgY3JlYXRlVHJhY2tDaGFuZ2VzQmFyLFxyXG4gIG5leHRTdWdnZXN0aW9uLFxyXG4gIHN1Z2dlc3Rpb25BdCxcclxufSBmcm9tICcuL3VpJ1xyXG4iLCAiaW1wb3J0IHtcclxuICB0eXBlIEVkaXRvcixcclxuICB0eXBlIEVkaXRvclN0YXRlLFxyXG4gIHR5cGUgUG9zaXRpb24sXHJcbiAgVGV4dFNlbGVjdGlvbixcclxuICBjb21wYXJlUG9zaXRpb25zLFxyXG4gIGRvbVBvaW50RnJvbVBvc2l0aW9uLFxyXG4gIHBvcyxcclxufSBmcm9tICdAdHJldml4YWwvY29yZSdcclxuaW1wb3J0IHR5cGUgeyBTdWdnZXN0aW9uUmFuZ2UsIFRyYWNrQ2hhbmdlcyB9IGZyb20gJy4vaW5kZXgnXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRyYWNrQ2hhbmdlc0Jhck9wdGlvbnMge1xyXG4gIC8qKiBXaGVyZSB0aGUgdG9vbGJhciBpcyBhcHBlbmRlZC4gKi9cclxuICByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50XHJcbiAgLyoqIFNob3duIG5leHQgdG8gdGhlIHRvZ2dsZSAoXCJTdWdnZXN0aW5nIGFzIGFkYVwiKS4gKi9cclxuICByZWFkb25seSBhdXRob3I/OiBzdHJpbmdcclxuICAvKiogQ2FsbGVkIGFmdGVyIGFueSBhY3Rpb24gdGFrZW4gZnJvbSB0aGUgYmFyLiAqL1xyXG4gIHJlYWRvbmx5IG9uQ2hhbmdlPzogKHN0YXRlOiB7IGVuYWJsZWQ6IGJvb2xlYW47IGNvdW50OiBudW1iZXIgfSkgPT4gdm9pZFxyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRyYWNrQ2hhbmdlc0JhciB7XHJcbiAgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnRcclxuICByZWZyZXNoKCk6IHZvaWRcclxuICBkZXN0cm95KCk6IHZvaWRcclxufVxyXG5cclxuZnVuY3Rpb24gY2FyZXRPZihzdGF0ZTogRWRpdG9yU3RhdGUpOiBQb3NpdGlvbiB8IG51bGwge1xyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHN0YXRlLnNlbGVjdGlvblxyXG4gIHJldHVybiBzZWxlY3Rpb24gaW5zdGFuY2VvZiBUZXh0U2VsZWN0aW9uID8gc2VsZWN0aW9uLmhlYWQgOiBudWxsXHJcbn1cclxuXHJcbmNvbnN0IHN0YXJ0ID0gKHN1Z2dlc3Rpb246IFN1Z2dlc3Rpb25SYW5nZSk6IFBvc2l0aW9uID0+IHBvcyhzdWdnZXN0aW9uLnBhdGgsIHN1Z2dlc3Rpb24uZnJvbSlcclxuY29uc3QgZW5kID0gKHN1Z2dlc3Rpb246IFN1Z2dlc3Rpb25SYW5nZSk6IFBvc2l0aW9uID0+IHBvcyhzdWdnZXN0aW9uLnBhdGgsIHN1Z2dlc3Rpb24udG8pXHJcblxyXG4vKiogUGVuZGluZyBzdWdnZXN0aW9ucyBpbiBkb2N1bWVudCBvcmRlciAodGhlIHRyYWNrZXIgZ3JvdXBzIHRoZW0gcGVyIGtpbmQpLiAqL1xyXG5mdW5jdGlvbiBvcmRlcmVkKHRyYWNrOiBUcmFja0NoYW5nZXMpOiByZWFkb25seSBTdWdnZXN0aW9uUmFuZ2VbXSB7XHJcbiAgcmV0dXJuIFsuLi50cmFjay5zdWdnZXN0aW9ucygpXS5zb3J0KChhLCBiKSA9PiBjb21wYXJlUG9zaXRpb25zKHN0YXJ0KGEpLCBzdGFydChiKSkpXHJcbn1cclxuXHJcbi8qKiBUaGUgc3VnZ2VzdGlvbiB3aG9zZSBzcGFuIGNvbnRhaW5zIHRoZSBjYXJldCAoZWRnZXMgaW5jbHVzaXZlKSwgaWYgYW55LiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc3VnZ2VzdGlvbkF0KHRyYWNrOiBUcmFja0NoYW5nZXMsIHN0YXRlOiBFZGl0b3JTdGF0ZSk6IFN1Z2dlc3Rpb25SYW5nZSB8IG51bGwge1xyXG4gIGNvbnN0IGNhcmV0ID0gY2FyZXRPZihzdGF0ZSlcclxuICBpZiAoIWNhcmV0KSByZXR1cm4gbnVsbFxyXG4gIHJldHVybiAoXHJcbiAgICB0cmFja1xyXG4gICAgICAuc3VnZ2VzdGlvbnMoKVxyXG4gICAgICAuZmluZChcclxuICAgICAgICAoc3VnZ2VzdGlvbikgPT5cclxuICAgICAgICAgIGNvbXBhcmVQb3NpdGlvbnMoc3RhcnQoc3VnZ2VzdGlvbiksIGNhcmV0KSA8PSAwICYmXHJcbiAgICAgICAgICBjb21wYXJlUG9zaXRpb25zKGNhcmV0LCBlbmQoc3VnZ2VzdGlvbikpIDw9IDAsXHJcbiAgICAgICkgPz8gbnVsbFxyXG4gIClcclxufVxyXG5cclxuLyoqXHJcbiAqIFRoZSBmaXJzdCBzdWdnZXN0aW9uIHN0YXJ0aW5nIGFmdGVyIHRoZSBjYXJldCAoYDFgKSBvciB0aGUgbGFzdCBvbmUgZW5kaW5nXHJcbiAqIGJlZm9yZSBpdCAoYC0xYCkuIEEgc3VnZ2VzdGlvbiB0b3VjaGluZyB0aGUgY2FyZXQgY291bnRzIGFzIGN1cnJlbnQgYW5kIGlzXHJcbiAqIHNraXBwZWQgaW4gYm90aCBkaXJlY3Rpb25zLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG5leHRTdWdnZXN0aW9uKFxyXG4gIHRyYWNrOiBUcmFja0NoYW5nZXMsXHJcbiAgc3RhdGU6IEVkaXRvclN0YXRlLFxyXG4gIGRpcmVjdGlvbjogMSB8IC0xLFxyXG4pOiBTdWdnZXN0aW9uUmFuZ2UgfCBudWxsIHtcclxuICBjb25zdCBjYXJldCA9IGNhcmV0T2Yoc3RhdGUpXHJcbiAgaWYgKCFjYXJldCkgcmV0dXJuIG51bGxcclxuICBjb25zdCBhbGwgPSBvcmRlcmVkKHRyYWNrKVxyXG4gIGlmIChkaXJlY3Rpb24gPT09IDEpIHtcclxuICAgIHJldHVybiBhbGwuZmluZCgoc3VnZ2VzdGlvbikgPT4gY29tcGFyZVBvc2l0aW9ucyhzdGFydChzdWdnZXN0aW9uKSwgY2FyZXQpID4gMCkgPz8gbnVsbFxyXG4gIH1cclxuICBmb3IgKGxldCBpbmRleCA9IGFsbC5sZW5ndGggLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XHJcbiAgICBjb25zdCBzdWdnZXN0aW9uID0gYWxsW2luZGV4XSBhcyBTdWdnZXN0aW9uUmFuZ2VcclxuICAgIGlmIChjb21wYXJlUG9zaXRpb25zKGVuZChzdWdnZXN0aW9uKSwgY2FyZXQpIDwgMCkgcmV0dXJuIHN1Z2dlc3Rpb25cclxuICB9XHJcbiAgcmV0dXJuIG51bGxcclxufVxyXG5cclxuZnVuY3Rpb24gY291bnRMYWJlbChjb3VudDogbnVtYmVyKTogc3RyaW5nIHtcclxuICBpZiAoY291bnQgPT09IDApIHJldHVybiAnTm8gc3VnZ2VzdGlvbnMnXHJcbiAgcmV0dXJuIGNvdW50ID09PSAxID8gJzEgc3VnZ2VzdGlvbicgOiBgJHtjb3VudH0gc3VnZ2VzdGlvbnNgXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIHRvb2xiYXIgZm9yIHN1Z2dlc3Rpb24gbW9kZTogdG9nZ2xlIHN1Z2dlc3RpbmcsIHNlZSBob3cgbWFueSBzdWdnZXN0aW9uc1xyXG4gKiBhcmUgcGVuZGluZywgc3RlcCB0aHJvdWdoIHRoZW0sIGFuZCBhY2NlcHQgb3IgcmVqZWN0IHRoZSBvbmUgYXQgdGhlIGNhcmV0XHJcbiAqIG9yIGFsbCBvZiB0aGVtIGF0IG9uY2UuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVHJhY2tDaGFuZ2VzQmFyKFxyXG4gIGVkaXRvcjogRWRpdG9yLFxyXG4gIHRyYWNrOiBUcmFja0NoYW5nZXMsXHJcbiAgb3B0aW9uczogVHJhY2tDaGFuZ2VzQmFyT3B0aW9ucyxcclxuKTogVHJhY2tDaGFuZ2VzQmFyIHtcclxuICBjb25zdCBkb2MgPSBvcHRpb25zLmNvbnRhaW5lci5vd25lckRvY3VtZW50XHJcbiAgY29uc3QgZGlzcG9zZXJzOiAoKCkgPT4gdm9pZClbXSA9IFtdXHJcblxyXG4gIGNvbnN0IHJvb3QgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JylcclxuICByb290LmNsYXNzTmFtZSA9ICd0cmV2aXhhbC10cmFja2NoYW5nZXMnXHJcbiAgcm9vdC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAndG9vbGJhcicpXHJcbiAgcm9vdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnVHJhY2sgY2hhbmdlcycpXHJcblxyXG4gIGNvbnN0IGNvbnRyb2wgPSAoY2xhc3NOYW1lOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGFjdGlvbjogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50ID0+IHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBkb2MuY3JlYXRlRWxlbWVudCgnYnV0dG9uJylcclxuICAgIGVsZW1lbnQudHlwZSA9ICdidXR0b24nXHJcbiAgICBlbGVtZW50LmNsYXNzTmFtZSA9IGB0cmV2aXhhbC10cmFja2NoYW5nZXNfX2J1dHRvbiAke2NsYXNzTmFtZX1gXHJcbiAgICBlbGVtZW50LnRleHRDb250ZW50ID0gbGFiZWxcclxuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIGFjdGlvbigpXHJcbiAgICAgIHJlZnJlc2goKVxyXG4gICAgICBvcHRpb25zLm9uQ2hhbmdlPy4oeyBlbmFibGVkOiB0cmFjay5pc0VuYWJsZWQsIGNvdW50OiB0cmFjay5zdWdnZXN0aW9ucygpLmxlbmd0aCB9KVxyXG4gICAgfSlcclxuICAgIHJldHVybiBlbGVtZW50XHJcbiAgfVxyXG5cclxuICBjb25zdCB0b2dnbGUgPSBjb250cm9sKCd0cmV2aXhhbC10cmFja2NoYW5nZXNfX3RvZ2dsZScsICdTdWdnZXN0aW5nJywgKCkgPT4ge1xyXG4gICAgaWYgKHRyYWNrLmlzRW5hYmxlZCkgdHJhY2suZGlzYWJsZSgpXHJcbiAgICBlbHNlIHRyYWNrLmVuYWJsZSgpXHJcbiAgfSlcclxuICBpZiAob3B0aW9ucy5hdXRob3IpIHRvZ2dsZS50aXRsZSA9IGBTdWdnZXN0aW5nIGFzICR7b3B0aW9ucy5hdXRob3J9YFxyXG4gIHJvb3QuYXBwZW5kQ2hpbGQodG9nZ2xlKVxyXG4gIGlmIChvcHRpb25zLmF1dGhvcikge1xyXG4gICAgY29uc3QgYXV0aG9yID0gZG9jLmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKVxyXG4gICAgYXV0aG9yLmNsYXNzTmFtZSA9ICd0cmV2aXhhbC10cmFja2NoYW5nZXNfX2F1dGhvcidcclxuICAgIGF1dGhvci50ZXh0Q29udGVudCA9IGBhcyAke29wdGlvbnMuYXV0aG9yfWBcclxuICAgIHJvb3QuYXBwZW5kQ2hpbGQoYXV0aG9yKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgY291bnQgPSBkb2MuY3JlYXRlRWxlbWVudCgnc3BhbicpXHJcbiAgY291bnQuY2xhc3NOYW1lID0gJ3RyZXZpeGFsLXRyYWNrY2hhbmdlc19fY291bnQnXHJcbiAgY291bnQuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJylcclxuICByb290LmFwcGVuZENoaWxkKGNvdW50KVxyXG5cclxuICBjb25zdCBzZWxlY3QgPSAoc3VnZ2VzdGlvbjogU3VnZ2VzdGlvblJhbmdlIHwgbnVsbCk6IHZvaWQgPT4ge1xyXG4gICAgaWYgKCFzdWdnZXN0aW9uKSByZXR1cm5cclxuICAgIGVkaXRvci5kaXNwYXRjaChcclxuICAgICAgZWRpdG9yLnN0YXRlLnRyLnNldFNlbGVjdGlvbihuZXcgVGV4dFNlbGVjdGlvbihzdGFydChzdWdnZXN0aW9uKSwgZW5kKHN1Z2dlc3Rpb24pKSksXHJcbiAgICApXHJcbiAgICBjb25zdCB2aWV3ID0gZWRpdG9yLnZpZXdcclxuICAgIGlmICghdmlldykgcmV0dXJuXHJcbiAgICB2aWV3LmZvY3VzKClcclxuICAgIGNvbnN0IHBvaW50ID0gZG9tUG9pbnRGcm9tUG9zaXRpb24odmlldy5kb20sIHZpZXcucmVuZGVyZXIsIHN0YXJ0KHN1Z2dlc3Rpb24pKVxyXG4gICAgY29uc3Qgbm9kZSA9IHBvaW50Py5ub2RlXHJcbiAgICBjb25zdCBlbGVtZW50ID0gbm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQgPyBub2RlIDogbm9kZT8ucGFyZW50RWxlbWVudFxyXG4gICAgZWxlbWVudD8uc2Nyb2xsSW50b1ZpZXc/Lih7IGJsb2NrOiAnbmVhcmVzdCcgfSlcclxuICB9XHJcblxyXG4gIGNvbnN0IGN1cnJlbnQgPSAoKTogcmVhZG9ubHkgU3VnZ2VzdGlvblJhbmdlW10gPT4ge1xyXG4gICAgY29uc3QgZm91bmQgPSBzdWdnZXN0aW9uQXQodHJhY2ssIGVkaXRvci5zdGF0ZSlcclxuICAgIHJldHVybiBmb3VuZCA/IFtmb3VuZF0gOiBbXVxyXG4gIH1cclxuXHJcbiAgY29uc3QgZ3JvdXAgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JylcclxuICBncm91cC5jbGFzc05hbWUgPSAndHJldml4YWwtdHJhY2tjaGFuZ2VzX19ncm91cCdcclxuICBjb25zdCBwcmV2aW91cyA9IGNvbnRyb2woJ3RyZXZpeGFsLXRyYWNrY2hhbmdlc19fcHJldmlvdXMnLCAnUHJldmlvdXMnLCAoKSA9PlxyXG4gICAgc2VsZWN0KG5leHRTdWdnZXN0aW9uKHRyYWNrLCBlZGl0b3Iuc3RhdGUsIC0xKSksXHJcbiAgKVxyXG4gIGNvbnN0IG5leHQgPSBjb250cm9sKCd0cmV2aXhhbC10cmFja2NoYW5nZXNfX25leHQnLCAnTmV4dCcsICgpID0+XHJcbiAgICBzZWxlY3QobmV4dFN1Z2dlc3Rpb24odHJhY2ssIGVkaXRvci5zdGF0ZSwgMSkpLFxyXG4gIClcclxuICBjb25zdCBhY2NlcHQgPSBjb250cm9sKCd0cmV2aXhhbC10cmFja2NoYW5nZXNfX2FjY2VwdCcsICdBY2NlcHQnLCAoKSA9PiB0cmFjay5hY2NlcHQoY3VycmVudCgpKSlcclxuICBjb25zdCByZWplY3QgPSBjb250cm9sKCd0cmV2aXhhbC10cmFja2NoYW5nZXNfX3JlamVjdCcsICdSZWplY3QnLCAoKSA9PiB0cmFjay5yZWplY3QoY3VycmVudCgpKSlcclxuICBjb25zdCBhY2NlcHRBbGwgPSBjb250cm9sKCd0cmV2aXhhbC10cmFja2NoYW5nZXNfX2FjY2VwdC1hbGwnLCAnQWNjZXB0IGFsbCcsICgpID0+XHJcbiAgICB0cmFjay5hY2NlcHRBbGwoKSxcclxuICApXHJcbiAgY29uc3QgcmVqZWN0QWxsID0gY29udHJvbCgndHJldml4YWwtdHJhY2tjaGFuZ2VzX19yZWplY3QtYWxsJywgJ1JlamVjdCBhbGwnLCAoKSA9PlxyXG4gICAgdHJhY2sucmVqZWN0QWxsKCksXHJcbiAgKVxyXG4gIGdyb3VwLmFwcGVuZChwcmV2aW91cywgbmV4dCwgYWNjZXB0LCByZWplY3QsIGFjY2VwdEFsbCwgcmVqZWN0QWxsKVxyXG4gIHJvb3QuYXBwZW5kQ2hpbGQoZ3JvdXApXHJcbiAgb3B0aW9ucy5jb250YWluZXIuYXBwZW5kQ2hpbGQocm9vdClcclxuXHJcbiAgY29uc3QgcmVmcmVzaCA9ICgpOiB2b2lkID0+IHtcclxuICAgIGNvbnN0IHRvdGFsID0gdHJhY2suc3VnZ2VzdGlvbnMoKS5sZW5ndGhcclxuICAgIHRvZ2dsZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyh0cmFjay5pc0VuYWJsZWQpKVxyXG4gICAgdG9nZ2xlLmNsYXNzTGlzdC50b2dnbGUoJ3RyZXZpeGFsLXRyYWNrY2hhbmdlc19fdG9nZ2xlLS1vbicsIHRyYWNrLmlzRW5hYmxlZClcclxuICAgIGNvdW50LnRleHRDb250ZW50ID0gY291bnRMYWJlbCh0b3RhbClcclxuICAgIGNvbnN0IGF0Q2FyZXQgPSBzdWdnZXN0aW9uQXQodHJhY2ssIGVkaXRvci5zdGF0ZSkgIT09IG51bGxcclxuICAgIGFjY2VwdC5kaXNhYmxlZCA9ICFhdENhcmV0XHJcbiAgICByZWplY3QuZGlzYWJsZWQgPSAhYXRDYXJldFxyXG4gICAgcHJldmlvdXMuZGlzYWJsZWQgPSBuZXh0U3VnZ2VzdGlvbih0cmFjaywgZWRpdG9yLnN0YXRlLCAtMSkgPT09IG51bGxcclxuICAgIG5leHQuZGlzYWJsZWQgPSBuZXh0U3VnZ2VzdGlvbih0cmFjaywgZWRpdG9yLnN0YXRlLCAxKSA9PT0gbnVsbFxyXG4gICAgYWNjZXB0QWxsLmRpc2FibGVkID0gdG90YWwgPT09IDBcclxuICAgIHJlamVjdEFsbC5kaXNhYmxlZCA9IHRvdGFsID09PSAwXHJcbiAgfVxyXG5cclxuICBkaXNwb3NlcnMucHVzaChlZGl0b3Iub24oJ3RyYW5zYWN0aW9uJywgcmVmcmVzaCkpXHJcbiAgZGlzcG9zZXJzLnB1c2goZWRpdG9yLm9uKCdzZWxlY3Rpb25VcGRhdGUnLCByZWZyZXNoKSlcclxuICAvLyBTd2l0Y2hpbmcgbW9kZXMgcmFpc2VzIG5vIHRyYW5zYWN0aW9uLCBzbyB0aGUgdHdvIHN1YnNjcmlwdGlvbnMgYWJvdmVcclxuICAvLyBuZXZlciBoZWFyIGl0LiBUaGUgYmFyIHdvdWxkIGtlZXAgc2F5aW5nIFwib2ZmXCIgd2hpbGUgdGhlIG1lbnUgaGFkIGp1c3RcclxuICAvLyB0dXJuZWQgaXQgb24sIHVudGlsIHRoZSBuZXh0IGtleXN0cm9rZSBoYXBwZW5lZCB0byByZWZyZXNoIGl0LlxyXG4gIGRpc3Bvc2Vycy5wdXNoKHRyYWNrLm9uRW5hYmxlZENoYW5nZShyZWZyZXNoKSlcclxuICByZWZyZXNoKClcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGVsZW1lbnQ6IHJvb3QsXHJcbiAgICByZWZyZXNoLFxyXG4gICAgZGVzdHJveTogKCkgPT4ge1xyXG4gICAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2YgZGlzcG9zZXJzKSBkaXNwb3NlKClcclxuICAgICAgcm9vdC5yZW1vdmUoKVxyXG4gICAgfSxcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7XHJcbiAgdHlwZSBFZGl0b3IsXHJcbiAgdHlwZSBQYXRoLFxyXG4gIFNjaGVtYSxcclxuICBUZXh0U2VsZWN0aW9uLFxyXG4gIGNyZWF0ZUVkaXRvcixcclxuICBkZWZhdWx0TWFya3MsXHJcbiAgZGVmYXVsdE5vZGVzLFxyXG4gIHBvcyxcclxufSBmcm9tICdAdHJldml4YWwvY29yZSdcclxuaW1wb3J0IHsgVHJhY2tDaGFuZ2VzLCB0cmFja0NoYW5nZXNNYXJrcyB9IGZyb20gJ0B0cmV2aXhhbC9leHRlbnNpb24tdHJhY2stY2hhbmdlcydcclxuXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICBpbnRlcmZhY2UgV2luZG93IHtcclxuICAgIHRyYWNrQ2hhbmdlc1BhZ2U6IHtcclxuICAgICAgZWRpdG9yOiBFZGl0b3JcclxuICAgICAgc2VsZWN0UmFuZ2UoZnJvbVBhdGg6IFBhdGgsIGZyb21PZmZzZXQ6IG51bWJlciwgdG9QYXRoOiBQYXRoLCB0b09mZnNldDogbnVtYmVyKTogdm9pZFxyXG4gICAgICB0cmFjazogVHJhY2tDaGFuZ2VzXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5jb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hKHtcclxuICBub2RlczogZGVmYXVsdE5vZGVzKCksXHJcbiAgbWFya3M6IHsgLi4uZGVmYXVsdE1hcmtzKCksIC4uLnRyYWNrQ2hhbmdlc01hcmtzKCkgfSxcclxufSlcclxuXHJcbmZ1bmN0aW9uIG1vdW50KGlkOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKVxyXG4gIGlmICghZWxlbWVudCkgdGhyb3cgbmV3IEVycm9yKGBtaXNzaW5nICMke2lkfWApXHJcbiAgcmV0dXJuIGVsZW1lbnRcclxufVxyXG5cclxuY29uc3QgZWRpdG9yID0gY3JlYXRlRWRpdG9yKHsgc2NoZW1hLCBlbGVtZW50OiBtb3VudCgnZWRpdG9yJykgfSlcclxuY29uc3QgdHJhY2sgPSBuZXcgVHJhY2tDaGFuZ2VzKGVkaXRvciwgeyBhdXRob3I6ICdtZScgfSlcclxuXHJcbi8vIC0tLS0gcGFnZSBBUEkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxud2luZG93LnRyYWNrQ2hhbmdlc1BhZ2UgPSB7XHJcbiAgZWRpdG9yLFxyXG4gIC8vIFNlbGVjdGlvbnMgYSBrZXlib2FyZCBjYW5ub3QgcmVsaWFibHkgbWFrZSBmcm9tIFBsYXl3cmlnaHQ7IHRoZSBzcGVjIG5lZWRzXHJcbiAgLy8gYW4gZXhhY3QgcmFuZ2UsIG5vdCB3aGF0ZXZlciBhIGRvdWJsZS1jbGljayBoYXBwZW5zIHRvIHBpY2suXHJcbiAgc2VsZWN0UmFuZ2U6IChmcm9tUGF0aCwgZnJvbU9mZnNldCwgdG9QYXRoLCB0b09mZnNldCkgPT4ge1xyXG4gICAgZWRpdG9yLmRpc3BhdGNoKFxyXG4gICAgICBlZGl0b3Iuc3RhdGUudHIuc2V0U2VsZWN0aW9uKFxyXG4gICAgICAgIG5ldyBUZXh0U2VsZWN0aW9uKHBvcyhmcm9tUGF0aCwgZnJvbU9mZnNldCksIHBvcyh0b1BhdGgsIHRvT2Zmc2V0KSksXHJcbiAgICAgICksXHJcbiAgICApXHJcbiAgfSxcclxuICB0cmFjayxcclxufVxyXG5cclxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RjLWVuYWJsZScpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRyYWNrLmVuYWJsZSgpKVxyXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndGMtYWNjZXB0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdHJhY2suYWNjZXB0QWxsKCkpXHJcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0Yy1yZWplY3QnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0cmFjay5yZWplY3RBbGwoKSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBR08sTUFBTSxhQUFvQixPQUFPLE9BQU8sQ0FBQSxDQUFFO0FBRzFDLFdBQVMsUUFBUSxHQUFVLEdBQW1CO0FBQ25ELFFBQUksTUFBTSxFQUFHLFFBQU87QUFDcEIsVUFBTSxRQUFRLE9BQU8sS0FBSyxDQUFDO0FBQzNCLFVBQU0sUUFBUSxPQUFPLEtBQUssQ0FBQztBQUMzQixRQUFJLE1BQU0sV0FBVyxNQUFNLE9BQVEsUUFBTztBQUMxQyxXQUFPLE1BQU0sTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLE1BQU0sRUFBRSxHQUFHLENBQUM7RUFDL0M7QUFHTyxXQUFTLGFBQ2QsV0FDQSxPQUNBLE9BQ087QUFDUCxRQUFJLENBQUMsVUFBVyxRQUFPO0FBQ3ZCLFVBQU0sU0FBa0MsQ0FBQTtBQUN4QyxlQUFXLENBQUMsTUFBTSxJQUFJLEtBQUssT0FBTyxRQUFRLFNBQVMsR0FBRztBQUNwRCxVQUFJLFNBQVMsUUFBUSxPQUFPO0FBQzFCLGVBQU8sSUFBSSxJQUFJLE1BQU0sSUFBSTtNQUMzQixXQUFXLGFBQWEsTUFBTTtBQUM1QixlQUFPLElBQUksSUFBSSxLQUFLO01BQ3RCLE9BQU87QUFDTCxjQUFNLElBQUksV0FBVywrQkFBK0IsSUFBSSxRQUFRLEtBQUssRUFBRTtNQUN6RTtJQUNGO0FBQ0EsV0FBTyxPQUFPLE9BQU8sTUFBTTtFQUM3QjtBQ25CTyxNQUFNLE9BQU4sTUFBVztJQUNoQixZQUNXLE1BQ0EsT0FDVDtBQUZTLFdBQUEsT0FBQTtBQUNBLFdBQUEsUUFBQTtJQUNSO0lBRlE7SUFDQTtJQUdYLEdBQUcsT0FBc0I7QUFDdkIsYUFBTyxTQUFTLFNBQVUsS0FBSyxTQUFTLE1BQU0sUUFBUSxRQUFRLEtBQUssT0FBTyxNQUFNLEtBQUs7SUFDdkY7SUFFQSxRQUFRLEtBQStCO0FBQ3JDLGFBQU8sSUFBSSxLQUFLLENBQUMsU0FBUyxLQUFLLEdBQUcsSUFBSSxDQUFDO0lBQ3pDOzs7OztJQU1BLFNBQVMsS0FBdUM7QUFDOUMsVUFBSSxLQUFLLFFBQVEsR0FBRyxFQUFHLFFBQU87QUFDOUIsWUFBTSxPQUFPLElBQUk7UUFDZixDQUFDLFNBQVMsQ0FBQyxLQUFLLEtBQUssU0FBUyxLQUFLLElBQUksS0FBSyxDQUFDLEtBQUssS0FBSyxTQUFTLEtBQUssSUFBSTtNQUFBO0FBRTNFLFlBQU0sU0FBUyxDQUFDLEdBQUcsTUFBTSxJQUFJLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssT0FBTyxFQUFFLEtBQUssSUFBSTtBQUN2RSxhQUFPO0lBQ1Q7SUFFQSxjQUFjLEtBQXVDO0FBQ25ELFlBQU0sU0FBUyxJQUFJLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztBQUNsRCxhQUFPLE9BQU8sV0FBVyxJQUFJLFNBQVMsTUFBTTtJQUM5QztJQUVBLFNBQW1CO0FBQ2pCLGFBQU8sT0FBTyxLQUFLLEtBQUssS0FBSyxFQUFFLFNBQVMsSUFDcEMsRUFBRSxNQUFNLEtBQUssS0FBSyxNQUFNLE9BQU8sRUFBRSxHQUFHLEtBQUssTUFBQSxFQUFNLElBQy9DLEVBQUUsTUFBTSxLQUFLLEtBQUssS0FBQTtJQUN4QjtFQUNGO0FBRU8sTUFBTSxVQUEyQixPQUFPLE9BQU8sQ0FBQSxDQUFFO0FBRWpELFdBQVMsUUFBUSxHQUFvQixHQUE2QjtBQUN2RSxRQUFJLE1BQU0sRUFBRyxRQUFPO0FBQ3BCLFFBQUksRUFBRSxXQUFXLEVBQUUsT0FBUSxRQUFPO0FBQ2xDLFdBQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO0VBQzNDO0FDdkRPLE1BQU0sV0FBTixNQUFNLFVBQVM7SUFDWixZQUFxQixVQUFpQztBQUFqQyxXQUFBLFdBQUE7SUFBa0M7SUFBbEM7SUFFN0IsT0FBZ0IsUUFBa0IsSUFBSSxVQUFTLE9BQU8sT0FBTyxDQUFBLENBQUUsQ0FBQztJQUVoRSxPQUFPLEtBQUssT0FBd0M7QUFDbEQsYUFBTyxNQUFNLFdBQVcsSUFBSSxVQUFTLFFBQVEsSUFBSSxVQUFTLE9BQU8sT0FBTyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDckY7SUFFQSxPQUFPLE1BQU0sT0FBK0I7QUFDMUMsYUFBTyxVQUFTLEtBQUssS0FBSztJQUM1QjtJQUVBLElBQUksYUFBcUI7QUFDdkIsYUFBTyxLQUFLLFNBQVM7SUFDdkI7SUFFQSxNQUFNLE9BQTJCO0FBQy9CLFlBQU0sT0FBTyxLQUFLLFNBQVMsS0FBSztBQUNoQyxVQUFJLENBQUMsS0FBTSxPQUFNLElBQUksV0FBVyx3QkFBd0IsS0FBSyxlQUFlO0FBQzVFLGFBQU87SUFDVDtJQUVBLFdBQVcsT0FBa0M7QUFDM0MsYUFBTyxLQUFLLFNBQVMsS0FBSyxLQUFLO0lBQ2pDO0lBRUEsYUFBYSxPQUFlLE1BQTRCO0FBQ3RELFlBQU0sT0FBTyxDQUFDLEdBQUcsS0FBSyxRQUFRO0FBQzlCLFdBQUssS0FBSyxJQUFJO0FBQ2QsYUFBTyxVQUFTLEtBQUssSUFBSTtJQUMzQjs7SUFHQSxhQUFhLE1BQWMsSUFBWSxRQUE0QjtBQUNqRSxhQUFPLFVBQVMsS0FBSztRQUNuQixHQUFHLEtBQUssU0FBUyxNQUFNLEdBQUcsSUFBSTtRQUM5QixHQUFHLE9BQU87UUFDVixHQUFHLEtBQUssU0FBUyxNQUFNLEVBQUU7TUFBQSxDQUMxQjtJQUNIO0lBRUEsTUFBTSxNQUFjLEtBQWEsS0FBSyxZQUFzQjtBQUMxRCxhQUFPLFVBQVMsS0FBSyxLQUFLLFNBQVMsTUFBTSxNQUFNLEVBQUUsQ0FBQztJQUNwRDtJQUVBLE9BQU8sT0FBMkI7QUFDaEMsVUFBSSxNQUFNLGVBQWUsRUFBRyxRQUFPO0FBQ25DLFVBQUksS0FBSyxlQUFlLEVBQUcsUUFBTztBQUNsQyxhQUFPLFVBQVMsS0FBSyxDQUFDLEdBQUcsS0FBSyxVQUFVLEdBQUcsTUFBTSxRQUFRLENBQUM7SUFDNUQ7SUFFQSxHQUFHLE9BQTBCO0FBQzNCLFVBQUksU0FBUyxNQUFPLFFBQU87QUFDM0IsVUFBSSxLQUFLLGVBQWUsTUFBTSxXQUFZLFFBQU87QUFDakQsYUFBTyxLQUFLLFNBQVMsTUFBTSxDQUFDLE9BQU8sTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3RFO0lBRUEsU0FBb0I7QUFDbEIsYUFBTyxLQUFLLFNBQVMsSUFBSSxDQUFDLFVBQVUsTUFBTSxPQUFBLENBQVE7SUFDcEQ7RUFDRjtBQzlDTyxNQUFNLGFBQU4sTUFBTSxZQUFXO0lBQ3RCLFlBQ1csTUFDQSxRQUFlLFlBQ2YsVUFBb0IsU0FBUyxPQUM3QixRQUF5QixTQUNsQztBQUpTLFdBQUEsT0FBQTtBQUNBLFdBQUEsUUFBQTtBQUNBLFdBQUEsVUFBQTtBQUNBLFdBQUEsUUFBQTtJQUNSO0lBSlE7SUFDQTtJQUNBO0lBQ0E7SUFHWCxJQUFJLFNBQWtCO0FBQ3BCLGFBQU87SUFDVDtJQUVBLElBQUksV0FBb0I7QUFDdEIsYUFBTyxLQUFLLEtBQUs7SUFDbkI7SUFFQSxJQUFJLFVBQW1CO0FBQ3JCLGFBQU8sQ0FBQyxLQUFLLEtBQUs7SUFDcEI7O0lBR0EsSUFBSSxTQUFrQjtBQUNwQixhQUFPLEtBQUssS0FBSztJQUNuQjs7SUFHQSxJQUFJLGNBQXVCO0FBQ3pCLGFBQU8sS0FBSyxLQUFLO0lBQ25CO0lBRUEsSUFBSSxhQUFxQjtBQUN2QixhQUFPLEtBQUssUUFBUTtJQUN0QjtJQUVBLE1BQU0sT0FBMkI7QUFDL0IsYUFBTyxLQUFLLFFBQVEsTUFBTSxLQUFLO0lBQ2pDO0lBRUEsSUFBSSxjQUFzQjtBQUN4QixVQUFJLE9BQU87QUFDWCxpQkFBVyxTQUFTLEtBQUssUUFBUSxVQUFVO0FBQ3pDLGdCQUFRLE1BQU0sU0FBVSxNQUFtQixPQUFPLE1BQU07TUFDMUQ7QUFDQSxhQUFPO0lBQ1Q7SUFFQSxZQUFZLFNBQStCO0FBQ3pDLGFBQU8sSUFBSSxZQUFXLEtBQUssTUFBTSxLQUFLLE9BQU8sU0FBUyxLQUFLLEtBQUs7SUFDbEU7SUFFQSxVQUFVLE9BQTBCO0FBQ2xDLGFBQU8sSUFBSSxZQUFXLEtBQUssTUFBTSxPQUFPLEtBQUssU0FBUyxLQUFLLEtBQUs7SUFDbEU7SUFFQSxVQUFVLE9BQW9DO0FBQzVDLGFBQU8sSUFBSSxZQUFXLEtBQUssTUFBTSxLQUFLLE9BQU8sS0FBSyxTQUFTLEtBQUs7SUFDbEU7SUFFQSxHQUFHLE9BQTRCO0FBQzdCLFVBQUksU0FBUyxNQUFPLFFBQU87QUFDM0IsYUFDRSxLQUFLLFNBQVMsTUFBTSxRQUNwQixRQUFRLEtBQUssT0FBTyxNQUFNLEtBQUssS0FDL0IsUUFBUSxLQUFLLE9BQU8sTUFBTSxLQUFLLEtBQy9CLEtBQUssUUFBUSxHQUFHLE1BQU0sT0FBTztJQUVqQztJQUVBLFNBQW1CO0FBQ2pCLFlBQU0sT0FLRixFQUFFLE1BQU0sS0FBSyxLQUFLLEtBQUE7QUFDdEIsWUFBTSxRQUFRLGdCQUFnQixLQUFLLEtBQUssS0FBSyxPQUFPLEtBQUssS0FBSztBQUM5RCxVQUFJLE1BQUEsTUFBWSxRQUFRO0FBQ3hCLFVBQUksS0FBSyxRQUFRLGFBQWEsRUFBQSxNQUFRLFVBQVUsS0FBSyxRQUFRLFNBQVMsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFBLENBQVE7QUFDM0YsVUFBSSxLQUFLLE1BQU0sU0FBUyxFQUFHLE1BQUssUUFBUSxLQUFLLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFBLENBQVE7QUFDeEUsYUFBTztJQUNUO0VBQ0Y7QUFHTyxNQUFNLFdBQU4sTUFBTSxrQkFBaUIsV0FBVztJQUN2QyxZQUNFLE1BQ1MsTUFDVCxRQUF5QixTQUN6QjtBQUNBLFVBQUksS0FBSyxXQUFXLEVBQUcsT0FBTSxJQUFJLFdBQVcsMkJBQTJCO0FBQ3ZFLFlBQU0sTUFBTSxZQUFZLFNBQVMsT0FBTyxLQUFLO0FBSnBDLFdBQUEsT0FBQTtJQUtYO0lBTFc7SUFPWCxJQUFhLFNBQWtCO0FBQzdCLGFBQU87SUFDVDtJQUVBLElBQWEsY0FBc0I7QUFDakMsYUFBTyxLQUFLO0lBQ2Q7SUFFQSxTQUFTLE1BQXdCO0FBQy9CLGFBQU8sSUFBSSxVQUFTLEtBQUssTUFBTSxNQUFNLEtBQUssS0FBSztJQUNqRDtJQUVTLFVBQVUsT0FBa0M7QUFDbkQsYUFBTyxJQUFJLFVBQVMsS0FBSyxNQUFNLEtBQUssTUFBTSxLQUFLO0lBQ2pEO0lBRUEsSUFBSSxNQUFjLEtBQWEsS0FBSyxLQUFLLFFBQWtCO0FBQ3pELGFBQU8sS0FBSyxTQUFTLEtBQUssS0FBSyxNQUFNLE1BQU0sRUFBRSxDQUFDO0lBQ2hEO0lBRVMsR0FBRyxPQUE0QjtBQUN0QyxVQUFJLFNBQVMsTUFBTyxRQUFPO0FBQzNCLGFBQ0UsTUFBTSxVQUFXLE1BQW1CLFNBQVMsS0FBSyxRQUFRLFFBQVEsS0FBSyxPQUFPLE1BQU0sS0FBSztJQUU3RjtJQUVTLFNBQW1CO0FBQzFCLFlBQU0sT0FBMkQ7UUFDL0QsTUFBTSxLQUFLLEtBQUs7UUFDaEIsTUFBTSxLQUFLO01BQUE7QUFFYixVQUFJLEtBQUssTUFBTSxTQUFTLEVBQUcsTUFBSyxRQUFRLEtBQUssTUFBTSxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQUEsQ0FBUTtBQUN4RSxhQUFPO0lBQ1Q7RUFDRjtBQU9BLFdBQVMsZ0JBQ1AsV0FDQSxPQUNxQztBQUNyQyxVQUFNLE1BQStCLENBQUE7QUFDckMsZUFBVyxDQUFDLE1BQU0sS0FBSyxLQUFLLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDakQsWUFBTSxPQUFPLFlBQVksSUFBSTtBQUM3QixVQUFJLFFBQVEsYUFBYSxRQUFRLEtBQUssWUFBWSxNQUFPO0FBQ3pELFVBQUksSUFBSSxJQUFJO0lBQ2Q7QUFDQSxXQUFPLE9BQU8sS0FBSyxHQUFHLEVBQUUsU0FBUyxJQUFJLE1BQU07RUFDN0M7QUN2SkEsTUFBTSxlQUFlO0FBRWQsV0FBUyxpQkFDZCxNQUNBLGFBQ3dCO0FBQ3hCLFVBQU0sVUFBVSxLQUFLLEtBQUE7QUFDckIsUUFBSSxZQUFZLEdBQUksUUFBTyxDQUFBO0FBQzNCLFdBQU8sUUFBUSxNQUFNLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVTtBQUN6QyxZQUFNLFFBQVEsYUFBYSxLQUFLLEtBQUs7QUFDckMsVUFBSSxDQUFDLE1BQU8sT0FBTSxJQUFJLFlBQVksb0NBQW9DLEtBQUssU0FBUyxJQUFJLEdBQUc7QUFDM0YsWUFBTSxDQUFBLEVBQUcsTUFBTSxVQUFVLElBQUk7QUFDN0IsWUFBTSxRQUFRLFlBQVksSUFBYztBQUN4QyxVQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3RCLGNBQU0sSUFBSSxXQUFXLDBCQUEwQixJQUFJLDRCQUE0QixJQUFJLEdBQUc7TUFDeEY7QUFDQSxjQUFRLFlBQUE7UUFDTixLQUFLO0FBQ0gsaUJBQU8sRUFBRSxPQUFPLElBQUksSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssT0FBTyxrQkFBQTtRQUN0RCxLQUFLO0FBQ0gsaUJBQU8sRUFBRSxPQUFPLElBQUksSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssT0FBTyxrQkFBQTtRQUN0RCxLQUFLO0FBQ0gsaUJBQU8sRUFBRSxPQUFPLElBQUksSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssRUFBQTtRQUMvQztBQUNFLGlCQUFPLEVBQUUsT0FBTyxJQUFJLElBQUksS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLEVBQUE7TUFBRTtJQUVyRCxDQUFDO0VBQ0g7QUFHTyxXQUFTLGVBQ2QsT0FDQSxZQUNTO0FBQ1QsUUFBSSxJQUFJO0FBQ1IsZUFBVyxRQUFRLE9BQU87QUFDeEIsVUFBSUEsU0FBUTtBQUNaLGFBQU8sSUFBSSxXQUFXLFVBQVVBLFNBQVEsS0FBSyxPQUFPLEtBQUssTUFBTSxJQUFJLFdBQVcsQ0FBQyxDQUFDLEdBQUc7QUFDakY7QUFDQUE7TUFDRjtBQUNBLFVBQUlBLFNBQVEsS0FBSyxJQUFLLFFBQU87SUFDL0I7QUFDQSxXQUFPLE1BQU0sV0FBVztFQUMxQjtBQ2NPLE1BQU0sV0FBTixNQUFlO0lBTXBCLFlBQ1csTUFDQUMsU0FDQSxNQUNUO0FBSFMsV0FBQSxPQUFBO0FBQ0EsV0FBQSxTQUFBQTtBQUNBLFdBQUEsT0FBQTtJQUNSO0lBSFE7SUFDQTtJQUNBO0lBUkgsZUFBdUMsQ0FBQTtJQUN2QyxlQUFxRDs7SUFFN0QsZ0JBQWdCO0lBUWhCLElBQUksU0FBa0I7QUFDcEIsYUFBTyxLQUFLLFNBQVM7SUFDdkI7SUFFQSxJQUFJLFdBQW9CO0FBQ3RCLGFBQU8sS0FBSyxVQUFVLEtBQUssS0FBSyxXQUFXO0lBQzdDO0lBRUEsSUFBSSxTQUFrQjtBQUNwQixhQUFPLEtBQUssS0FBSyxTQUFTO0lBQzVCO0lBRUEsSUFBSSxTQUE0QjtBQUM5QixhQUFPLEtBQUssS0FBSyxRQUFRLEtBQUssS0FBSyxNQUFNLE1BQU0sS0FBSyxJQUFJLENBQUE7SUFDMUQ7O0lBR0EsUUFBUSxhQUF3RDtBQUM5RCxXQUFLLGVBQWUsS0FBSyxLQUFLLFVBQVUsaUJBQWlCLEtBQUssS0FBSyxTQUFTLFdBQVcsSUFBSSxDQUFBO0FBQzNGLFlBQU0sYUFBQSxvQkFBaUIsSUFBQTtBQUN2QixpQkFBVyxRQUFRLEtBQUssY0FBYztBQUNwQyxtQkFBVyxRQUFRLEtBQUssTUFBTyxZQUFXLElBQUksSUFBSTtNQUNwRDtBQUNBLFlBQU0sYUFBYSxDQUFDLEdBQUcsVUFBVSxFQUFFLElBQUksQ0FBQyxTQUFTLEtBQUssT0FBTyxTQUFTLElBQUksQ0FBQztBQUMzRSxZQUFNLFlBQVksV0FBVyxLQUFLLENBQUMsU0FBUyxLQUFLLFFBQVE7QUFDekQsWUFBTSxXQUFXLFdBQVcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLFFBQVE7QUFDekQsVUFBSSxhQUFhLFVBQVU7QUFDekIsY0FBTSxJQUFJLFdBQVcsU0FBUyxLQUFLLElBQUksa0NBQWtDO01BQzNFO0FBQ0EsV0FBSyxnQkFBZ0I7QUFDckIsWUFBTSxRQUFRLEtBQUssS0FBSztBQUN4QixVQUFJLFVBQVUsUUFBVztBQUN2QixhQUFLLGVBQWUsS0FBSyxnQkFBZ0IsUUFBUTtNQUNuRCxXQUFXLFVBQVUsS0FBSztBQUN4QixhQUFLLGVBQWU7TUFDdEIsV0FBVyxNQUFNLEtBQUEsTUFBVyxJQUFJO0FBQzlCLGFBQUssZUFBZTtNQUN0QixPQUFPO0FBQ0wsYUFBSyxlQUFlLElBQUksSUFBSSxNQUFNLEtBQUEsRUFBTyxNQUFNLEtBQUssQ0FBQztNQUN2RDtJQUNGO0lBRUEsYUFBYSxTQUE0QjtBQUN2QyxhQUFPO1FBQ0wsS0FBSztRQUNMLFFBQVEsU0FBUyxJQUFJLENBQUMsVUFBVSxNQUFNLEtBQUssSUFBSTtNQUFBO0lBRW5EO0lBRUEsZUFBZSxVQUE2QjtBQUMxQyxVQUFJLEtBQUssaUJBQWlCLE1BQU8sUUFBTztBQUN4QyxVQUFJLEtBQUssaUJBQWlCLE9BQVEsUUFBTztBQUN6QyxhQUFPLEtBQUssYUFBYSxJQUFJLFNBQVMsSUFBSTtJQUM1Qzs7SUFHQSxJQUFJLHFCQUE4QjtBQUNoQyxhQUFPLGVBQWUsS0FBSyxjQUFjLENBQUEsQ0FBRTtJQUM3QztJQUVBLE9BQ0UsT0FDQSxVQUFvQixTQUFTLE9BQzdCLFFBQXlCLFNBQ2I7QUFDWixVQUFJLEtBQUssT0FBUSxPQUFNLElBQUksV0FBVyx3Q0FBd0M7QUFDOUUsYUFBTyxJQUFJO1FBQ1Q7UUFDQSxhQUFhLEtBQUssS0FBSyxPQUFPLE9BQU8sU0FBUyxLQUFLLElBQUksR0FBRztRQUMxRDtRQUNBO01BQUE7SUFFSjs7SUFHQSxjQUNFLE9BQ0EsVUFBb0IsU0FBUyxPQUM3QixRQUF5QixTQUNiO0FBQ1osVUFBSSxDQUFDLEtBQUssYUFBYSxPQUFPLEdBQUc7QUFDL0IsY0FBTSxJQUFJLFdBQVcsa0NBQWtDLEtBQUssSUFBSSxHQUFHO01BQ3JFO0FBQ0EsYUFBTyxLQUFLLE9BQU8sT0FBTyxTQUFTLEtBQUs7SUFDMUM7RUFDRjtBQUVPLE1BQU0sV0FBTixNQUFlO0lBR3BCLFlBQ1csTUFDQSxNQUNBLE1BQ1Q7QUFIUyxXQUFBLE9BQUE7QUFDQSxXQUFBLE9BQUE7QUFDQSxXQUFBLE9BQUE7QUFFVCxZQUFNLFdBQVcsS0FBSztBQUN0QixVQUFJLGFBQWEsS0FBSztBQUNwQixhQUFLLFdBQVc7TUFDbEIsT0FBTztBQUNMLGNBQU0sUUFBUSxXQUFXLFNBQVMsS0FBQSxFQUFPLE1BQU0sS0FBSyxFQUFFLE9BQU8sT0FBTyxJQUFJLENBQUE7QUFDeEUsYUFBSyxXQUFXLElBQUksSUFBSSxLQUFLO01BQy9CO0lBQ0Y7SUFYVztJQUNBO0lBQ0E7SUFMSDs7SUFpQlIsU0FBUyxPQUEwQjtBQUNqQyxVQUFJLFVBQVUsS0FBTSxRQUFPO0FBQzNCLFVBQUksS0FBSyxhQUFhLE1BQU8sUUFBTztBQUNwQyxhQUFPLEtBQUssU0FBUyxJQUFJLE1BQU0sSUFBSTtJQUNyQztJQUVBLE9BQU8sT0FBcUI7QUFDMUIsYUFBTyxJQUFJLEtBQUssTUFBTSxhQUFhLEtBQUssS0FBSyxPQUFPLE9BQU8sU0FBUyxLQUFLLElBQUksR0FBRyxDQUFDO0lBQ25GO0VBQ0Y7QUFNTyxNQUFNLFNBQU4sTUFBYTtJQU1sQixZQUFxQixNQUFrQjtBQUFsQixXQUFBLE9BQUE7QUFDbkIsWUFBTSxRQUFrQyxDQUFBO0FBQ3hDLGlCQUFXLENBQUMsTUFBTSxRQUFRLEtBQUssT0FBTyxRQUFRLEtBQUssS0FBSyxHQUFHO0FBQ3pELGNBQU0sSUFBSSxJQUFJLElBQUksU0FBUyxNQUFNLE1BQU0sUUFBUTtNQUNqRDtBQUNBLFlBQU0sUUFBa0MsQ0FBQTtBQUN4QyxVQUFJLE9BQU87QUFDWCxpQkFBVyxDQUFDLE1BQU0sUUFBUSxLQUFLLE9BQU8sUUFBUSxLQUFLLFNBQVMsQ0FBQSxDQUFFLEdBQUc7QUFDL0QsY0FBTSxJQUFJLElBQUksSUFBSSxTQUFTLE1BQU0sUUFBUSxRQUFRO01BQ25EO0FBQ0EsV0FBSyxRQUFRO0FBQ2IsV0FBSyxRQUFRO0FBRWIsWUFBTSxVQUFVLEtBQUssV0FBVztBQUNoQyxZQUFNLE1BQU0sTUFBTSxPQUFPO0FBQ3pCLFVBQUksQ0FBQyxJQUFLLE9BQU0sSUFBSSxXQUFXLHdDQUF3QyxPQUFPLEdBQUc7QUFDakYsWUFBTSxPQUFPLE1BQU07QUFDbkIsVUFBSSxDQUFDLEtBQU0sT0FBTSxJQUFJLFdBQVcsaURBQWlEO0FBQ2pGLFdBQUssVUFBVTtBQUNmLFdBQUssV0FBVztBQUVoQixZQUFNLFNBQUEsb0JBQWEsSUFBQTtBQUNuQixpQkFBVyxRQUFRLE9BQU8sT0FBTyxLQUFLLEdBQUc7QUFDdkMsbUJBQVcsU0FBUyxLQUFLLFFBQVE7QUFDL0IsZ0JBQU0sVUFBVSxPQUFPLElBQUksS0FBSyxLQUFLLENBQUE7QUFDckMsa0JBQVEsS0FBSyxLQUFLLElBQUk7QUFDdEIsaUJBQU8sSUFBSSxPQUFPLE9BQU87UUFDM0I7TUFDRjtBQUNBLFlBQU0sY0FBYyxDQUFDLFNBQW9DO0FBQ3ZELFlBQUksTUFBTSxJQUFJLEVBQUcsUUFBTyxDQUFDLElBQUk7QUFDN0IsZUFBTyxPQUFPLElBQUksSUFBSSxLQUFLLENBQUE7TUFDN0I7QUFDQSxpQkFBVyxRQUFRLE9BQU8sT0FBTyxLQUFLLEVBQUcsTUFBSyxRQUFRLFdBQVc7SUFDbkU7SUFsQ3FCO0lBTFo7SUFDQTtJQUNBO0lBQ0E7SUFzQ1QsU0FBUyxNQUF3QjtBQUMvQixZQUFNLE9BQU8sS0FBSyxNQUFNLElBQUk7QUFDNUIsVUFBSSxDQUFDLEtBQU0sT0FBTSxJQUFJLFdBQVcsc0JBQXNCLElBQUksR0FBRztBQUM3RCxhQUFPO0lBQ1Q7SUFFQSxTQUFTLE1BQXdCO0FBQy9CLFlBQU0sT0FBTyxLQUFLLE1BQU0sSUFBSTtBQUM1QixVQUFJLENBQUMsS0FBTSxPQUFNLElBQUksV0FBVyxzQkFBc0IsSUFBSSxHQUFHO0FBQzdELGFBQU87SUFDVDtJQUVBLEtBQ0UsTUFDQSxPQUNBLFNBQ0EsT0FDWTtBQUNaLFlBQU0sV0FBVyxtQkFBbUIsV0FBVyxVQUFVLFNBQVMsS0FBSyxXQUFXLENBQUEsQ0FBRTtBQUNwRixhQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsT0FBTyxPQUFPLFVBQVUsS0FBSztJQUMxRDtJQUVBLEtBQUssTUFBYyxRQUF5QixTQUFtQjtBQUM3RCxhQUFPLElBQUksU0FBUyxLQUFLLFVBQVUsTUFBTSxLQUFLO0lBQ2hEO0lBRUEsS0FBSyxNQUFjLE9BQXFCO0FBQ3RDLGFBQU8sS0FBSyxTQUFTLElBQUksRUFBRSxPQUFPLEtBQUs7SUFDekM7O0lBR0EscUJBQStCO0FBQzdCLGlCQUFXLFFBQVEsT0FBTyxPQUFPLEtBQUssS0FBSyxHQUFHO0FBQzVDLFlBQUksQ0FBQyxLQUFLLFVBQVUsS0FBSyxpQkFBaUIsQ0FBQyxLQUFLLFNBQVUsUUFBTztNQUNuRTtBQUNBLFlBQU0sSUFBSSxXQUFXLG1DQUFtQztJQUMxRDtFQUNGO0FDbFJPLFdBQVMsV0FBVyxNQUEwQjtBQUNuRCxXQUFPLEtBQUssU0FBVSxLQUFrQixLQUFLLFNBQVM7RUFDeEQ7QUFFTyxXQUFTLGFBQWEsTUFBd0I7QUFDbkQsV0FBTyxLQUFLLFNBQVMsT0FBTyxDQUFDLEtBQUssVUFBVSxNQUFNLFdBQVcsS0FBSyxHQUFHLENBQUM7RUFDeEU7QUFHQSxXQUFTLG1CQUFtQixNQUFzQjtBQUNoRCxRQUFJLEtBQUssV0FBVyxFQUFHLFFBQU87QUFDOUIsUUFBSSxPQUFPLFNBQVMsZUFBZSxlQUFlLE1BQU07QUFDdEQsVUFBSSxPQUFPO0FBQ1gsaUJBQVcsRUFBRSxRQUFBLEtBQWEsSUFBSSxLQUFLLFVBQUEsRUFBWSxRQUFRLElBQUksRUFBRyxRQUFPO0FBQ3JFLGFBQU8sS0FBSztJQUNkO0FBQ0EsVUFBTSxZQUFZLEtBQUssWUFBWSxLQUFLLFNBQVMsQ0FBQztBQUNsRCxXQUFPLGNBQWMsVUFBYSxZQUFZLFFBQVMsSUFBSTtFQUM3RDtBQUVBLFdBQVMsb0JBQW9CLE1BQXNCO0FBQ2pELFFBQUksS0FBSyxXQUFXLEVBQUcsUUFBTztBQUM5QixRQUFJLE9BQU8sU0FBUyxlQUFlLGVBQWUsTUFBTTtBQUN0RCxpQkFBVyxFQUFFLFFBQUEsS0FBYSxJQUFJLEtBQUssVUFBQSxFQUFZLFFBQVEsSUFBSSxFQUFHLFFBQU8sUUFBUTtJQUMvRTtBQUNBLFVBQU0sWUFBWSxLQUFLLFlBQVksQ0FBQztBQUNwQyxXQUFPLGNBQWMsVUFBYSxZQUFZLFFBQVMsSUFBSTtFQUM3RDtBQUdPLFdBQVMsdUJBQXVCLE1BQWdCLFFBQXdCO0FBQzdFLFFBQUksVUFBVSxFQUFHLFFBQU87QUFDeEIsUUFBSUMsT0FBTTtBQUNWLGVBQVcsU0FBUyxLQUFLLFVBQVU7QUFDakMsWUFBTSxPQUFPLFdBQVcsS0FBSztBQUM3QixZQUFNLE1BQU1BLE9BQU07QUFDbEIsVUFBSSxTQUFTQSxRQUFPLFVBQVUsS0FBSztBQUNqQyxZQUFJLENBQUMsTUFBTSxPQUFRLFFBQU9BO0FBQzFCLGNBQU0sUUFBUSxTQUFTQTtBQUN2QixlQUFPLFNBQVMsbUJBQW9CLE1BQW1CLEtBQUssTUFBTSxHQUFHLEtBQUssQ0FBQztNQUM3RTtBQUNBQSxhQUFNO0lBQ1I7QUFDQSxXQUFPO0VBQ1Q7QUFHTyxXQUFTLG1CQUFtQixNQUFnQixRQUF3QjtBQUN6RSxRQUFJLFVBQVUsYUFBYSxJQUFJLEVBQUcsUUFBTztBQUN6QyxRQUFJQSxPQUFNO0FBQ1YsZUFBVyxTQUFTLEtBQUssVUFBVTtBQUNqQyxZQUFNLE9BQU8sV0FBVyxLQUFLO0FBQzdCLFlBQU0sTUFBTUEsT0FBTTtBQUNsQixVQUFJLFVBQVVBLFFBQU8sU0FBUyxLQUFLO0FBQ2pDLFlBQUksQ0FBQyxNQUFNLE9BQVEsUUFBTztBQUMxQixjQUFNLFFBQVEsU0FBU0E7QUFDdkIsZUFBTyxTQUFTLG9CQUFxQixNQUFtQixLQUFLLE1BQU0sS0FBSyxDQUFDO01BQzNFO0FBQ0FBLGFBQU07SUFDUjtBQUNBLFdBQU87RUFDVDtBQUdPLFdBQVMsWUFBWSxNQUFnQixNQUFjLElBQXNCO0FBQzlFLFFBQUksUUFBUSxHQUFJLFFBQU8sU0FBUztBQUNoQyxVQUFNLE1BQW9CLENBQUE7QUFDMUIsUUFBSUEsT0FBTTtBQUNWLGVBQVcsU0FBUyxLQUFLLFVBQVU7QUFDakMsWUFBTSxPQUFPLFdBQVcsS0FBSztBQUM3QixZQUFNLFFBQVFBO0FBQ2QsWUFBTSxNQUFNQSxPQUFNO0FBQ2xCQSxhQUFNO0FBQ04sVUFBSSxPQUFPLEtBQU07QUFDakIsVUFBSSxTQUFTLEdBQUk7QUFDakIsVUFBSSxNQUFNLFFBQVE7QUFDaEIsY0FBTSxVQUFVLEtBQUssSUFBSSxPQUFPLE9BQU8sQ0FBQztBQUN4QyxjQUFNLFFBQVEsS0FBSyxJQUFJLEtBQUssT0FBTyxJQUFJO0FBQ3ZDLFlBQUksS0FBSyxZQUFZLEtBQUssVUFBVSxPQUFPLFFBQVMsTUFBbUIsSUFBSSxTQUFTLEtBQUssQ0FBQztNQUM1RixXQUFXLFNBQVMsUUFBUSxPQUFPLElBQUk7QUFDckMsWUFBSSxLQUFLLEtBQUs7TUFDaEI7SUFDRjtBQUNBLFdBQU8sU0FBUyxLQUFLLEdBQUc7RUFDMUI7QUFHTyxXQUFTLFlBQVksTUFBMEI7QUFDcEQsVUFBTSxNQUFvQixDQUFBO0FBQzFCLGVBQVcsU0FBUyxLQUFLLFVBQVU7QUFDakMsWUFBTSxPQUFPLElBQUksSUFBSSxTQUFTLENBQUM7QUFDL0IsVUFBSSxNQUFNLFVBQVUsTUFBTSxVQUFVLFFBQVEsS0FBSyxPQUFPLE1BQU0sS0FBSyxHQUFHO0FBQ3BFLGNBQU0sV0FBVztBQUNqQixZQUFJLElBQUksU0FBUyxDQUFDLElBQUksU0FBUyxTQUFTLFNBQVMsT0FBUSxNQUFtQixJQUFJO01BQ2xGLE9BQU87QUFDTCxZQUFJLEtBQUssS0FBSztNQUNoQjtJQUNGO0FBQ0EsV0FBTyxJQUFJLFdBQVcsS0FBSyxhQUFhLE9BQU8sU0FBUyxLQUFLLEdBQUc7RUFDbEU7QUFVTyxXQUFTLGdCQUFnQixNQUFnQixPQUE0QztBQUMxRixVQUFNLE1BQW9CLENBQUE7QUFDMUIsZUFBVyxRQUFRLE9BQU87QUFDeEIsVUFBSSxLQUFLLFFBQVE7QUFDZixjQUFNLE9BQU8sS0FBSyxNQUFNLE9BQU8sQ0FBQyxTQUFTLEtBQUssZUFBZSxLQUFLLElBQUksQ0FBQztBQUN2RSxZQUFJLEtBQUssS0FBSyxXQUFXLEtBQUssTUFBTSxTQUFTLE9BQU8sS0FBSyxVQUFVLElBQUksQ0FBQztBQUN4RTtNQUNGO0FBQ0EsVUFBSSxLQUFLLGFBQWEsU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHO0FBQ3hDLFlBQUksS0FBSyxJQUFJO0FBQ2I7TUFDRjtBQUNBLFlBQU0sT0FBTyxLQUFLLEtBQUssU0FBUyxjQUFjLE9BQU8sS0FBSztBQUMxRCxVQUFJLEtBQUssU0FBUyxFQUFHLEtBQUksS0FBSyxLQUFLLEtBQUssT0FBTyxLQUFLLElBQUksQ0FBQztJQUMzRDtBQUNBLFdBQU8sWUFBWSxTQUFTLEtBQUssR0FBRyxDQUFDLEVBQUU7RUFDekM7QUFVTyxXQUFTLHFCQUFxQixNQUFnQixZQUE0QjtBQUMvRSxRQUFJLFFBQVE7QUFDWixRQUFJLFNBQVM7QUFDYixlQUFXLFNBQVMsS0FBSyxVQUFVO0FBQ2pDLFlBQU0sYUFBYSxNQUFNLFlBQVk7QUFDckMsVUFBSSxRQUFRLGNBQWMsWUFBWTtBQUNwQyxZQUFJLE1BQU0sT0FBUSxRQUFPLFVBQVUsYUFBYTtBQUNoRCxlQUFPLGNBQWMsUUFBUSxTQUFTLFNBQVM7TUFDakQ7QUFDQSxlQUFTO0FBQ1QsZ0JBQVUsV0FBVyxLQUFLO0lBQzVCO0FBQ0EsV0FBTztFQUNUO0FBR08sV0FBUyxjQUNkLE1BQ0EsTUFDQSxJQUNBLFFBQ1U7QUFDVixVQUFNLFNBQVMsWUFBWSxNQUFNLEdBQUcsSUFBSTtBQUN4QyxVQUFNLFFBQVEsWUFBWSxNQUFNLElBQUksYUFBYSxJQUFJLENBQUM7QUFDdEQsV0FBTyxZQUFZLE9BQU8sT0FBTyxNQUFNLEVBQUUsT0FBTyxLQUFLLENBQUM7RUFDeEQ7QUFHTyxXQUFTLGdCQUNkLE1BQ0EsTUFDQSxJQUNBLE1BQ0EsS0FDVTtBQUNWLFVBQU0sTUFBb0IsQ0FBQTtBQUMxQixRQUFJQSxPQUFNO0FBQ1YsZUFBVyxTQUFTLEtBQUssVUFBVTtBQUNqQyxZQUFNLE9BQU8sV0FBVyxLQUFLO0FBQzdCLFlBQU0sUUFBUUE7QUFDZCxZQUFNLE1BQU1BLE9BQU07QUFDbEJBLGFBQU07QUFDTixVQUFJLE9BQU8sUUFBUSxTQUFTLElBQUk7QUFDOUIsWUFBSSxLQUFLLEtBQUs7QUFDZDtNQUNGO0FBQ0EsWUFBTSxRQUFRLENBQUMsU0FDYixLQUFLLFVBQVUsTUFBTSxLQUFLLFNBQVMsS0FBSyxLQUFLLElBQUksS0FBSyxjQUFjLEtBQUssS0FBSyxDQUFDO0FBQ2pGLFVBQUksQ0FBQyxNQUFNLFFBQVE7QUFDakIsWUFBSSxLQUFLLFNBQVMsUUFBUSxPQUFPLEtBQUssTUFBTSxLQUFLLElBQUksS0FBSztBQUMxRDtNQUNGO0FBQ0EsWUFBTSxPQUFPO0FBQ2IsWUFBTSxVQUFVLEtBQUssSUFBSSxPQUFPLE9BQU8sQ0FBQztBQUN4QyxZQUFNLFFBQVEsS0FBSyxJQUFJLEtBQUssT0FBTyxJQUFJO0FBQ3ZDLFVBQUksVUFBVSxFQUFHLEtBQUksS0FBSyxLQUFLLElBQUksR0FBRyxPQUFPLENBQUM7QUFDOUMsVUFBSSxLQUFLLE1BQU0sS0FBSyxJQUFJLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDeEMsVUFBSSxRQUFRLEtBQU0sS0FBSSxLQUFLLEtBQUssSUFBSSxPQUFPLElBQUksQ0FBQztJQUNsRDtBQUNBLFdBQU8sWUFBWSxTQUFTLEtBQUssR0FBRyxDQUFDO0VBQ3ZDO0FBR08sV0FBUyxhQUNkLE1BQ0EsTUFDQSxJQUNBLFVBQ1M7QUFDVCxRQUFJLGFBQWE7QUFDakIsUUFBSUEsT0FBTTtBQUNWLGVBQVcsU0FBUyxLQUFLLFVBQVU7QUFDakMsWUFBTSxPQUFPLFdBQVcsS0FBSztBQUM3QixZQUFNLFFBQVFBO0FBQ2QsWUFBTSxNQUFNQSxPQUFNO0FBQ2xCQSxhQUFNO0FBQ04sVUFBSSxPQUFPLFFBQVEsU0FBUyxHQUFJO0FBQ2hDLFVBQUksQ0FBQyxNQUFNLE9BQVE7QUFDbkIsbUJBQWE7QUFDYixVQUFJLENBQUMsTUFBTSxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssU0FBUyxRQUFRLEVBQUcsUUFBTztJQUNsRTtBQUNBLFdBQU87RUFDVDtBQU9PLFdBQVMsZUFDZCxNQUNBLE1BQ0EsSUFDQSxVQUNxRDtBQUNyRCxVQUFNLFNBQXFELENBQUE7QUFDM0QsUUFBSUEsT0FBTTtBQUNWLGVBQVcsU0FBUyxLQUFLLFVBQVU7QUFDakMsWUFBTSxPQUFPLFdBQVcsS0FBSztBQUM3QixZQUFNLFFBQVFBO0FBQ2QsWUFBTSxNQUFNQSxPQUFNO0FBQ2xCQSxhQUFNO0FBQ04sVUFBSSxPQUFPLFFBQVEsU0FBUyxHQUFJO0FBQ2hDLFlBQU0sT0FBTyxNQUFNLE1BQU0sS0FBSyxDQUFDLGNBQWMsVUFBVSxTQUFTLFFBQVE7QUFDeEUsVUFBSSxDQUFDLEtBQU07QUFDWCxZQUFNLGNBQWMsS0FBSyxJQUFJLE9BQU8sSUFBSTtBQUN4QyxZQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssRUFBRTtBQUNsQyxZQUFNLE9BQU8sT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUNyQyxVQUFJLFFBQVEsS0FBSyxPQUFPLGVBQWUsS0FBSyxLQUFLLEdBQUcsSUFBSSxHQUFHO0FBQ3pELGFBQUssS0FBSztNQUNaLE9BQU87QUFDTCxlQUFPLEtBQUssRUFBRSxNQUFNLGFBQWEsSUFBSSxXQUFXLEtBQUEsQ0FBTTtNQUN4RDtJQUNGO0FBQ0EsV0FBTztFQUNUO0FBR08sV0FBUyxvQkFBb0IsTUFBZ0IsUUFBaUM7QUFDbkYsUUFBSUEsT0FBTTtBQUNWLGVBQVcsU0FBUyxLQUFLLFVBQVU7QUFDakMsWUFBTSxPQUFPLFdBQVcsS0FBSztBQUM3QixZQUFNLE1BQU1BLE9BQU07QUFFbEIsVUFBSSxTQUFTQSxRQUFPLFVBQVUsSUFBQSxRQUFZLE1BQU0sU0FBUyxNQUFNLFFBQVEsQ0FBQTtBQUN2RUEsYUFBTTtJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUssV0FBVyxDQUFDO0FBQy9CLFdBQU8sT0FBTyxTQUFTLE1BQU0sUUFBUSxDQUFBO0VBQ3ZDO0FDNVFPLFdBQVMsV0FBVyxHQUFTLEdBQWtCO0FBQ3BELFdBQU8sRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxPQUFPLE1BQU0sVUFBVSxFQUFFLENBQUMsQ0FBQztFQUN0RTtBQUVPLFdBQVMsZUFBZSxNQUFZLFFBQXVCO0FBQ2hFLFdBQU8sT0FBTyxVQUFVLEtBQUssVUFBVSxPQUFPLE1BQU0sQ0FBQyxPQUFPLE1BQU0sVUFBVSxLQUFLLENBQUMsQ0FBQztFQUNyRjtBQWFPLFdBQVMsV0FBVyxLQUFpQixNQUErQjtBQUN6RSxRQUFJLE9BQW1CO0FBQ3ZCLGVBQVcsU0FBUyxNQUFNO0FBQ3hCLFlBQU0sUUFBUSxLQUFLLFFBQVEsV0FBVyxLQUFLO0FBQzNDLFVBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsYUFBTztJQUNUO0FBQ0EsV0FBTztFQUNUO0FBTU8sV0FBUyxhQUNkLEtBQ0EsTUFDQSxJQUNZO0FBQ1osUUFBSSxLQUFLLFdBQVcsRUFBRyxRQUFPLEdBQUcsR0FBRztBQUNwQyxVQUFNLENBQUMsT0FBTyxHQUFHLElBQUksSUFBSTtBQUN6QixVQUFNLFFBQVEsSUFBSSxRQUFRLFdBQVcsS0FBSztBQUMxQyxRQUFJLENBQUMsTUFBTyxPQUFNLElBQUksV0FBVyx5QkFBeUIsS0FBSyxFQUFFO0FBQ2pFLFdBQU8sSUFBSSxZQUFZLElBQUksUUFBUSxhQUFhLE9BQU8sYUFBYSxPQUFPLE1BQU0sRUFBRSxDQUFDLENBQUM7RUFDdkY7QUNsQ08sV0FBUyxJQUFJLE1BQVksUUFBMEI7QUFDeEQsV0FBTyxFQUFFLE1BQU0sT0FBQTtFQUNqQjtBQU1PLFdBQVMsaUJBQWlCLEdBQWEsR0FBeUI7QUFDckUsVUFBTSxTQUFTLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxNQUFNO0FBQ25DLFVBQU0sU0FBUyxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsTUFBTTtBQUNuQyxVQUFNLFNBQVMsS0FBSyxJQUFJLE9BQU8sUUFBUSxPQUFPLE1BQU07QUFDcEQsYUFBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLEtBQUs7QUFDL0IsWUFBTSxLQUFLLE9BQU8sQ0FBQztBQUNuQixZQUFNLEtBQUssT0FBTyxDQUFDO0FBQ25CLFVBQUksT0FBTyxHQUFJLFFBQU8sS0FBSyxLQUFLLEtBQUs7SUFDdkM7QUFDQSxRQUFJLE9BQU8sV0FBVyxPQUFPLE9BQVEsUUFBTztBQUM1QyxXQUFPLE9BQU8sU0FBUyxPQUFPLFNBQVMsS0FBSztFQUM5QztBQUVPLFdBQVMsZUFBZSxHQUFhLEdBQXNCO0FBQ2hFLFdBQU8sRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLEtBQUssV0FBVyxFQUFFLEtBQUssVUFBVSxpQkFBaUIsR0FBRyxDQUFDLE1BQU07RUFDaEc7QUFFTyxXQUFTLFlBQVksR0FBYSxHQUF1QjtBQUM5RCxXQUFPLGlCQUFpQixHQUFHLENBQUMsS0FBSyxJQUFJLElBQUk7RUFDM0M7QUFFTyxXQUFTLFlBQVksR0FBYSxHQUF1QjtBQUM5RCxXQUFPLGlCQUFpQixHQUFHLENBQUMsS0FBSyxJQUFJLElBQUk7RUFDM0M7QUFxQk8sV0FBUyxjQUFjLEtBQWlCLFVBQThCO0FBQzNFLFVBQU0sT0FBaUIsQ0FBQTtBQUN2QixRQUFJLE9BQW1CO0FBQ3ZCLGVBQVcsWUFBWSxTQUFTLE1BQU07QUFDcEMsVUFBSSxLQUFLLGVBQWUsRUFBRztBQUMzQixZQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLFVBQVUsS0FBSyxhQUFhLENBQUMsQ0FBQztBQUNqRSxXQUFLLEtBQUssS0FBSztBQUNmLGFBQU8sS0FBSyxNQUFNLEtBQUs7SUFDekI7QUFDQSxVQUFNLFlBQVksS0FBSyxjQUFjLGFBQWEsS0FBSyxPQUFPLElBQUksS0FBSztBQUN2RSxVQUFNLFNBQVMsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLFNBQVMsUUFBUSxTQUFTLENBQUM7QUFDL0QsV0FBTyxFQUFFLE1BQU0sT0FBQTtFQUNqQjtBQ3hFTyxXQUFTLFdBQVcsS0FBOEQ7QUFDdkYsVUFBTSxRQUE0QyxDQUFBO0FBQ2xELFVBQU0sT0FBTyxDQUFDLE1BQWtCLFNBQXFCO0FBQ25ELFVBQUksS0FBSyxhQUFhO0FBQ3BCLGNBQU0sS0FBSyxFQUFFLE1BQU0sS0FBQSxDQUFNO0FBQ3pCO01BQ0Y7QUFDQSxXQUFLLFFBQVEsU0FBUyxRQUFRLENBQUMsT0FBTyxVQUFVO0FBQzlDLGFBQUssT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLLENBQUM7TUFDOUIsQ0FBQztJQUNIO0FBQ0EsU0FBSyxLQUFLLENBQUEsQ0FBRTtBQUNaLFdBQU87RUFDVDtBQUVPLFdBQVMsbUJBQW1CLEtBQThCO0FBQy9ELFdBQU8sV0FBVyxHQUFHLEVBQUUsQ0FBQyxHQUFHLFFBQVE7RUFDckM7QUFXTyxXQUFTLGNBQ2QsS0FDQSxNQUNBLElBQ3VCO0FBQ3ZCLFVBQU0sU0FBdUIsQ0FBQTtBQUM3QixlQUFXLEVBQUUsTUFBTSxLQUFBLEtBQVUsV0FBVyxHQUFHLEdBQUc7QUFDNUMsWUFBTSxTQUFTLGFBQWEsS0FBSyxPQUFPO0FBQ3hDLFVBQUksaUJBQWlCLElBQUksTUFBTSxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUc7QUFDbkQsVUFBSSxpQkFBaUIsSUFBSSxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRztBQUM1QyxhQUFPLEtBQUs7UUFDVjtRQUNBO1FBQ0EsTUFBTSxXQUFXLE1BQU0sS0FBSyxJQUFJLElBQUksS0FBSyxTQUFTO1FBQ2xELElBQUksV0FBVyxNQUFNLEdBQUcsSUFBSSxJQUFJLEdBQUcsU0FBUztNQUFBLENBQzdDO0lBQ0g7QUFDQSxXQUFPO0VBQ1Q7QUMzQ08sV0FBUyxhQUFhQyxTQUFnQixNQUFzQjtBQUNqRSxXQUFPQSxRQUFPLFNBQVMsS0FBSyxJQUFJLEVBQUUsT0FBTyxLQUFLLEtBQTBCO0VBQzFFO0FBRU8sV0FBUyxhQUFhQSxTQUFnQixNQUE0QjtBQUN2RSxVQUFNLFNBQVMsS0FBSyxTQUFTLENBQUEsR0FBSSxJQUFJLENBQUMsU0FBUyxhQUFhQSxTQUFRLElBQUksQ0FBQztBQUN6RSxRQUFJLEtBQUssU0FBUyxRQUFRO0FBQ3hCLFVBQUksT0FBTyxLQUFLLFNBQVMsVUFBVTtBQUNqQyxjQUFNLElBQUksV0FBVywrQ0FBK0M7TUFDdEU7QUFDQSxhQUFPQSxRQUFPLEtBQUssS0FBSyxNQUFNLEtBQUs7SUFDckM7QUFDQSxVQUFNLFVBQVUsU0FBUyxNQUFNLEtBQUssV0FBVyxDQUFBLEdBQUksSUFBSSxDQUFDLFVBQVUsYUFBYUEsU0FBUSxLQUFLLENBQUMsQ0FBQztBQUM5RixXQUFPQSxRQUFPLFNBQVMsS0FBSyxJQUFJLEVBQUUsT0FBTyxLQUFLLE9BQTRCLFNBQVMsS0FBSztFQUMxRjtBQ2JPLFdBQVMsYUFBYSxLQUE2QjtBQUN4RCxVQUFNQSxVQUFTLElBQUksS0FBSztBQUN4QixRQUFJLGFBQWEsY0FBYyxHQUFHO0FBQ2xDLFFBQUksV0FBVyxlQUFlLEtBQUssQ0FBQyxXQUFXLEtBQUssb0JBQW9CO0FBQ3RFLG1CQUFhLFdBQVcsWUFBWSxTQUFTLEdBQUdBLFFBQU8sbUJBQUEsRUFBcUIsT0FBQSxDQUFRLENBQUM7SUFDdkY7QUFDQSxXQUFPO0VBQ1Q7QUFFQSxXQUFTLGNBQWMsTUFBOEI7QUFDbkQsUUFBSSxLQUFLLE9BQVEsUUFBTztBQUN4QixRQUFJLENBQUMsS0FBSyxLQUFLLEtBQUssU0FBUztBQUUzQixhQUFPLEtBQUssZUFBZSxJQUFJLE9BQU8sS0FBSyxZQUFZLFNBQVMsS0FBSztJQUN2RTtBQUVBLFFBQUksV0FBVyxLQUFLLFFBQVEsU0FBUztNQUFJLENBQUMsVUFDeEMscUJBQXFCLGNBQWMsS0FBSyxHQUFHLElBQUk7SUFBQTtBQUdqRCxRQUFJLEtBQUssYUFBYTtBQUVwQixpQkFBVyxTQUFTO1FBQVEsQ0FBQyxVQUMzQixNQUFNLFdBQVcsQ0FBQyxLQUFLLElBQUksTUFBTSxRQUFRLFNBQVMsT0FBTyxDQUFDLFVBQVUsTUFBTSxRQUFRO01BQUE7QUFFcEYsYUFBTyxLQUFLLFlBQVksWUFBWSxTQUFTLEtBQUssUUFBUSxDQUFDLENBQUM7SUFDOUQ7QUFHQSxVQUFNQSxVQUFTLEtBQUssS0FBSztBQUN6QixVQUFNLFVBQXdCLENBQUE7QUFDOUIsUUFBSSxZQUEwQixDQUFBO0FBQzlCLFVBQU0sV0FBVyxNQUFZO0FBQzNCLFVBQUksVUFBVSxTQUFTLEdBQUc7QUFDeEIsZ0JBQVE7VUFDTkEsUUFBTyxtQkFBQSxFQUFxQixPQUFPLFFBQVcsWUFBWSxTQUFTLEtBQUssU0FBUyxDQUFDLENBQUM7UUFBQTtBQUVyRixvQkFBWSxDQUFBO01BQ2Q7SUFDRjtBQUNBLGVBQVcsU0FBUyxVQUFVO0FBQzVCLFVBQUksTUFBTSxVQUFVO0FBQ2xCLGtCQUFVLEtBQUssS0FBSztNQUN0QixPQUFPO0FBQ0wsaUJBQUE7QUFDQSxnQkFBUSxLQUFLLEtBQUs7TUFDcEI7SUFDRjtBQUNBLGFBQUE7QUFDQSxXQUFPLEtBQUssWUFBWSxTQUFTLEtBQUssT0FBTyxDQUFDO0VBQ2hEO0FBRUEsV0FBUyxxQkFBcUIsT0FBbUIsUUFBZ0M7QUFDL0UsUUFBSSxNQUFNLE1BQU0sV0FBVyxFQUFHLFFBQU87QUFDckMsVUFBTSxVQUFVLE1BQU0sTUFBTSxPQUFPLENBQUMsU0FBUyxPQUFPLEtBQUssZUFBZSxLQUFLLElBQUksQ0FBQztBQUNsRixXQUFPLFFBQVEsV0FBVyxNQUFNLE1BQU0sU0FBUyxRQUFRLE1BQU0sVUFBVSxPQUFPO0VBQ2hGO0FDbERPLFdBQVMsT0FBTyxLQUE2QjtBQUNsRCxXQUFPLEVBQUUsS0FBSyxRQUFRLEtBQUE7RUFDeEI7QUFFTyxXQUFTLFNBQVMsUUFBNEI7QUFDbkQsV0FBTyxFQUFFLEtBQUssTUFBTSxRQUFRLE9BQUE7RUFDOUI7QUFPTyxNQUFlLE9BQWYsTUFBOEM7RUFXckQ7QUM1Qk8sTUFBTSxvQkFBTixNQUFNLDJCQUEwQixLQUFLO0lBQzFDLFlBQ1csV0FDQSxNQUNBLElBQ0EsUUFDVDtBQUNBLFlBQUE7QUFMUyxXQUFBLFlBQUE7QUFDQSxXQUFBLE9BQUE7QUFDQSxXQUFBLEtBQUE7QUFDQSxXQUFBLFNBQUE7QUFHVCxVQUFJLE9BQU8sTUFBTSxPQUFPLEVBQUcsT0FBTSxJQUFJLFdBQVcseUJBQXlCLElBQUksS0FBSyxFQUFFLEdBQUc7SUFDekY7SUFQVztJQUNBO0lBQ0E7SUFDQTtJQU1YLElBQUksZUFBdUI7QUFDekIsYUFBTyxhQUFhLEtBQUssTUFBTTtJQUNqQztJQUVTLE1BQU0sS0FBNkI7QUFDMUMsWUFBTSxRQUFRLFdBQVcsS0FBSyxLQUFLLFNBQVM7QUFDNUMsVUFBSSxDQUFDLE1BQU8sUUFBTyxTQUFTLG9DQUFvQztBQUNoRSxVQUFJLENBQUMsTUFBTSxZQUFhLFFBQU8sU0FBUyw4Q0FBOEM7QUFDdEYsVUFBSSxLQUFLLEtBQUssYUFBYSxNQUFNLE9BQU87QUFDdEMsZUFBTyxTQUFTLHdDQUF3QztBQUMxRCxVQUFJLEtBQUssT0FBTyxTQUFTLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxRQUFRLEdBQUc7QUFDekQsZUFBTyxTQUFTLHVEQUF1RDtNQUN6RTtBQUNBLGFBQU87UUFDTDtVQUFhO1VBQUssS0FBSztVQUFXLENBQUMsU0FDakMsS0FBSyxZQUFZLGNBQWMsS0FBSyxTQUFTLEtBQUssTUFBTSxLQUFLLElBQUksS0FBSyxNQUFNLENBQUM7UUFBQTtNQUMvRTtJQUVKO0lBRVMsT0FBTyxXQUE2QjtBQUMzQyxZQUFNLFFBQVEsV0FBVyxXQUFXLEtBQUssU0FBUztBQUNsRCxVQUFJLENBQUMsTUFBTyxPQUFNLElBQUksV0FBVywyQ0FBMkM7QUFDNUUsWUFBTSxVQUFVLFlBQVksTUFBTSxTQUFTLEtBQUssTUFBTSxLQUFLLEVBQUU7QUFDN0QsYUFBTyxJQUFJLG1CQUFrQixLQUFLLFdBQVcsS0FBSyxNQUFNLEtBQUssT0FBTyxLQUFLLGNBQWMsT0FBTztJQUNoRztJQUVTLFlBQVksVUFBb0IsT0FBYSxHQUFhO0FBQ2pFLFVBQUksQ0FBQyxXQUFXLFNBQVMsTUFBTSxLQUFLLFNBQVMsRUFBRyxRQUFPO0FBQ3ZELFlBQU0sRUFBRSxPQUFBLElBQVc7QUFDbkIsVUFBSSxTQUFTLEtBQUssS0FBTSxRQUFPO0FBQy9CLFlBQU0sUUFBUSxLQUFLLGdCQUFnQixLQUFLLEtBQUssS0FBSztBQUNsRCxVQUFJLFNBQVMsS0FBSyxHQUFJLFFBQU8sRUFBRSxNQUFNLFNBQVMsTUFBTSxRQUFRLFNBQVMsTUFBQTtBQUVyRSxZQUFNLFNBQVMsT0FBTyxJQUFJLEtBQUssT0FBTyxLQUFLLE9BQU8sS0FBSztBQUN2RCxhQUFPLEVBQUUsTUFBTSxTQUFTLE1BQU0sUUFBUSxPQUFBO0lBQ3hDO0lBRVMsU0FBa0M7QUFDekMsYUFBTztRQUNMLFVBQVU7UUFDVixXQUFXLENBQUMsR0FBRyxLQUFLLFNBQVM7UUFDN0IsTUFBTSxLQUFLO1FBQ1gsSUFBSSxLQUFLO1FBQ1QsUUFBUSxLQUFLLE9BQU8sT0FBQTtNQUFPO0lBRS9CO0VBQ0Y7QUM1RE8sTUFBTSxtQkFBTixNQUFNLDBCQUF5QixLQUFLO0lBQ3pDLFlBQ1csWUFDQSxNQUNBLElBQ0EsUUFDVDtBQUNBLFlBQUE7QUFMUyxXQUFBLGFBQUE7QUFDQSxXQUFBLE9BQUE7QUFDQSxXQUFBLEtBQUE7QUFDQSxXQUFBLFNBQUE7QUFHVCxVQUFJLE9BQU8sTUFBTSxPQUFPLEVBQUcsT0FBTSxJQUFJLFdBQVcsd0JBQXdCLElBQUksS0FBSyxFQUFFLEdBQUc7SUFDeEY7SUFQVztJQUNBO0lBQ0E7SUFDQTtJQU1GLE1BQU0sS0FBNkI7QUFDMUMsWUFBTSxTQUFTLFdBQVcsS0FBSyxLQUFLLFVBQVU7QUFDOUMsVUFBSSxDQUFDLE9BQVEsUUFBTyxTQUFTLG1DQUFtQztBQUNoRSxVQUFJLE9BQU8sZUFBZSxPQUFPLFFBQVE7QUFDdkMsZUFBTyxTQUFTLHFFQUFxRTtNQUN2RjtBQUNBLFVBQUksS0FBSyxLQUFLLE9BQU8sV0FBWSxRQUFPLFNBQVMsdUNBQXVDO0FBQ3hGLGFBQU87UUFDTDtVQUFhO1VBQUssS0FBSztVQUFZLENBQUMsU0FDbEMsS0FBSyxZQUFZLEtBQUssUUFBUSxhQUFhLEtBQUssTUFBTSxLQUFLLElBQUksS0FBSyxNQUFNLENBQUM7UUFBQTtNQUM3RTtJQUVKO0lBRVMsT0FBTyxXQUE2QjtBQUMzQyxZQUFNLFNBQVMsV0FBVyxXQUFXLEtBQUssVUFBVTtBQUNwRCxVQUFJLENBQUMsT0FBUSxPQUFNLElBQUksV0FBVywwQ0FBMEM7QUFDNUUsWUFBTSxVQUFVLE9BQU8sUUFBUSxNQUFNLEtBQUssTUFBTSxLQUFLLEVBQUU7QUFDdkQsYUFBTyxJQUFJO1FBQ1QsS0FBSztRQUNMLEtBQUs7UUFDTCxLQUFLLE9BQU8sS0FBSyxPQUFPO1FBQ3hCO01BQUE7SUFFSjtJQUVTLFlBQVksVUFBb0IsT0FBYSxHQUFhO0FBQ2pFLFVBQUksQ0FBQyxlQUFlLFNBQVMsTUFBTSxLQUFLLFVBQVUsRUFBRyxRQUFPO0FBQzVELFlBQU0sUUFBUSxLQUFLLE9BQU8sY0FBYyxLQUFLLEtBQUssS0FBSztBQUN2RCxVQUFJLFNBQVMsS0FBSyxXQUFXLEtBQUssV0FBVyxRQUFRO0FBRW5ELGNBQU0sUUFBUSxTQUFTO0FBQ3ZCLFlBQUksUUFBUSxLQUFLLEtBQU0sUUFBTztBQUM5QixZQUFJLFNBQVMsS0FBSyxHQUFJLFFBQU8sRUFBRSxNQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsTUFBQTtBQUNwRSxlQUFPO1VBQ0wsTUFBTSxTQUFTO1VBQ2YsUUFBUSxPQUFPLElBQUksS0FBSyxPQUFPLEtBQUssT0FBTyxLQUFLLE9BQU87UUFBQTtNQUUzRDtBQUNBLFlBQU0sYUFBYSxTQUFTLEtBQUssS0FBSyxXQUFXLE1BQU07QUFDdkQsVUFBSSxhQUFhLEtBQUssS0FBTSxRQUFPO0FBQ25DLFVBQUksY0FBYyxLQUFLLElBQUk7QUFDekIsY0FBTSxPQUFPLENBQUMsR0FBRyxTQUFTLElBQUk7QUFDOUIsYUFBSyxLQUFLLFdBQVcsTUFBTSxJQUFJLGFBQWE7QUFDNUMsZUFBTyxFQUFFLE1BQU0sUUFBUSxTQUFTLE9BQUE7TUFDbEM7QUFFQSxhQUFPO1FBQ0wsTUFBTSxLQUFLO1FBQ1gsUUFBUSxPQUFPLElBQUksS0FBSyxPQUFPLEtBQUssT0FBTyxLQUFLLE9BQU87TUFBQTtJQUUzRDtJQUVTLFNBQWtDO0FBQ3pDLGFBQU87UUFDTCxVQUFVO1FBQ1YsWUFBWSxDQUFDLEdBQUcsS0FBSyxVQUFVO1FBQy9CLE1BQU0sS0FBSztRQUNYLElBQUksS0FBSztRQUNULFFBQVEsS0FBSyxPQUFPLE9BQUE7TUFBTztJQUUvQjtFQUNGO0FBR08sV0FBUyxjQUFjLE1BQVksUUFBb0M7QUFDNUUsUUFBSSxLQUFLLFdBQVcsRUFBRyxPQUFNLElBQUksV0FBVyw4QkFBOEI7QUFDMUUsVUFBTSxRQUFRLEtBQUssS0FBSyxTQUFTLENBQUM7QUFDbEMsV0FBTyxJQUFJLGlCQUFpQixLQUFLLE1BQU0sR0FBRyxFQUFFLEdBQUcsT0FBTyxRQUFRLEdBQUcsTUFBTTtFQUN6RTtBQ25GQSxNQUFlLFdBQWYsY0FBZ0MsS0FBSztJQUNuQyxZQUNXLFdBQ0EsTUFDQSxJQUNBLE1BQ1Q7QUFDQSxZQUFBO0FBTFMsV0FBQSxZQUFBO0FBQ0EsV0FBQSxPQUFBO0FBQ0EsV0FBQSxLQUFBO0FBQ0EsV0FBQSxPQUFBO0FBR1QsVUFBSSxPQUFPLE1BQU0sT0FBTyxFQUFHLE9BQU0sSUFBSSxXQUFXLHVCQUF1QixJQUFJLEtBQUssRUFBRSxHQUFHO0lBQ3ZGO0lBUFc7SUFDQTtJQUNBO0lBQ0E7SUFNRCxVQUFVLEtBQWlCLEtBQWMsTUFBMEI7QUFDM0UsWUFBTSxRQUFRLFdBQVcsS0FBSyxLQUFLLFNBQVM7QUFDNUMsVUFBSSxDQUFDLE1BQU8sUUFBTyxTQUFTLEdBQUcsSUFBSSxtQkFBbUI7QUFDdEQsVUFBSSxDQUFDLE1BQU0sWUFBQSxRQUFvQixTQUFTLEdBQUcsSUFBSSw2QkFBNkI7QUFDNUUsVUFBSSxLQUFLLEtBQUssYUFBYSxNQUFNLE9BQU8sRUFBRyxRQUFPLFNBQVMsR0FBRyxJQUFJLHVCQUF1QjtBQUN6RixVQUFJLENBQUMsTUFBTSxLQUFLLGVBQWUsS0FBSyxLQUFLLElBQUksR0FBRztBQUM5QyxlQUFPLFNBQVMsR0FBRyxJQUFJLFdBQVcsS0FBSyxLQUFLLEtBQUssSUFBSSxvQkFBb0I7TUFDM0U7QUFDQSxhQUFPO1FBQ0w7VUFBYTtVQUFLLEtBQUs7VUFBVyxDQUFDLFNBQ2pDLEtBQUssWUFBWSxnQkFBZ0IsS0FBSyxTQUFTLEtBQUssTUFBTSxLQUFLLElBQUksS0FBSyxNQUFNLEdBQUcsQ0FBQztRQUFBO01BQ3BGO0lBRUo7O0lBR1MsWUFBWSxVQUE4QjtBQUNqRCxhQUFPO0lBQ1Q7RUFDRjtBQUdPLE1BQU0sY0FBTixjQUEwQixTQUFTO0lBQy9CLE1BQU0sS0FBNkI7QUFDMUMsYUFBTyxLQUFLLFVBQVUsS0FBSyxNQUFNLGFBQWE7SUFDaEQ7SUFFUyxTQUFlO0FBQ3RCLGFBQU8sSUFBSSxlQUFlLEtBQUssV0FBVyxLQUFLLE1BQU0sS0FBSyxJQUFJLEtBQUssSUFBSTtJQUN6RTtJQUVTLFNBQWtDO0FBQ3pDLGFBQU87UUFDTCxVQUFVO1FBQ1YsV0FBVyxDQUFDLEdBQUcsS0FBSyxTQUFTO1FBQzdCLE1BQU0sS0FBSztRQUNYLElBQUksS0FBSztRQUNULE1BQU0sS0FBSyxLQUFLLE9BQUE7TUFBTztJQUUzQjtFQUNGO0FBTU8sTUFBTSxpQkFBTixjQUE2QixTQUFTO0lBQ2xDLE1BQU0sS0FBNkI7QUFDMUMsYUFBTyxLQUFLLFVBQVUsS0FBSyxPQUFPLGdCQUFnQjtJQUNwRDtJQUVTLFNBQWU7QUFDdEIsYUFBTyxJQUFJLFlBQVksS0FBSyxXQUFXLEtBQUssTUFBTSxLQUFLLElBQUksS0FBSyxJQUFJO0lBQ3RFO0lBRVMsU0FBa0M7QUFDekMsYUFBTztRQUNMLFVBQVU7UUFDVixXQUFXLENBQUMsR0FBRyxLQUFLLFNBQVM7UUFDN0IsTUFBTSxLQUFLO1FBQ1gsSUFBSSxLQUFLO1FBQ1QsTUFBTSxLQUFLLEtBQUssT0FBQTtNQUFPO0lBRTNCO0VBQ0Y7QUMzRU8sTUFBTSxtQkFBTixNQUFNLDBCQUF5QixLQUFLO0lBQ3pDLFlBQ1csTUFDQSxPQUNUO0FBQ0EsWUFBQTtBQUhTLFdBQUEsT0FBQTtBQUNBLFdBQUEsUUFBQTtJQUdYO0lBSlc7SUFDQTtJQUtGLE1BQU0sS0FBNkI7QUFDMUMsWUFBTSxPQUFPLFdBQVcsS0FBSyxLQUFLLElBQUk7QUFDdEMsVUFBSSxDQUFDLEtBQU0sUUFBTyxTQUFTLG1DQUFtQztBQUM5RCxVQUFJLEtBQUssT0FBUSxRQUFPLFNBQVMsaURBQWlEO0FBQ2xGLGFBQU8sT0FBTyxhQUFhLEtBQUssS0FBSyxNQUFNLENBQUMsV0FBVyxPQUFPLFVBQVUsS0FBSyxLQUFLLENBQUMsQ0FBQztJQUN0RjtJQUVTLE9BQU8sV0FBNkI7QUFDM0MsWUFBTSxPQUFPLFdBQVcsV0FBVyxLQUFLLElBQUk7QUFDNUMsVUFBSSxDQUFDLEtBQU0sT0FBTSxJQUFJLFdBQVcsMENBQTBDO0FBQzFFLGFBQU8sSUFBSSxrQkFBaUIsS0FBSyxNQUFNLEtBQUssS0FBSztJQUNuRDtJQUVTLFlBQVksVUFBOEI7QUFDakQsYUFBTztJQUNUO0lBRVMsU0FBa0M7QUFDekMsYUFBTyxFQUFFLFVBQVUsZ0JBQWdCLE1BQU0sQ0FBQyxHQUFHLEtBQUssSUFBSSxHQUFHLE9BQU8sRUFBRSxHQUFHLEtBQUssTUFBQSxFQUFNO0lBQ2xGO0VBQ0Y7QUMzQkEsV0FBUyxhQUNQLFVBQ0EsWUFDQSxXQUNBLE9BQ2lCO0FBQ2pCLFFBQUksQ0FBQyxlQUFlLFNBQVMsTUFBTSxVQUFVLEVBQUcsUUFBTztBQUN2RCxRQUFJLFNBQVMsS0FBSyxXQUFXLFdBQVcsUUFBUTtBQUM5QyxhQUFPLFNBQVMsU0FBUyxZQUNyQixFQUFFLE1BQU0sU0FBUyxNQUFNLFFBQVEsU0FBUyxTQUFTLE1BQUEsSUFDakQ7SUFDTjtBQUNBLFVBQU0sUUFBUSxTQUFTLEtBQUssV0FBVyxNQUFNO0FBQzdDLFFBQUksU0FBUyxVQUFXLFFBQU87QUFDL0IsVUFBTSxPQUFPLENBQUMsR0FBRyxTQUFTLElBQUk7QUFDOUIsU0FBSyxXQUFXLE1BQU0sSUFBSSxRQUFRO0FBQ2xDLFdBQU8sRUFBRSxNQUFNLFFBQVEsU0FBUyxPQUFBO0VBQ2xDO0FBT08sTUFBTSxnQkFBTixjQUE0QixLQUFLO0lBQ3RDLFlBQ1csTUFDQSxRQUNBLFdBQ0EsWUFDVDtBQUNBLFlBQUE7QUFMUyxXQUFBLE9BQUE7QUFDQSxXQUFBLFNBQUE7QUFDQSxXQUFBLFlBQUE7QUFDQSxXQUFBLGFBQUE7QUFHVCxVQUFJLEtBQUssV0FBVyxFQUFHLE9BQU0sSUFBSSxXQUFXLDRCQUE0QjtJQUMxRTtJQVBXO0lBQ0E7SUFDQTtJQUNBO0lBTUYsTUFBTSxLQUE2QjtBQUMxQyxZQUFNLE9BQU8sV0FBVyxLQUFLLEtBQUssSUFBSTtBQUN0QyxVQUFJLENBQUMsS0FBTSxRQUFPLFNBQVMsZ0NBQWdDO0FBQzNELFVBQUksQ0FBQyxLQUFLLFlBQWEsUUFBTyxTQUFTLDZDQUE2QztBQUNwRixZQUFNLFNBQVMsYUFBYSxLQUFLLE9BQU87QUFDeEMsVUFBSSxLQUFLLFNBQVMsT0FBUSxRQUFPLFNBQVMscUNBQXFDO0FBQy9FLFlBQU0sU0FBUyxZQUFZLEtBQUssU0FBUyxHQUFHLEtBQUssTUFBTTtBQUN2RCxZQUFNLFFBQVEsWUFBWSxLQUFLLFNBQVMsS0FBSyxRQUFRLE1BQU07QUFDM0QsWUFBTUEsVUFBUyxLQUFLLEtBQUs7QUFDekIsWUFBTSxhQUFhLEtBQUssWUFBWUEsUUFBTyxTQUFTLEtBQUssU0FBUyxJQUFJLEtBQUs7QUFDM0UsWUFBTSxjQUFjLEtBQUssWUFBWSxLQUFLLGFBQWMsS0FBSyxjQUFjLEtBQUs7QUFDaEYsWUFBTSxTQUFTLFdBQVcsT0FBTyxhQUFhLEtBQUs7QUFDbkQsWUFBTSxRQUFRLEtBQUssWUFBWSxNQUFNO0FBQ3JDLFlBQU0sYUFBYSxLQUFLLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDeEMsWUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQzVDLGFBQU87UUFDTDtVQUFhO1VBQUs7VUFBWSxDQUFDLFdBQzdCLE9BQU87WUFDTCxPQUFPLFFBQVEsYUFBYSxPQUFPLFFBQVEsR0FBRyxTQUFTLEdBQUcsT0FBTyxNQUFNLENBQUM7VUFBQTtRQUMxRTtNQUNGO0lBRUo7SUFFUyxTQUFlO0FBQ3RCLGFBQU8sSUFBSSxjQUFjLEtBQUssTUFBTSxLQUFLLE1BQU07SUFDakQ7SUFFUyxZQUFZLFVBQW9CLE9BQWEsR0FBYTtBQUNqRSxZQUFNLGFBQWEsS0FBSyxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBQ3hDLFlBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLLFNBQVMsQ0FBQztBQUM1QyxVQUFJLFdBQVcsU0FBUyxNQUFNLEtBQUssSUFBSSxHQUFHO0FBQ3hDLFlBQUksU0FBUyxTQUFTLEtBQUssT0FBUSxRQUFPO0FBQzFDLFlBQUksU0FBUyxXQUFXLEtBQUssVUFBVSxPQUFPLEVBQUcsUUFBTztBQUN4RCxlQUFPO1VBQ0wsTUFBTSxDQUFDLEdBQUcsWUFBWSxRQUFRLENBQUM7VUFDL0IsUUFBUSxTQUFTLFNBQVMsS0FBSztRQUFBO01BRW5DO0FBQ0EsYUFBTyxhQUFhLFVBQVUsWUFBWSxPQUFPLENBQUMsS0FBSztJQUN6RDtJQUVTLFNBQWtDO0FBQ3pDLGFBQU87UUFDTCxVQUFVO1FBQ1YsTUFBTSxDQUFDLEdBQUcsS0FBSyxJQUFJO1FBQ25CLFFBQVEsS0FBSztRQUNiLEdBQUksS0FBSyxZQUFZLEVBQUUsV0FBVyxLQUFLLFVBQUEsSUFBYyxDQUFBO1FBQ3JELEdBQUksS0FBSyxhQUFhLEVBQUUsWUFBWSxFQUFFLEdBQUcsS0FBSyxXQUFBLEVBQVcsSUFBTSxDQUFBO01BQUM7SUFFcEU7RUFDRjtBQU9PLE1BQU0sZ0JBQU4sY0FBNEIsS0FBSztJQUN0QyxZQUNXLE1BQ0EsWUFDVDtBQUNBLFlBQUE7QUFIUyxXQUFBLE9BQUE7QUFDQSxXQUFBLGFBQUE7QUFHVCxVQUFJLEtBQUssV0FBVyxFQUFHLE9BQU0sSUFBSSxXQUFXLDJCQUEyQjtJQUN6RTtJQUxXO0lBQ0E7SUFNRixNQUFNLEtBQTZCO0FBQzFDLFlBQU0sT0FBTyxXQUFXLEtBQUssS0FBSyxJQUFJO0FBQ3RDLFVBQUksQ0FBQyxLQUFNLFFBQU8sU0FBUyxnQ0FBZ0M7QUFDM0QsVUFBSSxDQUFDLEtBQUssWUFBYSxRQUFPLFNBQVMsOENBQThDO0FBQ3JGLFVBQUksYUFBYSxLQUFLLE9BQU8sTUFBTSxLQUFLLFlBQVk7QUFDbEQsZUFBTyxTQUFTLDJEQUEyRDtNQUM3RTtBQUNBLFlBQU0sYUFBYSxLQUFLLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDeEMsWUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQzVDLFlBQU0sU0FBUyxXQUFXLEtBQUssVUFBVTtBQUN6QyxZQUFNLE9BQU8sUUFBUSxRQUFRLFdBQVcsUUFBUSxDQUFDO0FBQ2pELFVBQUksQ0FBQyxLQUFNLFFBQU8sU0FBUyw2Q0FBNkM7QUFDeEUsVUFBSSxDQUFDLEtBQUssWUFBYSxRQUFPLFNBQVMsZ0RBQWdEO0FBQ3ZGLFlBQU0sU0FBUyxLQUFLLFlBQVksWUFBWSxLQUFLLFFBQVEsT0FBTyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQzlFLGFBQU87UUFDTDtVQUFhO1VBQUs7VUFBWSxDQUFDLFdBQzdCLE9BQU8sWUFBWSxPQUFPLFFBQVEsYUFBYSxPQUFPLFFBQVEsR0FBRyxTQUFTLEdBQUcsTUFBTSxDQUFDLENBQUM7UUFBQTtNQUN2RjtJQUVKO0lBRVMsT0FBTyxXQUE2QjtBQUMzQyxZQUFNLGFBQWEsS0FBSyxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBQ3hDLFlBQU0sUUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLLFNBQVMsQ0FBQztBQUM1QyxZQUFNLFNBQVMsV0FBVyxXQUFXLFVBQVU7QUFDL0MsWUFBTSxPQUFPLFFBQVEsUUFBUSxXQUFXLFFBQVEsQ0FBQztBQUNqRCxVQUFJLENBQUMsS0FBTSxPQUFNLElBQUksV0FBVyx1Q0FBdUM7QUFDdkUsYUFBTyxJQUFJLGNBQWMsS0FBSyxNQUFNLEtBQUssWUFBWSxLQUFLLEtBQUssTUFBTSxLQUFLLEtBQUs7SUFDakY7SUFFUyxZQUFZLFVBQThCO0FBQ2pELFlBQU0sYUFBYSxLQUFLLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDeEMsWUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQzVDLFlBQU0sV0FBVyxDQUFDLEdBQUcsWUFBWSxRQUFRLENBQUM7QUFDMUMsVUFBSSxXQUFXLFNBQVMsTUFBTSxRQUFRLEdBQUc7QUFDdkMsZUFBTyxFQUFFLE1BQU0sS0FBSyxNQUFNLFFBQVEsU0FBUyxTQUFTLEtBQUssV0FBQTtNQUMzRDtBQUNBLFVBQUksQ0FBQyxlQUFlLFNBQVMsTUFBTSxVQUFVLEVBQUcsUUFBTztBQUN2RCxVQUFJLFNBQVMsS0FBSyxXQUFXLFdBQVcsUUFBUTtBQUU5QyxlQUFPLFNBQVMsVUFBVSxRQUFRLElBQzlCLEVBQUUsTUFBTSxTQUFTLE1BQU0sUUFBUSxTQUFTLFNBQVMsRUFBQSxJQUNqRDtNQUNOO0FBQ0EsWUFBTSxhQUFhLFNBQVMsS0FBSyxXQUFXLE1BQU07QUFDbEQsVUFBSSxjQUFjLFFBQVEsR0FBRztBQUMzQixjQUFNLE9BQU8sQ0FBQyxHQUFHLFNBQVMsSUFBSTtBQUM5QixhQUFLLFdBQVcsTUFBTSxJQUFJLGFBQWE7QUFDdkMsZUFBTyxFQUFFLE1BQU0sUUFBUSxTQUFTLE9BQUE7TUFDbEM7QUFDQSxhQUFPO0lBQ1Q7SUFFUyxTQUFrQztBQUN6QyxhQUFPLEVBQUUsVUFBVSxhQUFhLE1BQU0sQ0FBQyxHQUFHLEtBQUssSUFBSSxHQUFHLFlBQVksS0FBSyxXQUFBO0lBQ3pFO0VBQ0Y7QUUzSk8sTUFBTSxnQkFBTixjQUE0QixLQUFLO0lBQ3RDLFlBQ1csWUFDQSxNQUNBLElBQ0EsYUFDQSxjQUNUO0FBQ0EsWUFBQTtBQU5TLFdBQUEsYUFBQTtBQUNBLFdBQUEsT0FBQTtBQUNBLFdBQUEsS0FBQTtBQUNBLFdBQUEsY0FBQTtBQUNBLFdBQUEsZUFBQTtBQUdULFVBQUksUUFBUSxNQUFNLE9BQU8sRUFBRyxPQUFNLElBQUksV0FBVyx1QkFBdUIsSUFBSSxLQUFLLEVBQUUsR0FBRztJQUN4RjtJQVJXO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFNRixNQUFNLEtBQTZCO0FBQzFDLFlBQU0sU0FBUyxXQUFXLEtBQUssS0FBSyxVQUFVO0FBQzlDLFVBQUksQ0FBQyxPQUFRLFFBQU8sU0FBUyxnQ0FBZ0M7QUFDN0QsVUFBSSxPQUFPLGVBQWUsT0FBTztBQUMvQixlQUFPLFNBQVMsMkNBQTJDO0FBQzdELFVBQUksS0FBSyxLQUFLLE9BQU8sV0FBWSxRQUFPLFNBQVMsb0NBQW9DO0FBQ3JGLFlBQU1DLFVBQVMsT0FBTyxLQUFLO0FBQzNCLFlBQU0sVUFBVUEsUUFDYixTQUFTLEtBQUssV0FBVyxFQUN6QixPQUFPLEtBQUssY0FBYyxPQUFPLFFBQVEsTUFBTSxLQUFLLE1BQU0sS0FBSyxFQUFFLENBQUM7QUFDckUsYUFBTztRQUNMO1VBQWE7VUFBSyxLQUFLO1VBQVksQ0FBQyxTQUNsQyxLQUFLLFlBQVksS0FBSyxRQUFRLGFBQWEsS0FBSyxNQUFNLEtBQUssSUFBSSxTQUFTLEdBQUcsT0FBTyxDQUFDLENBQUM7UUFBQTtNQUN0RjtJQUVKO0lBRVMsU0FBZTtBQUN0QixhQUFPLElBQUksY0FBYyxDQUFDLEdBQUcsS0FBSyxZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssS0FBSyxLQUFLLElBQUk7SUFDL0U7SUFFUyxZQUFZLFVBQThCO0FBQ2pELFVBQUksQ0FBQyxlQUFlLFNBQVMsTUFBTSxLQUFLLFVBQVUsRUFBRyxRQUFPO0FBQzVELFlBQU0sVUFBVSxLQUFLLEtBQUssS0FBSztBQUMvQixVQUFJLFNBQVMsS0FBSyxXQUFXLEtBQUssV0FBVyxRQUFRO0FBQ25ELGNBQU0sUUFBUSxTQUFTO0FBQ3ZCLFlBQUksU0FBUyxLQUFLLEtBQU0sUUFBTztBQUMvQixZQUFJLFNBQVMsS0FBSyxHQUFJLFFBQU8sRUFBRSxNQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsVUFBVSxFQUFBO0FBRTlFLGVBQU8sRUFBRSxNQUFNLENBQUMsR0FBRyxLQUFLLFlBQVksS0FBSyxJQUFJLEdBQUcsUUFBUSxRQUFRLEtBQUssS0FBQTtNQUN2RTtBQUNBLFlBQU0sYUFBYSxTQUFTLEtBQUssS0FBSyxXQUFXLE1BQU07QUFDdkQsWUFBTSxPQUFPLFNBQVMsS0FBSyxNQUFNLEtBQUssV0FBVyxTQUFTLENBQUM7QUFDM0QsVUFBSSxhQUFhLEtBQUssS0FBTSxRQUFPO0FBQ25DLFVBQUksY0FBYyxLQUFLLElBQUk7QUFDekIsY0FBTSxPQUFPLENBQUMsR0FBRyxTQUFTLElBQUk7QUFDOUIsYUFBSyxLQUFLLFdBQVcsTUFBTSxJQUFJLGFBQWEsVUFBVTtBQUN0RCxlQUFPLEVBQUUsTUFBTSxRQUFRLFNBQVMsT0FBQTtNQUNsQztBQUNBLGFBQU87UUFDTCxNQUFNLENBQUMsR0FBRyxLQUFLLFlBQVksS0FBSyxNQUFNLGFBQWEsS0FBSyxNQUFNLEdBQUcsSUFBSTtRQUNyRSxRQUFRLFNBQVM7TUFBQTtJQUVyQjtJQUVTLFNBQWtDO0FBQ3pDLGFBQU87UUFDTCxVQUFVO1FBQ1YsWUFBWSxDQUFDLEdBQUcsS0FBSyxVQUFVO1FBQy9CLE1BQU0sS0FBSztRQUNYLElBQUksS0FBSztRQUNULGFBQWEsS0FBSztRQUNsQixHQUFJLEtBQUssZUFBZSxFQUFFLGNBQWMsRUFBRSxHQUFHLEtBQUssYUFBQSxFQUFhLElBQU0sQ0FBQTtNQUFDO0lBRTFFO0VBQ0Y7QUFPTyxNQUFNLGdCQUFOLGNBQTRCLEtBQUs7SUFDdEMsWUFDVyxNQUNBLGFBQ1Q7QUFDQSxZQUFBO0FBSFMsV0FBQSxPQUFBO0FBQ0EsV0FBQSxjQUFBO0FBR1QsVUFBSSxLQUFLLFdBQVcsRUFBRyxPQUFNLElBQUksV0FBVywyQkFBMkI7SUFDekU7SUFMVztJQUNBO0lBTUYsTUFBTSxLQUE2QjtBQUMxQyxZQUFNLE9BQU8sV0FBVyxLQUFLLEtBQUssSUFBSTtBQUN0QyxVQUFJLENBQUMsS0FBTSxRQUFPLFNBQVMsZ0NBQWdDO0FBQzNELFVBQUksS0FBSyxlQUFlLEtBQUs7QUFDM0IsZUFBTyxTQUFTLDJDQUEyQztBQUM3RCxVQUFJLEtBQUssZUFBZSxLQUFLLGFBQWE7QUFDeEMsZUFBTyxTQUFTLG9EQUFvRDtNQUN0RTtBQUNBLFlBQU0sYUFBYSxLQUFLLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDeEMsWUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQzVDLGFBQU87UUFDTDtVQUFhO1VBQUs7VUFBWSxDQUFDLFdBQzdCLE9BQU8sWUFBWSxPQUFPLFFBQVEsYUFBYSxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sQ0FBQztRQUFBO01BQ2hGO0lBRUo7SUFFUyxPQUFPLFdBQTZCO0FBQzNDLFlBQU0sT0FBTyxXQUFXLFdBQVcsS0FBSyxJQUFJO0FBQzVDLFVBQUksQ0FBQyxLQUFNLE9BQU0sSUFBSSxXQUFXLHVDQUF1QztBQUN2RSxZQUFNLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBSyxTQUFTLENBQUM7QUFDNUMsYUFBTyxJQUFJO1FBQ1QsS0FBSyxLQUFLLE1BQU0sR0FBRyxFQUFFO1FBQ3JCO1FBQ0EsUUFBUSxLQUFLO1FBQ2IsS0FBSyxLQUFLO1FBQ1YsS0FBSztNQUFBO0lBRVQ7SUFFUyxZQUFZLFVBQThCO0FBQ2pELFlBQU0sYUFBYSxLQUFLLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDeEMsWUFBTSxRQUFRLEtBQUssS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQzVDLFVBQUksZUFBZSxTQUFTLE1BQU0sS0FBSyxJQUFJLEdBQUc7QUFDNUMsWUFBSSxTQUFTLEtBQUssV0FBVyxLQUFLLEtBQUssUUFBUTtBQUU3QyxpQkFBTyxFQUFFLE1BQU0sWUFBWSxRQUFRLFFBQVEsU0FBUyxPQUFBO1FBQ3REO0FBQ0EsY0FBTUMsY0FBYSxTQUFTLEtBQUssS0FBSyxLQUFLLE1BQU07QUFDakQsY0FBTSxPQUFPLFNBQVMsS0FBSyxNQUFNLEtBQUssS0FBSyxTQUFTLENBQUM7QUFDckQsZUFBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLFlBQVksUUFBUUEsYUFBWSxHQUFHLElBQUksR0FBRyxRQUFRLFNBQVMsT0FBQTtNQUNoRjtBQUNBLFVBQUksQ0FBQyxlQUFlLFNBQVMsTUFBTSxVQUFVLEVBQUcsUUFBTztBQUN2RCxZQUFNLFFBQVEsS0FBSyxjQUFjO0FBQ2pDLFVBQUksU0FBUyxLQUFLLFdBQVcsV0FBVyxRQUFRO0FBQzlDLGVBQU8sU0FBUyxTQUFTLFFBQ3JCLEVBQUUsTUFBTSxTQUFTLE1BQU0sUUFBUSxTQUFTLFNBQVMsTUFBQSxJQUNqRDtNQUNOO0FBQ0EsWUFBTSxhQUFhLFNBQVMsS0FBSyxXQUFXLE1BQU07QUFDbEQsVUFBSSxhQUFhLE9BQU87QUFDdEIsY0FBTSxPQUFPLENBQUMsR0FBRyxTQUFTLElBQUk7QUFDOUIsYUFBSyxXQUFXLE1BQU0sSUFBSSxhQUFhO0FBQ3ZDLGVBQU8sRUFBRSxNQUFNLFFBQVEsU0FBUyxPQUFBO01BQ2xDO0FBQ0EsYUFBTztJQUNUO0lBRVMsU0FBa0M7QUFDekMsYUFBTyxFQUFFLFVBQVUsYUFBYSxNQUFNLENBQUMsR0FBRyxLQUFLLElBQUksR0FBRyxhQUFhLEtBQUssWUFBQTtJQUMxRTtFQUNGO0FDaEpPLE1BQU0sY0FBTixNQUE0QztJQUN4QyxRQUFnQixDQUFBOztJQUVoQixPQUFxQixDQUFBOztJQUVyQixPQUFlLEtBQUssSUFBQTtJQUVyQjtJQUNTO0lBQ1Qsb0JBQXFFO0lBQ3JFO0lBQ0EsV0FBd0M7SUFFaEQsWUFBWSxPQUFvQjtBQUM5QixXQUFLLGFBQWEsTUFBTTtBQUN4QixXQUFLLGdCQUFnQixNQUFNO0FBQzNCLFdBQUssU0FBUyxNQUFNO0lBQ3RCO0lBRUEsSUFBSSxNQUFrQjtBQUNwQixhQUFPLEtBQUs7SUFDZDtJQUVBLElBQUksYUFBc0I7QUFDeEIsYUFBTyxLQUFLLE1BQU0sU0FBUztJQUM3Qjs7SUFHQSxVQUFVLE1BQXFCO0FBQzdCLGFBQU8sS0FBSyxRQUFRLElBQUksTUFBTTtJQUNoQzs7SUFHQSxLQUFLLE1BQWtCO0FBQ3JCLFlBQU0sU0FBUyxLQUFLLFFBQVEsSUFBSTtBQUNoQyxVQUFJLFdBQVcsS0FBTSxPQUFNLElBQUksV0FBVyxnQkFBZ0IsTUFBTSxFQUFFO0FBQ2xFLGFBQU87SUFDVDtJQUVRLFFBQVEsTUFBMkI7QUFDekMsWUFBTSxTQUFTLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDekMsVUFBSSxPQUFPLFdBQVcsUUFBUSxPQUFPLFFBQVEsTUFBTTtBQUNqRCxlQUFPLE9BQU8sVUFBVTtNQUMxQjtBQUNBLFdBQUssS0FBSyxLQUFLLEtBQUssVUFBVTtBQUM5QixXQUFLLE1BQU0sS0FBSyxJQUFJO0FBQ3BCLFdBQUssYUFBYSxPQUFPO0FBQ3pCLGFBQU87SUFDVDs7SUFHQSxZQUFZLFVBQW9CLE1BQXVCO0FBQ3JELGFBQU8sS0FBSyxXQUFXLFVBQVUsR0FBRyxJQUFJO0lBQzFDO0lBRVEsV0FBVyxVQUFvQixVQUFrQixNQUF1QjtBQUM5RSxVQUFJLFNBQVM7QUFDYixlQUFTLElBQUksVUFBVSxJQUFJLEtBQUssTUFBTSxRQUFRLEtBQUs7QUFDakQsaUJBQVUsS0FBSyxNQUFNLENBQUMsRUFBVyxZQUFZLFFBQVEsSUFBSTtNQUMzRDtBQUNBLGFBQU87SUFDVDs7Ozs7SUFNQSxJQUFJLFlBQXVCO0FBQ3pCLFVBQUksS0FBSyxtQkFBbUI7QUFDMUIsY0FBTSxFQUFFLFdBQVcsT0FBQSxJQUFXLEtBQUs7QUFDbkMsZUFBTyxVQUFVLElBQUksS0FBSyxZQUFZO1VBQ3BDLGFBQWEsQ0FBQyxVQUFVLFNBQVMsS0FBSyxXQUFXLFVBQVUsUUFBUSxJQUFJO1FBQUEsQ0FDeEU7TUFDSDtBQUNBLGFBQU8sS0FBSyxjQUFjLElBQUksS0FBSyxZQUFZLElBQUk7SUFDckQ7SUFFQSxhQUFhLFdBQTRCO0FBQ3ZDLFdBQUssb0JBQW9CLEVBQUUsV0FBVyxRQUFRLEtBQUssTUFBTSxPQUFBO0FBQ3pELFdBQUssU0FBUztBQUNkLGFBQU87SUFDVDtJQUVBLElBQUksY0FBc0M7QUFDeEMsYUFBTyxLQUFLO0lBQ2Q7SUFFQSxlQUFlLE9BQXFDO0FBQ2xELFdBQUssU0FBUztBQUNkLGFBQU87SUFDVDtJQUVBLFFBQVEsS0FBYSxPQUFzQjtBQUN6QyxXQUFLLGFBQUEsb0JBQWlCLElBQUE7QUFDdEIsV0FBSyxTQUFTLElBQUksS0FBSyxLQUFLO0FBQzVCLGFBQU87SUFDVDtJQUVBLFFBQVEsS0FBc0I7QUFDNUIsYUFBTyxLQUFLLFVBQVUsSUFBSSxHQUFHO0lBQy9COzs7Ozs7Ozs7OztJQVlBLFdBQThCO0FBQzVCLGFBQU8sS0FBSyxXQUFXLENBQUMsR0FBRyxLQUFLLFNBQVMsS0FBQSxDQUFNLElBQUksQ0FBQTtJQUNyRDtFQUNGO0FDekdPLE1BQWUsWUFBZixNQUF5QjtJQUk5QixJQUFJLFFBQWlCO0FBQ25CLGFBQU8sZUFBZSxLQUFLLE1BQU0sS0FBSyxFQUFFO0lBQzFDO0VBS0Y7QUFHTyxNQUFNLGdCQUFOLE1BQU0sdUJBQXNCLFVBQVU7SUFDM0MsWUFDVyxRQUNBLE9BQWlCLFFBQzFCO0FBQ0EsWUFBQTtBQUhTLFdBQUEsU0FBQTtBQUNBLFdBQUEsT0FBQTtJQUdYO0lBSlc7SUFDQTtJQUtYLElBQWEsT0FBaUI7QUFDNUIsYUFBTyxZQUFZLEtBQUssUUFBUSxLQUFLLElBQUk7SUFDM0M7SUFFQSxJQUFhLEtBQWU7QUFDMUIsYUFBTyxZQUFZLEtBQUssUUFBUSxLQUFLLElBQUk7SUFDM0M7SUFFQSxJQUFJLFdBQW9CO0FBQ3RCLGFBQU8sZUFBZSxLQUFLLFFBQVEsS0FBSyxJQUFJO0lBQzlDO0lBRVMsSUFBSSxLQUFpQixRQUFtQztBQUMvRCxZQUFNLFNBQVMsY0FBYyxLQUFLLE9BQU8sWUFBWSxLQUFLLFFBQVEsRUFBRSxDQUFDO0FBQ3JFLFlBQU0sT0FBTyxjQUFjLEtBQUssT0FBTyxZQUFZLEtBQUssTUFBTSxFQUFFLENBQUM7QUFDakUsYUFBTyxJQUFJLGVBQWMsUUFBUSxJQUFJO0lBQ3ZDO0lBRVMsR0FBRyxPQUEyQjtBQUNyQyxhQUNFLGlCQUFpQixrQkFDakIsZUFBZSxNQUFNLFFBQVEsS0FBSyxNQUFNLEtBQ3hDLGVBQWUsTUFBTSxNQUFNLEtBQUssSUFBSTtJQUV4QztJQUVTLFNBQXdCO0FBQy9CLGFBQU87UUFDTCxNQUFNO1FBQ04sUUFBUSxFQUFFLE1BQU0sQ0FBQyxHQUFHLEtBQUssT0FBTyxJQUFJLEdBQUcsUUFBUSxLQUFLLE9BQU8sT0FBQTtRQUMzRCxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsS0FBSyxLQUFLLElBQUksR0FBRyxRQUFRLEtBQUssS0FBSyxPQUFBO01BQU87SUFFaEU7O0lBR0EsT0FBTyxRQUFRLEtBQWdDO0FBQzdDLFlBQU0sT0FBTyxtQkFBbUIsR0FBRztBQUNuQyxhQUFPLElBQUksZUFBYyxJQUFJLFFBQVEsQ0FBQSxHQUFJLENBQUMsQ0FBQztJQUM3Qzs7SUFHQSxPQUFPLE1BQU0sS0FBZ0M7QUFDM0MsWUFBTSxTQUFTLFdBQVcsR0FBRztBQUM3QixZQUFNLE9BQU8sT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUNyQyxVQUFJLENBQUMsS0FBTSxRQUFPLElBQUksZUFBYyxJQUFJLENBQUEsR0FBSSxDQUFDLENBQUM7QUFDOUMsYUFBTyxJQUFJLGVBQWMsSUFBSSxLQUFLLE1BQU0sYUFBYSxLQUFLLEtBQUssT0FBTyxDQUFDLENBQUM7SUFDMUU7RUFDRjtBQUdPLE1BQU0sZ0JBQU4sTUFBTSx1QkFBc0IsVUFBVTtJQUMzQyxZQUFxQixNQUFZO0FBQy9CLFlBQUE7QUFEbUIsV0FBQSxPQUFBO0FBRW5CLFVBQUksS0FBSyxXQUFXLEVBQUcsT0FBTSxJQUFJLFdBQVcsNkJBQTZCO0lBQzNFO0lBSHFCO0lBS3JCLElBQUksYUFBbUI7QUFDckIsYUFBTyxLQUFLLEtBQUssTUFBTSxHQUFHLEVBQUU7SUFDOUI7SUFFQSxJQUFJLFFBQWdCO0FBQ2xCLGFBQU8sS0FBSyxLQUFLLEtBQUssS0FBSyxTQUFTLENBQUM7SUFDdkM7SUFFQSxJQUFhLE9BQWlCO0FBQzVCLGFBQU8sSUFBSSxLQUFLLFlBQVksS0FBSyxLQUFLO0lBQ3hDO0lBRUEsSUFBYSxLQUFlO0FBQzFCLGFBQU8sSUFBSSxLQUFLLFlBQVksS0FBSyxRQUFRLENBQUM7SUFDNUM7SUFFUyxJQUFJLEtBQWlCLFFBQW1DO0FBQy9ELFlBQU0sU0FBUyxjQUFjLEtBQUssT0FBTyxZQUFZLEtBQUssTUFBTSxFQUFFLENBQUM7QUFDbkUsWUFBTSxPQUFPLFdBQVcsS0FBSyxDQUFDLEdBQUcsT0FBTyxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQzVELFVBQUksUUFBUSxDQUFDLEtBQUssT0FBUSxRQUFPLElBQUksZUFBYyxDQUFDLEdBQUcsT0FBTyxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQ2xGLGFBQU8sSUFBSSxjQUFjLE1BQU0sRUFBRSxJQUFJLEtBQUssY0FBYztJQUMxRDtJQUVTLEdBQUcsT0FBMkI7QUFDckMsYUFBTyxpQkFBaUIsa0JBQWlCLFdBQVcsTUFBTSxNQUFNLEtBQUssSUFBSTtJQUMzRTtJQUVTLFNBQXdCO0FBQy9CLGFBQU8sRUFBRSxNQUFNLFFBQVEsTUFBTSxDQUFDLEdBQUcsS0FBSyxJQUFJLEVBQUE7SUFDNUM7RUFDRjtBQUdPLE1BQU0sZUFBTixNQUFNLHNCQUFxQixVQUFVO0lBQzFDLFlBQTZCLEtBQWlCO0FBQzVDLFlBQUE7QUFEMkIsV0FBQSxNQUFBO0lBRTdCO0lBRjZCO0lBSTdCLElBQWEsT0FBaUI7QUFDNUIsYUFBTyxJQUFJLENBQUEsR0FBSSxDQUFDO0lBQ2xCO0lBRUEsSUFBYSxLQUFlO0FBQzFCLGFBQU8sSUFBSSxDQUFBLEdBQUksS0FBSyxJQUFJLFVBQVU7SUFDcEM7SUFFUyxJQUFJLEtBQTRCO0FBQ3ZDLGFBQU8sSUFBSSxjQUFhLEdBQUc7SUFDN0I7SUFFUyxHQUFHLE9BQTJCO0FBQ3JDLGFBQU8saUJBQWlCO0lBQzFCO0lBRVMsU0FBd0I7QUFDL0IsYUFBTyxFQUFFLE1BQU0sTUFBQTtJQUNqQjtFQUNGO0FBRUEsTUFBTSxpQkFBaUM7SUFDckMsYUFBYSxDQUFDLGFBQWE7RUFDN0I7QUFNTyxXQUFTLGNBQWMsS0FBaUIsVUFBbUM7QUFDaEYsVUFBTSxVQUFVLGNBQWMsS0FBSyxRQUFRO0FBQzNDLFVBQU0sT0FBTyxXQUFXLEtBQUssUUFBUSxJQUFJO0FBQ3pDLFFBQUksTUFBTSxZQUFhLFFBQU8sSUFBSSxjQUFjLE9BQU87QUFDdkQsZUFBVyxFQUFFLE1BQU0sTUFBTSxNQUFBLEtBQVcsV0FBVyxHQUFHLEdBQUc7QUFDbkQsVUFBSSxpQkFBaUIsSUFBSSxNQUFNLGFBQWEsTUFBTSxPQUFPLENBQUMsR0FBRyxPQUFPLEtBQUssR0FBRztBQUMxRSxlQUFPLElBQUksY0FBYyxJQUFJLE1BQU0sQ0FBQyxDQUFDO01BQ3ZDO0lBQ0Y7QUFDQSxXQUFPLGNBQWMsTUFBTSxHQUFHO0VBQ2hDO0FDbEpPLE1BQU0sY0FBTixNQUFNLGFBQVk7SUFDZixZQUNHRCxTQUNBLEtBQ0EsV0FDQSxhQUNUO0FBSlMsV0FBQSxTQUFBQTtBQUNBLFdBQUEsTUFBQTtBQUNBLFdBQUEsWUFBQTtBQUNBLFdBQUEsY0FBQTtJQUNSO0lBSlE7SUFDQTtJQUNBO0lBQ0E7SUFHWCxPQUFPLE9BQU8sUUFBd0M7QUFDcEQsWUFBTSxFQUFFLFFBQUFBLFFBQUFBLElBQVc7QUFDbkIsWUFBTSxVQUNKLE9BQU8sUUFDTixPQUFPLFVBQ0osYUFBYUEsU0FBUSxPQUFPLE9BQU8sSUFDbkNBLFFBQU8sUUFBUSxPQUFPLFFBQVcsU0FBUyxHQUFHQSxRQUFPLG1CQUFBLEVBQXFCLE9BQUEsQ0FBUSxDQUFDO0FBQ3hGLFlBQU0sTUFBTSxhQUFhLE9BQU87QUFDaEMsWUFBTSxZQUFZLE9BQU8sWUFDckIsa0JBQWtCLEtBQUssT0FBTyxTQUFTLElBQ3ZDLGNBQWMsUUFBUSxHQUFHO0FBQzdCLGFBQU8sSUFBSSxhQUFZQSxTQUFRLEtBQUssV0FBVyxJQUFJO0lBQ3JEOztJQUdBLElBQUksS0FBa0I7QUFDcEIsYUFBTyxJQUFJLFlBQVksSUFBSTtJQUM3QjtJQUVBLE1BQU0sSUFBOEI7QUFDbEMsYUFBTyxJQUFJO1FBQ1QsS0FBSztRQUNMLEdBQUc7UUFDSCxrQkFBa0IsR0FBRyxLQUFLLEdBQUcsU0FBUztRQUN0QyxHQUFHO01BQUE7SUFFUDtJQUVBLFNBQStDO0FBQzdDLGFBQU8sRUFBRSxLQUFLLEtBQUssSUFBSSxPQUFBLEdBQVUsV0FBVyxLQUFLLFVBQVUsT0FBQSxFQUFPO0lBQ3BFO0VBQ0Y7QUFHTyxXQUFTLGtCQUFrQixLQUFpQixXQUFpQztBQUNsRixRQUFJLHFCQUFxQixhQUFjLFFBQU8sSUFBSSxhQUFhLEdBQUc7QUFDbEUsUUFBSSxxQkFBcUIsZUFBZTtBQUN0QyxZQUFNLE9BQU8sV0FBVyxLQUFLLFVBQVUsSUFBSTtBQUMzQyxhQUFPLFFBQVEsQ0FBQyxLQUFLLFNBQVMsWUFBWSxjQUFjLEtBQUssVUFBVSxJQUFJO0lBQzdFO0FBQ0EsUUFBSSxxQkFBcUIsZUFBZTtBQUN0QyxZQUFNLFNBQVMsY0FBYyxLQUFLLFVBQVUsTUFBTTtBQUNsRCxZQUFNLE9BQU8sY0FBYyxLQUFLLFVBQVUsSUFBSTtBQUM5QyxZQUFNLGFBQWEsV0FBVyxLQUFLLE9BQU8sSUFBSTtBQUM5QyxZQUFNLFdBQVcsV0FBVyxLQUFLLEtBQUssSUFBSTtBQUMxQyxVQUFJLFlBQVksZUFBZSxVQUFVLGFBQWE7QUFDcEQsZUFBTyxJQUFJLGNBQWMsUUFBUSxJQUFJO01BQ3ZDO0FBQ0EsYUFBTyxjQUFjLEtBQUssTUFBTTtJQUNsQztBQUNBLFdBQU8sY0FBYyxLQUFLLFVBQVUsSUFBSTtFQUMxQztBQ3RGQSxNQUFNLGlCQUFpQjtBQUdoQixXQUFTLFNBQVMsTUFBOEI7QUFDckQsUUFBSSxPQUFPLFNBQVMsWUFBWSxLQUFLLFdBQVcsRUFBRyxRQUFPO0FBQzFELFVBQU0sVUFBVSxLQUFLLEtBQUE7QUFHckIsUUFBSSwrQkFBK0IsS0FBSyxPQUFPLEVBQUcsUUFBTztBQUN6RCxRQUFJLHVCQUF1QixLQUFLLE9BQU8sS0FBSyxDQUFDLGVBQWUsS0FBSyxPQUFPLEVBQUcsUUFBTztBQUNsRixXQUFPO0VBQ1Q7QUFxQkEsTUFBTSxhQUFhO0FBT1osV0FBUyxhQUFhLE9BQWdCLFlBQVksS0FBb0I7QUFDM0UsUUFBSSxPQUFPLFVBQVUsU0FBVSxRQUFPO0FBQ3RDLFVBQU0sVUFBVSxNQUFNLEtBQUE7QUFDdEIsUUFBSSxRQUFRLFdBQVcsS0FBSyxRQUFRLFNBQVMsVUFBVyxRQUFPO0FBRS9ELFFBQUksK0JBQStCLEtBQUssT0FBTyxFQUFHLFFBQU87QUFDekQsUUFBSSxXQUFXLEtBQUssT0FBTyxFQUFHLFFBQU87QUFDckMsV0FBTztFQUNUO0FBT08sV0FBUyxlQUFlLE9BQStCO0FBQzVELFFBQUksT0FBTyxVQUFVLFNBQVUsUUFBTztBQUN0QyxVQUFNLFVBQVUsTUFBTSxLQUFBO0FBQ3RCLFFBQUksUUFBUSxXQUFXLEtBQUssUUFBUSxTQUFTLElBQUssUUFBTztBQUV6RCxRQUFJLCtCQUErQixLQUFLLE9BQU8sRUFBRyxRQUFPO0FBQ3pELFFBQUksa0RBQWtELEtBQUssT0FBTyxFQUFHLFFBQU87QUFDNUUsVUFBTSxXQUFXLFFBQVEsTUFBTSxHQUFHLEVBQUUsSUFBSSxDQUFDLFdBQVcsT0FBTyxLQUFBLENBQU07QUFDakUsUUFBSSxTQUFTLFdBQVcsS0FBSyxTQUFTLFNBQVMsR0FBSSxRQUFPO0FBQzFELFdBQU8sU0FBUyxNQUFNLENBQUMsV0FBVyxZQUFZLEtBQUssTUFBTSxDQUFDLElBQUksU0FBUyxLQUFLLElBQUksSUFBSTtFQUN0RjtBQUVBLE1BQU0sY0FBYztBQU9iLFdBQVMsVUFBVSxPQUErQjtBQUN2RCxRQUFJLE9BQU8sVUFBVSxTQUFVLFFBQU87QUFDdEMsVUFBTSxVQUFVLE1BQU0sS0FBQTtBQUN0QixRQUFJLFFBQVEsV0FBVyxLQUFLLFFBQVEsU0FBUyxHQUFJLFFBQU87QUFFeEQsUUFBSSwrQkFBK0IsS0FBSyxPQUFPLEVBQUcsUUFBTztBQUN6RCxXQUFPLE1BQU0sS0FBSyxPQUFPLElBQUksVUFBVTtFQUN6QztBQUVBLE1BQU0sUUFDSjtBQUdLLFdBQVMsV0FBVyxPQUErQjtBQUN4RCxVQUFNLE1BQU0sYUFBYSxPQUFPLEVBQUU7QUFDbEMsUUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixRQUFJLGdCQUFnQixLQUFLLEdBQUcsRUFBRyxRQUFPLEdBQUcsR0FBRztBQUM1QyxXQUFPLDBDQUEwQyxLQUFLLEdBQUcsSUFBSSxNQUFNO0VBQ3JFO0FBR08sV0FBUyxtQkFBMEQ7QUFDeEUsV0FBTztNQUNMLE9BQU8sRUFBRSxTQUFTLEtBQUE7TUFDbEIsUUFBUSxFQUFFLFNBQVMsRUFBQTtNQUNuQixZQUFZLEVBQUUsU0FBUyxLQUFBO01BQ3ZCLGFBQWEsRUFBRSxTQUFTLEtBQUE7TUFDeEIsWUFBWSxFQUFFLFNBQVMsS0FBQTtJQUFLO0VBRWhDO0FBU08sV0FBUyxlQUFlLE9BQStCO0FBQzVELFVBQU0sTUFBTSxPQUFPLFVBQVUsV0FBVyxPQUFPLEtBQUssSUFBSTtBQUN4RCxVQUFNLE1BQU0sYUFBYSxLQUFLLEVBQUU7QUFDaEMsUUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixRQUFJLGdCQUFnQixLQUFLLEdBQUcsRUFBRyxRQUFPLE9BQU8sV0FBVyxHQUFHLEtBQUssS0FBSyxNQUFNO0FBQzNFLFdBQU8sV0FBVyxHQUFHO0VBQ3ZCO0FBRUEsTUFBTSxhQUFBLG9CQUFpQixJQUFJLENBQUMsUUFBUSxVQUFVLFNBQVMsU0FBUyxDQUFDO0FBRzFELE1BQU0sYUFBYTtBQU9uQixXQUFTLGNBQWMsT0FBK0I7QUFDM0QsUUFBSSxPQUFPLFVBQVUsU0FBVSxRQUFPO0FBQ3RDLFFBQUksQ0FBQywyQkFBMkIsS0FBSyxLQUFLLEtBQUssTUFBTSxXQUFXLE1BQU0sRUFBRyxRQUFPO0FBQ2hGLFdBQU87RUFDVDtBQUdPLFdBQVMsZ0JBQWdCLE1BQTBDO0FBQ3hFLFVBQU0sZUFBeUIsQ0FBQTtBQUMvQixVQUFNLFFBQVEsT0FBTyxLQUFLLE1BQU0sVUFBVSxXQUFXLEtBQUssTUFBTSxRQUFRO0FBQ3hFLFFBQUksU0FBUyxXQUFXLElBQUksS0FBSyxFQUFHLGNBQWEsS0FBSyxlQUFlLEtBQUssRUFBRTtBQUM1RSxVQUFNLFNBQVMsT0FBTyxLQUFLLE1BQU0sV0FBVyxXQUFXLEtBQUssTUFBTSxTQUFTO0FBQzNFLFVBQU0sUUFBUSxLQUFLLElBQUksWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sTUFBTSxDQUFDLENBQUM7QUFDbEUsUUFBSSxRQUFRLEVBQUcsY0FBYSxLQUFLLGdCQUFnQixRQUFRLEdBQUcsS0FBSztBQUNqRSxVQUFNLGFBQWEsZUFBZSxLQUFLLE1BQU0sVUFBVTtBQUN2RCxRQUFJLFdBQVksY0FBYSxLQUFLLGdCQUFnQixVQUFVLEVBQUU7QUFDOUQsVUFBTSxTQUFTLFdBQVcsS0FBSyxNQUFNLFdBQVc7QUFDaEQsUUFBSSxPQUFRLGNBQWEsS0FBSyxlQUFlLE1BQU0sRUFBRTtBQUNyRCxVQUFNLFFBQVEsV0FBVyxLQUFLLE1BQU0sVUFBVTtBQUM5QyxRQUFJLE1BQU8sY0FBYSxLQUFLLGtCQUFrQixLQUFLLEVBQUU7QUFDdEQsV0FBTyxhQUFhLFNBQVMsSUFBSSxFQUFFLE9BQU8sYUFBYSxLQUFLLElBQUksRUFBQSxJQUFNLENBQUE7RUFDeEU7QUFHTyxXQUFTLGlCQUFpQixTQUErQztBQUM5RSxVQUFNLFFBQWlDLENBQUE7QUFDdkMsVUFBTSxRQUFRLFFBQVEsTUFBTSxhQUFhLFFBQVEsYUFBYSxPQUFPO0FBQ3JFLFFBQUksU0FBUyxXQUFXLElBQUksS0FBSyxFQUFBLE9BQVMsUUFBUTtBQUNsRCxVQUFNLFNBQVMsT0FBTyxXQUFXLFFBQVEsTUFBTSxVQUFVO0FBQ3pELFFBQUksT0FBTyxTQUFTLE1BQU0sS0FBSyxTQUFTLEdBQUc7QUFDekMsWUFBTSxTQUFTLEtBQUssSUFBSSxZQUFZLEtBQUssTUFBTSxTQUFTLEdBQUcsQ0FBQztJQUM5RDtBQUNBLFVBQU0sYUFBYSxlQUFlLFFBQVEsTUFBTSxVQUFVO0FBQzFELFFBQUksV0FBQSxPQUFrQixhQUFhO0FBQ25DLFVBQU0sU0FBUyxXQUFXLFFBQVEsTUFBTSxTQUFTO0FBQ2pELFFBQUksT0FBQSxPQUFjLGNBQWM7QUFDaEMsVUFBTSxRQUFRLFdBQVcsUUFBUSxNQUFNLFlBQVk7QUFDbkQsUUFBSSxNQUFBLE9BQWEsYUFBYTtBQUM5QixXQUFPO0VBQ1Q7QUFPTyxNQUFNLHFCQUEwQyxvQkFBSSxJQUFJLENBQUMsUUFBUSxVQUFVLFFBQVEsQ0FBQztBQUVwRixNQUFNLHNCQUFBLG9CQUErQyxJQUFJO0lBQzlEO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7RUFDRixDQUFDO0FBR00sTUFBTSxjQUFBLG9CQUF1QyxJQUFJO0lBQ3RELEdBQUc7SUFDSCxHQUFHO0VBQ0wsQ0FBQztBQUdNLFdBQVMsY0FBYyxjQUEyQztBQUN2RSxRQUFJLGlCQUFpQixhQUFjLFFBQU87QUFDMUMsUUFBSSxpQkFBaUIsY0FBZSxRQUFPO0FBQzNDLFdBQU87RUFDVDtBQUVBLE1BQU0sZUFBQSxvQkFBd0MsSUFBQTtBQUc5QyxXQUFTLGNBQWMsTUFBa0IsU0FBc0Q7QUFDN0YsVUFBTSxRQUFRLEtBQUssTUFBTTtBQUN6QixRQUFJLE9BQU8sVUFBVSxZQUFZLENBQUMsUUFBUSxJQUFJLEtBQUssRUFBRyxRQUFPLENBQUE7QUFDN0QsV0FBTyxFQUFFLE9BQU8sb0JBQW9CLEtBQUssR0FBQTtFQUMzQztBQUdBLFdBQVMsZUFDUCxTQUNBLFNBQ3lCO0FBQ3pCLFVBQU0sUUFBUSxRQUFRLE1BQU07QUFDNUIsV0FBTyxRQUFRLElBQUksS0FBSyxJQUFJLEVBQUUsV0FBVyxNQUFBLElBQVUsQ0FBQTtFQUNyRDtBQVVBLFdBQVMsWUFBWSxTQUFrQztBQUNyRCxlQUFXLFNBQVMsUUFBUSxVQUFVO0FBQ3BDLFVBQUksV0FBVyxLQUFLLEVBQUcsUUFBTztBQUM5QixVQUFJLE1BQU0sUUFBUSxZQUFBLE1BQWtCLElBQUs7QUFDekMsaUJBQVcsU0FBUyxNQUFNLFVBQVU7QUFDbEMsWUFBSSxXQUFXLEtBQUssRUFBRyxRQUFPO01BQ2hDO0lBQ0Y7QUFDQSxXQUFPO0VBQ1Q7QUFFQSxXQUFTLFdBQVcsU0FBMkI7QUFDN0MsV0FDRSxRQUFRLFFBQVEsWUFBQSxNQUFrQixZQUNqQyxRQUFRLGFBQWEsTUFBTSxLQUFLLElBQUksWUFBQSxNQUFrQjtFQUUzRDtBQVFPLFdBQVMsaUJBQWlCLE9BQStCO0FBQzlELFFBQUksT0FBTyxVQUFVLFNBQVUsUUFBTztBQUN0QyxVQUFNLFVBQVUsTUFBTSxLQUFBLEVBQU8sWUFBQTtBQUM3QixXQUFPLGdDQUFnQyxLQUFLLE9BQU8sSUFBSSxVQUFVO0VBQ25FO0FBT0EsV0FBUyxXQUFXLFNBQXFDO0FBQ3ZELFVBQU0sV0FBVyxpQkFBaUIsUUFBUSxhQUFhLGVBQWUsQ0FBQztBQUN2RSxRQUFJLFNBQVUsUUFBTztBQUNyQixVQUFNLE9BQU8sUUFBUSxjQUFjLE1BQU07QUFDekMsZUFBVyxRQUFRLENBQUMsU0FBUyxJQUFJLEdBQUc7QUFDbEMsaUJBQVcsUUFBUSxNQUFNLGFBQWEsQ0FBQSxHQUFJO0FBQ3hDLGNBQU0sUUFBUSwyQkFBMkIsS0FBSyxJQUFJO0FBQ2xELGNBQU0sV0FBVyxRQUFRLGlCQUFpQixNQUFNLENBQUMsQ0FBQyxJQUFJO0FBQ3RELFlBQUksU0FBVSxRQUFPO01BQ3ZCO0lBQ0Y7QUFDQSxXQUFPO0VBQ1Q7QUFHTyxXQUFTLGVBQXlDO0FBQ3ZELFdBQU87TUFDTCxLQUFLLEVBQUUsU0FBUyxTQUFBO01BQ2hCLFdBQVc7UUFDVCxTQUFTO1FBQ1QsT0FBTztRQUNQLE9BQU8saUJBQUE7UUFDUCxRQUFRLENBQUMsVUFBVSxFQUFFLEtBQUssS0FBSyxPQUFPLGdCQUFnQixJQUFJLEVBQUE7UUFDMUQsV0FBVyxDQUFDLEVBQUUsS0FBSyxLQUFLLFVBQVUsaUJBQUEsQ0FBa0I7TUFBQTtNQUV0RCxTQUFTO1FBQ1AsU0FBUztRQUNULE9BQU87OztRQUdQLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFBLEdBQUssSUFBSSxFQUFFLFNBQVMsS0FBQSxHQUFRLEdBQUcsaUJBQUEsRUFBaUI7UUFDM0UsUUFBUSxDQUFDLFNBQVM7QUFDaEIsZ0JBQU0sUUFBUSxnQkFBZ0IsSUFBSTtBQUNsQyxnQkFBTSxLQUFLLGNBQWMsS0FBSyxNQUFNLEVBQUU7QUFDdEMsaUJBQU8sRUFBRSxLQUFLLElBQUksV0FBVyxLQUFLLE1BQU0sS0FBSyxDQUFDLElBQUksT0FBTyxLQUFLLEVBQUUsR0FBRyxPQUFPLEdBQUEsSUFBTyxNQUFBO1FBQ25GO1FBQ0EsV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLFdBQVc7VUFDNUMsS0FBSyxJQUFJLEtBQUs7VUFDZCxVQUFVLENBQUMsYUFBYTtZQUN0QjtZQUNBLElBQUksY0FBYyxRQUFRLGFBQWEsSUFBSSxDQUFDO1lBQzVDLEdBQUcsaUJBQWlCLE9BQU87VUFBQTtRQUM3QixFQUNBO01BQUE7TUFFSixZQUFZO1FBQ1YsU0FBUztRQUNULE9BQU87UUFDUCxRQUFRLE9BQU8sRUFBRSxLQUFLLGFBQUE7UUFDdEIsV0FBVyxDQUFDLEVBQUUsS0FBSyxhQUFBLENBQWM7TUFBQTtNQUVuQyxXQUFXO1FBQ1QsU0FBUztRQUNULE9BQU87UUFDUCxPQUFPO1FBQ1AsT0FBTyxFQUFFLFVBQVUsRUFBRSxTQUFTLEtBQUEsRUFBSztRQUNuQyxvQkFBb0I7UUFDcEIsUUFBUSxDQUFDLFNBQVM7QUFDaEIsZ0JBQU0sV0FBVyxpQkFBaUIsS0FBSyxNQUFNLFFBQVE7QUFDckQsZ0JBQU0sUUFBZ0MsQ0FBQTtBQUN0QyxjQUFJLFNBQVUsT0FBTSxlQUFlLElBQUk7QUFDdkMsaUJBQU8sRUFBRSxLQUFLLE9BQU8sT0FBTyxVQUFVLE9BQUE7UUFDeEM7UUFDQSxXQUFXLENBQUMsRUFBRSxLQUFLLE9BQU8sVUFBVSxDQUFDLGFBQWEsRUFBRSxVQUFVLFdBQVcsT0FBTyxFQUFBLEdBQUEsQ0FBTTtNQUFBO01BRXhGLGdCQUFnQjtRQUNkLE9BQU87UUFDUCxNQUFNO1FBQ04sUUFBUSxPQUFPLEVBQUUsS0FBSyxNQUFNLFFBQVEsS0FBQTtRQUNwQyxXQUFXLENBQUMsRUFBRSxLQUFLLEtBQUEsQ0FBTTtNQUFBO01BRTNCLFdBQVc7UUFDVCxRQUFRO1FBQ1IsTUFBTTtRQUNOLE9BQU87UUFDUCxRQUFRLE9BQU8sRUFBRSxLQUFLLE1BQU0sUUFBUSxLQUFBO1FBQ3BDLFdBQVcsQ0FBQyxFQUFFLEtBQUssS0FBQSxDQUFNO01BQUE7TUFFM0IsVUFBVTtRQUNSLFNBQVM7UUFDVCxPQUFPO1FBQ1AsUUFBUSxPQUFPLEVBQUUsS0FBSyxNQUFNLE9BQU8sRUFBRSxhQUFhLFdBQUEsRUFBVzs7OztRQUk3RCxXQUFXO1VBQ1Q7WUFDRSxLQUFLO1lBQ0wsV0FBVztZQUNYLFVBQVUsQ0FBQyxZQUFhLFFBQVEsYUFBYSxXQUFXLE1BQU0sYUFBYSxDQUFBLElBQUs7VUFBQTs7Ozs7VUFNbEY7WUFDRSxLQUFLO1lBQ0wsVUFBVSxDQUFDLFlBQ1QsQ0FBQyxHQUFHLFFBQVEsUUFBUSxFQUFFO2NBQ3BCLENBQUMsVUFBVSxNQUFNLFFBQVEsWUFBQSxNQUFrQixRQUFRLFlBQVksS0FBSztZQUFBLElBRWxFLENBQUEsSUFDQTtVQUFBO1FBQ1I7TUFDRjtNQUVGLFVBQVU7UUFDUixTQUFTO1FBQ1QsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLE1BQUEsRUFBTTtRQUNuQyxRQUFRLENBQUMsVUFBVTtVQUNqQixLQUFLO1VBQ0wsT0FBTztZQUNMLGFBQWE7WUFDYixnQkFBZ0IsS0FBSyxNQUFNLFlBQVksT0FBTyxTQUFTO1VBQUE7UUFDekQ7UUFFRixXQUFXO1VBQ1Q7WUFDRSxLQUFLO1lBQ0wsV0FBVztZQUNYLFVBQVUsQ0FBQyxhQUFhLEVBQUUsU0FBUyxRQUFRLGFBQWEsY0FBYyxNQUFNLE9BQUE7VUFBTzs7Ozs7OztVQVFyRjtZQUNFLEtBQUs7WUFDTCxVQUFVLENBQUMsWUFBWTtBQUNyQixvQkFBTSxNQUFNLFlBQVksT0FBTztBQUMvQixxQkFBTyxNQUFNLEVBQUUsU0FBUyxJQUFJLGFBQWEsU0FBUyxFQUFBLElBQU07WUFDMUQ7VUFBQTtRQUNGO01BQ0Y7TUFFRixZQUFZO1FBQ1YsU0FBUztRQUNULE9BQU87UUFDUCxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsS0FBQSxFQUFLO1FBQ3BDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsS0FBSyxNQUFNLE9BQU8sY0FBYyxNQUFNLGtCQUFrQixFQUFBO1FBQzdFLFdBQVc7VUFDVCxFQUFFLEtBQUssTUFBTSxVQUFVLENBQUMsWUFBWSxlQUFlLFNBQVMsa0JBQWtCLEVBQUE7UUFBRTtNQUNsRjtNQUVGLGFBQWE7UUFDWCxTQUFTO1FBQ1QsT0FBTztRQUNQLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFBLEdBQUssV0FBVyxFQUFFLFNBQVMsS0FBQSxFQUFLO1FBQzNELFFBQVEsQ0FBQyxTQUFTO0FBQ2hCLGdCQUFNLFFBQWdDLGNBQWMsTUFBTSxtQkFBbUI7QUFDN0UsY0FBSSxLQUFLLE1BQU0sVUFBVSxFQUFBLE9BQVMsUUFBUSxPQUFPLEtBQUssTUFBTSxLQUFLO0FBQ2pFLGlCQUFPLEVBQUUsS0FBSyxNQUFNLE1BQUE7UUFDdEI7UUFDQSxXQUFXO1VBQ1Q7WUFDRSxLQUFLO1lBQ0wsVUFBVSxDQUFDLFlBQVk7QUFDckIsb0JBQU0sUUFBUSxPQUFPLFNBQVMsUUFBUSxhQUFhLE9BQU8sS0FBSyxLQUFLLEVBQUU7QUFDdEUscUJBQU87Z0JBQ0wsT0FBTyxPQUFPLE1BQU0sS0FBSyxJQUFJLElBQUk7Z0JBQ2pDLEdBQUcsZUFBZSxTQUFTLG1CQUFtQjtjQUFBO1lBRWxEO1VBQUE7UUFDRjtNQUNGO01BRUYsVUFBVTtRQUNSLFNBQVM7UUFDVCxRQUFRLE9BQU8sRUFBRSxLQUFLLEtBQUE7UUFDdEIsV0FBVyxDQUFDLEVBQUUsS0FBSyxLQUFBLENBQU07TUFBQTtNQUUzQixNQUFNLEVBQUUsT0FBTyxTQUFBO0lBQVM7RUFFNUI7QUFHTyxXQUFTLGVBQXlDO0FBQ3ZELFdBQU87TUFDTCxNQUFNO1FBQ0osUUFBUSxPQUFPLEVBQUUsS0FBSyxTQUFBO1FBQ3RCLFdBQVcsQ0FBQyxFQUFFLEtBQUssU0FBQSxHQUFZLEVBQUUsS0FBSyxJQUFBLENBQUs7TUFBQTtNQUU3QyxRQUFRO1FBQ04sUUFBUSxPQUFPLEVBQUUsS0FBSyxLQUFBO1FBQ3RCLFdBQVcsQ0FBQyxFQUFFLEtBQUssS0FBQSxHQUFRLEVBQUUsS0FBSyxJQUFBLENBQUs7TUFBQTtNQUV6QyxXQUFXO1FBQ1QsUUFBUSxPQUFPLEVBQUUsS0FBSyxJQUFBO1FBQ3RCLFdBQVcsQ0FBQyxFQUFFLEtBQUssSUFBQSxDQUFLO01BQUE7TUFFMUIsZUFBZTtRQUNiLFFBQVEsT0FBTyxFQUFFLEtBQUssSUFBQTtRQUN0QixXQUFXLENBQUMsRUFBRSxLQUFLLElBQUEsR0FBTyxFQUFFLEtBQUssU0FBQSxHQUFZLEVBQUUsS0FBSyxNQUFBLENBQU87TUFBQTtNQUU3RCxNQUFNO1FBQ0osUUFBUSxPQUFPLEVBQUUsS0FBSyxPQUFBO1FBQ3RCLFdBQVcsQ0FBQyxFQUFFLEtBQUssT0FBQSxDQUFRO01BQUE7TUFFN0IsTUFBTTtRQUNKLE9BQU8sRUFBRSxNQUFNLENBQUEsR0FBSSxPQUFPLEVBQUUsU0FBUyxLQUFBLEdBQVEsUUFBUSxFQUFFLFNBQVMsS0FBQSxFQUFLO1FBQ3JFLFFBQVEsQ0FBQyxTQUFTO0FBQ2hCLGdCQUFNLE9BQU8sU0FBUyxLQUFLLE1BQU0sSUFBSTtBQUNyQyxnQkFBTSxRQUFnQyxPQUFPLEVBQUUsS0FBQSxJQUFTLENBQUE7QUFDeEQsY0FBSSxPQUFPLEtBQUssTUFBTSxVQUFVLFNBQVUsT0FBTSxRQUFRLEtBQUssTUFBTTtBQUluRSxjQUFJLEtBQUssTUFBTSxXQUFXLFVBQVU7QUFDbEMsa0JBQU0sU0FBUztBQUNmLGtCQUFNLE1BQU07VUFDZDtBQUNBLGlCQUFPLEVBQUUsS0FBSyxLQUFLLE1BQUE7UUFDckI7UUFDQSxXQUFXO1VBQ1Q7WUFDRSxLQUFLO1lBQ0wsVUFBVSxDQUFDLFlBQVk7QUFDckIsb0JBQU0sT0FBTyxTQUFTLFFBQVEsYUFBYSxNQUFNLENBQUM7QUFDbEQsa0JBQUksQ0FBQyxLQUFNLFFBQU87QUFDbEIsb0JBQU0sUUFBUSxRQUFRLGFBQWEsT0FBTztBQUcxQyxvQkFBTSxTQUFTLFFBQVEsYUFBYSxRQUFRLE1BQU0sV0FBVyxXQUFXO0FBQ3hFLG9CQUFNLFFBQWlDLEVBQUUsS0FBQTtBQUN6QyxrQkFBSSxNQUFBLE9BQWEsUUFBUTtBQUN6QixrQkFBSSxPQUFBLE9BQWMsU0FBUztBQUMzQixxQkFBTztZQUNUO1VBQUE7UUFDRjtNQUNGO01BRUYsV0FBVztRQUNULFFBQVEsT0FBTyxFQUFFLEtBQUssT0FBQTtRQUN0QixXQUFXLENBQUMsRUFBRSxLQUFLLE9BQUEsQ0FBUTtNQUFBO01BRTdCLFdBQVc7UUFDVCxVQUFVO1FBQ1YsUUFBUSxPQUFPLEVBQUUsS0FBSyxNQUFBO1FBQ3RCLFdBQVcsQ0FBQyxFQUFFLEtBQUssTUFBQSxDQUFPO01BQUE7TUFFNUIsYUFBYTtRQUNYLFVBQVU7UUFDVixRQUFRLE9BQU8sRUFBRSxLQUFLLE1BQUE7UUFDdEIsV0FBVyxDQUFDLEVBQUUsS0FBSyxNQUFBLENBQU87TUFBQTtNQUU1QixZQUFZO1FBQ1YsT0FBTyxFQUFFLFFBQVEsQ0FBQSxFQUFDO1FBQ2xCLFFBQVEsQ0FBQyxTQUFTLFVBQVUsZUFBZSxlQUFlLEtBQUssTUFBTSxNQUFNLENBQUM7UUFDNUUsV0FBVztVQUNUO1lBQ0UsS0FBSztZQUNMLFVBQVUsQ0FBQyxZQUFZO0FBQ3JCLG9CQUFNLFNBQVMsZUFBZSxRQUFRLE1BQU0sVUFBVTtBQUN0RCxxQkFBTyxTQUFTLEVBQUUsT0FBQSxJQUFXO1lBQy9CO1VBQUE7VUFFRjtZQUNFLEtBQUs7WUFDTCxVQUFVLENBQUMsWUFBWTtBQUNyQixvQkFBTSxTQUFTLGVBQWUsUUFBUSxhQUFhLE1BQU0sQ0FBQztBQUMxRCxxQkFBTyxTQUFTLEVBQUUsT0FBQSxJQUFXO1lBQy9CO1VBQUE7UUFDRjtNQUNGO01BRUYsVUFBVTtRQUNSLE9BQU8sRUFBRSxNQUFNLENBQUEsRUFBQztRQUNoQixRQUFRLENBQUMsU0FBUyxVQUFVLGFBQWEsV0FBVyxLQUFLLE1BQU0sSUFBSSxDQUFDO1FBQ3BFLFdBQVc7VUFDVDtZQUNFLEtBQUs7WUFDTCxVQUFVLENBQUMsWUFBWTtBQUNyQixvQkFBTSxPQUFPLFdBQVcsUUFBUSxNQUFNLFFBQVE7QUFDOUMscUJBQU8sT0FBTyxFQUFFLEtBQUEsSUFBUztZQUMzQjtVQUFBO1FBQ0Y7TUFDRjtNQUVGLFdBQVc7UUFDVCxPQUFPLEVBQUUsT0FBTyxDQUFBLEVBQUM7UUFDakIsUUFBUSxDQUFDLFNBQVMsVUFBVSxTQUFTLFVBQVUsS0FBSyxNQUFNLEtBQUssQ0FBQztRQUNoRSxXQUFXO1VBQ1Q7WUFDRSxLQUFLO1lBQ0wsVUFBVSxDQUFDLFlBQVk7QUFDckIsb0JBQU0sUUFBUSxVQUFVLFFBQVEsTUFBTSxLQUFLO0FBQzNDLHFCQUFPLFFBQVEsRUFBRSxNQUFBLElBQVU7WUFDN0I7VUFBQTtRQUNGO01BQ0Y7TUFFRixpQkFBaUI7UUFDZixPQUFPLEVBQUUsT0FBTyxDQUFBLEVBQUM7UUFDakIsUUFBUSxDQUFDLFNBQVMsVUFBVSxvQkFBb0IsVUFBVSxLQUFLLE1BQU0sS0FBSyxDQUFDO1FBQzNFLFdBQVc7VUFDVDtZQUNFLEtBQUs7WUFDTCxVQUFVLENBQUMsWUFBWTtBQUNyQixvQkFBTSxRQUFRLFVBQVUsUUFBUSxNQUFNLGVBQWU7QUFDckQscUJBQU8sUUFBUSxFQUFFLE1BQUEsSUFBVTtZQUM3QjtVQUFBO1FBQ0Y7TUFDRjtNQUVGLFdBQVc7UUFDVCxRQUFRLE1BQU0sVUFBVSxxQkFBcUIsWUFBWTtRQUN6RCxXQUFXO1VBQ1Q7WUFDRSxLQUFLO1lBQ0wsVUFBVSxDQUFDLFlBQVk7QUFJckIsb0JBQU0sT0FBTyxRQUFRLE1BQU0sbUJBQW1CLFFBQVEsTUFBTSxlQUFlO0FBQzNFLHFCQUFPLEtBQUssS0FBQSxFQUFPLFlBQUEsTUFBa0IsZUFBZSxDQUFBLElBQUs7WUFDM0Q7VUFBQTtRQUNGO01BQ0Y7TUFFRixlQUFlO1FBQ2IsT0FBTyxFQUFFLFNBQVMsQ0FBQSxFQUFDO1FBQ25CLFFBQVEsQ0FBQyxTQUFTLFVBQVUsa0JBQWtCLFdBQVcsS0FBSyxNQUFNLE9BQU8sQ0FBQztRQUM1RSxXQUFXO1VBQ1Q7WUFDRSxLQUFLO1lBQ0wsVUFBVSxDQUFDLFlBQVk7QUFDckIsb0JBQU0sVUFBVSxXQUFXLFFBQVEsTUFBTSxhQUFhO0FBQ3RELHFCQUFPLFVBQVUsRUFBRSxRQUFBLElBQVk7WUFDakM7VUFBQTtRQUNGO01BQ0Y7SUFDRjtFQUVKO0FBR0EsV0FBUyxVQUFVLFVBQWtCLE9BQWdDO0FBQ25FLFdBQU8sUUFBUSxFQUFFLEtBQUssUUFBUSxPQUFPLEVBQUUsT0FBTyxHQUFHLFFBQVEsS0FBSyxLQUFLLEdBQUEsRUFBRyxJQUFNLEVBQUUsS0FBSyxPQUFBO0VBQ3JGO0FBRUEsV0FBUyxXQUFXLE9BQXdCO0FBQzFDLFVBQU0sUUFBUSxPQUFPLFVBQVUsV0FBVyxLQUFLLE1BQU0sS0FBSyxJQUFJO0FBQzlELFdBQU8sS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLEdBQUcsS0FBSyxDQUFDO0VBQ3ZDO0FDamxCTyxXQUFTLFlBQVksSUFBaUIsTUFBZ0IsSUFBb0I7QUFDL0UsUUFBSSxXQUFXLEtBQUssTUFBTSxHQUFHLElBQUksR0FBRztBQUNsQyxVQUFJLEtBQUssU0FBUyxHQUFHLFFBQVE7QUFDM0IsV0FBRyxLQUFLLElBQUksa0JBQWtCLEtBQUssTUFBTSxLQUFLLFFBQVEsR0FBRyxRQUFRLFNBQVMsS0FBSyxDQUFDO01BQ2xGO0FBQ0E7SUFDRjtBQUVBLFVBQU0sYUFBYSxXQUFXLEdBQUcsS0FBSyxLQUFLLElBQUk7QUFDL0MsVUFBTSxZQUFZLFdBQVcsR0FBRyxLQUFLLEdBQUcsSUFBSTtBQUM1QyxRQUFJLENBQUMsWUFBWSxlQUFlLENBQUMsV0FBVyxZQUFhO0FBR3pELFVBQU0sY0FBYyxhQUFhLFdBQVcsT0FBTztBQUNuRCxRQUFJLEtBQUssU0FBUyxhQUFhO0FBQzdCLFNBQUcsS0FBSyxJQUFJLGtCQUFrQixLQUFLLE1BQU0sS0FBSyxRQUFRLGFBQWEsU0FBUyxLQUFLLENBQUM7SUFDcEY7QUFDQSxRQUFJLEdBQUcsU0FBUyxHQUFHO0FBQ2pCLFNBQUcsS0FBSyxJQUFJLGtCQUFrQixHQUFHLE1BQU0sR0FBRyxHQUFHLFFBQVEsU0FBUyxLQUFLLENBQUM7SUFDdEU7QUFHQSxRQUFJLGFBQWE7QUFDakIsV0FBTyxLQUFLLEtBQUssVUFBVSxNQUFNLEdBQUcsS0FBSyxVQUFVLEVBQUc7QUFDdEQsVUFBTSxhQUFhLEtBQUssS0FBSyxNQUFNLEdBQUcsVUFBVTtBQUNoRCxVQUFNLGFBQWEsS0FBSyxLQUFLLFVBQVU7QUFDdkMsVUFBTSxZQUFZLEdBQUcsS0FBSyxVQUFVO0FBQ3BDLFFBQUksWUFBWSxhQUFhLEdBQUc7QUFDOUIsU0FBRyxLQUFLLElBQUksaUJBQWlCLFlBQVksYUFBYSxHQUFHLFdBQVcsU0FBUyxLQUFLLENBQUM7SUFDckY7QUFHQSxVQUFNLGlCQUFpQixLQUFLLEtBQUssV0FBVyxhQUFhLEtBQUssR0FBRyxLQUFLLFdBQVcsYUFBYTtBQUM5RixRQUFJLGdCQUFnQjtBQUNsQixTQUFHLEtBQUssSUFBSSxjQUFjLEtBQUssTUFBTSxLQUFLLE1BQU0sQ0FBQztJQUNuRDtFQUNGO0FDYk8sV0FBUyxpQkFBaUIsVUFBdUM7QUFDdEUsV0FBTyxDQUFDLFVBQVU7QUFDaEIsaUJBQVcsV0FBVyxVQUFVO0FBQzlCLGNBQU0sS0FBSyxRQUFRLEtBQUs7QUFDeEIsWUFBSSxHQUFJLFFBQU87TUFDakI7QUFDQSxhQUFPO0lBQ1Q7RUFDRjtBQUdPLFdBQVMsV0FBVyxNQUF1QjtBQUNoRCxXQUFPLENBQUMsVUFBVTtBQUNoQixVQUFJLEtBQUssV0FBVyxFQUFHLFFBQU87QUFDOUIsWUFBTSxZQUFZLE1BQU07QUFDeEIsVUFBSSxFQUFFLHFCQUFxQixlQUFnQixRQUFPO0FBQ2xELFlBQU0sS0FBSyxNQUFNO0FBQ2pCLFVBQUksQ0FBQyxVQUFVLE1BQU8sYUFBWSxJQUFJLFVBQVUsTUFBTSxVQUFVLEVBQUU7QUFDbEUsWUFBTSxRQUFRLFVBQVU7QUFDeEIsWUFBTSxRQUFRLFdBQVcsR0FBRyxLQUFLLE1BQU0sSUFBSTtBQUMzQyxVQUFJLENBQUMsT0FBTyxZQUFhLFFBQU87QUFDaEMsWUFBTSxZQUFZLE1BQU0sZUFBZSxvQkFBb0IsTUFBTSxTQUFTLE1BQU0sTUFBTTtBQUN0RixZQUFNLFFBQVEsVUFBVSxPQUFPLENBQUMsU0FBUyxNQUFNLEtBQUssZUFBZSxLQUFLLElBQUksQ0FBQztBQUM3RSxTQUFHO1FBQ0QsSUFBSTtVQUNGLE1BQU07VUFDTixNQUFNO1VBQ04sTUFBTTtVQUNOLFNBQVMsR0FBRyxNQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssQ0FBQztRQUFBO01BQzVDO0FBRUYsU0FBRyxhQUFhLElBQUksY0FBYyxJQUFJLE1BQU0sTUFBTSxNQUFNLFNBQVMsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUM5RSxhQUFPO0lBQ1Q7RUFDRjtBQUdPLE1BQU0sa0JBQTJCLENBQUMsVUFBVTtBQUNqRCxVQUFNLFlBQVksTUFBTTtBQUN4QixRQUFJLFVBQVUsTUFBTyxRQUFPO0FBQzVCLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFFBQUkscUJBQXFCLGNBQWM7QUFDckMsWUFBTSxZQUFZLE1BQU0sT0FBTyxtQkFBQSxFQUFxQixPQUFBO0FBQ3BELFNBQUcsS0FBSyxJQUFJLGlCQUFpQixDQUFBLEdBQUksR0FBRyxNQUFNLElBQUksWUFBWSxTQUFTLEdBQUcsU0FBUyxDQUFDLENBQUM7QUFDakYsU0FBRyxhQUFhLElBQUksY0FBYyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzlDLGFBQU87SUFDVDtBQUNBLFFBQUkscUJBQXFCLGVBQWU7QUFDdEMsU0FBRztRQUNELElBQUk7VUFDRixVQUFVO1VBQ1YsVUFBVTtVQUNWLFVBQVUsUUFBUTtVQUNsQixTQUFTO1FBQUE7TUFDWDtBQUVGLFNBQUcsYUFBYSxjQUFjLEdBQUcsS0FBSyxVQUFVLElBQUksQ0FBQztBQUNyRCxhQUFPO0lBQ1Q7QUFDQSxnQkFBWSxJQUFJLFVBQVUsTUFBTSxVQUFVLEVBQUU7QUFDNUMsT0FBRyxhQUFhLElBQUksY0FBYyxVQUFVLElBQUksQ0FBQztBQUNqRCxXQUFPO0VBQ1Q7QUFHTyxXQUFTLFdBQVcsTUFBYyxPQUF3QjtBQUMvRCxXQUFPLENBQUMsVUFBVTtBQUNoQixZQUFNLE9BQU8sTUFBTSxPQUFPLFNBQVMsSUFBSTtBQUN2QyxZQUFNLE9BQU8sS0FBSyxPQUFPLEtBQUs7QUFDOUIsWUFBTSxZQUFZLE1BQU07QUFFeEIsVUFBSSxVQUFVLFNBQVMscUJBQXFCLGVBQWU7QUFDekQsY0FBTSxRQUFRLFdBQVcsTUFBTSxLQUFLLFVBQVUsS0FBSyxJQUFJO0FBQ3ZELFlBQUksQ0FBQyxPQUFPLGVBQWUsQ0FBQyxNQUFNLEtBQUssZUFBZSxJQUFJLEVBQUcsUUFBTztBQUNwRSxjQUFNLFVBQVUsTUFBTSxlQUFlLG9CQUFvQixNQUFNLFNBQVMsVUFBVSxLQUFLLE1BQU07QUFDN0YsY0FBTUUsVUFBUyxRQUFRLEtBQUssQ0FBQyxjQUFjLFVBQVUsU0FBUyxJQUFJO0FBQ2xFLGNBQU0sT0FBT0EsVUFDVCxRQUFRLE9BQU8sQ0FBQyxjQUFjLFVBQVUsU0FBUyxJQUFJLElBQ3JELEtBQUssU0FBUyxPQUFPO0FBQ3pCLGVBQU8sTUFBTSxHQUFHLGVBQWUsSUFBSTtNQUNyQztBQUVBLFlBQU0sU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFLEVBQUU7UUFDcEUsQ0FBQyxVQUFVLE1BQU0sT0FBTyxNQUFNLE1BQU0sTUFBTSxLQUFLLEtBQUssZUFBZSxJQUFJO01BQUE7QUFFekUsVUFBSSxPQUFPLFdBQVcsRUFBRyxRQUFPO0FBQ2hDLFlBQU0sU0FBUyxPQUFPO1FBQU0sQ0FBQyxVQUMzQixhQUFhLE1BQU0sS0FBSyxTQUFTLE1BQU0sTUFBTSxNQUFNLElBQUksSUFBSTtNQUFBO0FBRTdELFlBQU0sS0FBSyxNQUFNO0FBQ2pCLGlCQUFXLFNBQVMsUUFBUTtBQUMxQixZQUFJLFFBQVE7QUFDVixxQkFBVyxTQUFTLGVBQWUsTUFBTSxLQUFLLFNBQVMsTUFBTSxNQUFNLE1BQU0sSUFBSSxJQUFJLEdBQUc7QUFDbEYsZUFBRyxLQUFLLElBQUksZUFBZSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sSUFBSSxNQUFNLElBQUksQ0FBQztVQUMxRTtRQUNGLE9BQU87QUFDTCxhQUFHLEtBQUssSUFBSSxZQUFZLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQztRQUNqRTtNQUNGO0FBQ0EsYUFBTyxHQUFHLGFBQWEsS0FBSztJQUM5QjtFQUNGO0FBR08sV0FBUyxhQUFhLE1BQWMsT0FBd0I7QUFDakUsV0FBTyxDQUFDLFVBQVU7QUFDaEIsWUFBTSxPQUFPLE1BQU0sT0FBTyxTQUFTLElBQUk7QUFDdkMsVUFBSSxDQUFDLEtBQUssY0FBZSxRQUFPO0FBQ2hDLFlBQU0sWUFBWSxNQUFNO0FBQ3hCLFlBQU0sS0FBSyxNQUFNO0FBQ2pCLFVBQUksVUFBVTtBQUNkLGlCQUFXLFNBQVMsY0FBYyxNQUFNLEtBQUssVUFBVSxNQUFNLFVBQVUsRUFBRSxHQUFHO0FBQzFFLGNBQU0sY0FBYyxLQUFLLE9BQU8sT0FBTyxNQUFNLEtBQUssT0FBTztBQUN6RCxZQUFJLE1BQU0sS0FBSyxTQUFTLFFBQVEsUUFBUSxNQUFNLEtBQUssT0FBTyxZQUFZLEtBQUssRUFBRztBQUM5RSxXQUFHLEtBQUssY0FBYyxNQUFNLE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxDQUFDO0FBQzNELGtCQUFVO01BQ1o7QUFDQSxVQUFJLENBQUMsUUFBUyxRQUFPO0FBR3JCLFNBQUcsYUFBYSxTQUFTO0FBQ3pCLGFBQU87SUFDVDtFQUNGO0FBT08sV0FBUyxRQUFRLE1BQWMsT0FBdUI7QUFDM0QsV0FBTyxDQUFDLFVBQVU7QUFDaEIsWUFBTSxPQUFPLE1BQU0sT0FBTyxTQUFTLElBQUk7QUFDdkMsWUFBTSxPQUFPLEtBQUssT0FBTyxLQUFLO0FBQzlCLFlBQU0sWUFBWSxNQUFNO0FBRXhCLFVBQUksVUFBVSxTQUFTLHFCQUFxQixlQUFlO0FBQ3pELGNBQU0sUUFBUSxXQUFXLE1BQU0sS0FBSyxVQUFVLEtBQUssSUFBSTtBQUN2RCxZQUFJLENBQUMsT0FBTyxlQUFlLENBQUMsTUFBTSxLQUFLLGVBQWUsSUFBSSxFQUFHLFFBQU87QUFDcEUsY0FBTSxVQUFVLE1BQU0sZUFBZSxvQkFBb0IsTUFBTSxTQUFTLFVBQVUsS0FBSyxNQUFNO0FBQzdGLGVBQU8sTUFBTSxHQUFHLGVBQWUsS0FBSyxTQUFTLE9BQU8sQ0FBQztNQUN2RDtBQUVBLFlBQU0sU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFLEVBQUU7UUFDcEUsQ0FBQyxVQUFVLE1BQU0sT0FBTyxNQUFNLE1BQU0sTUFBTSxLQUFLLEtBQUssZUFBZSxJQUFJO01BQUE7QUFFekUsVUFBSSxPQUFPLFdBQVcsRUFBRyxRQUFPO0FBQ2hDLFlBQU0sS0FBSyxNQUFNO0FBQ2pCLGlCQUFXLFNBQVMsUUFBUTtBQUUxQixtQkFBVyxTQUFTLGVBQWUsTUFBTSxLQUFLLFNBQVMsTUFBTSxNQUFNLE1BQU0sSUFBSSxJQUFJLEdBQUc7QUFDbEYsYUFBRyxLQUFLLElBQUksZUFBZSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sSUFBSSxNQUFNLElBQUksQ0FBQztRQUMxRTtBQUNBLFdBQUcsS0FBSyxJQUFJLFlBQVksTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDO01BQ2pFO0FBQ0EsYUFBTyxHQUFHLGFBQWEsS0FBSztJQUM5QjtFQUNGO0FBR08sV0FBUyxVQUFVLE1BQXVCO0FBQy9DLFdBQU8sQ0FBQyxVQUFVO0FBQ2hCLFlBQU0sT0FBTyxNQUFNLE9BQU8sU0FBUyxJQUFJO0FBQ3ZDLFlBQU0sWUFBWSxNQUFNO0FBRXhCLFVBQUksVUFBVSxTQUFTLHFCQUFxQixlQUFlO0FBQ3pELGNBQU0sUUFBUSxXQUFXLE1BQU0sS0FBSyxVQUFVLEtBQUssSUFBSTtBQUN2RCxZQUFJLENBQUMsT0FBTyxZQUFhLFFBQU87QUFDaEMsY0FBTSxVQUFVLE1BQU0sZUFBZSxvQkFBb0IsTUFBTSxTQUFTLFVBQVUsS0FBSyxNQUFNO0FBQzdGLGNBQU0sT0FBTyxRQUFRLE9BQU8sQ0FBQyxjQUFjLFVBQVUsU0FBUyxJQUFJO0FBQ2xFLGVBQU8sS0FBSyxXQUFXLFFBQVEsU0FBUyxPQUFPLE1BQU0sR0FBRyxlQUFlLElBQUk7TUFDN0U7QUFFQSxZQUFNLEtBQUssTUFBTTtBQUNqQixpQkFBVyxTQUFTLGNBQWMsTUFBTSxLQUFLLFVBQVUsTUFBTSxVQUFVLEVBQUUsR0FBRztBQUMxRSxZQUFJLE1BQU0sUUFBUSxNQUFNLEdBQUk7QUFDNUIsbUJBQVcsU0FBUyxlQUFlLE1BQU0sS0FBSyxTQUFTLE1BQU0sTUFBTSxNQUFNLElBQUksSUFBSSxHQUFHO0FBQ2xGLGFBQUcsS0FBSyxJQUFJLGVBQWUsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLElBQUksTUFBTSxJQUFJLENBQUM7UUFDMUU7TUFDRjtBQUNBLGFBQU8sR0FBRyxhQUFhLEtBQUs7SUFDOUI7RUFDRjtBQUdPLE1BQU0sa0JBQTJCLENBQUMsVUFBVTtBQUNqRCxVQUFNLFlBQVksTUFBTTtBQUN4QixVQUFNLEtBQUssTUFBTTtBQUNqQixlQUFXLFNBQVMsY0FBYyxNQUFNLEtBQUssVUFBVSxNQUFNLFVBQVUsRUFBRSxHQUFHO0FBQzFFLFVBQUksTUFBTSxRQUFRLE1BQU0sR0FBSTtBQUM1QixpQkFBVyxRQUFRLE9BQU8sT0FBTyxNQUFNLE9BQU8sS0FBSyxHQUFHO0FBQ3BELG1CQUFXLFNBQVMsZUFBZSxNQUFNLEtBQUssU0FBUyxNQUFNLE1BQU0sTUFBTSxJQUFJLElBQUksR0FBRztBQUNsRixhQUFHLEtBQUssSUFBSSxlQUFlLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLE1BQU0sSUFBSSxDQUFDO1FBQzFFO01BQ0Y7SUFDRjtBQUNBLFdBQU8sR0FBRyxhQUFhLEtBQUs7RUFDOUI7QUFPTyxNQUFNLHVCQUFnQyxDQUFDLFVBQVU7QUFDdEQsVUFBTSxLQUFLLE1BQU07QUFDakIsVUFBTSxXQUFXLGlCQUFBO0FBQ2pCLGVBQVcsU0FBUyxjQUFjLE1BQU0sS0FBSyxNQUFNLFVBQVUsTUFBTSxNQUFNLFVBQVUsRUFBRSxHQUFHO0FBQ3RGLFlBQU0sUUFBUSxNQUFNLEtBQUs7QUFDekIsWUFBTSxPQUFnQyxFQUFFLEdBQUcsTUFBQTtBQUMzQyxpQkFBVyxDQUFDLE1BQU0sSUFBSSxLQUFLLE9BQU8sUUFBUSxRQUFRLEdBQUc7QUFDbkQsWUFBSSxRQUFRLEtBQU0sTUFBSyxJQUFJLElBQUksS0FBSyxXQUFXO01BQ2pEO0FBQ0EsVUFBSSxRQUFRLE9BQU8sSUFBSSxFQUFHO0FBQzFCLFNBQUcsS0FBSyxJQUFJLGlCQUFpQixNQUFNLE1BQU0sSUFBSSxDQUFDO0lBQ2hEO0FBQ0EsV0FBTyxHQUFHLGFBQWEsS0FBSztFQUM5QjtBQUdPLE1BQU0scUJBQThCLENBQUMsVUFBVTtBQUNwRCxVQUFNLFFBQVEsZ0JBQWdCLEtBQUs7QUFDbkMsVUFBTSxTQUFTLHFCQUFxQixRQUFRLE1BQU0sTUFBTSxLQUFLLElBQUksS0FBSztBQUN0RSxRQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLFFBQUksQ0FBQyxPQUFRLFFBQU87QUFHcEIsZUFBVyxRQUFRLE9BQU8sTUFBTyxPQUFNLEtBQUssSUFBSTtBQUNoRCxXQUFPO0VBQ1Q7QUFPTyxXQUFTLGNBQWMsT0FBdUI7QUFDbkQsV0FBTyxDQUFDLFVBQVU7QUFDaEIsWUFBTSxZQUFZLE1BQU07QUFDeEIsWUFBTSxLQUFLLE1BQU07QUFDakIsaUJBQVcsU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFLEdBQUc7QUFDMUUsY0FBTSxPQUFPLEVBQUUsR0FBRyxNQUFNLEtBQUssT0FBTyxHQUFHLE1BQUE7QUFDdkMsWUFBSSxRQUFRLE1BQU0sS0FBSyxPQUFPLElBQUksRUFBRztBQUNyQyxXQUFHLEtBQUssSUFBSSxpQkFBaUIsTUFBTSxNQUFNLElBQUksQ0FBQztNQUNoRDtBQUNBLGFBQU8sR0FBRyxhQUFhLEtBQUs7SUFDOUI7RUFDRjtBQUdPLFdBQVMsYUFBYSxPQUFnRTtBQUMzRixXQUFPLGNBQWMsRUFBRSxNQUFBLENBQU87RUFDaEM7QUFHTyxXQUFTLGFBQWEsT0FBd0I7QUFDbkQsV0FBTyxDQUFDLFVBQVU7QUFDaEIsWUFBTSxZQUFZLE1BQU07QUFDeEIsWUFBTSxLQUFLLE1BQU07QUFDakIsaUJBQVcsU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFLEdBQUc7QUFDMUUsY0FBTSxVQUFVLE9BQU8sTUFBTSxLQUFLLE1BQU0sV0FBVyxXQUFXLE1BQU0sS0FBSyxNQUFNLFNBQVM7QUFDeEYsY0FBTSxPQUFPLEtBQUssSUFBSSxZQUFZLEtBQUssSUFBSSxHQUFHLFVBQVUsS0FBSyxDQUFDO0FBQzlELFlBQUksU0FBUyxRQUFTO0FBQ3RCLFdBQUcsS0FBSyxJQUFJLGlCQUFpQixNQUFNLE1BQU0sRUFBRSxHQUFHLE1BQU0sS0FBSyxPQUFPLFFBQVEsS0FBQSxDQUFNLENBQUM7TUFDakY7QUFDQSxhQUFPLEdBQUcsYUFBYSxLQUFLO0lBQzlCO0VBQ0Y7QUFPTyxXQUFTLGNBQWMsT0FBd0M7QUFDcEUsV0FBTyxjQUFjLEVBQUUsWUFBWSxVQUFVLE9BQU8sT0FBTyxPQUFPLEtBQUssRUFBQSxDQUFHO0VBQzVFO0FBTU8sV0FBUyxvQkFBb0IsTUFHeEI7QUFDVixVQUFNLFFBQWlDLENBQUE7QUFDdkMsUUFBSSxZQUFZLEtBQU0sT0FBTSxjQUFjLEtBQUssVUFBVTtBQUN6RCxRQUFJLFdBQVcsS0FBTSxPQUFNLGFBQWEsS0FBSyxTQUFTO0FBQ3RELFdBQU8sQ0FBQyxVQUFXLE9BQU8sS0FBSyxLQUFLLEVBQUUsV0FBVyxJQUFJLE9BQU8sY0FBYyxLQUFLLEVBQUUsS0FBSztFQUN4RjtBQUdPLFdBQVMsaUJBQWlCLFNBQWlDO0FBQ2hFLFdBQU8sWUFBWSxPQUFPLFVBQVUsZUFBZSxJQUFJLFFBQVEsaUJBQWlCLEVBQUUsUUFBQSxDQUFTO0VBQzdGO0FBR08sTUFBTSxrQkFBMkIsV0FBVyxXQUFXO0FBSzlELE1BQU0saUJBQWlCO0FBU2hCLFdBQVMsWUFBWSxNQUF5QjtBQUNuRCxXQUFPLENBQUMsVUFBVTtBQUNoQixZQUFNLFlBQVksTUFBTTtBQUN4QixVQUFJLFVBQVUsTUFBTyxRQUFPO0FBQzVCLFlBQU0sU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFLEVBQUU7UUFDcEUsQ0FBQyxVQUFVLE1BQU0sT0FBTyxNQUFNO01BQUE7QUFFaEMsVUFBSSxPQUFPLFdBQVcsRUFBRyxRQUFPO0FBRWhDLFlBQU0sS0FBSyxNQUFNO0FBSWpCLFVBQUksU0FBUztBQUNiLFVBQUksVUFBVTtBQUlkLFVBQUksY0FBYztBQUVsQixpQkFBVyxTQUFTLFFBQVE7QUFDMUIsY0FBTSxRQUFRLFlBQVksTUFBTSxLQUFLLFNBQVMsTUFBTSxNQUFNLE1BQU0sRUFBRTtBQUNsRSxjQUFNLE1BQW9CLENBQUE7QUFDMUIsWUFBSSxlQUFlO0FBQ25CLGlCQUFTO0FBQ1QsbUJBQVcsU0FBUyxNQUFNLFVBQVU7QUFDbEMsY0FBSSxDQUFDLE1BQU0sUUFBUTtBQUNqQixnQkFBSSxLQUFLLEtBQUs7QUFDZCxxQkFBUztBQUNUO1VBQ0Y7QUFDQSxnQkFBTSxPQUFPO0FBQ2IsZ0JBQU0sT0FBTyxZQUFZLEtBQUssTUFBTSxNQUFNLE1BQU07QUFDaEQsbUJBQVMsS0FBSztBQUNkLGNBQUksS0FBSyxTQUFTLEtBQUssS0FBTSxnQkFBZTtBQUM1QyxjQUFJLEtBQUssS0FBSyxTQUFTLEtBQUssSUFBSSxDQUFDO0FBQ2pDLHlCQUFlLEtBQUssS0FBSyxTQUFTLEtBQUssS0FBSztRQUM5QztBQUNBLFlBQUksQ0FBQyxhQUFjO0FBQ25CLGtCQUFVO0FBQ1YsV0FBRyxLQUFLLElBQUksa0JBQWtCLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLFNBQVMsS0FBSyxHQUFHLENBQUMsQ0FBQztNQUNyRjtBQUNBLFVBQUksQ0FBQyxRQUFTLFFBQU87QUFLckIsVUFBSSxnQkFBZ0IsRUFBRyxJQUFHLGFBQWEsU0FBUztBQUNoRCxhQUFPO0lBQ1Q7RUFDRjtBQUdBLFdBQVMsWUFDUCxNQUNBLE1BQ0EsY0FDbUM7QUFDbkMsUUFBSSxTQUFTLFFBQVMsUUFBTyxFQUFFLE1BQU0sS0FBSyxZQUFBLEdBQWUsUUFBUSxNQUFBO0FBQ2pFLFFBQUksU0FBUyxRQUFTLFFBQU8sRUFBRSxNQUFNLEtBQUssWUFBQSxHQUFlLFFBQVEsTUFBQTtBQUNqRSxRQUFJLFNBQVM7QUFDYixRQUFJLE1BQU07QUFDVixlQUFXLGFBQWEsTUFBTTtBQUM1QixZQUFNLFNBQVMsZUFBZSxLQUFLLFNBQVM7QUFDNUMsYUFBTyxVQUFVLENBQUMsU0FBUyxVQUFVLFlBQUEsSUFBZ0IsVUFBVSxZQUFBO0FBQy9ELGVBQVM7SUFDWDtBQUNBLFdBQU8sRUFBRSxNQUFNLEtBQUssT0FBQTtFQUN0QjtBQVVBLE1BQU0sY0FBYztBQUdwQixNQUFNLGdCQUFBLG9CQUFpRCxJQUFJO0lBQ3pELENBQUMsS0FBSyxHQUFHO0lBQ1QsQ0FBQyxLQUFLLEdBQUc7SUFDVCxDQUFDLEtBQUssR0FBRztFQUNYLENBQUM7QUFDRCxNQUFNLGNBQW1DLG9CQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBRWhFLE1BQU0sYUFBMEMsSUFBSSxJQUFJO0lBQ3RELEdBQUc7SUFDSCxHQUFHLENBQUMsR0FBRyxXQUFXLEVBQUUsSUFBSSxDQUFDLFVBQTRCLENBQUMsT0FBTyxLQUFLLENBQUM7RUFDckUsQ0FBQztBQUNELE1BQU0sZUFBb0MsSUFBSSxJQUFJLFdBQVcsT0FBQSxDQUFRO0FBS3JFLE1BQU0sZUFBQSxvQkFBd0MsSUFBSTtJQUNoRDtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7RUFDRixDQUFDO0FBQ0QsTUFBTSxZQUFZO0FBR2xCLFdBQVMsZ0JBQWdCLE1BQWMsV0FBMkI7QUFDaEUsUUFBSSxNQUFNO0FBQ1YsV0FBTyxNQUFNLEtBQUssV0FBVyxLQUFLLEdBQUcsTUFBTSxPQUFPLEtBQUssR0FBRyxNQUFNLEtBQU87QUFDdkUsV0FBTyxLQUFLLE1BQU0sV0FBVyxHQUFHO0VBQ2xDO0FBR0EsV0FBUyxlQUFlLE9BQXVDO0FBQzdELFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFFBQUksRUFBRSxxQkFBcUIsZUFBZ0IsUUFBTztBQUNsRCxVQUFNLFFBQVEsV0FBVyxNQUFNLEtBQUssVUFBVSxLQUFLLElBQUk7QUFDdkQsUUFBSSxDQUFDLE9BQU8sZUFBZSxDQUFDLE1BQU0sS0FBSyxLQUFLLG1CQUFvQixRQUFPO0FBRXZFLFFBQUksQ0FBQyxXQUFXLFVBQVUsS0FBSyxNQUFNLFVBQVUsR0FBRyxJQUFJLEVBQUcsUUFBTztBQUNoRSxXQUFPO0VBQ1Q7QUFHQSxXQUFTLFNBQ1AsSUFDQSxPQUNBLE1BQ0EsUUFDQSxNQUNNO0FBQ04sT0FBRyxLQUFLLElBQUksa0JBQWtCLE1BQU0sUUFBUSxRQUFRLFNBQVMsS0FBSyxDQUFDLE1BQU0sT0FBTyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztFQUMvRjtBQUdBLFdBQVMsV0FBVyxNQUFjLE1BQWMsSUFBc0I7QUFDcEUsVUFBTSxTQUFTLENBQUMsSUFBSTtBQUNwQixhQUFTLFFBQVEsTUFBTSxRQUFRLElBQUksU0FBUztBQUMxQyxVQUFJLEtBQUssS0FBSyxNQUFNLEtBQU0sUUFBTyxLQUFLLFFBQVEsQ0FBQztJQUNqRDtBQUNBLFdBQU87RUFDVDtBQUdBLFdBQVMsY0FBYyxNQUFjLE9BQXVCO0FBQzFELFFBQUksS0FBSyxLQUFLLE1BQU0sSUFBTSxRQUFPO0FBQ2pDLFFBQUksU0FBUztBQUNiLFdBQU8sU0FBUyxZQUFZLFVBQVUsS0FBSyxRQUFRLE1BQU0sTUFBTSxJQUFLO0FBQ3BFLFdBQU87RUFDVDtBQVNPLE1BQU0sdUJBQWdDLENBQUMsVUFBVTtBQUN0RCxVQUFNLFFBQVEsZUFBZSxLQUFLO0FBQ2xDLFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxZQUFZLE1BQU07QUFDeEIsVUFBTSxPQUFPLE1BQU07QUFDbkIsVUFBTSxPQUFPLFVBQVUsS0FBSztBQUc1QixRQUFJLENBQUMsS0FBSyxNQUFNLFVBQVUsS0FBSyxRQUFRLFVBQVUsR0FBRyxNQUFNLEVBQUUsU0FBUyxJQUFJLEdBQUc7QUFDMUUsWUFBTUMsTUFBSyxNQUFNO0FBQ2pCLFVBQUksQ0FBQyxVQUFVLE1BQU8sYUFBWUEsS0FBSSxVQUFVLE1BQU0sVUFBVSxFQUFFO0FBQ2xFLFlBQU0sS0FBS0EsSUFBRyxZQUFZLFVBQVUsTUFBTSxFQUFFO0FBQzVDLGVBQVNBLEtBQUksT0FBTyxHQUFHLE1BQU0sR0FBRyxRQUFRLFdBQVc7QUFDbkQsYUFBT0EsSUFBRyxhQUFhLElBQUksY0FBYyxJQUFJLEdBQUcsTUFBTSxHQUFHLFNBQVMsWUFBWSxNQUFNLENBQUMsQ0FBQztJQUN4RjtBQUdBLFVBQU0sWUFBWSxLQUFLLFlBQVksTUFBTSxVQUFVLEtBQUssU0FBUyxDQUFDLElBQUk7QUFDdEUsVUFBTSxZQUFZLEtBQUssUUFBUSxNQUFNLFVBQVUsR0FBRyxNQUFNO0FBQ3hELFVBQU0sU0FBUyxXQUFXLE1BQU0sV0FBVyxjQUFjLEtBQUssS0FBSyxTQUFTLFNBQVM7QUFFckYsVUFBTSxLQUFLLE1BQU07QUFDakIsZUFBVyxTQUFTLENBQUMsR0FBRyxNQUFNLEVBQUUsUUFBQSxFQUFXLFVBQVMsSUFBSSxPQUFPLE1BQU0sT0FBTyxXQUFXO0FBRXZGLFdBQU8sR0FBRztNQUNSLElBQUk7UUFDRixJQUFJLE1BQU0sVUFBVSxLQUFLLFNBQVMsWUFBWSxNQUFNO1FBQ3BELElBQUksTUFBTSxVQUFVLEdBQUcsU0FBUyxZQUFZLFNBQVMsT0FBTyxNQUFNO01BQUE7SUFDcEU7RUFFSjtBQVFPLE1BQU0sd0JBQWlDLENBQUMsVUFBVTtBQUN2RCxVQUFNLFFBQVEsZUFBZSxLQUFLO0FBQ2xDLFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxZQUFZLE1BQU07QUFDeEIsVUFBTSxPQUFPLE1BQU07QUFDbkIsVUFBTSxPQUFPLFVBQVUsS0FBSztBQUU1QixVQUFNLFlBQVksS0FBSyxZQUFZLE1BQU0sVUFBVSxLQUFLLFNBQVMsQ0FBQyxJQUFJO0FBQ3RFLFVBQU0sWUFBWSxLQUFLLFFBQVEsTUFBTSxVQUFVLEdBQUcsTUFBTTtBQUN4RCxVQUFNLFNBQVMsV0FBVyxNQUFNLFdBQVcsY0FBYyxLQUFLLEtBQUssU0FBUyxTQUFTO0FBR3JGLFVBQU0sT0FBTyxPQUNWLElBQUksQ0FBQyxXQUFXLEVBQUUsT0FBTyxRQUFRLGNBQWMsTUFBTSxLQUFLLEVBQUEsRUFBSSxFQUM5RCxPQUFPLENBQUMsUUFBUSxJQUFJLFNBQVMsQ0FBQztBQUNqQyxRQUFJLEtBQUssV0FBVyxFQUFHLFFBQU87QUFFOUIsVUFBTSxLQUFLLE1BQU07QUFDakIsZUFBVyxPQUFPLENBQUMsR0FBRyxJQUFJLEVBQUUsUUFBQSxHQUFXO0FBQ3JDLGtCQUFZLElBQUksSUFBSSxNQUFNLElBQUksS0FBSyxHQUFHLElBQUksTUFBTSxJQUFJLFFBQVEsSUFBSSxNQUFNLENBQUM7SUFDekU7QUFFQSxVQUFNLGdCQUFnQixLQUNuQixPQUFPLENBQUMsUUFBUSxJQUFJLFFBQVEsVUFBVSxLQUFLLE1BQU0sRUFDakQsT0FBTyxDQUFDLE9BQU8sUUFBUSxRQUFRLElBQUksUUFBUSxDQUFDO0FBQy9DLFVBQU0sZUFBZSxLQUFLLE9BQU8sQ0FBQyxPQUFPLFFBQVEsUUFBUSxJQUFJLFFBQVEsQ0FBQztBQUN0RSxVQUFNLE9BQU8sS0FBSyxJQUFJLFdBQVcsVUFBVSxLQUFLLFNBQVMsYUFBYTtBQUN0RSxVQUFNLEtBQUssS0FBSyxJQUFJLE1BQU0sVUFBVSxHQUFHLFNBQVMsWUFBWTtBQUM1RCxXQUFPLEdBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLE1BQU0sRUFBRSxDQUFDLENBQUM7RUFDMUU7QUFVQSxNQUFJLGNBQWtFO0FBRS9ELE1BQU0sMkJBQW9DLENBQUMsVUFBVTtBQUMxRCxVQUFNLFlBQVksTUFBTTtBQUN4QixRQUFJLEVBQUUscUJBQXFCLGVBQWdCLFFBQU87QUFDbEQsVUFBTSxRQUFRLFdBQVcsTUFBTSxLQUFLLFVBQVUsS0FBSyxJQUFJO0FBQ3ZELFFBQUksQ0FBQyxPQUFPLGVBQWUsQ0FBQyxNQUFNLEtBQUssS0FBSyxtQkFBb0IsUUFBTztBQUV2RSxVQUFNLEtBQUssTUFBTTtBQUNqQixRQUFJLENBQUMsVUFBVSxNQUFPLGFBQVksSUFBSSxVQUFVLE1BQU0sVUFBVSxFQUFFO0FBRWxFLFVBQU0sUUFBUSxHQUFHLFlBQVksVUFBVSxNQUFNLEVBQUU7QUFDL0MsVUFBTSxVQUFVLFdBQVcsR0FBRyxLQUFLLE1BQU0sSUFBSTtBQUM3QyxRQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFVBQU0sT0FBTyxRQUFRO0FBQ3JCLFVBQU0sUUFBUSxNQUFNLFdBQVcsYUFBYSxRQUFRLE9BQU87QUFTM0QsVUFBTSxZQUFZLEtBQUssWUFBWSxNQUFNLE1BQU0sU0FBUyxDQUFDLElBQUk7QUFDN0QsVUFBTSxjQUFjLFlBQVksS0FBSyxXQUFXLEtBQUssS0FBSyxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUM7QUFDeEYsVUFBTSxjQUNKLGdCQUFnQixRQUNoQixZQUFZLFdBQVcsTUFBTSxVQUM3QixXQUFXLFlBQVksTUFBTSxNQUFNLElBQUk7QUFFekMsUUFBSSxTQUFTLGVBQWUsYUFBYTtBQUN2QyxZQUFNLFlBQVksTUFBTSxPQUFPLE1BQU07QUFDckMsVUFBSSxXQUFXO0FBR2Isb0JBQVksSUFBSSxJQUFJLE1BQU0sTUFBTSxZQUFZLENBQUMsR0FBRyxLQUFLO0FBQ3JELGNBQU0sTUFBTSxHQUFHLFlBQVksT0FBTyxFQUFFO0FBQ3BDLFdBQUcsS0FBSyxJQUFJLGNBQWMsSUFBSSxNQUFNLElBQUksUUFBUSxVQUFVLElBQUksQ0FBQztBQUMvRCxjQUFNLGFBQWEsSUFBSSxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBQ3ZDLGNBQU0sUUFBUSxJQUFJLEtBQUssSUFBSSxLQUFLLFNBQVMsQ0FBQztBQUMxQyxXQUFHLGFBQWEsSUFBSSxjQUFjLElBQUksQ0FBQyxHQUFHLFlBQVksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDckUsc0JBQWM7QUFDZCxlQUFPO01BQ1Q7SUFDRjtBQU1BLFVBQU0sU0FBUyxnQkFBZ0IsTUFBTSxTQUFTO0FBQzlDLFVBQU0sU0FBUyxLQUFLLE1BQU0sU0FBUyxDQUFDO0FBQ3BDLFVBQU0sU0FBUyxXQUFXLFNBQVksU0FBWSxjQUFjLElBQUksTUFBTTtBQUMxRSxVQUFNLFNBQVMsV0FBVztBQUMxQixVQUFNLGFBQWEsVUFBVSxLQUFLLE1BQU0sTUFBTSxNQUFNO0FBQ3BELFVBQU0sV0FBVztFQUFLLE1BQU0sR0FBRyxTQUFTLGNBQWMsRUFBRTtBQUN4RCxVQUFNLFdBQVcsYUFBYTtFQUFLLE1BQU0sS0FBSztBQUM5QyxPQUFHO01BQ0QsSUFBSTtRQUNGLE1BQU07UUFDTixNQUFNO1FBQ04sTUFBTTtRQUNOLFNBQVMsS0FBSyxDQUFDLE1BQU0sT0FBTyxLQUFLLFdBQVcsUUFBUSxDQUFDLENBQUM7TUFBQTtJQUN4RDtBQUVGLFVBQU0sUUFBUSxNQUFNLFNBQVMsU0FBUztBQUN0QyxPQUFHLGFBQWEsSUFBSSxjQUFjLElBQUksTUFBTSxNQUFNLEtBQUssQ0FBQyxDQUFDO0FBR3pELGtCQUFjLEVBQUUsTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFBO0FBQzFDLFdBQU87RUFDVDtBQU9PLE1BQU0sbUJBQTRCLENBQUMsVUFBVTtBQUNsRCxVQUFNLFFBQVEsZUFBZSxLQUFLO0FBQ2xDLFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxZQUFZLE1BQU0sT0FBTyxNQUFNO0FBQ3JDLFFBQUksQ0FBQyxVQUFXLFFBQU87QUFDdkIsVUFBTSxPQUFRLE1BQU0sVUFBNEIsS0FBSztBQUNyRCxVQUFNLGFBQWEsS0FBSyxNQUFNLEdBQUcsRUFBRTtBQUNuQyxVQUFNLFFBQVEsS0FBSyxLQUFLLFNBQVMsQ0FBQztBQUNsQyxVQUFNLEtBQUssTUFBTTtBQUNqQixPQUFHLEtBQUssSUFBSSxpQkFBaUIsWUFBWSxRQUFRLEdBQUcsUUFBUSxHQUFHLFNBQVMsR0FBRyxVQUFVLE9BQUEsQ0FBUSxDQUFDLENBQUM7QUFDL0YsT0FBRyxhQUFhLElBQUksY0FBYyxJQUFJLENBQUMsR0FBRyxZQUFZLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3JFLGtCQUFjO0FBQ2QsV0FBTztFQUNUO0FBT08sTUFBTSw4QkFBdUMsQ0FBQyxVQUFVO0FBQzdELFFBQUksQ0FBQyxlQUFlLEtBQUssRUFBRyxRQUFPO0FBQ25DLFdBQU8sV0FBVyxJQUFJLEVBQUUsS0FBSztFQUMvQjtBQVNPLFdBQVMsbUJBQW1CLE1BQXVCO0FBQ3hELFdBQU8sQ0FBQyxVQUFVO0FBQ2hCLFlBQU0sUUFBUSxlQUFlLEtBQUs7QUFDbEMsVUFBSSxDQUFDLFNBQVMsS0FBSyxXQUFXLEVBQUcsUUFBTztBQUN4QyxZQUFNLFlBQVksTUFBTTtBQUN4QixZQUFNLFNBQVMsTUFBTTtBQUNyQixZQUFNLE9BQU8sVUFBVSxLQUFLO0FBQzVCLFlBQU0sU0FBUyxXQUFXLElBQUksSUFBSTtBQUVsQyxVQUFJLENBQUMsVUFBVSxPQUFPO0FBQ3BCLFlBQUksV0FBVyxPQUFXLFFBQU87QUFDakMsY0FBTSxRQUFRLE9BQU8sTUFBTSxVQUFVLEtBQUssUUFBUSxVQUFVLEdBQUcsTUFBTTtBQUNyRSxjQUFNQSxNQUFLLE1BQU07QUFDakJBLFlBQUc7VUFDRCxJQUFJO1lBQ0Y7WUFDQSxVQUFVLEtBQUs7WUFDZixVQUFVLEdBQUc7WUFDYixTQUFTLEtBQUssQ0FBQyxNQUFNLE9BQU8sS0FBSyxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsTUFBTSxFQUFFLENBQUMsQ0FBQztVQUFBO1FBQy9EO0FBR0YsZUFBT0EsSUFBRztVQUNSLElBQUksY0FBYyxJQUFJLE1BQU0sVUFBVSxLQUFLLFNBQVMsQ0FBQyxHQUFHLElBQUksTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFDLENBQUM7UUFBQTtNQUU5RjtBQUVBLFlBQU0sU0FBUyxVQUFVLEtBQUs7QUFDOUIsWUFBTSxTQUFTLE9BQU8sU0FBUyxDQUFDO0FBQ2hDLFlBQU0sUUFBUSxPQUFPLE1BQU07QUFJM0IsVUFBSSxhQUFhLElBQUksSUFBSSxLQUFLLFVBQVUsTUFBTTtBQUM1QyxlQUFPLE1BQU0sR0FBRyxhQUFhLElBQUksY0FBYyxJQUFJLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQztNQUN2RTtBQUNBLFVBQUksV0FBVyxPQUFXLFFBQU87QUFDakMsVUFBSSxVQUFVLFVBQWEsQ0FBQyxhQUFhLElBQUksS0FBSyxFQUFHLFFBQU87QUFHNUQsVUFDRSxZQUFZLElBQUksSUFBSSxLQUNwQixXQUFXLFdBQ1YsVUFBVSxLQUFLLE1BQU0sS0FBSyxXQUFXLE9BQ3RDO0FBQ0EsZUFBTztNQUNUO0FBRUEsWUFBTSxLQUFLLE1BQU07QUFDakIsU0FBRztRQUNELElBQUk7VUFDRjtVQUNBO1VBQ0E7VUFDQSxTQUFTLEtBQUssQ0FBQyxNQUFNLE9BQU8sS0FBSyxPQUFPLE1BQU0sQ0FBQyxDQUFDO1FBQUE7TUFDbEQ7QUFFRixhQUFPLEdBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxNQUFNLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDakU7RUFDRjtBQVFPLE1BQU0sK0JBQXdDLENBQUMsVUFBVTtBQUM5RCxVQUFNLFFBQVEsZUFBZSxLQUFLO0FBQ2xDLFFBQUksQ0FBQyxNQUFPLFFBQU87QUFDbkIsVUFBTSxZQUFZLE1BQU07QUFDeEIsUUFBSSxDQUFDLFVBQVUsTUFBTyxRQUFPO0FBQzdCLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFVBQU0sT0FBTyxVQUFVLEtBQUs7QUFDNUIsVUFBTSxTQUFTLFVBQVUsS0FBSztBQUM5QixVQUFNLFNBQVMsT0FBTyxTQUFTLENBQUM7QUFDaEMsUUFBSSxXQUFXLE9BQVcsUUFBTztBQUVqQyxVQUFNLFNBQVMsV0FBVyxJQUFJLE1BQU07QUFDcEMsUUFBSSxXQUFXLFVBQWEsT0FBTyxNQUFNLE1BQU0sUUFBUTtBQUNyRCxZQUFNLEtBQUssTUFBTTtBQUNqQixTQUFHLEtBQUssSUFBSSxrQkFBa0IsTUFBTSxTQUFTLEdBQUcsU0FBUyxHQUFHLFNBQVMsS0FBSyxDQUFDO0FBQzNFLGFBQU8sR0FBRyxhQUFhLElBQUksY0FBYyxJQUFJLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNqRTtBQUVBLFVBQU0sWUFBWSxPQUFPLFlBQVksTUFBTSxTQUFTLENBQUMsSUFBSTtBQUN6RCxVQUFNLFVBQVUsT0FBTyxNQUFNLFdBQVcsTUFBTTtBQUM5QyxRQUFJLFFBQVEsU0FBUyxLQUFLLE9BQU8sS0FBSyxPQUFPLEdBQUc7QUFDOUMsWUFBTSxVQUFXLFFBQVEsU0FBUyxLQUFLLFlBQVksU0FBVTtBQUM3RCxZQUFNLEtBQUssTUFBTTtBQUNqQixTQUFHLEtBQUssSUFBSSxrQkFBa0IsTUFBTSxTQUFTLFFBQVEsUUFBUSxTQUFTLEtBQUssQ0FBQztBQUM1RSxhQUFPLEdBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxNQUFNLFNBQVMsTUFBTSxDQUFDLENBQUM7SUFDdEU7QUFDQSxXQUFPO0VBQ1Q7QUFFTyxNQUFNLGFBQXNCLENBQUMsVUFBVTtBQUM1QyxVQUFNLFlBQVksTUFBTTtBQUN4QixRQUFJLEVBQUUscUJBQXFCLGVBQWdCLFFBQU87QUFDbEQsVUFBTSxLQUFLLE1BQU07QUFDakIsUUFBSSxDQUFDLFVBQVUsTUFBTyxhQUFZLElBQUksVUFBVSxNQUFNLFVBQVUsRUFBRTtBQUNsRSxVQUFNLFFBQVEsVUFBVTtBQUN4QixVQUFNLFFBQVEsV0FBVyxHQUFHLEtBQUssTUFBTSxJQUFJO0FBQzNDLFFBQUksQ0FBQyxPQUFPLFlBQWEsUUFBTztBQUVoQyxVQUFNLFlBQVksTUFBTSxPQUFPLE1BQU07QUFDckMsVUFBTSxRQUFRLE1BQU0sV0FBVyxhQUFhLE1BQU0sT0FBTztBQUN6RCxVQUFNLFlBQVksU0FBUyxhQUFhLE1BQU0sU0FBUyxZQUFZLFVBQVUsT0FBTztBQUNwRixPQUFHLEtBQUssSUFBSSxjQUFjLE1BQU0sTUFBTSxNQUFNLFFBQVEsU0FBUyxDQUFDO0FBQzlELFVBQU0sYUFBYSxNQUFNLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDekMsVUFBTSxRQUFRLE1BQU0sS0FBSyxNQUFNLEtBQUssU0FBUyxDQUFDO0FBQzlDLE9BQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxDQUFDLEdBQUcsWUFBWSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNyRSxXQUFPO0VBQ1Q7QUFNTyxXQUFTLGNBQWMsT0FBdUM7QUFDbkUsV0FBTyxDQUFDLFVBQVU7QUFDaEIsVUFBSSxNQUFNLFdBQVcsRUFBRyxRQUFPO0FBQy9CLFlBQU0sWUFBWSxNQUFNO0FBQ3hCLFVBQUksRUFBRSxxQkFBcUIsZUFBZ0IsUUFBTztBQUNsRCxZQUFNLEtBQUssTUFBTTtBQUNqQixVQUFJLENBQUMsVUFBVSxNQUFPLGFBQVksSUFBSSxVQUFVLE1BQU0sVUFBVSxFQUFFO0FBQ2xFLFlBQU0sUUFBUSxVQUFVO0FBQ3hCLFlBQU0sUUFBUSxXQUFXLEdBQUcsS0FBSyxNQUFNLElBQUk7QUFDM0MsVUFBSSxDQUFDLE9BQU8sWUFBYSxRQUFPO0FBRWhDLFlBQU0sWUFBWSxNQUFNLE1BQU0sQ0FBQyxTQUFTLEtBQUssUUFBUTtBQUNyRCxZQUFNLGFBQWEsTUFBTSxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBQ3pDLFlBQU0sUUFBUSxNQUFNLEtBQUssTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUM5QyxZQUFNLGFBQWEsYUFBYSxNQUFNLE9BQU8sTUFBTTtBQUVuRCxVQUFJLENBQUMsYUFBYSxZQUFZO0FBRTVCLFdBQUcsS0FBSyxJQUFJLGlCQUFpQixZQUFZLE9BQU8sUUFBUSxHQUFHLFNBQVMsS0FBSyxLQUFLLENBQUMsQ0FBQztBQUNoRixXQUFHLGFBQWEscUJBQXFCLFlBQVksUUFBUSxHQUFHLEtBQUssQ0FBQztBQUNsRSxlQUFPO01BQ1Q7QUFFQSxZQUFNLFNBQVMsTUFBTSxXQUFXLElBQUksTUFBTSxDQUFDLElBQUk7QUFDL0MsVUFBSSxhQUFhLFFBQVEsYUFBYTtBQUNwQyxjQUFNLFNBQVMsWUFBWSxRQUFTLE9BQXNCLFFBQVE7QUFLbEUsY0FBTSxTQUFTLFNBQVMsS0FBSyxnQkFBZ0IsTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUNoRSxZQUFJLE9BQU8sZUFBZSxFQUFHLFFBQU87QUFDcEMsY0FBTSxTQUFTLGFBQWEsTUFBTTtBQUNsQyxXQUFHLEtBQUssSUFBSSxrQkFBa0IsTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBQzdFLFdBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxNQUFNLE1BQU0sTUFBTSxTQUFTLE1BQU0sQ0FBQyxDQUFDO0FBQ3pFLGVBQU87TUFDVDtBQUdBLFNBQUcsS0FBSyxJQUFJLGNBQWMsTUFBTSxNQUFNLE1BQU0sTUFBTSxDQUFDO0FBQ25ELFNBQUcsS0FBSyxJQUFJLGlCQUFpQixZQUFZLFFBQVEsR0FBRyxRQUFRLEdBQUcsU0FBUyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQ3BGLFNBQUcsYUFBYSxxQkFBcUIsWUFBWSxPQUFPLEtBQUssQ0FBQztBQUM5RCxhQUFPO0lBQ1Q7RUFDRjtBQUdBLFdBQVMscUJBQ1AsWUFDQSxPQUNBLE9BQ2U7QUFDZixVQUFNLFdBQVcsTUFBTSxNQUFNLFNBQVMsQ0FBQztBQUN2QyxVQUFNLFdBQVcsQ0FBQyxHQUFHLFlBQVksUUFBUSxNQUFNLE1BQU07QUFDckQsV0FBTyxJQUFJO01BQ1QsU0FBUyxjQUNMLElBQUksVUFBVSxhQUFhLFNBQVMsT0FBTyxDQUFDLElBQzVDLElBQUksWUFBWSxRQUFRLE1BQU0sU0FBUyxDQUFDO0lBQUE7RUFFaEQ7QUFHTyxNQUFNLHFCQUE4QixDQUFDLFVBQVU7QUFDcEQsVUFBTSxZQUFZLE1BQU07QUFDeEIsUUFBSSxDQUFDLFVBQVUsTUFBTyxRQUFPLGdCQUFnQixLQUFLO0FBQ2xELFFBQUksRUFBRSxxQkFBcUIsZUFBZ0IsUUFBTztBQUNsRCxVQUFNLFFBQVEsVUFBVTtBQUN4QixVQUFNLFFBQVEsV0FBVyxNQUFNLEtBQUssTUFBTSxJQUFJO0FBQzlDLFFBQUksQ0FBQyxPQUFPLFlBQWEsUUFBTztBQUNoQyxVQUFNLFdBQVcsdUJBQXVCLE1BQU0sU0FBUyxNQUFNLE1BQU07QUFDbkUsUUFBSSxXQUFXLEVBQUcsUUFBTyxhQUFhLEtBQUs7QUFDM0MsVUFBTSxLQUFLLE1BQU07QUFDakIsT0FBRyxLQUFLLElBQUksa0JBQWtCLE1BQU0sTUFBTSxVQUFVLE1BQU0sUUFBUSxTQUFTLEtBQUssQ0FBQztBQUNqRixPQUFHLGFBQWEsSUFBSSxjQUFjLElBQUksTUFBTSxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQzVELFdBQU87RUFDVDtBQUdPLE1BQU0sb0JBQTZCLENBQUMsVUFBVTtBQUNuRCxVQUFNLFlBQVksTUFBTTtBQUN4QixRQUFJLENBQUMsVUFBVSxNQUFPLFFBQU8sZ0JBQWdCLEtBQUs7QUFDbEQsUUFBSSxFQUFFLHFCQUFxQixlQUFnQixRQUFPO0FBQ2xELFVBQU0sUUFBUSxVQUFVO0FBQ3hCLFVBQU0sUUFBUSxXQUFXLE1BQU0sS0FBSyxNQUFNLElBQUk7QUFDOUMsUUFBSSxDQUFDLE9BQU8sWUFBYSxRQUFPO0FBQ2hDLFVBQU0sV0FBVyxtQkFBbUIsTUFBTSxTQUFTLE1BQU0sTUFBTTtBQUMvRCxRQUFJLFdBQVcsRUFBRyxRQUFPLFlBQVksS0FBSztBQUMxQyxVQUFNLEtBQUssTUFBTTtBQUNqQixPQUFHLEtBQUssSUFBSSxrQkFBa0IsTUFBTSxNQUFNLE1BQU0sUUFBUSxVQUFVLFNBQVMsS0FBSyxDQUFDO0FBQ2pGLE9BQUcsYUFBYSxJQUFJLGNBQWMsS0FBSyxDQUFDO0FBQ3hDLFdBQU87RUFDVDtBQUdPLE1BQU0sY0FBdUIsQ0FBQyxVQUFVO0FBQzdDLFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFFBQUksRUFBRSxxQkFBcUIsa0JBQWtCLENBQUMsVUFBVSxNQUFPLFFBQU87QUFDdEUsVUFBTSxRQUFRLFVBQVU7QUFDeEIsVUFBTSxRQUFRLFdBQVcsTUFBTSxLQUFLLE1BQU0sSUFBSTtBQUM5QyxRQUFJLENBQUMsT0FBTyxlQUFlLE1BQU0sV0FBVyxhQUFhLE1BQU0sT0FBTyxFQUFHLFFBQU87QUFDaEYsUUFBSSxNQUFNLEtBQUssV0FBVyxFQUFHLFFBQU87QUFDcEMsVUFBTSxRQUFRLE1BQU0sS0FBSyxNQUFNLEtBQUssU0FBUyxDQUFDO0FBQzlDLFVBQU0sYUFBYSxNQUFNLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDekMsVUFBTSxPQUFPLFdBQVcsTUFBTSxLQUFLLENBQUMsR0FBRyxZQUFZLFFBQVEsQ0FBQyxDQUFDO0FBQzdELFFBQUksQ0FBQyxLQUFNLFFBQU87QUFDbEIsVUFBTSxLQUFLLE1BQU07QUFDakIsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUNyQixVQUFJLENBQUMsS0FBSyxPQUFRLFFBQU87QUFDekIsU0FBRyxLQUFLLElBQUksaUJBQWlCLFlBQVksUUFBUSxHQUFHLFFBQVEsR0FBRyxTQUFTLEtBQUssQ0FBQztBQUM5RSxhQUFPO0lBQ1Q7QUFDQSxPQUFHLEtBQUssSUFBSSxjQUFjLE1BQU0sTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUNuRCxPQUFHLGFBQWEsSUFBSSxjQUFjLEtBQUssQ0FBQztBQUN4QyxXQUFPO0VBQ1Q7QUFHTyxNQUFNLGVBQXdCLENBQUMsVUFBVTtBQUM5QyxVQUFNLFlBQVksTUFBTTtBQUN4QixRQUFJLEVBQUUscUJBQXFCLGtCQUFrQixDQUFDLFVBQVUsTUFBTyxRQUFPO0FBQ3RFLFVBQU0sUUFBUSxVQUFVO0FBQ3hCLFFBQUksTUFBTSxXQUFXLEtBQUssTUFBTSxLQUFLLFdBQVcsRUFBRyxRQUFPO0FBQzFELFVBQU0sUUFBUSxNQUFNLEtBQUssTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUM5QyxRQUFJLFVBQVUsRUFBRyxRQUFPO0FBQ3hCLFVBQU0sYUFBYSxNQUFNLEtBQUssTUFBTSxHQUFHLEVBQUU7QUFDekMsVUFBTSxlQUFlLENBQUMsR0FBRyxZQUFZLFFBQVEsQ0FBQztBQUM5QyxVQUFNLFdBQVcsV0FBVyxNQUFNLEtBQUssWUFBWTtBQUNuRCxRQUFJLENBQUMsU0FBVSxRQUFPO0FBQ3RCLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFFBQUksQ0FBQyxTQUFTLGFBQWE7QUFFekIsVUFBSSxDQUFDLFNBQVMsT0FBUSxRQUFPO0FBQzdCLFNBQUcsS0FBSyxJQUFJLGlCQUFpQixZQUFZLFFBQVEsR0FBRyxPQUFPLFNBQVMsS0FBSyxDQUFDO0FBQzFFLGFBQU87SUFDVDtBQUNBLFVBQU0sYUFBYSxhQUFhLFNBQVMsT0FBTztBQUNoRCxPQUFHLEtBQUssSUFBSSxjQUFjLGNBQWMsVUFBVSxDQUFDO0FBQ25ELE9BQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxjQUFjLFVBQVUsQ0FBQyxDQUFDO0FBQ2hFLFdBQU87RUFDVDtBQUdPLFdBQVMsaUJBQWlCLE1BQWMsT0FBd0I7QUFDckUsV0FBTyxDQUFDLFVBQVU7QUFDaEIsWUFBTSxPQUFPLE1BQU0sT0FBTyxTQUFTLElBQUk7QUFDdkMsVUFBSSxDQUFDLEtBQUssWUFBWSxDQUFDLEtBQUssT0FBUSxRQUFPO0FBQzNDLFlBQU0sWUFBWSxNQUFNO0FBQ3hCLFVBQUksRUFBRSxxQkFBcUIsZUFBZ0IsUUFBTztBQUNsRCxZQUFNLEtBQUssTUFBTTtBQUNqQixVQUFJLENBQUMsVUFBVSxNQUFPLGFBQVksSUFBSSxVQUFVLE1BQU0sVUFBVSxFQUFFO0FBQ2xFLFlBQU0sUUFBUSxVQUFVO0FBQ3hCLFNBQUc7UUFDRCxJQUFJO1VBQ0YsTUFBTTtVQUNOLE1BQU07VUFDTixNQUFNO1VBQ04sU0FBUyxHQUFHLEtBQUssT0FBTyxLQUFLLENBQUM7UUFBQTtNQUNoQztBQUVGLFNBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxNQUFNLE1BQU0sTUFBTSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ3BFLGFBQU87SUFDVDtFQUNGO0FBR08sV0FBUyxpQkFBaUIsTUFBYyxPQUF3QjtBQUNyRSxXQUFPLENBQUMsVUFBVTtBQUNoQixZQUFNLE9BQU8sTUFBTSxPQUFPLFNBQVMsSUFBSTtBQUN2QyxVQUFJLEtBQUssWUFBWSxLQUFLLGNBQWUsUUFBTztBQUNoRCxZQUFNLFlBQVksTUFBTTtBQUN4QixZQUFNLFlBQVksVUFBVSxHQUFHO0FBQy9CLFVBQUksVUFBVSxXQUFXLEVBQUcsUUFBTztBQUNuQyxZQUFNLGFBQWEsVUFBVSxNQUFNLEdBQUcsRUFBRTtBQUN4QyxZQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsQ0FBQztBQUM1QyxZQUFNLEtBQUssTUFBTTtBQUNqQixTQUFHLEtBQUssSUFBSSxpQkFBaUIsWUFBWSxRQUFRLEdBQUcsUUFBUSxHQUFHLFNBQVMsR0FBRyxLQUFLLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztBQUMvRixhQUFPO0lBQ1Q7RUFDRjtBQUdPLFdBQVMsT0FBTyxNQUFjLE9BQXdCO0FBQzNELFdBQU8sQ0FBQyxVQUFVO0FBQ2hCLFlBQU0sWUFBWSxNQUFNO0FBQ3hCLFlBQU0sU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFO0FBQ3BFLFlBQU0sUUFBUSxPQUFPLENBQUM7QUFDdEIsWUFBTSxPQUFPLE9BQU8sT0FBTyxTQUFTLENBQUM7QUFDckMsVUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFNLFFBQU87QUFDNUIsWUFBTSxhQUFhLE1BQU0sS0FBSyxNQUFNLEdBQUcsRUFBRTtBQUN6QyxVQUFJLENBQUMsV0FBVyxZQUFZLEtBQUssS0FBSyxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUcsUUFBTztBQUM1RCxZQUFNLE9BQU8sTUFBTSxLQUFLLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFDN0MsWUFBTSxLQUFNLEtBQUssS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDLElBQWU7QUFDekQsWUFBTSxLQUFLLE1BQU07QUFDakIsU0FBRyxLQUFLLElBQUksY0FBYyxZQUFZLE1BQU0sSUFBSSxNQUFNLEtBQUssQ0FBQztBQUM1RCxhQUFPO0lBQ1Q7RUFDRjtBQUdPLE1BQU0sT0FBZ0IsQ0FBQyxVQUFVO0FBQ3RDLFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFVBQU0sWUFBWSxVQUFVLEtBQUs7QUFDakMsUUFBSSxVQUFVLFNBQVMsRUFBRyxRQUFPO0FBQ2pDLFVBQU0sY0FBYyxVQUFVLE1BQU0sR0FBRyxFQUFFO0FBQ3pDLFVBQU0sVUFBVSxXQUFXLE1BQU0sS0FBSyxXQUFXO0FBQ2pELFFBQUksQ0FBQyxXQUFXLFFBQVEsWUFBYSxRQUFPO0FBQzVDLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLE9BQUcsS0FBSyxJQUFJLGNBQWMsYUFBYSxRQUFRLFVBQVUsQ0FBQztBQUMxRCxXQUFPO0VBQ1Q7QUFHTyxNQUFNLFlBQXFCLENBQUMsVUFBVTtBQUMzQyxXQUFPLE1BQU0sR0FBRyxhQUFhLElBQUksYUFBYSxNQUFNLEdBQUcsQ0FBQztFQUMxRDtBQUdPLFdBQVMsYUFBYSxPQUFvQixNQUF1QjtBQUN0RSxVQUFNLE9BQU8sTUFBTSxPQUFPLE1BQU0sSUFBSTtBQUNwQyxRQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFFBQUksVUFBVSxTQUFTLHFCQUFxQixlQUFlO0FBQ3pELFlBQU0sUUFBUSxXQUFXLE1BQU0sS0FBSyxVQUFVLEtBQUssSUFBSTtBQUN2RCxVQUFJLENBQUMsT0FBTyxZQUFhLFFBQU87QUFDaEMsWUFBTSxVQUFVLE1BQU0sZUFBZSxvQkFBb0IsTUFBTSxTQUFTLFVBQVUsS0FBSyxNQUFNO0FBQzdGLGFBQU8sUUFBUSxLQUFLLENBQUMsU0FBZSxLQUFLLFNBQVMsSUFBSTtJQUN4RDtBQUNBLFVBQU0sU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFLEVBQUU7TUFDcEUsQ0FBQyxVQUFVLE1BQU0sT0FBTyxNQUFNO0lBQUE7QUFFaEMsV0FDRSxPQUFPLFNBQVMsS0FDaEIsT0FBTyxNQUFNLENBQUMsVUFBVSxhQUFhLE1BQU0sS0FBSyxTQUFTLE1BQU0sTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDO0VBRXhGO0FDNWdDQSxNQUFNLGFBQStDO0lBQ25ELFlBQVk7SUFDWixhQUFhO0lBQ2IsVUFBVTtFQUNaO0FBRUEsTUFBTSxrQkFBdUMsSUFBSSxJQUFJLE9BQU8sT0FBTyxVQUFVLENBQUM7QUFPdkUsV0FBUyxtQkFBbUIsVUFBdUM7QUFDeEUsV0FBTyxhQUFhLFVBQWEsZ0JBQWdCLElBQUksUUFBUTtFQUMvRDtBQUdBLFdBQVMsZ0JBQWdCLGNBQThCO0FBQ3JELFdBQU8sV0FBVyxZQUFZLEtBQUs7RUFDckM7QUFXQSxXQUFTLGNBQWMsS0FBaUIsV0FBcUM7QUFDM0UsUUFBSSxVQUFVLFNBQVMsRUFBRyxRQUFPO0FBQ2pDLFVBQU0sV0FBVyxVQUFVLE1BQU0sR0FBRyxFQUFFO0FBQ3RDLFVBQU0sT0FBTyxXQUFXLEtBQUssUUFBUTtBQUNyQyxRQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixJQUFJLEtBQUssS0FBSyxJQUFJLEVBQUcsUUFBTztBQUMxRCxVQUFNLFdBQVcsU0FBUyxNQUFNLEdBQUcsRUFBRTtBQUNyQyxVQUFNLE9BQU8sV0FBVyxLQUFLLFFBQVE7QUFDckMsUUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixXQUFPLEVBQUUsVUFBVSxNQUFNLFVBQVUsTUFBTSxXQUFXLFNBQVMsU0FBUyxTQUFTLENBQUMsRUFBQTtFQUNsRjtBQU1PLFdBQVMsV0FBVyxjQUErQjtBQUN4RCxXQUFPLENBQUMsVUFBVTtBQUNoQixZQUFNLE9BQU8sTUFBTSxPQUFPLFNBQVMsWUFBWTtBQUMvQyxZQUFNLFlBQVksTUFBTTtBQUN4QixZQUFNLFNBQVMsY0FBYyxNQUFNLEtBQUssVUFBVSxNQUFNLFVBQVUsRUFBRTtBQUNwRSxZQUFNLFFBQVEsT0FBTyxDQUFDO0FBQ3RCLFlBQU0sT0FBTyxPQUFPLE9BQU8sU0FBUyxDQUFDO0FBQ3JDLFVBQUksQ0FBQyxTQUFTLENBQUMsS0FBTSxRQUFPO0FBQzVCLFlBQU0sS0FBSyxNQUFNO0FBQ2pCLFlBQU0sVUFBVSxjQUFjLE1BQU0sS0FBSyxNQUFNLElBQUk7QUFFbkQsVUFBSSxTQUFTO0FBQ1gsWUFBSSxRQUFRLEtBQUssU0FBUyxNQUFNO0FBRTlCLGdCQUFNLE9BQU8sUUFBUSxLQUFLLFFBQVEsU0FBUyxRQUFRLENBQUMsU0FBUyxLQUFLLFFBQVEsUUFBUTtBQUNsRixhQUFHLEtBQUssY0FBYyxRQUFRLFVBQVUsU0FBUyxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQzVELGFBQUcsYUFBYSxhQUFhLFVBQVUsTUFBTSxVQUFVLElBQUksT0FBTyxDQUFDO1FBQ3JFLE9BQU87QUFJTCxnQkFBTUMsWUFBVyxNQUFNLE9BQU8sU0FBUyxnQkFBZ0IsWUFBWSxDQUFDO0FBQ3BFLGdCQUFNQyxTQUFRLFFBQVEsS0FBSyxRQUFRLFNBQVM7WUFBSSxDQUFDLFNBQy9DLEtBQUssU0FBU0QsWUFBVyxPQUFPQSxVQUFTLE9BQU8sUUFBVyxLQUFLLE9BQU87VUFBQTtBQUV6RSxhQUFHO1lBQ0Q7Y0FDRSxRQUFRO2NBQ1IsU0FBUyxHQUFHLEtBQUssT0FBTyxRQUFXLFNBQVMsS0FBS0MsTUFBSyxDQUFDLENBQUM7WUFBQTtVQUMxRDtBQUVGLGFBQUcsYUFBYSxJQUFJLGNBQWMsVUFBVSxNQUFNLFVBQVUsRUFBRSxDQUFDO1FBQ2pFO0FBQ0EsZUFBTztNQUNUO0FBR0EsWUFBTSxhQUFhLE1BQU0sS0FBSyxNQUFNLEdBQUcsRUFBRTtBQUN6QyxVQUFJLENBQUMsV0FBVyxZQUFZLEtBQUssS0FBSyxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUcsUUFBTztBQUM1RCxZQUFNLFNBQVMsV0FBVyxNQUFNLEtBQUssVUFBVTtBQUMvQyxVQUFJLENBQUMsT0FBUSxRQUFPO0FBQ3BCLFlBQU0sWUFBWSxNQUFNLEtBQUssTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUNsRCxZQUFNLFVBQVcsS0FBSyxLQUFLLEtBQUssS0FBSyxTQUFTLENBQUMsSUFBZTtBQUM5RCxZQUFNLFdBQVcsTUFBTSxPQUFPLFNBQVMsZ0JBQWdCLFlBQVksQ0FBQztBQUNwRSxZQUFNLFFBQVEsT0FBTyxRQUFRLFNBQzFCLE1BQU0sV0FBVyxPQUFPLEVBQ3hCLElBQUksQ0FBQyxVQUFVLFNBQVMsT0FBTyxRQUFXLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQztBQUNoRSxTQUFHO1FBQ0QsSUFBSTtVQUNGO1VBQ0E7VUFDQTtVQUNBLFNBQVMsR0FBRyxLQUFLLE9BQU8sUUFBVyxTQUFTLEtBQUssS0FBSyxDQUFDLENBQUM7UUFBQTtNQUMxRDtBQUVGLFlBQU0sV0FBVyxDQUFDLGFBQWlDO0FBQ2pELGNBQU0sUUFBUSxTQUFTLEtBQUssU0FBUyxLQUFLLFNBQVMsQ0FBQztBQUNwRCxZQUNFLENBQUMsV0FBVyxTQUFTLEtBQUssTUFBTSxHQUFHLEVBQUUsR0FBRyxVQUFVLEtBQ2xELFFBQVEsYUFDUixTQUFTLFNBQ1Q7QUFDQSxpQkFBTztRQUNUO0FBQ0EsZUFBTyxJQUFJLENBQUMsR0FBRyxZQUFZLFdBQVcsUUFBUSxXQUFXLENBQUMsR0FBRyxTQUFTLE1BQU07TUFDOUU7QUFDQSxTQUFHLGFBQWEsSUFBSSxjQUFjLFNBQVMsVUFBVSxJQUFJLEdBQUcsU0FBUyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ25GLGFBQU87SUFDVDtFQUNGO0FBRUEsV0FBUyxhQUFhLE1BQWdCLElBQWMsU0FBcUM7QUFDdkYsVUFBTSxNQUFNLENBQUMsYUFBaUM7QUFFNUMsVUFBSSxTQUFTLEtBQUssV0FBVyxRQUFRLFNBQVMsU0FBUyxFQUFHLFFBQU87QUFDakUsVUFBSSxDQUFDLFdBQVcsU0FBUyxLQUFLLE1BQU0sR0FBRyxRQUFRLFNBQVMsTUFBTSxHQUFHLFFBQVEsUUFBUTtBQUMvRSxlQUFPO0FBQ1QsWUFBTSxZQUFZLFNBQVMsS0FBSyxRQUFRLFNBQVMsTUFBTTtBQUN2RCxZQUFNLGFBQWEsU0FBUyxLQUFLLFFBQVEsU0FBUyxTQUFTLENBQUM7QUFDNUQsVUFBSSxPQUFPO0FBQ1gsZUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLElBQUssU0FBUSxRQUFRLEtBQUssUUFBUSxNQUFNLENBQUMsRUFBRTtBQUMxRSxZQUFNLFlBQVksUUFBUSxTQUFTLFFBQVEsU0FBUyxTQUFTLENBQUM7QUFDOUQsYUFBTyxJQUFJLENBQUMsR0FBRyxRQUFRLFNBQVMsTUFBTSxHQUFHLEVBQUUsR0FBRyxZQUFZLE9BQU8sVUFBVSxHQUFHLFNBQVMsTUFBTTtJQUMvRjtBQUNBLFdBQU8sSUFBSSxjQUFjLElBQUksSUFBSSxHQUFHLElBQUksRUFBRSxDQUFDO0VBQzdDO0FBR08sTUFBTSxnQkFBeUIsQ0FBQyxVQUFVO0FBQy9DLFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFFBQUksRUFBRSxxQkFBcUIsZUFBZ0IsUUFBTztBQUNsRCxVQUFNLFVBQVUsY0FBYyxNQUFNLEtBQUssVUFBVSxLQUFLLElBQUk7QUFDNUQsUUFBSSxDQUFDLFFBQVMsUUFBTztBQUVyQixVQUFNLFFBQVEsVUFBVTtBQUN4QixVQUFNLGFBQWEsTUFBTSxLQUFLLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFDbkQsVUFBTSxlQUFlLFdBQVcsTUFBTSxLQUFLLE1BQU0sSUFBSTtBQUNyRCxRQUFJLENBQUMsYUFBYyxRQUFPO0FBRzFCLFFBQ0UsVUFBVSxTQUNWLFFBQVEsS0FBSyxlQUFlLEtBQzVCLGFBQWEsYUFBYSxPQUFPLE1BQU0sR0FDdkM7QUFDQSxhQUFPLGFBQWEsS0FBSztJQUMzQjtBQUVBLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFFBQUksQ0FBQyxVQUFVLE1BQU8sYUFBWSxJQUFJLFVBQVUsTUFBTSxVQUFVLEVBQUU7QUFDbEUsT0FBRyxLQUFLLElBQUksY0FBYyxNQUFNLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFHbkQsVUFBTSxPQUFPLFdBQVcsR0FBRyxLQUFLLFFBQVEsUUFBUTtBQUNoRCxRQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFVBQU0sUUFBUSxLQUFLLFFBQVEsTUFBTSxhQUFhLENBQUM7QUFDL0MsT0FBRyxLQUFLLElBQUksaUJBQWlCLFFBQVEsVUFBVSxhQUFhLEdBQUcsS0FBSyxZQUFZLFNBQVMsS0FBSyxDQUFDO0FBRy9GLFVBQU0sV0FBVyxRQUFRLEtBQUs7QUFDOUIsVUFBTSxXQUFXLGFBQWEsUUFBUSxLQUFLLFFBQVEsRUFBRSxTQUFTLE1BQUEsSUFBVTtBQUN4RSxPQUFHO01BQ0QsSUFBSTtRQUNGLFFBQVE7UUFDUixRQUFRLFlBQVk7UUFDcEIsUUFBUSxZQUFZO1FBQ3BCLFNBQVMsR0FBRyxTQUFTLE9BQU8sVUFBVSxLQUFLLENBQUM7TUFBQTtJQUM5QztBQUVGLE9BQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxDQUFDLEdBQUcsUUFBUSxVQUFVLFFBQVEsWUFBWSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMxRixXQUFPO0VBQ1Q7QUFHTyxNQUFNLGVBQXdCLENBQUMsVUFBVTtBQUM5QyxVQUFNLFlBQVksTUFBTTtBQUN4QixVQUFNLFVBQVUsY0FBYyxNQUFNLEtBQUssVUFBVSxLQUFLLElBQUk7QUFDNUQsUUFBSSxDQUFDLFdBQVcsUUFBUSxjQUFjLEVBQUcsUUFBTztBQUNoRCxVQUFNLFdBQVcsUUFBUSxLQUFLLFFBQVEsTUFBTSxRQUFRLFlBQVksQ0FBQztBQUNqRSxVQUFNLFlBQVksU0FBUyxRQUFRLFdBQVcsU0FBUyxhQUFhLENBQUM7QUFDckUsVUFBTSxXQUFXLFVBQVUsS0FBSyxLQUFLLE1BQU0sUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUV0RSxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUksYUFBYSxVQUFVLFNBQVMsUUFBUSxLQUFLLE1BQU07QUFFckQsWUFBTSxTQUFTLFVBQVUsWUFBWSxVQUFVLFFBQVEsT0FBTyxTQUFTLEdBQUcsUUFBUSxJQUFJLENBQUMsQ0FBQztBQUN4RixvQkFBYyxTQUFTO1FBQ3JCLFNBQVMsUUFBUSxhQUFhLFNBQVMsYUFBYSxHQUFHLE1BQU07TUFBQTtBQUUvRCxxQkFBZTtRQUNiLEdBQUcsUUFBUTtRQUNYLFFBQVEsWUFBWTtRQUNwQixTQUFTLGFBQWE7UUFDdEIsVUFBVTtRQUNWLEdBQUc7TUFBQTtJQUVQLE9BQU87QUFDTCxZQUFNLFNBQVMsUUFBUSxLQUFLLEtBQUssT0FBTyxRQUFXLFNBQVMsR0FBRyxRQUFRLElBQUksQ0FBQztBQUM1RSxvQkFBYyxTQUFTLFlBQVksU0FBUyxRQUFRLE9BQU8sU0FBUyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0FBQy9FLHFCQUFlLENBQUMsR0FBRyxRQUFRLFVBQVUsUUFBUSxZQUFZLEdBQUcsU0FBUyxZQUFZLEdBQUcsR0FBRyxRQUFRO0lBQ2pHO0FBQ0EsVUFBTSxLQUFLLE1BQU07QUFDakIsT0FBRztNQUNELElBQUk7UUFDRixRQUFRO1FBQ1IsUUFBUSxZQUFZO1FBQ3BCLFFBQVEsWUFBWTtRQUNwQixTQUFTLEdBQUcsV0FBVztNQUFBO0lBQ3pCO0FBRUYsT0FBRyxhQUFhLElBQUksY0FBYyxJQUFJLGNBQWMsVUFBVSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQzNFLFdBQU87RUFDVDtBQUdPLE1BQU0sZUFBd0IsQ0FBQyxVQUFVO0FBQzlDLFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFVBQU0sVUFBVSxjQUFjLE1BQU0sS0FBSyxVQUFVLEtBQUssSUFBSTtBQUM1RCxRQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFVBQU0sUUFBUSxRQUFRLEtBQUssUUFBUTtBQUNuQyxVQUFNLFNBQVMsTUFBTSxNQUFNLEdBQUcsUUFBUSxTQUFTO0FBQy9DLFVBQU0sUUFBUSxNQUFNLE1BQU0sUUFBUSxZQUFZLENBQUM7QUFDL0MsVUFBTSxhQUFjLFVBQVUsS0FBSyxLQUFLLFFBQVEsU0FBUyxTQUFTLENBQUMsS0FBNEI7QUFDL0YsVUFBTSxLQUFLLE1BQU07QUFJakIsVUFBTSxpQkFBaUIsUUFBUSxTQUFTLE1BQU0sR0FBRyxFQUFFO0FBQ25ELFVBQU0sYUFBYSxlQUFlLFNBQVMsSUFBSSxXQUFXLE1BQU0sS0FBSyxjQUFjLElBQUk7QUFDdkYsUUFBSSxjQUFjLG1CQUFtQixXQUFXLEtBQUssSUFBSSxHQUFHO0FBQzFELFlBQU0sa0JBQWtCLFFBQVEsU0FBUyxRQUFRLFNBQVMsU0FBUyxDQUFDO0FBQ3BFLFlBQU0sWUFBWSxlQUFlLE1BQU0sR0FBRyxFQUFFO0FBQzVDLFlBQU0sY0FBYyxlQUFlLGVBQWUsU0FBUyxDQUFDO0FBQzVELFlBQU0sYUFBYSxPQUFPLFNBQVMsSUFBSSxDQUFDLFFBQVEsS0FBSyxZQUFZLFNBQVMsS0FBSyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUE7QUFDM0YsWUFBTSxZQUFZLFdBQVc7UUFDM0IsV0FBVyxRQUFRO1VBQ2pCO1VBQ0Esa0JBQWtCO1VBQ2xCLFNBQVMsS0FBSyxVQUFVO1FBQUE7TUFDMUI7QUFFRixZQUFNLFVBQ0osTUFBTSxTQUFTLElBQUksQ0FBQyxRQUFRLEtBQUssS0FBSyxPQUFPLFFBQVcsU0FBUyxLQUFLLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUNuRixZQUFNLFVBQVUsUUFBUSxLQUFLLFlBQVksUUFBUSxLQUFLLFFBQVEsT0FBTyxTQUFTLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDNUYsU0FBRztRQUNELElBQUk7VUFDRjtVQUNBO1VBQ0EsY0FBYztVQUNkLFNBQVMsR0FBRyxXQUFXLE9BQU87UUFBQTtNQUNoQztBQUVGLFNBQUc7UUFDRCxJQUFJLGNBQWMsSUFBSSxDQUFDLEdBQUcsV0FBVyxjQUFjLEdBQUcsVUFBVSxHQUFHLFVBQVUsS0FBSyxNQUFNLENBQUM7TUFBQTtBQUUzRixhQUFPO0lBQ1Q7QUFHQSxVQUFNLGNBQTRCLENBQUE7QUFDbEMsUUFBSSxPQUFPLFNBQVMsRUFBRyxhQUFZLEtBQUssUUFBUSxLQUFLLFlBQVksU0FBUyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZGLGdCQUFZLEtBQUssR0FBRyxRQUFRLEtBQUssUUFBUSxRQUFRO0FBQ2pELFFBQUksTUFBTSxTQUFTLEdBQUc7QUFDcEIsa0JBQVksS0FBSyxRQUFRLEtBQUssS0FBSyxPQUFPLFFBQVcsU0FBUyxLQUFLLEtBQUssQ0FBQyxDQUFDO0lBQzVFO0FBQ0EsT0FBRyxLQUFLLGNBQWMsUUFBUSxVQUFVLFNBQVMsS0FBSyxXQUFXLENBQUMsQ0FBQztBQUVuRSxVQUFNLFlBQVksUUFBUSxTQUFTLFFBQVEsU0FBUyxTQUFTLENBQUM7QUFDOUQsVUFBTSxXQUFXLGFBQWEsT0FBTyxTQUFTLElBQUksSUFBSSxLQUFLO0FBQzNELE9BQUc7TUFDRCxJQUFJLGNBQWMsSUFBSSxDQUFDLEdBQUcsUUFBUSxTQUFTLE1BQU0sR0FBRyxFQUFFLEdBQUcsUUFBUSxHQUFHLFVBQVUsS0FBSyxNQUFNLENBQUM7SUFBQTtBQUU1RixXQUFPO0VBQ1Q7QUFHTyxNQUFNLGlCQUEwQixXQUFXLFVBQVU7QUFHckQsTUFBTSxvQkFBNkIsQ0FBQyxVQUFVO0FBQ25ELFVBQU0sVUFBVSxjQUFjLE1BQU0sS0FBSyxNQUFNLFVBQVUsS0FBSyxJQUFJO0FBQ2xFLFFBQUksU0FBUyxLQUFLLEtBQUssU0FBUyxXQUFZLFFBQU87QUFDbkQsV0FBTyxNQUFNLEdBQUc7TUFDZCxJQUFJLGlCQUFpQixRQUFRLFVBQVU7UUFDckMsR0FBRyxRQUFRLEtBQUs7UUFDaEIsU0FBUyxRQUFRLEtBQUssTUFBTSxZQUFZO01BQUEsQ0FDekM7SUFBQTtFQUVMO0FBR08sV0FBUyxlQUFlLFVBQWdCLFNBQTJCO0FBQ3hFLFdBQU8sQ0FBQyxVQUFVO0FBQ2hCLFlBQU0sT0FBTyxXQUFXLE1BQU0sS0FBSyxRQUFRO0FBQzNDLFVBQUksTUFBTSxLQUFLLFNBQVMsY0FBYyxLQUFLLE1BQU0sWUFBWSxRQUFTLFFBQU87QUFDN0UsYUFBTyxNQUFNLEdBQUcsS0FBSyxJQUFJLGlCQUFpQixVQUFVLEVBQUUsR0FBRyxLQUFLLE9BQU8sUUFBQSxDQUFTLENBQUM7SUFDakY7RUFDRjtBQU9PLFdBQVMsYUFBYSxPQUErQjtBQUMxRCxXQUFPLENBQUMsVUFBVTtBQUNoQixZQUFNLFVBQVUsY0FBYyxNQUFNLEtBQUssTUFBTSxVQUFVLEtBQUssSUFBSTtBQUNsRSxVQUFJLENBQUMsUUFBUyxRQUFPO0FBQ3JCLFVBQUksVUFBVSxRQUFRLENBQUMsY0FBYyxRQUFRLEtBQUssS0FBSyxJQUFJLEVBQUUsSUFBSSxLQUFLLEVBQUcsUUFBTztBQUNoRixVQUFJLEVBQUUsZUFBZSxRQUFRLEtBQUssT0FBUSxRQUFPO0FBQ2pELFlBQU0sUUFBUSxFQUFFLEdBQUcsUUFBUSxLQUFLLE9BQU8sV0FBVyxNQUFBO0FBQ2xELFVBQUksUUFBUSxRQUFRLEtBQUssT0FBTyxLQUFLLEVBQUcsUUFBTztBQUMvQyxhQUFPLE1BQU0sR0FBRyxLQUFLLElBQUksaUJBQWlCLFFBQVEsVUFBVSxLQUFLLENBQUM7SUFDcEU7RUFDRjtBQUdPLE1BQU0sbUJBQTRCLGtCQUFrQixDQUFDO0FBT3JELE1BQU0sZ0NBQXlDLENBQUMsVUFBVTtBQUMvRCxVQUFNLFVBQVUsY0FBYyxNQUFNLEtBQUssTUFBTSxVQUFVLEtBQUssSUFBSTtBQUNsRSxRQUFJLFNBQVMsS0FBSyxLQUFLLFNBQVMsY0FBZSxRQUFPO0FBQ3RELFVBQU0sU0FBUyxXQUFXLE1BQU0sS0FBSyxRQUFRLFNBQVMsTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUNsRSxRQUFJLENBQUMsT0FBUSxRQUFPO0FBQ3BCLFVBQU0sUUFBUSxRQUFRLFNBQVMsUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUMxRCxhQUFTLElBQUksUUFBUSxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQ25DLFlBQU0sVUFBVSxPQUFPLE1BQU0sQ0FBQztBQUM5QixVQUFJLFFBQVEsS0FBSyxTQUFTLGNBQWU7QUFDekMsWUFBTSxRQUFRLE9BQU8sUUFBUSxNQUFNLFVBQVUsV0FBVyxRQUFRLE1BQU0sUUFBUTtBQUM5RSxhQUFPLGtCQUFrQixRQUFRLFFBQVEsVUFBVSxFQUFFLEtBQUs7SUFDNUQ7QUFDQSxXQUFPO0VBQ1Q7QUFHTyxXQUFTLGtCQUFrQixPQUF3QjtBQUN4RCxXQUFPLENBQUMsVUFBVTtBQUNoQixZQUFNLFVBQVUsY0FBYyxNQUFNLEtBQUssTUFBTSxVQUFVLEtBQUssSUFBSTtBQUNsRSxVQUFJLFNBQVMsS0FBSyxLQUFLLFNBQVMsY0FBZSxRQUFPO0FBQ3RELFlBQU0sUUFBUSxLQUFLLE1BQU0sS0FBSztBQUM5QixVQUFJLENBQUMsT0FBTyxTQUFTLEtBQUssS0FBSyxRQUFRLEtBQUssTUFBTSxVQUFVLE1BQU8sUUFBTztBQUMxRSxhQUFPLE1BQU0sR0FBRztRQUNkLElBQUksaUJBQWlCLFFBQVEsVUFBVSxFQUFFLEdBQUcsUUFBUSxLQUFLLE9BQU8sT0FBTyxNQUFBLENBQU87TUFBQTtJQUVsRjtFQUNGO0FDckpBLE1BQU0sY0FBYztBQUdwQixNQUFNLDJCQUEyQjtBQU8xQixXQUFTLFlBQ2RDLFNBQ0EsTUFDQSxRQUF5QixDQUFBLEdBQ0o7QUFDckIsVUFBTSxPQUFPQSxRQUFPLE1BQU07QUFDMUIsUUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixVQUFNLFFBQXNCLENBQUE7QUFDNUIsUUFBSSxPQUFPO0FBQ1gsZUFBVyxTQUFTLEtBQUssU0FBUyxXQUFXLEdBQUc7QUFDOUMsVUFBSSxNQUFNLE1BQU0sQ0FBQztBQUNqQixhQUFPLElBQUksU0FBUyxLQUFLLHlCQUF5QixTQUFTLElBQUksSUFBSSxTQUFTLENBQUMsQ0FBVyxHQUFHO0FBQ3pGLGNBQU0sSUFBSSxNQUFNLEdBQUcsRUFBRTtNQUN2QjtBQUNBLFlBQU0sT0FBTyxTQUFTLFVBQVUsS0FBSyxHQUFHLElBQUksV0FBVyxHQUFHLEtBQUssR0FBRztBQUNsRSxVQUFJLENBQUMsUUFBUSxJQUFJLFdBQVcsRUFBRztBQUMvQixZQUFNLFFBQVEsTUFBTSxTQUFTO0FBQzdCLFVBQUksUUFBUSxLQUFNLE9BQU0sS0FBS0EsUUFBTyxLQUFLLEtBQUssTUFBTSxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUM7QUFDeEUsWUFBTSxLQUFLQSxRQUFPLEtBQUssS0FBSyxLQUFLLE9BQU8sRUFBRSxLQUFBLENBQU0sRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ2xFLGFBQU8sUUFBUSxJQUFJO0lBQ3JCO0FBQ0EsUUFBSSxNQUFNLFdBQVcsRUFBRyxRQUFPO0FBQy9CLFFBQUksT0FBTyxLQUFLLE9BQVEsT0FBTSxLQUFLQSxRQUFPLEtBQUssS0FBSyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUM7QUFDdkUsV0FBTztFQUNUO0FDMU5PLE1BQU0saUJBQWlCO0FBRXZCLE1BQU0sb0JBQW9CO0FBSzFCLE1BQU0sZ0JBQWdCO0FBTXRCLE1BQU0sVUFBTixNQUFjO0lBQ1gsWUFBNEIsQ0FBQTtJQUM1QixZQUE0QixDQUFBO0lBQ25CO0lBQ0E7SUFFakIsWUFBWSxVQUEwQixDQUFBLEdBQUk7QUFDeEMsV0FBSyxhQUFhLFFBQVEsY0FBYztBQUN4QyxXQUFLLFFBQVEsUUFBUSxTQUFTO0lBQ2hDO0lBRUEsSUFBSSxVQUFtQjtBQUNyQixhQUFPLEtBQUssVUFBVSxTQUFTO0lBQ2pDO0lBRUEsSUFBSSxVQUFtQjtBQUNyQixhQUFPLEtBQUssVUFBVSxTQUFTO0lBQ2pDOztJQUdBLElBQUksY0FBdUM7QUFDekMsYUFBTyxLQUFLLFVBQVUsSUFBSSxPQUFPO0lBQ25DOztJQUdBLElBQUksY0FBdUM7QUFDekMsYUFBTyxLQUFLLFVBQVUsSUFBSSxPQUFPO0lBQ25DOztJQUdBLE9BQU8sSUFBaUIsaUJBQWtDO0FBQ3hELFVBQUksQ0FBQyxHQUFHLGNBQWMsR0FBRyxRQUFRLGNBQWMsTUFBTSxNQUFPO0FBQzVELFlBQU0sV0FBVyxZQUFZLEdBQUcsT0FBTyxHQUFHLElBQUk7QUFDOUMsWUFBTSxRQUFRLFNBQVMsRUFBRTtBQUN6QixZQUFNLE9BQU8sS0FBSyxVQUFVLEtBQUssVUFBVSxTQUFTLENBQUM7QUFDckQsVUFDRSxRQUNBLEdBQUcsT0FBTyxLQUFLLFlBQVksS0FBSyxjQUNoQyxHQUFHLFFBQVEsaUJBQWlCLE1BQU0sTUFDbEM7QUFDQSxhQUFLLFFBQVEsQ0FBQyxHQUFHLFVBQVUsR0FBRyxLQUFLLEtBQUs7QUFDeEMsYUFBSyxZQUFZLEdBQUc7QUFDcEIsYUFBSyxLQUFLLEdBQUc7QUFDYixhQUFLLFFBQVE7QUFFYixZQUFJLEtBQUssVUFBVSxNQUFPLE1BQUssUUFBUTtNQUN6QyxPQUFPO0FBQ0wsYUFBSyxVQUFVLEtBQUs7VUFDbEIsT0FBTztVQUNQO1VBQ0EsV0FBVyxHQUFHO1VBQ2QsSUFBSSxHQUFHO1VBQ1A7VUFDQSxNQUFNO1FBQUEsQ0FDUDtBQUNELFlBQUksS0FBSyxVQUFVLFNBQVMsS0FBSyxNQUFPLE1BQUssVUFBVSxNQUFBO01BQ3pEO0FBQ0EsV0FBSyxZQUFZLENBQUE7SUFDbkI7SUFFQSxLQUFLLE9BQXdDO0FBQzNDLGFBQU8sS0FBSyxLQUFLLE9BQU8sS0FBSyxXQUFXLEtBQUssU0FBUztJQUN4RDtJQUVBLEtBQUssT0FBd0M7QUFDM0MsYUFBTyxLQUFLLEtBQUssT0FBTyxLQUFLLFdBQVcsS0FBSyxTQUFTO0lBQ3hEO0lBRUEsUUFBYztBQUNaLFdBQUssWUFBWSxDQUFBO0FBQ2pCLFdBQUssWUFBWSxDQUFBO0lBQ25CO0lBRVEsS0FBSyxPQUFvQixNQUFzQixJQUF3QztBQUM3RixZQUFNLFFBQVEsS0FBSyxJQUFBO0FBQ25CLFVBQUksQ0FBQyxNQUFPLFFBQU87QUFJbkIsWUFBTSxVQUFVLEtBQUssS0FBSyxTQUFTLENBQUM7QUFDcEMsVUFBSSxRQUFBLFNBQWlCLFlBQVk7QUFDakMsWUFBTSxLQUFLLE1BQU07QUFDakIsaUJBQVcsUUFBUSxNQUFNLE1BQU8sSUFBRyxLQUFLLElBQUk7QUFDNUMsU0FBRyxhQUFhLE1BQU0sZUFBZTtBQUNyQyxTQUFHLFFBQVEsZ0JBQWdCLEtBQUs7QUFDaEMsU0FBRyxLQUFLO1FBQ04sT0FBTyxZQUFZLEdBQUcsT0FBTyxHQUFHLElBQUk7UUFDcEMsaUJBQWlCLE1BQU07UUFDdkIsV0FBVzs7UUFDWCxJQUFJLE1BQU07UUFDVixPQUFPLE1BQU07UUFDYixNQUFNLE1BQU07TUFBQSxDQUNiO0FBQ0QsYUFBTztJQUNUO0VBQ0Y7QUFFQSxXQUFTLFFBQVEsT0FBbUM7QUFDbEQsV0FBTyxFQUFFLE9BQU8sTUFBTSxPQUFPLFdBQVcsTUFBTSxJQUFJLE1BQU0sTUFBTSxLQUFBO0VBQ2hFO0FBRUEsV0FBUyxZQUFZLE9BQXdCLE1BQXFDO0FBQ2hGLFdBQU8sTUFBTSxJQUFJLENBQUMsTUFBTSxNQUFNLEtBQUssT0FBTyxLQUFLLENBQUMsQ0FBZSxDQUFDLEVBQUUsUUFBQTtFQUNwRTtBQUdBLFdBQVMsU0FBUyxJQUF5QjtBQUN6QyxVQUFNLFNBQVMsR0FBRyxRQUFRLGFBQWE7QUFDdkMsUUFBSSxPQUFPLFdBQVcsWUFBWSxPQUFPLFNBQVMsRUFBRyxRQUFPO0FBQzVELFVBQU0sUUFBUSxJQUFJLElBQUksR0FBRyxNQUFNLElBQUksTUFBTSxDQUFDO0FBQzFDLFFBQUksTUFBTSxJQUFJLFdBQVcsRUFBRyxRQUFPO0FBQ25DLFFBQUksTUFBTSxJQUFJLE9BQU8sRUFBRyxRQUFPO0FBQy9CLFFBQUksTUFBTSxJQUFJLE1BQU0sRUFBRyxRQUFPO0FBQzlCLFFBQUksTUFBTSxJQUFJLE9BQU8sRUFBRyxRQUFPO0FBQy9CLFFBQUksTUFBTSxJQUFJLE1BQU0sRUFBRyxRQUFPO0FBQzlCLFFBQUksTUFBTSxJQUFJLE1BQU0sRUFBRyxRQUFPO0FBQzlCLFdBQU87RUFDVDtBQUVBLFdBQVMsT0FBTyxNQUFvQjtBQUNsQyxRQUFJLGdCQUFnQixrQkFBbUIsUUFBTztBQUM5QyxRQUFJLGdCQUFnQixlQUFlLGdCQUFnQixlQUFnQixRQUFPO0FBQzFFLFFBQUksZ0JBQWdCLGlCQUFrQixRQUFPO0FBQzdDLFFBQUksZ0JBQWdCLGlCQUFpQixnQkFBZ0IsY0FBZSxRQUFPO0FBQzNFLFFBQUksZ0JBQWdCLGlCQUFpQixnQkFBZ0IsY0FBZSxRQUFPO0FBQzNFLFFBQUksZ0JBQWdCLGlCQUFrQixRQUFPO0FBQzdDLFdBQU87RUFDVDtBQ2hKTyxXQUFTLGdCQUNkLE9BQ0EsT0FDQSxPQUNvQjtBQUNwQixRQUFJLE1BQU0sV0FBVyxFQUFHLFFBQU87QUFDL0IsVUFBTSxZQUFZLE1BQU07QUFDeEIsUUFBSSxFQUFFLHFCQUFxQixrQkFBa0IsQ0FBQyxVQUFVLE1BQU8sUUFBTztBQUN0RSxVQUFNLFFBQVEsVUFBVTtBQUN4QixVQUFNLFFBQVEsV0FBVyxNQUFNLEtBQUssTUFBTSxJQUFJO0FBQzlDLFFBQUksQ0FBQyxPQUFPLFlBQWEsUUFBTztBQUloQyxRQUFJLE1BQU0sS0FBSyxLQUFLLG1CQUFvQixRQUFPO0FBQy9DLFFBQUksbUJBQW1CLE9BQU8sTUFBTSxNQUFNLEVBQUcsUUFBTztBQUVwRCxRQUFJLE1BQU0sUUFBUSxTQUFTLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxNQUFNLEVBQUcsUUFBTztBQUNsRSxVQUFNLGFBQWEsTUFBTSxZQUFZLE1BQU0sR0FBRyxNQUFNLE1BQU07QUFDMUQsVUFBTSxZQUFZLGFBQWE7QUFDL0IsZUFBVyxRQUFRLE9BQU87QUFDeEIsWUFBTSxRQUFRLEtBQUssTUFBTSxLQUFLLFNBQVM7QUFDdkMsVUFBSSxDQUFDLFNBQVMsTUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFLFdBQVcsVUFBVSxPQUFRO0FBQ2xFLFlBQU0sS0FBSyxLQUFLO1FBQ2QsRUFBRSxPQUFPLFdBQVcsTUFBTSxNQUFNLE9BQU8sTUFBTSxNQUFNLE9BQU8sSUFBSSxNQUFNLE9BQUE7UUFDcEU7TUFBQTtBQUVGLFVBQUksR0FBSSxRQUFPLEdBQUcsUUFBUSxtQkFBbUIsSUFBSTtJQUNuRDtBQUNBLFdBQU87RUFDVDtBQU9BLFdBQVMsbUJBQW1CLE9BQW1CLFFBQXlCO0FBQ3RFLFVBQU0sUUFBUSxvQkFBb0IsTUFBTSxTQUFTLE1BQU07QUFDdkQsV0FBTyxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssS0FBSyxTQUFTLE1BQU07RUFDdkQ7QUFZTyxXQUFTLGtCQUFrQixVQUFtQyxDQUFBLEdBQWlCO0FBQ3BGLFVBQU0sUUFBcUI7O01BRXpCO1FBQ0UsT0FBTztRQUNQLEtBQUssQ0FBQyxFQUFFLE9BQU8sV0FBVyxNQUFNLEdBQUEsR0FBTSxVQUFVO0FBQzlDLGdCQUFNLFFBQVMsTUFBTSxDQUFDLEVBQWE7QUFDbkMsZ0JBQU0sS0FBSyxNQUFNO0FBQ2pCLGFBQUcsS0FBSyxJQUFJLGtCQUFrQixXQUFXLE1BQU0sSUFBSSxTQUFTLEtBQUssQ0FBQztBQUNsRSxnQkFBTSxRQUFRLFdBQVcsR0FBRyxLQUFLLFNBQVM7QUFDMUMsY0FBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixhQUFHO1lBQ0Q7Y0FDRTtjQUNBLFNBQVMsR0FBRyxNQUFNLE9BQU8sU0FBUyxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQUEsR0FBUyxNQUFNLE9BQU8sQ0FBQztZQUFBO1VBQy9FO0FBRUYsYUFBRyxhQUFhLElBQUksY0FBYyxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUM7QUFDcEQsaUJBQU87UUFDVDtNQUFBOztNQUdGO1FBQ0UsT0FBTztRQUNQLEtBQUssQ0FBQyxZQUFZLFdBQVcsU0FBUyxjQUFjLE1BQVM7TUFBQTtNQUUvRDtRQUNFLE9BQU87UUFDUCxLQUFLLENBQUMsU0FBUyxVQUNiLFdBQVcsU0FBUyxlQUFlO1VBQ2pDLE9BQU8sT0FBTyxTQUFTLE1BQU0sQ0FBQyxHQUFhLEVBQUU7UUFBQSxDQUM5QztNQUFBOztNQUdMO1FBQ0UsT0FBTztRQUNQLEtBQUssQ0FBQyxFQUFFLE9BQU8sV0FBVyxNQUFNLEdBQUEsTUFBUztBQUN2QyxnQkFBTSxLQUFLLE1BQU07QUFDakIsYUFBRyxLQUFLLElBQUksa0JBQWtCLFdBQVcsTUFBTSxJQUFJLFNBQVMsS0FBSyxDQUFDO0FBQ2xFLGdCQUFNLGFBQWEsVUFBVSxNQUFNLEdBQUcsRUFBRTtBQUN4QyxnQkFBTSxRQUFRLFVBQVUsVUFBVSxTQUFTLENBQUM7QUFDNUMsYUFBRyxLQUFLLElBQUksY0FBYyxZQUFZLE9BQU8sUUFBUSxHQUFHLFlBQVksQ0FBQztBQUNyRSxhQUFHLGFBQWEsSUFBSSxjQUFjLElBQUksQ0FBQyxHQUFHLFlBQVksT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDcEUsaUJBQU87UUFDVDtNQUFBOztNQUdGO1FBQ0UsT0FBTztRQUNQLEtBQUssQ0FBQyxFQUFFLE9BQU8sV0FBVyxNQUFNLEdBQUEsTUFBUztBQUN2QyxnQkFBTSxLQUFLLE1BQU07QUFDakIsYUFBRyxLQUFLLElBQUksa0JBQWtCLFdBQVcsTUFBTSxJQUFJLFNBQVMsS0FBSyxDQUFDO0FBQ2xFLGdCQUFNLFFBQVEsV0FBVyxHQUFHLEtBQUssU0FBUztBQUMxQyxjQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLGFBQUc7WUFDRDtjQUNFO2NBQ0EsU0FBUyxHQUFHLE1BQU0sT0FBTyxTQUFTLFdBQVcsRUFBRSxPQUFPLFFBQVcsTUFBTSxPQUFPLENBQUM7WUFBQTtVQUNqRjtBQUVGLGFBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBQ3BELGlCQUFPO1FBQ1Q7TUFBQTtJQUNGO0FBRUYsUUFBSSxRQUFRLGFBQWEsTUFBTyxPQUFNLEtBQUssYUFBQSxDQUFjO0FBQ3pELFFBQUksUUFBUSxlQUFlLE1BQU8sT0FBTSxLQUFLLGVBQUEsQ0FBZ0I7QUFDN0QsUUFBSSxRQUFRLFdBQVcsT0FBTztBQUM1QixZQUFNLEtBQUs7UUFDVCxPQUFPO1FBQ1AsS0FBSyxDQUFDLEVBQUUsT0FBTyxXQUFXLE1BQU0sR0FBQSxNQUFTO0FBQ3ZDLGdCQUFNLEtBQUssTUFBTTtBQUNqQixhQUFHLEtBQUssSUFBSSxrQkFBa0IsV0FBVyxNQUFNLElBQUksU0FBUyxHQUFHLE1BQU0sT0FBTyxLQUFLLFFBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkYsYUFBRyxhQUFhLElBQUksY0FBYyxJQUFJLFdBQVcsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUMzRCxpQkFBTztRQUNUO01BQUEsQ0FDRDtJQUNIO0FBQ0EsV0FBTztFQUNUO0FBRUEsV0FBUyxXQUNQLFNBQ0EsY0FDQSxPQUNvQjtBQUNwQixVQUFNLEVBQUUsT0FBTyxXQUFXLE1BQU0sR0FBQSxJQUFPO0FBRXZDLFFBQUksUUFBUSxNQUFNLEtBQUssU0FBUyxZQUFhLFFBQU87QUFDcEQsVUFBTSxhQUFhLFVBQVUsTUFBTSxHQUFHLEVBQUU7QUFDeEMsUUFBSSxXQUFXLFNBQVMsS0FBSyxtQkFBbUIsV0FBVyxNQUFNLEtBQUssVUFBVSxHQUFHLEtBQUssSUFBSSxHQUFHO0FBQzdGLGFBQU87SUFDVDtBQUNBLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLE9BQUcsS0FBSyxJQUFJLGtCQUFrQixXQUFXLE1BQU0sSUFBSSxTQUFTLEtBQUssQ0FBQztBQUNsRSxVQUFNLFFBQVEsV0FBVyxHQUFHLEtBQUssU0FBUztBQUMxQyxRQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLFVBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxDQUFDO0FBQzVDLFVBQU1BLFVBQVMsTUFBTTtBQUNyQixVQUFNLE9BQU9BLFFBQU8sU0FBUyxVQUFVLEVBQUUsT0FBTyxRQUFXLFNBQVMsR0FBRyxLQUFLLENBQUM7QUFDN0UsT0FBRztNQUNELElBQUk7UUFDRjtRQUNBO1FBQ0EsUUFBUTtRQUNSLFNBQVMsR0FBR0EsUUFBTyxTQUFTLFlBQVksRUFBRSxPQUFPLE9BQU8sU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDO01BQUE7SUFDNUU7QUFFRixPQUFHLGFBQWEsSUFBSSxjQUFjLElBQUksQ0FBQyxHQUFHLFlBQVksT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2RSxXQUFPO0VBQ1Q7QUFXQSxNQUFNLFdBQVc7QUFFakIsV0FBUyxlQUEwQjtBQUNqQyxXQUFPO01BQ0wsT0FBTztNQUNQLEtBQUssQ0FBQyxFQUFFLE9BQU8sV0FBVyxPQUFPLEdBQUEsR0FBTSxVQUFVO0FBQy9DLGNBQU0sT0FBTyxNQUFNLE9BQU8sU0FBUyxNQUFNO0FBR3pDLFlBQUksQ0FBQyxNQUFNLEtBQUssZUFBZSxJQUFJLEVBQUcsUUFBTztBQUU3QyxjQUFNLE1BQU0sTUFBTSxDQUFDO0FBQ25CLGNBQU0sV0FBVyxNQUFNLENBQUM7QUFDeEIsY0FBTSxNQUFNLHdCQUF3QixHQUFHO0FBQ3ZDLFlBQUksSUFBSSxXQUFXLEVBQUcsUUFBTztBQUU3QixjQUFNLE9BQU8sU0FBUyxVQUFVLEtBQUssR0FBRyxJQUFJLFdBQVcsR0FBRyxLQUFLLEdBQUc7QUFDbEUsWUFBSSxDQUFDLEtBQU0sUUFBTztBQU9sQixjQUFNLFFBQVEsS0FBSyxJQUFJO0FBQ3ZCLFlBQUksUUFBUSxFQUFHLFFBQU87QUFDdEIsY0FBTSxNQUFNLFFBQVEsSUFBSTtBQUV4QixjQUFNLEtBQUssTUFBTTtBQUNqQixXQUFHLEtBQUssSUFBSSxZQUFZLFdBQVcsT0FBTyxLQUFLLEtBQUssT0FBTyxFQUFFLEtBQUEsQ0FBTSxDQUFDLENBQUM7QUFJckUsV0FBRyxLQUFLLElBQUksa0JBQWtCLFdBQVcsSUFBSSxJQUFJLFNBQVMsR0FBRyxNQUFNLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQzFGLFdBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxXQUFXLEtBQUssU0FBUyxNQUFNLENBQUMsQ0FBQztBQUN2RSxlQUFPO01BQ1Q7SUFBQTtFQUVKO0FBT0EsV0FBUyxpQkFBNEI7QUFDbkMsV0FBTztNQUNMLE9BQU87TUFDUCxLQUFLLENBQUMsRUFBRSxPQUFPLFdBQVcsT0FBTyxHQUFBLEdBQU0sVUFBVTtBQUMvQyxjQUFNLE9BQU8sTUFBTSxPQUFPLE1BQU07QUFDaEMsWUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEtBQUssZUFBZSxJQUFJLEVBQUcsUUFBTztBQUN0RCxjQUFNLFFBQVEsTUFBTSxDQUFDO0FBRXJCLGNBQU0sUUFBUSxLQUFLLE1BQU0sU0FBUztBQUNsQyxZQUFJLFFBQVEsRUFBRyxRQUFPO0FBQ3RCLGNBQU0sS0FBSyxNQUFNO0FBQ2pCLFdBQUc7VUFDRCxJQUFJO1lBQ0Y7WUFDQTtZQUNBO1lBQ0EsU0FBUyxHQUFHLE1BQU0sT0FBTyxLQUFLLE9BQU8sQ0FBQyxLQUFLLE9BQUEsQ0FBUSxDQUFDLENBQUM7VUFBQTtRQUN2RDtBQUVGLFdBQUcsYUFBYSxJQUFJLGNBQWMsSUFBSSxXQUFXLFFBQVEsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUN2RSxlQUFPO01BQ1Q7SUFBQTtFQUVKO0FBR0EsTUFBTSx1QkFBdUI7QUFHN0IsV0FBUyx3QkFBd0IsS0FBcUI7QUFDcEQsUUFBSSxNQUFNLElBQUk7QUFDZCxXQUFPLE1BQU0sR0FBRztBQUNkLFlBQU0sT0FBTyxJQUFJLE1BQU0sQ0FBQztBQUN4QixVQUFJLFNBQVMsS0FBSztBQUVoQixjQUFNLFNBQVMsSUFBSSxNQUFNLEdBQUcsR0FBRyxFQUFFLE1BQU0sS0FBSyxLQUFLLENBQUEsR0FBSTtBQUNyRCxjQUFNLFVBQVUsSUFBSSxNQUFNLEdBQUcsR0FBRyxFQUFFLE1BQU0sS0FBSyxLQUFLLENBQUEsR0FBSTtBQUN0RCxZQUFJLFNBQVMsT0FBUTtBQUNyQixlQUFPO0FBQ1A7TUFDRjtBQUNBLFVBQUkscUJBQXFCLFNBQVMsSUFBSSxHQUFHO0FBQ3ZDLGVBQU87QUFDUDtNQUNGO0FBQ0E7SUFDRjtBQUNBLFdBQU8sSUFBSSxNQUFNLEdBQUcsR0FBRztFQUN6QjtBRTdTTyxXQUFTLGVBQWUsS0FBeUI7QUFDdEQsV0FBTyxXQUFXLEdBQUcsRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFFLEtBQUEsTUFBVyxNQUFNLGFBQWEsS0FBSyxPQUFPLEdBQUcsQ0FBQztFQUN0RjtBQUdPLFdBQVMsVUFBVSxLQUF5QjtBQUNqRCxRQUFJQyxTQUFRO0FBQ1osZUFBVyxFQUFFLEtBQUEsS0FBVSxXQUFXLEdBQUcsR0FBRztBQUN0Q0EsZ0JBQVMsVUFBVSxJQUFJLEVBQ3BCLE1BQU0sS0FBSyxFQUNYLE9BQU8sQ0FBQyxTQUFTLEtBQUssU0FBUyxDQUFDLEVBQUU7SUFDdkM7QUFDQSxXQUFPQTtFQUNUO0FBT08sV0FBUyxjQUFjLEtBQXlCO0FBQ3JELFFBQUlBLFNBQVE7QUFDWixlQUFXLEVBQUUsS0FBQSxLQUFVLFdBQVcsR0FBRyxHQUFHO0FBQ3RDLFlBQU0sT0FBTyxVQUFVLElBQUksRUFBRSxLQUFBO0FBQzdCLFVBQUksS0FBSyxXQUFXLEVBQUc7QUFDdkJBLGdCQUFTLEtBQUs7UUFDWjtRQUNBLEtBQUssTUFBTSxrQkFBa0IsRUFBRSxPQUFPLENBQUMsU0FBUyxLQUFLLEtBQUEsRUFBTyxTQUFTLENBQUMsRUFBRTtNQUFBO0lBRTVFO0FBQ0EsV0FBT0E7RUFDVDtBQUdPLFdBQVMsZUFBZSxLQUF5QjtBQUN0RCxRQUFJQSxTQUFRO0FBQ1osZUFBVyxFQUFFLEtBQUEsS0FBVSxXQUFXLEdBQUcsR0FBRztBQUN0QyxVQUFJLFVBQVUsSUFBSSxFQUFFLEtBQUEsRUFBTyxTQUFTLEVBQUdBO0lBQ3pDO0FBQ0EsV0FBT0E7RUFDVDtBQUdBLFdBQVMsVUFBVSxNQUEwQjtBQUMzQyxRQUFJLE9BQU87QUFDWCxlQUFXLFNBQVMsS0FBSyxRQUFRLFVBQVU7QUFDekMsY0FBUSxNQUFNLFNBQVUsTUFBbUIsT0FBTztJQUNwRDtBQUNBLFdBQU87RUFDVDtBQzlCTyxXQUFTLGdCQUFnQixNQUFrQixVQUFnQyxDQUFBLEdBQVk7QUFDNUYsUUFBSSxLQUFLLE9BQVEsUUFBTyxjQUFjLElBQWdCO0FBQ3RELFVBQU0sY0FBYyxRQUFRLGFBQWEsSUFBSTtBQUM3QyxRQUFJLGdCQUFnQixRQUFRLGdCQUFnQixPQUFXLFFBQU87QUFDOUQsVUFBTSxPQUFPLEtBQUssS0FBSyxLQUFLLFNBQVMsSUFBSTtBQUd6QyxVQUFNLFdBQVcsS0FBSyxRQUFRLFNBQVMsSUFBSSxDQUFDLFVBQVUsZ0JBQWdCLE9BQU8sT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFO0FBQzlGLFFBQUksQ0FBQyxLQUFNLFFBQU87QUFDbEIsV0FBTyxVQUFVLE1BQU0sUUFBUTtFQUNqQztBQUVBLFdBQVMsY0FBYyxNQUF3QjtBQUM3QyxRQUFJLE9BQU8sV0FBVyxLQUFLLElBQUk7QUFFL0IsYUFBUyxJQUFJLEtBQUssTUFBTSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDL0MsWUFBTSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQ3pCLFlBQU0sT0FBTyxLQUFLLEtBQUssS0FBSyxTQUFTLElBQUk7QUFDekMsVUFBSSxLQUFNLFFBQU8sVUFBVSxNQUFNLElBQUk7SUFDdkM7QUFDQSxXQUFPO0VBQ1Q7QUFFQSxXQUFTLFVBQVUsTUFBZ0IsVUFBMEI7QUFDM0QsVUFBTSxRQUFRLE9BQU8sUUFBUSxLQUFLLFNBQVMsQ0FBQSxDQUFFLEVBQzFDLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLFdBQVcsS0FBSyxDQUFDLEdBQUcsRUFDeEQsS0FBSyxFQUFFO0FBQ1YsUUFBSSxLQUFLLE9BQVEsUUFBTyxJQUFJLEtBQUssR0FBRyxHQUFHLEtBQUs7QUFDNUMsVUFBTSxPQUFPLFlBQVksS0FBSyxjQUFjLEtBQUssT0FBTyxXQUFXLEtBQUssSUFBSSxJQUFJO0FBQ2hGLFVBQU0sUUFBUSxLQUFLLFdBQVcsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLEtBQUssS0FBSyxRQUFRLE1BQU07QUFDL0UsV0FBTyxJQUFJLEtBQUssR0FBRyxHQUFHLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxHQUFHO0VBQ25EO0FBRU8sV0FBUyxXQUFXLE9BQXVCO0FBQ2hELFdBQU8sTUFDSixXQUFXLEtBQUssT0FBTyxFQUN2QixXQUFXLEtBQUssTUFBTSxFQUN0QixXQUFXLEtBQUssTUFBTSxFQUN0QixXQUFXLEtBQUssUUFBUSxFQUN4QixXQUFXLEtBQUssT0FBTztFQUM1QjtBQUdPLFdBQVMsZ0JBQWdCLEtBQXlCO0FBQ3ZELFVBQU0sUUFBa0IsQ0FBQTtBQUN4QixVQUFNLE9BQU8sQ0FBQyxTQUEyQjtBQUN2QyxVQUFJLEtBQUssYUFBYTtBQUNwQixjQUFNLEtBQUssS0FBSyxXQUFXO0FBQzNCO01BQ0Y7QUFDQSxpQkFBVyxTQUFTLEtBQUssUUFBUSxTQUFBLE1BQWUsS0FBSztJQUN2RDtBQUNBLFNBQUssR0FBRztBQUNSLFdBQU8sTUFBTSxLQUFLLElBQUk7RUFDeEI7QUc5REEsTUFBTSxpQkFBQSxvQkFBcUIsSUFBSTtJQUM3QjtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ0E7RUFDRixDQUFDO0FBT0QsTUFBTSxVQUFOLE1BQWlCO0lBQ1AsUUFBQSxvQkFBWSxJQUFBO0lBRXBCLElBQUksT0FBVSxNQUF1QjtBQUNuQyxZQUFNLE9BQU8sS0FBSyxNQUFNLElBQUksS0FBSyxHQUFHLEtBQUssQ0FBQTtBQUV6QyxVQUFJLEtBQUssVUFBVyxNQUFLLFFBQVEsRUFBRSxPQUFPLEtBQUEsQ0FBTTtVQUMzQyxNQUFLLEtBQUssRUFBRSxPQUFPLEtBQUEsQ0FBTTtBQUM5QixXQUFLLE1BQU0sSUFBSSxLQUFLLEtBQUssSUFBSTtJQUMvQjs7SUFHQSxPQUFPLEtBQXNCO0FBQzNCLGFBQU8sS0FBSyxNQUFNLElBQUksR0FBRztJQUMzQjs7SUFHQSxNQUFNLFNBQWtGO0FBQ3RGLFlBQU0sT0FBTyxLQUFLLE1BQU0sSUFBSSxRQUFRLFFBQVEsWUFBQSxDQUFhO0FBQ3pELFVBQUksQ0FBQyxLQUFNLFFBQU87QUFDbEIsaUJBQVcsRUFBRSxPQUFPLEtBQUEsS0FBVSxNQUFNO0FBQ2xDLFlBQUksS0FBSyxhQUFhLENBQUMsUUFBUSxhQUFhLEtBQUssU0FBUyxFQUFHO0FBQzdELFlBQUksQ0FBQyxLQUFLLFNBQUEsUUFBaUIsRUFBRSxPQUFPLE9BQU8sS0FBQTtBQUMzQyxjQUFNLFFBQVEsS0FBSyxTQUFTLE9BQU87QUFDbkMsWUFBSSxVQUFVLE1BQU87QUFDckIsZUFBTyxFQUFFLE9BQU8sT0FBUSxTQUFxQyxLQUFBO01BQy9EO0FBQ0EsYUFBTztJQUNUO0VBQ0Y7QUFFQSxNQUFNLGFBQU4sTUFBaUI7SUFJZixZQUE2QkMsU0FBZ0I7QUFBaEIsV0FBQSxTQUFBQTtBQUMzQixpQkFBVyxRQUFRLE9BQU8sT0FBT0EsUUFBTyxLQUFLLEdBQUc7QUFDOUMsbUJBQVcsUUFBUSxLQUFLLEtBQUssYUFBYSxDQUFBLEVBQUksTUFBSyxVQUFVLElBQUksTUFBTSxJQUFJO01BQzdFO0FBQ0EsaUJBQVcsUUFBUSxPQUFPLE9BQU9BLFFBQU8sS0FBSyxHQUFHO0FBQzlDLG1CQUFXLFFBQVEsS0FBSyxLQUFLLGFBQWEsQ0FBQSxFQUFJLE1BQUssVUFBVSxJQUFJLE1BQU0sSUFBSTtNQUM3RTtJQUNGO0lBUDZCO0lBSFosWUFBWSxJQUFJLFFBQUE7SUFDaEIsWUFBWSxJQUFJLFFBQUE7SUFXakMsTUFBTSxNQUFtQztBQUN2QyxZQUFNLFdBQVcsS0FBSyxjQUFjLE1BQU0sQ0FBQSxHQUFJLEtBQUs7QUFDbkQsWUFBTSxNQUFNLEtBQUssT0FBTyxRQUFRLE9BQU8sUUFBVyxTQUFTLEtBQUssUUFBUSxDQUFDO0FBQ3pFLGFBQU8sYUFBYSxHQUFHO0lBQ3pCOztJQUdRLGNBQ04sUUFDQSxPQUNBLGVBQ2M7QUFDZCxZQUFNLE1BQW9CLENBQUE7QUFDMUIsaUJBQVcsU0FBUyxDQUFDLEdBQUcsT0FBTyxVQUFVLEdBQUc7QUFDMUMsWUFBSSxLQUFLLEdBQUcsS0FBSyxVQUFVLE9BQU8sT0FBTyxhQUFhLENBQUM7TUFDekQ7QUFDQSxhQUFPO0lBQ1Q7SUFFUSxVQUNOLE1BQ0EsT0FDQSxlQUNjO0FBQ2QsVUFBSSxLQUFLLGFBQWEsR0FBbUI7QUFDdkMsY0FBTSxhQUFhLEtBQUssZUFBZSxJQUFJLFFBQVEsUUFBUSxHQUFHO0FBQzlELFlBQUksY0FBYyxHQUFJLFFBQU8sQ0FBQTtBQUM3QixZQUFJLGNBQWMsS0FBSztBQUVyQixpQkFBTyxnQkFBZ0IsQ0FBQyxLQUFLLE9BQU8sS0FBSyxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUE7UUFDMUQ7QUFDQSxlQUFPLENBQUMsS0FBSyxPQUFPLEtBQUssV0FBVyxLQUFLLENBQUM7TUFDNUM7QUFDQSxVQUFJLEtBQUssYUFBYSxFQUFzQixRQUFPLENBQUE7QUFDbkQsWUFBTSxVQUFVO0FBQ2hCLFlBQU0sTUFBTSxRQUFRLFFBQVEsWUFBQTtBQUk1QixZQUFNLFlBQVksZUFBZSxJQUFJLEdBQUc7QUFDeEMsVUFBSSxhQUFhLENBQUMsS0FBSyxVQUFVLE9BQU8sR0FBRyxFQUFBLFFBQVUsQ0FBQTtBQUVyRCxZQUFNLFlBQVksS0FBSyxVQUFVLE1BQU0sT0FBTztBQUM5QyxVQUFJLFdBQVc7QUFDYixjQUFNLE9BQU8sVUFBVSxNQUFNLE9BQU8sVUFBVSxTQUFTLE1BQVM7QUFDaEUsZUFBTyxLQUFLLGNBQWMsU0FBUyxLQUFLLFNBQVMsS0FBSyxHQUFHLGFBQWE7TUFDeEU7QUFFQSxZQUFNLFlBQVksS0FBSyxVQUFVLE1BQU0sT0FBTztBQUM5QyxVQUFJLFdBQVc7QUFDYixjQUFNLE9BQU8sVUFBVTtBQUN2QixjQUFNLFFBQVEsVUFBVSxTQUFTO0FBQ2pDLFlBQUksS0FBSyxLQUFLLG9CQUFvQjtBQUVoQyxnQkFBTSxPQUFPLFFBQVEsZUFBZTtBQUNwQyxnQkFBTSxVQUFVLE9BQU8sU0FBUyxHQUFHLEtBQUssT0FBTyxLQUFLLElBQUksQ0FBQyxJQUFJLFNBQVM7QUFDdEUsaUJBQU8sQ0FBQyxLQUFLLE9BQU8sT0FBTyxPQUFPLENBQUM7UUFDckM7QUFDQSxZQUFJLENBQUMsS0FBSyxLQUFLLFNBQVM7QUFDdEIsaUJBQU8sQ0FBQyxLQUFLLE9BQU8sS0FBSyxDQUFDO1FBQzVCO0FBQ0EsY0FBTSxTQUFTLEtBQUs7QUFDcEIsY0FBTSxXQUFXLEtBQUssY0FBYyxTQUFTLFNBQVMsUUFBUSxDQUFBLEdBQUksTUFBTTtBQUN4RSxZQUFJLFFBQVE7QUFDVixnQkFBTSxpQkFBaUIsU0FBUyxPQUFPLENBQUMsVUFBVSxNQUFNLFFBQVE7QUFDaEUsaUJBQU8sQ0FBQyxLQUFLLE9BQU8sT0FBTyxZQUFZLFNBQVMsS0FBSyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQ3hFO0FBQ0EsZUFBTyxDQUFDLEtBQUssT0FBTyxPQUFPLFNBQVMsS0FBSyxRQUFRLENBQUMsQ0FBQztNQUNyRDtBQU1BLFVBQUksVUFBQSxRQUFrQixDQUFBO0FBR3RCLGFBQU8sS0FBSyxjQUFjLFNBQVMsT0FBTyxhQUFhO0lBQ3pEO0VBQ0Y7QUFFQSxNQUFNLGNBQUEsb0JBQWtCLFFBQUE7QUFNakIsV0FBUyxVQUFVQSxTQUFnQixNQUFjQyxXQUFpQztBQUN2RixVQUFNLE1BQU1BLGNBQWEsT0FBTyxXQUFXLGNBQWMsT0FBTyxXQUFXO0FBQzNFLFFBQUksQ0FBQyxLQUFLO0FBQ1IsWUFBTSxJQUFJLFdBQVcsdUVBQXVFO0lBQzlGO0FBR0EsVUFBTSxXQUFXLElBQUksY0FBYyxVQUFVO0FBQzdDLGFBQVMsWUFBWTtBQUNyQixRQUFJLFNBQVMsWUFBWSxJQUFJRCxPQUFNO0FBQ25DLFFBQUksQ0FBQyxRQUFRO0FBQ1gsZUFBUyxJQUFJLFdBQVdBLE9BQU07QUFDOUIsa0JBQVksSUFBSUEsU0FBUSxNQUFNO0lBQ2hDO0FBQ0EsV0FBTyxPQUFPLE1BQU0sU0FBUyxPQUFPO0VBQ3RDO0FDNUtBLE1BQU0sc0JBQXNCO0FBRTVCLE1BQU0sYUFBYTtBQU9uQixNQUFNLGNBQWM7QUFFcEIsTUFBTSxhQUFhO0FBS25CLE1BQU0sa0JBQWtCO0FBRXhCLE1BQU0sa0JBQWtCO0FBRXhCLE1BQU0sa0JBQWtCO0FBRXhCLE1BQU0sc0JBQXNCO0FBRTVCLE1BQU0sZ0JBQWdCO0FBRXRCLE1BQU0sa0JBQWtCO0FBU2pCLFdBQVMsa0JBQWtCLE1BQTJCO0FBQzNELFFBQUksZ0NBQWdDLEtBQUssSUFBSSxFQUFHLFFBQU87QUFDdkQsUUFBSSwwQ0FBMEMsS0FBSyxJQUFJLEVBQUcsUUFBTztBQUNqRSxRQUFJLG1DQUFtQyxLQUFLLElBQUksRUFBRyxRQUFPO0FBQzFELFFBQUkseUNBQXlDLEtBQUssSUFBSSxFQUFHLFFBQU87QUFDaEUsUUFBSSxrQ0FBa0MsS0FBSyxJQUFJLEVBQUcsUUFBTztBQUd6RCxRQUFJLHlCQUF5QixLQUFLLElBQUksRUFBRyxRQUFPO0FBQ2hELFFBQUkscUJBQXFCLEtBQUssSUFBSSxFQUFHLFFBQU87QUFDNUMsV0FBTztFQUNUO0FBU08sV0FBUyxnQkFDZCxNQUNBLFNBQXNCLGtCQUFrQixJQUFJLEdBQ3BDO0FBQ1IsUUFBSSxXQUFXLE9BQVEsUUFBTztBQUM5QixRQUFJLFVBQVU7QUFDZCxRQUFJLFdBQVcsZUFBZTtBQUc1QixZQUFNLFVBQVUsb0JBQW9CLEtBQUssT0FBTztBQUNoRCxVQUFJLFVBQVUsQ0FBQyxNQUFNLE9BQVcsV0FBVSxRQUFRLENBQUM7SUFDckQsT0FBTztBQUNMLGdCQUFVLFFBQ1AsUUFBUSxxQkFBcUIsRUFBRSxFQUMvQixRQUFRLFlBQVksRUFBRSxFQUN0QixRQUFRLGFBQWEsRUFBRSxFQUN2QixRQUFRLGlCQUFpQixFQUFFLEVBQzNCLFFBQVEsWUFBWSxFQUFFO0lBQzNCO0FBQ0EsV0FBTyxRQUNKLFFBQVEsaUJBQWlCLG1CQUFtQixFQUM1QyxRQUFRLGlCQUFpQixtQkFBbUI7RUFDakQ7QUFHQSxXQUFTLG9CQUFvQixRQUFnQixTQUFrQixRQUF5QjtBQUN0RixVQUFNLFFBQVEsV0FBVyxVQUFVLElBQ2hDLE1BQU0sR0FBRyxFQUNULElBQUksQ0FBQyxnQkFBZ0IsWUFBWSxLQUFBLENBQU0sRUFDdkM7TUFDQyxDQUFDLGdCQUNDLFlBQVksU0FBUyxLQUNyQixDQUFDLGdCQUFnQixLQUFLLFdBQVcsS0FDakMsQ0FBQyxjQUFjLEtBQUssV0FBVztJQUFBO0FBRXJDLFdBQU8sS0FBSyxTQUFTLElBQUksV0FBVyxLQUFLLEtBQUssSUFBSSxDQUFDLE1BQU07RUFDM0Q7QUFHQSxXQUFTLG9CQUNQLFFBQ0EsU0FDQSxRQUNBLE1BQ1E7QUFDUixVQUFNLFFBQVEsV0FBVyxVQUFVLFFBQVEsSUFDeEMsTUFBTSxLQUFLLEVBQ1gsT0FBTyxDQUFDLFNBQVMsS0FBSyxTQUFTLEtBQUssQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDO0FBQ3pELFdBQU8sS0FBSyxTQUFTLElBQUksV0FBVyxLQUFLLEtBQUssR0FBRyxDQUFDLE1BQU07RUFDMUQ7QUVoRkEsTUFBTSxrQkFDSjtBQUdLLFdBQVMsZ0JBQWdCRSxXQUFvQixVQUE0QixDQUFBLEdBQWU7QUFDN0YsVUFBTSxlQUFlLFFBQVEsZ0JBQWdCO0FBRTdDLFVBQU0sT0FBT0EsVUFBUyxjQUFjLEtBQUs7QUFDekMsU0FBSyxZQUFZO0FBQ2pCLFNBQUssYUFBYSxTQUFTLGVBQWU7QUFLMUMsVUFBTSxVQUFpRDtNQUNyRCxRQUFRLE9BQU9BLFdBQVUsUUFBUTtNQUNqQyxXQUFXLE9BQU9BLFdBQVUsV0FBVztJQUFBO0FBRXpDLFNBQUssT0FBTyxRQUFRLFFBQVEsUUFBUSxTQUFTO0FBQzVDLEtBQUMsUUFBUSxhQUFhQSxVQUFTLE9BQU8sWUFBWSxJQUFJO0FBRXZELFFBQUksUUFBOEM7QUFFbEQsV0FBTztNQUNMLFNBQVM7TUFDVCxTQUFTLFNBQVMsV0FBVyxVQUFVO0FBQ3JDLGNBQU0sT0FBTyxRQUFRLEtBQUE7QUFDckIsWUFBSSxDQUFDLEtBQU07QUFDWCxjQUFNLFNBQVMsUUFBUSxRQUFRLEtBQUssUUFBUTtBQUM1QyxZQUFJLFVBQVUsS0FBTSxjQUFhLEtBQUs7QUFJdEMsZUFBTyxjQUFjO0FBQ3JCLGVBQU8sY0FBYztBQUNyQixnQkFBUSxXQUFXLE1BQU07QUFDdkIsaUJBQU8sY0FBYztBQUNyQixrQkFBUTtRQUNWLEdBQUcsWUFBWTtNQUNqQjtNQUNBLFFBQVE7QUFDTixZQUFJLFVBQVUsS0FBTSxjQUFhLEtBQUs7QUFDdEMsZ0JBQVE7QUFDUixnQkFBUSxPQUFPLGNBQWM7QUFDN0IsZ0JBQVEsVUFBVSxjQUFjO01BQ2xDO01BQ0EsVUFBVTtBQUNSLFlBQUksVUFBVSxLQUFNLGNBQWEsS0FBSztBQUN0QyxnQkFBUTtBQUNSLGFBQUssT0FBQTtNQUNQO0lBQUE7RUFFSjtBQUVBLFdBQVMsT0FBT0EsV0FBb0IsVUFBeUM7QUFDM0UsVUFBTSxVQUFVQSxVQUFTLGNBQWMsS0FBSztBQUM1QyxZQUFRLGFBQWEsYUFBYSxRQUFRO0FBRzFDLFlBQVEsYUFBYSxlQUFlLE1BQU07QUFDMUMsWUFBUSxhQUFhLFFBQVEsYUFBYSxjQUFjLFVBQVUsUUFBUTtBQUMxRSxXQUFPO0VBQ1Q7QUFHQSxXQUFTLE1BQU0sR0FBVyxVQUEwQjtBQUNsRCxXQUFPLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxNQUFNLElBQUksS0FBSyxHQUFHO0VBQzlDO0FBV08sV0FBUyxrQkFDZCxRQUNBLE9BQ0EsaUJBQ0EsZ0JBQ2U7QUFDZixVQUFNLFVBQVUsT0FBTyxhQUFhLE1BQU07QUFDMUMsUUFBSSxVQUFVLEVBQUcsUUFBTyxHQUFHLE1BQU0sU0FBUyxPQUFPLENBQUM7QUFDbEQsUUFBSSxtQkFBbUIsa0JBQWtCLG9CQUFvQixnQkFBZ0I7QUFDM0UsYUFBTyxhQUFhLGNBQWM7SUFDcEM7QUFDQSxXQUFPO0VBQ1Q7QUFHQSxXQUFTLGFBQWEsTUFBc0I7QUFDMUMsVUFBTSxTQUFTLEtBQUssUUFBUSxzQkFBc0IsT0FBTyxFQUFFLFlBQUE7QUFDM0QsV0FBTyxPQUFPLE9BQU8sQ0FBQyxFQUFFLFlBQUEsSUFBZ0IsT0FBTyxNQUFNLENBQUM7RUFDeEQ7QUNqSUEsTUFBTSxZQUFZO0FBQ2xCLE1BQU0sZUFBZTtBQUdyQixXQUFTLGFBQWEsTUFBZ0M7QUFDcEQsUUFBSSxLQUFLLGFBQWEsYUFBYyxRQUFPO0FBQzNDLFVBQU0sVUFBVyxLQUFxQjtBQUN0QyxXQUFPLFFBQVEsd0JBQXdCLFVBQVUsUUFBUSxtQkFBbUI7RUFDOUU7QUFHQSxXQUFTLFFBQVEsVUFBdUIsTUFBMEM7QUFDaEYsV0FBTyxTQUFTLFFBQVEsSUFBSSxJQUFJLEtBQUs7RUFDdkM7QUFHQSxXQUFTLGNBQWMsVUFBdUIsTUFBK0I7QUFDM0UsUUFBSSxLQUFLLGFBQWEsVUFBVyxTQUFRLEtBQUssZUFBZSxJQUFJO0FBQ2pFLFFBQUksYUFBYSxJQUFJLEVBQUcsUUFBTztBQUMvQixVQUFNLFFBQVEsUUFBUSxVQUFVLElBQUk7QUFDcEMsUUFBSSxTQUFTLENBQUMsTUFBTSxPQUFRLFFBQU87QUFFbkMsUUFBSSxPQUFPO0FBQ1gsZUFBVyxTQUFTLENBQUMsR0FBRyxLQUFLLFVBQVUsRUFBRyxTQUFRLGNBQWMsVUFBVSxLQUFLO0FBQy9FLFdBQU87RUFDVDtBQU1PLFdBQVMscUJBQ2QsTUFDQSxVQUNBLFNBQ0EsV0FDaUI7QUFFakIsUUFBSSxlQUFtQztBQUN2QyxhQUNNLFVBQWtDLFNBQ3RDLFdBQVcsWUFBWSxLQUFLLFlBQzVCLFVBQVUsUUFBUSxZQUNsQjtBQUNBLFlBQU0sUUFBUSxRQUFRLGFBQWEsZUFBZSxRQUFRLFVBQVUsT0FBTyxJQUFJO0FBQy9FLFVBQUksT0FBTyxhQUFhO0FBQ3RCLHVCQUFlO0FBQ2Y7TUFDRjtBQUNBLFVBQUksWUFBWSxLQUFNO0lBQ3hCO0FBQ0EsUUFBSSxDQUFDLGNBQWM7QUFHakIsYUFBTyxvQkFBb0IsTUFBTSxVQUFVLFNBQVMsU0FBUztJQUMvRDtBQUVBLFVBQU0sT0FBTyxjQUFjLE1BQU0sVUFBVSxZQUFZO0FBQ3ZELFFBQUksQ0FBQyxLQUFNLFFBQU87QUFFbEIsVUFBTSxVQUFVLFNBQVMsaUJBQWlCLFlBQVk7QUFDdEQsVUFBTSxTQUFTLGVBQWUsVUFBVSxTQUFTLFNBQVMsU0FBUztBQUNuRSxXQUFPLFdBQVcsT0FBTyxPQUFPLEVBQUUsTUFBTSxPQUFBO0VBQzFDO0FBT0EsV0FBUyxvQkFDUCxNQUNBLFVBQ0EsV0FDQSxPQUNpQjtBQUNqQixRQUFJLFVBQVUsYUFBYSxhQUFjLFFBQU87QUFDaEQsVUFBTSxXQUFXLENBQUMsR0FBSSxVQUEwQixRQUFRLEVBQUU7TUFBTyxDQUFDLFVBQ2hFLFNBQVMsUUFBUSxJQUFJLEtBQUs7SUFBQTtBQUU1QixRQUFJLFNBQVMsV0FBVyxFQUFHLFFBQU87QUFFbEMsVUFBTSxRQUFRLFNBQVMsU0FBUztBQUNoQyxVQUFNLFNBQVMsU0FBUyxLQUFLLElBQUksT0FBTyxTQUFTLFNBQVMsQ0FBQyxDQUFDO0FBQzVELFFBQUksQ0FBQyxPQUFRLFFBQU87QUFFcEIsVUFBTSxVQUFVLENBQUMsWUFBMEM7QUFDekQsWUFBTSxRQUFRLFNBQVMsUUFBUSxJQUFJLE9BQU87QUFDMUMsVUFBSSxPQUFPLGFBQWE7QUFDdEIsY0FBTSxPQUFPLGNBQWMsTUFBTSxVQUFVLE9BQU87QUFDbEQsWUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixlQUFPLEVBQUUsTUFBTSxRQUFRLFFBQVEsYUFBYSxNQUFNLE9BQU8sSUFBSSxFQUFBO01BQy9EO0FBQ0EsWUFBTSxVQUFVLFNBQVMsaUJBQWlCLE9BQU87QUFDakQsWUFBTSxTQUFTLENBQUMsR0FBRyxRQUFRLFFBQVEsRUFBRTtRQUFPLENBQUMsVUFDM0MsU0FBUyxRQUFRLElBQUksS0FBSztNQUFBO0FBRTVCLFlBQU0sT0FBTyxRQUFRLE9BQU8sT0FBTyxTQUFTLENBQUMsSUFBSSxPQUFPLENBQUM7QUFDekQsYUFBTyxPQUFPLFFBQVEsSUFBSSxJQUFJO0lBQ2hDO0FBQ0EsV0FBTyxRQUFRLE1BQU07RUFDdkI7QUFHTyxXQUFTLGNBQ2QsTUFDQSxVQUNBLFNBQ2lCO0FBQ2pCLFVBQU0sT0FBaUIsQ0FBQTtBQUN2QixRQUFJLFVBQXVCO0FBQzNCLFdBQU8sWUFBWSxNQUFNO0FBQ3ZCLFlBQU0sU0FBUyxRQUFRO0FBQ3ZCLFVBQUksQ0FBQyxPQUFRLFFBQU87QUFFcEIsVUFBSSxRQUFRO0FBQ1osVUFBSSxRQUFRO0FBQ1osaUJBQVcsV0FBVyxDQUFDLEdBQUcsT0FBTyxRQUFRLEdBQUc7QUFDMUMsWUFBSSxZQUFZLFNBQVM7QUFDdkIsa0JBQVE7QUFDUjtRQUNGO0FBQ0EsWUFBSSxTQUFTLFFBQVEsSUFBSSxPQUFPLEVBQUc7TUFDckM7QUFDQSxVQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLFdBQUssUUFBUSxLQUFLO0FBQ2xCLFVBQUksU0FBUyxRQUFRLElBQUksTUFBTSxLQUFLLFdBQVcsTUFBTTtBQUNuRCxrQkFBVTtNQUNaLE9BQU87QUFFTCxjQUFNLFFBQVEsT0FBTztBQUNyQixZQUFJLENBQUMsTUFBTyxRQUFPO0FBQ25CLGtCQUFVO01BQ1o7SUFDRjtBQUNBLFdBQU87RUFDVDtBQUdBLFdBQVMsZUFDUCxVQUNBLFNBQ0EsWUFDQSxjQUNlO0FBQ2YsUUFBSSxlQUFlLFdBQVcsV0FBVyxhQUFhLGNBQWM7QUFFbEUsVUFBSSxlQUFlLFdBQVcsUUFBUSxTQUFTLFVBQVUsR0FBRztBQUMxRCxZQUFJLE1BQU07QUFDVixZQUFJLGVBQWUsU0FBUztBQUUxQixnQkFBTUMsVUFBUyxrQkFBa0IsVUFBVSxTQUFTLFVBQVU7QUFDOUQsY0FBSUEsWUFBVyxLQUFNLFFBQU87QUFDNUIsZ0JBQU1BO1FBQ1I7QUFDQSxjQUFNLFdBQVcsQ0FBQyxHQUFHLFdBQVcsVUFBVTtBQUMxQyxpQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLElBQUksY0FBYyxTQUFTLE1BQU0sR0FBRyxLQUFLO0FBQ2hFLGlCQUFPLGNBQWMsVUFBVSxTQUFTLENBQUMsQ0FBb0I7UUFDL0Q7QUFDQSxlQUFPO01BQ1Q7QUFDQSxhQUFPO0lBQ1Q7QUFFQSxVQUFNLFNBQVMsa0JBQWtCLFVBQVUsU0FBUyxVQUFVO0FBQzlELFdBQU8sV0FBVyxPQUFPLE9BQU8sU0FBUztFQUMzQztBQUdBLFdBQVMsa0JBQ1AsVUFDQSxTQUNBLFFBQ2U7QUFDZixRQUFJLE1BQU07QUFDVixRQUFJLFFBQVE7QUFDWixVQUFNLE9BQU8sQ0FBQyxTQUFnQztBQUM1QyxVQUFJLE1BQU87QUFDWCxVQUFJLFNBQVMsUUFBUTtBQUNuQixnQkFBUTtBQUNSO01BQ0Y7QUFDQSxVQUFJLEtBQUssYUFBYSxXQUFXO0FBQy9CLGdCQUFRLEtBQUssZUFBZSxJQUFJO0FBQ2hDO01BQ0Y7QUFDQSxVQUFJLGFBQWEsSUFBSSxFQUFHO0FBQ3hCLFlBQU0sUUFBUSxTQUFTLFVBQVUsUUFBUSxVQUFVLElBQUksSUFBSTtBQUMzRCxVQUFJLFNBQVMsQ0FBQyxNQUFNLFVBQVUsU0FBUyxTQUFTO0FBQzlDLGVBQU87QUFDUDtNQUNGO0FBQ0EsaUJBQVcsU0FBUyxDQUFDLEdBQUcsS0FBSyxVQUFVLEdBQUc7QUFDeEMsYUFBSyxLQUFLO0FBQ1YsWUFBSSxNQUFPO01BQ2I7SUFDRjtBQUNBLFNBQUssT0FBTztBQUNaLFdBQU8sUUFBUSxNQUFNO0VBQ3ZCO0FBTU8sV0FBUyxxQkFDZCxNQUNBLFVBQ0EsVUFDaUI7QUFFakIsUUFBSSxVQUF1QjtBQUMzQixlQUFXLFNBQVMsU0FBUyxNQUFNO0FBQ2pDLFlBQU0sV0FBVyxDQUFDLEdBQUcsU0FBUyxpQkFBaUIsT0FBTyxFQUFFLFFBQVEsRUFBRTtRQUFPLENBQUMsVUFDeEUsU0FBUyxRQUFRLElBQUksS0FBSztNQUFBO0FBRTVCLFlBQU0sT0FBTyxTQUFTLEtBQUs7QUFDM0IsVUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixnQkFBVTtJQUNaO0FBQ0EsVUFBTSxRQUFRLFNBQVMsUUFBUSxJQUFJLE9BQU87QUFDMUMsUUFBSSxDQUFDLE9BQU8sYUFBYTtBQUV2QixZQUFNQyxXQUFVLFNBQVMsaUJBQWlCLE9BQU87QUFDakQsYUFBTyxFQUFFLE1BQU1BLFVBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxRQUFRQSxTQUFRLFdBQVcsTUFBTSxFQUFBO0lBQ3JGO0FBRUEsVUFBTSxVQUFVLFNBQVMsaUJBQWlCLE9BQU87QUFDakQsUUFBSSxZQUFZLFNBQVM7QUFDekIsUUFBSSxTQUEwQjtBQUM5QixVQUFNLE9BQU8sQ0FBQyxTQUFtQztBQUMvQyxVQUFJLEtBQUssYUFBYSxXQUFXO0FBQy9CLGNBQU0sVUFBVSxLQUFLLGVBQWUsSUFBSTtBQUN4QyxZQUFJLGFBQWEsUUFBUTtBQUN2QixtQkFBUyxFQUFFLE1BQU0sUUFBUSxVQUFBO0FBQ3pCLGlCQUFPO1FBQ1Q7QUFDQSxxQkFBYTtBQUNiLGVBQU87TUFDVDtBQUNBLFVBQUksYUFBYSxJQUFJLEVBQUcsUUFBTztBQUMvQixZQUFNLFlBQVksU0FBUyxVQUFVLFFBQVEsVUFBVSxJQUFJLElBQUk7QUFDL0QsVUFBSSxhQUFhLENBQUMsVUFBVSxRQUFRO0FBQ2xDLFlBQUksY0FBYyxHQUFHO0FBQ25CLGdCQUFNLFNBQVMsS0FBSztBQUNwQixnQkFBTSxRQUFRLENBQUMsR0FBRyxPQUFPLFVBQVUsRUFBRSxRQUFRLElBQWlCO0FBQzlELG1CQUFTLEVBQUUsTUFBTSxRQUFRLFFBQVEsTUFBQTtBQUNqQyxpQkFBTztRQUNUO0FBQ0EscUJBQWE7QUFDYixlQUFPO01BQ1Q7QUFDQSxpQkFBVyxTQUFTLENBQUMsR0FBRyxLQUFLLFVBQVUsR0FBRztBQUN4QyxZQUFJLEtBQUssS0FBSyxFQUFHLFFBQU87TUFDMUI7QUFDQSxhQUFPO0lBQ1Q7QUFDQSxRQUFJLEtBQUssT0FBTyxLQUFLLE9BQVEsUUFBTztBQUVwQyxXQUFPLEVBQUUsTUFBTSxTQUFTLFFBQVEsUUFBUSxXQUFXLE9BQUE7RUFDckQ7QUNsUU8sV0FBUyxpQkFBaUIsTUFBYyxPQUF3QjtBQUNyRSxVQUFNLFFBQVEsS0FBSyxNQUFNLEdBQUc7QUFDNUIsVUFBTSxNQUFNLE1BQU0sSUFBQSxLQUFTO0FBQzNCLFFBQUksT0FBTztBQUNYLGVBQVcsUUFBUSxPQUFPO0FBQ3hCLFlBQU0sUUFBUSxLQUFLLFlBQUE7QUFDbkIsVUFBSSxVQUFVLE1BQU8sU0FBUSxRQUFRLE1BQU07ZUFDbEMsVUFBVSxVQUFVLFVBQVUsVUFBVyxTQUFRO2VBQ2pELFVBQVUsVUFBVSxVQUFVLE1BQU8sU0FBUTtlQUM3QyxVQUFVLE1BQU8sU0FBUTtlQUN6QixVQUFVLFFBQVMsU0FBUTtVQUFBLE9BQ3pCLElBQUksV0FBVyxxQkFBcUIsSUFBSSxxQkFBcUIsSUFBSSxHQUFHO0lBQ2pGO0FBQ0EsV0FBTyxHQUFHLENBQUMsR0FBRyxJQUFJLEVBQUUsS0FBQSxFQUFPLEtBQUssRUFBRSxDQUFDLElBQUksSUFBSSxXQUFXLElBQUksSUFBSSxZQUFBLElBQWdCLEdBQUc7RUFDbkY7QUFFQSxXQUFTLGFBQWEsT0FBOEI7QUFDbEQsUUFBSSxPQUFPO0FBQ1gsUUFBSSxNQUFNLE9BQVEsU0FBUTtBQUMxQixRQUFJLE1BQU0sUUFBUyxTQUFRO0FBQzNCLFFBQUksTUFBTSxRQUFTLFNBQVE7QUFDM0IsUUFBSSxNQUFNLFNBQVUsU0FBUTtBQUM1QixVQUFNLE1BQU0sTUFBTSxJQUFJLFdBQVcsSUFBSSxNQUFNLElBQUksWUFBQSxJQUFnQixNQUFNO0FBQ3JFLFdBQU8sR0FBRyxDQUFDLEdBQUcsSUFBSSxFQUFFLEtBQUEsRUFBTyxLQUFLLEVBQUUsQ0FBQyxJQUFJLEdBQUc7RUFDNUM7QUFNTyxXQUFTLGVBQ2QsVUFDQUMsU0FDQSxPQUNtQztBQUNuQyxVQUFNLGFBQUEsb0JBQWlCLElBQUE7QUFDdkIsZUFBVyxDQUFDLE1BQU0sT0FBTyxLQUFLLE9BQU8sUUFBUSxRQUFRLEdBQUc7QUFDdEQsaUJBQVcsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLEdBQUcsT0FBTztJQUN2RDtBQUNBLFdBQU8sQ0FBQyxVQUFVO0FBQ2hCLFlBQU0sVUFBVSxXQUFXLElBQUksYUFBYSxLQUFLLENBQUM7QUFDbEQsVUFBSSxDQUFDLFFBQVMsUUFBTztBQUNyQixhQUFPLFFBQVFBLE9BQU07SUFDdkI7RUFDRjtBQUdPLFdBQVMsYUFBcUI7QUFDbkMsV0FBTztNQUNMLFNBQVMsQ0FBQ0EsWUFBV0EsUUFBTyxTQUFTLFdBQVcsTUFBTTtNQUN0RCxTQUFTLENBQUNBLFlBQVdBLFFBQU8sU0FBUyxXQUFXLFFBQVE7TUFDeEQsU0FBUyxDQUFDQSxZQUFXQSxRQUFPLFNBQVMsV0FBVyxXQUFXO01BQzNELFNBQVMsQ0FBQ0EsWUFBV0EsUUFBTyxTQUFTLFdBQVcsTUFBTTtNQUN0RCxTQUFTLENBQUNBLFlBQVdBLFFBQU8sU0FBUyxLQUFBLEtBQVU7TUFDL0MsZUFBZSxDQUFDQSxZQUFXQSxRQUFPLFNBQVMsS0FBQSxLQUFVO01BQ3JELFNBQVMsQ0FBQ0EsWUFBV0EsUUFBTyxTQUFTLEtBQUEsS0FBVTs7OztNQUkvQyxLQUFLLENBQUNBLFlBQVdBLFFBQU8sS0FBSyxvQkFBb0IsS0FBS0EsUUFBTyxTQUFTLGFBQUE7TUFDdEUsYUFBYSxDQUFDQSxZQUFXQSxRQUFPLEtBQUsscUJBQXFCLEtBQUtBLFFBQU8sU0FBUyxhQUFBOztNQUUvRSxhQUFhLENBQUNBLFlBQVdBLFFBQU8sS0FBSyxnQkFBZ0I7SUFBQTtFQUV6RDtBQzlDQSxXQUFTLGNBQ1AsR0FDQSxHQUNTO0FBQ1QsUUFBSSxNQUFNLEVBQUcsUUFBTztBQUNwQixRQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsT0FBUSxRQUFPO0FBQzlDLFdBQU8sRUFBRSxNQUFNLENBQUMsWUFBWSxNQUFNO0FBQ2hDLFlBQU0sUUFBUSxFQUFFLENBQUM7QUFDakIsYUFDRSxXQUFXLFNBQVMsTUFBTSxRQUMxQixXQUFXLE9BQU8sTUFBTSxNQUN4QixXQUFXLGNBQWMsTUFBTSxhQUMvQixXQUFXLFVBQVUsTUFBTSxTQUMzQixVQUFVLFdBQVcsT0FBTyxNQUFNLEtBQUssS0FDdkMsV0FBVyxXQUFXLE1BQU07SUFFaEMsQ0FBQztFQUNIO0FBR0EsV0FBUyxVQUNQLEdBQ0EsR0FDUztBQUNULFFBQUksTUFBTSxFQUFHLFFBQU87QUFDcEIsUUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDckIsVUFBTSxPQUFPLE9BQU8sS0FBSyxDQUFDO0FBQzFCLFdBQU8sS0FBSyxXQUFXLE9BQU8sS0FBSyxDQUFDLEVBQUUsVUFBVSxLQUFLLE1BQU0sQ0FBQyxRQUFRLEVBQUUsR0FBRyxNQUFNLEVBQUUsR0FBRyxDQUFDO0VBQ3ZGO0FBNEJPLE1BQU0sY0FBTixNQUFrQjtJQWF2QixZQUNtQkgsV0FDQSxZQUEyRCxDQUFBLEdBQzVFO0FBRmlCLFdBQUEsV0FBQUE7QUFDQSxXQUFBLFlBQUE7SUFDaEI7SUFGZ0I7SUFDQTs7SUFiVixVQUFBLG9CQUFjLFFBQUE7O0lBRU4sWUFBQSxvQkFBZ0IsUUFBQTs7SUFFekIsUUFBUTtJQUNDLGdCQUFBLG9CQUFvQixRQUFBO0lBQzdCLGNBQXVDOztJQUU5QixzQkFBQSxvQkFBMEIsUUFBQTtJQUMxQixZQUFBLG9CQUFnQixRQUFBOztJQVFqQyxlQUFlLFFBQXVDO0FBQ3BELFdBQUssY0FBYztBQUNuQixXQUFLO0lBQ1A7O0lBR0EsVUFBVSxLQUFpQixNQUF5QjtBQUNsRCxXQUFLLFFBQVEsSUFBSSxNQUFNLEdBQUc7QUFDMUIsV0FBSyxVQUFVLElBQUksTUFBTSxJQUFJO0FBQzdCLFdBQUssY0FBYyxNQUFNLElBQUksT0FBTztJQUN0Qzs7SUFHQSxpQkFBaUIsU0FBbUM7QUFDbEQsYUFBTyxLQUFLLFVBQVUsSUFBSSxPQUFPLEtBQUs7SUFDeEM7SUFFUSxVQUFVLFNBQStCO0FBQy9DLGFBQU8sS0FBSyxjQUFjLElBQUksT0FBTyxNQUFNLEtBQUs7SUFDbEQ7O0lBR0EsYUFBYSxTQUE0QjtBQUN2QyxXQUFLLFVBQVUsSUFBSSxPQUFPLEdBQUcsVUFBQTtBQUM3QixpQkFBVyxTQUFTLENBQUMsR0FBRyxRQUFRLFFBQVEsRUFBRyxNQUFLLGFBQWEsS0FBb0I7SUFDbkY7SUFFUSxZQUFZLE1BQStCO0FBQ2pELFlBQU0sWUFBWSxLQUFLLFVBQVUsS0FBSyxLQUFLLElBQUk7QUFDL0MsVUFBSSxXQUFXO0FBQ2IsY0FBTSxXQUFXLFVBQVUsSUFBSTtBQUMvQixjQUFNSSxXQUFVLFNBQVM7QUFDekIsYUFBSyxRQUFRLElBQUlBLFVBQVMsSUFBSTtBQUM5QixhQUFLLFVBQVUsSUFBSUEsVUFBUyxTQUFTLGNBQWNBLFFBQU87QUFDMUQsYUFBSyxjQUFjLElBQUlBLFVBQVMsS0FBSyxLQUFLO0FBQzFDLGFBQUssVUFBVSxJQUFJQSxVQUFTLFFBQVE7QUFDcEMsWUFBSSxTQUFTLFlBQVk7QUFDdkIsY0FBSSxLQUFLLFlBQWEsTUFBSyxhQUFhLFNBQVMsWUFBWSxJQUFJO21CQUN4RCxDQUFDLEtBQUssT0FBUSxNQUFLLGNBQWMsU0FBUyxZQUFZLEtBQUssT0FBTztRQUM3RSxPQUFPO0FBRUxBLG1CQUFRLGtCQUFrQjtRQUM1QjtBQUNBLGVBQU9BO01BQ1Q7QUFDQSxZQUFNLE9BQU8sS0FBSyxLQUFLLEtBQUssU0FBUyxJQUFJO0FBQ3pDLFlBQU0sVUFBVSxLQUFLLFNBQVMsY0FBYyxNQUFNLE9BQU8sS0FBSztBQUM5RCxpQkFBVyxDQUFDLE1BQU0sS0FBSyxLQUFLLE9BQU8sUUFBUSxNQUFNLFNBQVMsQ0FBQSxDQUFFLEdBQUc7QUFDN0QsZ0JBQVEsYUFBYSxNQUFNLEtBQUs7TUFDbEM7QUFDQSxVQUFJLFVBQVU7QUFDZCxVQUFJLE1BQU0sVUFBVTtBQUNsQixrQkFBVSxLQUFLLFNBQVMsY0FBYyxLQUFLLFFBQVE7QUFDbkQsZ0JBQVEsWUFBWSxPQUFPO01BQzdCO0FBQ0EsV0FBSyxRQUFRLElBQUksU0FBUyxJQUFJO0FBQzlCLFdBQUssVUFBVSxJQUFJLFNBQVMsT0FBTztBQUNuQyxXQUFLLGNBQWMsSUFBSSxTQUFTLEtBQUssS0FBSztBQUMxQyxVQUFJLEtBQUssUUFBUTtBQUNmLGdCQUFRLGtCQUFrQjtBQUMxQixhQUFLLGVBQWUsU0FBUyxJQUFJO0FBQ2pDLGVBQU87TUFDVDtBQUNBLFVBQUksS0FBSyxhQUFhO0FBQ3BCLGFBQUssYUFBYSxTQUFTLElBQUk7TUFDakMsT0FBTztBQUNMLGFBQUssY0FBYyxTQUFTLEtBQUssT0FBTztNQUMxQztBQUNBLGFBQU87SUFDVDs7SUFHUSxhQUFhLFNBQXNCLE9BQXlCO0FBQ2xFLGFBQU8sUUFBUSxXQUFZLFNBQVEsWUFBWSxRQUFRLFVBQVU7QUFDakUsWUFBTSxPQUFPLE1BQU07QUFDbkIsWUFBTSxjQUFjLEtBQUssY0FBYyxLQUFLLEtBQUssQ0FBQTtBQUNqRCxXQUFLLG9CQUFvQixJQUFJLFNBQVMsV0FBVztBQUNqRCxZQUFNLFNBQVMsWUFBWSxPQUFPLENBQUMsZUFBZSxXQUFXLEtBQUssV0FBVyxJQUFJO0FBQ2pGLFlBQU0sVUFBVSxZQUNiLE9BQU8sQ0FBQyxlQUFlLFdBQVcsTUFBTSxFQUN4QyxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUk7QUFDakMsVUFBSSxjQUFjO0FBQ2xCLFlBQU0sZUFBZSxDQUFDLFNBQXVCO0FBQzNDLGVBQU8sY0FBYyxRQUFRLFFBQVE7QUFDbkMsZ0JBQU0sYUFBYSxRQUFRLFdBQVc7QUFDdEMsY0FBSSxXQUFXLE9BQU8sS0FBTTtBQUM1QjtBQUNBLGdCQUFNLFVBQVUsS0FBSyxTQUFTLGNBQWMsTUFBTTtBQUNsRCxrQkFBUSxZQUFZLFdBQVc7QUFDL0IsY0FBSSxXQUFXLE1BQU8sU0FBUSxhQUFhLFNBQVMsV0FBVyxLQUFLO0FBQ3BFLHFCQUFXLENBQUMsTUFBTSxLQUFLLEtBQUssT0FBTyxRQUFRLFdBQVcsU0FBUyxDQUFBLENBQUUsR0FBRztBQUNsRSxvQkFBUSxhQUFhLE1BQU0sS0FBSztVQUNsQztBQUNBLGtCQUFRLGtCQUFrQjtBQUMxQixrQkFBUSxRQUFRLGlCQUFpQjtBQUNqQyxnQkFBTSxRQUFRLFdBQVcsU0FBQTtBQUN6QixjQUFJLE1BQU8sU0FBUSxZQUFZLEtBQUs7QUFDcEMsa0JBQVEsWUFBWSxPQUFPO1FBQzdCO01BQ0Y7QUFDQSxVQUFJLFNBQVM7QUFDYixpQkFBVyxTQUFTLEtBQUssVUFBVTtBQUNqQyxjQUFNLE9BQU8sV0FBVyxLQUFLO0FBQzdCLFlBQUksQ0FBQyxNQUFNLFFBQVE7QUFDakIsdUJBQWEsTUFBTTtBQUNuQixnQkFBTSxPQUFPLE1BQU0sS0FBSyxLQUFLLFNBQVMsS0FBSztBQUMzQyxnQkFBTSxPQUFPLEtBQUssU0FBUyxjQUFjLE1BQU0sT0FBTyxNQUFNO0FBQzVELHFCQUFXLENBQUMsTUFBTSxLQUFLLEtBQUssT0FBTyxRQUFRLE1BQU0sU0FBUyxDQUFBLENBQUUsR0FBRztBQUM3RCxpQkFBSyxhQUFhLE1BQU0sS0FBSztVQUMvQjtBQUNBLGNBQUksTUFBTSxjQUFjLFVBQWEsTUFBTSxNQUFNO0FBQy9DLGlCQUFLLGVBQWUsTUFBTSxJQUFJO0FBQzlCLGlCQUFLLGtCQUFrQjtVQUN6QjtBQUNBLGVBQUssUUFBUSxJQUFJLE1BQU0sS0FBSztBQUM1QixrQkFBUSxZQUFZLElBQUk7QUFDeEIsb0JBQVU7QUFDVjtRQUNGO0FBQ0EsY0FBTSxPQUFPO0FBQ2IsbUJBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxhQUFhLFFBQVEsU0FBUyxNQUFNLFdBQVcsR0FBRztBQUN6RSx1QkFBYSxJQUFJO0FBQ2pCLGdCQUFNLFFBQVEsS0FBSyxJQUFJLE9BQU8sUUFBUSxLQUFLLE1BQU07QUFDakQsZ0JBQU0sV0FBVyxLQUFLLGNBQWMsS0FBSztBQUN6QyxnQkFBTSxXQUFXLE9BQU87WUFDdEIsQ0FBQyxlQUFlLFdBQVcsUUFBUSxRQUFRLFdBQVcsTUFBTTtVQUFBO0FBRTlELGNBQUksU0FBUyxTQUFTLEdBQUc7QUFDdkIsa0JBQU0sT0FBTyxLQUFLLFNBQVMsY0FBYyxNQUFNO0FBQy9DLGlCQUFLLFlBQVksU0FBUyxJQUFJLENBQUMsZUFBZSxXQUFXLFNBQVMsRUFBRSxLQUFLLEdBQUc7QUFDNUUsa0JBQU0sUUFBUSxTQUNYLElBQUksQ0FBQyxlQUFlLFdBQVcsS0FBSyxFQUNwQyxPQUFPLE9BQU8sRUFDZCxLQUFLLEdBQUc7QUFDWCxnQkFBSSxNQUFPLE1BQUssYUFBYSxTQUFTLEtBQUs7QUFDM0MsdUJBQVcsY0FBYyxVQUFVO0FBQ2pDLHlCQUFXLENBQUMsTUFBTSxLQUFLLEtBQUssT0FBTyxRQUFRLFdBQVcsU0FBUyxDQUFBLENBQUUsR0FBRztBQUNsRSxxQkFBSyxhQUFhLE1BQU0sS0FBSztjQUMvQjtZQUNGO0FBQ0EsaUJBQUssWUFBWSxRQUFRO0FBQ3pCLG9CQUFRLFlBQVksSUFBSTtVQUMxQixPQUFPO0FBQ0wsb0JBQVEsWUFBWSxRQUFRO1VBQzlCO1FBQ0Y7QUFDQSxrQkFBVTtNQUNaO0FBQ0EsbUJBQWEsTUFBTTtBQUNuQixVQUFJLEtBQUssZUFBZSxHQUFHO0FBRXpCLGNBQU0sS0FBSyxLQUFLLFNBQVMsY0FBYyxJQUFJO0FBQzNDLFdBQUcsUUFBUSxzQkFBc0I7QUFDakMsZ0JBQVEsWUFBWSxFQUFFO01BQ3hCO0lBQ0Y7SUFFUSxjQUFjLE1BQWlDO0FBQ3JELFVBQUksV0FBNEIsS0FBSyxTQUFTLGVBQWUsS0FBSyxJQUFJO0FBQ3RFLFdBQUssUUFBUSxJQUFJLFVBQVUsSUFBSTtBQUMvQixlQUFTLElBQUksS0FBSyxNQUFNLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUMvQyxjQUFNLE9BQU8sS0FBSyxNQUFNLENBQUM7QUFDekIsY0FBTSxPQUFPLEtBQUssS0FBSyxLQUFLLFNBQVMsSUFBSTtBQUN6QyxZQUFJLENBQUMsS0FBTTtBQUNYLGNBQU0sVUFBVSxLQUFLLFNBQVMsY0FBYyxLQUFLLEdBQUc7QUFDcEQsbUJBQVcsQ0FBQyxNQUFNLEtBQUssS0FBSyxPQUFPLFFBQVEsS0FBSyxTQUFTLENBQUEsQ0FBRSxHQUFHO0FBQzVELGtCQUFRLGFBQWEsTUFBTSxLQUFLO1FBQ2xDO0FBQ0EsZ0JBQVEsWUFBWSxRQUFRO0FBQzVCLG1CQUFXO01BQ2I7QUFDQSxhQUFPO0lBQ1Q7O0lBR1EsY0FBYyxRQUFxQixNQUFzQjtBQUMvRCxZQUFNLGNBQWMsQ0FBQyxHQUFHLE9BQU8sUUFBUTtBQUN2QyxZQUFNLFdBQVcsWUFBWSxJQUFJLENBQUMsWUFBWSxLQUFLLFFBQVEsSUFBSSxPQUFPLEtBQUssSUFBSTtBQUMvRSxZQUFNLE9BQU8sS0FBSztBQUVsQixZQUFNLFlBQVksQ0FBQyxPQUFlLGFBQThCO0FBQzlELGNBQU0sVUFBVSxZQUFZLEtBQUs7QUFDakMsZUFBTyxZQUFZLFVBQWEsU0FBUyxLQUFLLE1BQU0sS0FBSyxRQUFRLEtBQUssS0FBSyxVQUFVLE9BQU87TUFDOUY7QUFDQSxVQUFJLFFBQVE7QUFDWixhQUFPLFFBQVEsU0FBUyxVQUFVLFFBQVEsS0FBSyxVQUFVLFVBQVUsT0FBTyxLQUFLLEVBQUc7QUFDbEYsVUFBSSxTQUFTLFNBQVM7QUFDdEIsVUFBSSxTQUFTLEtBQUs7QUFDbEIsYUFBTyxTQUFTLFNBQVMsU0FBUyxTQUFTLFVBQVUsU0FBUyxHQUFHLFNBQVMsQ0FBQyxHQUFHO0FBQzVFO0FBQ0E7TUFDRjtBQUlBLFlBQU0sU0FBUyxLQUFLLElBQUksU0FBUyxPQUFPLFNBQVMsS0FBSztBQUN0RCxlQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsS0FBSztBQUMvQixjQUFNLFVBQVUsWUFBWSxRQUFRLENBQUM7QUFDckMsY0FBTSxVQUFVLFNBQVMsUUFBUSxDQUFDO0FBQ2xDLGNBQU0sT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUMzQixZQUFJLENBQUMsV0FBVyxDQUFDLEtBQU07QUFJdkIsY0FBTSxTQUFTLEtBQUssVUFBVSxJQUFJLE9BQU87QUFDekMsY0FBTSxPQUFPLEtBQUssS0FBSyxLQUFLLFNBQVMsSUFBSSxHQUFHLE9BQU8sT0FBTyxZQUFBO0FBQzFELFlBQUksV0FBVyxRQUFRLFNBQVMsS0FBSyxTQUFTLFVBQVUsUUFBUSxZQUFZLE1BQU07QUFDaEYsY0FBSSxDQUFDLEtBQUssYUFBYSxTQUFTLElBQUksR0FBRztBQUNyQyxpQkFBSyxhQUFhLE9BQU87QUFDekIsbUJBQU8sYUFBYSxLQUFLLFlBQVksSUFBSSxHQUFHLE9BQU87VUFDckQ7UUFDRixPQUFPO0FBQ0wsZUFBSyxhQUFhLE9BQU87QUFDekIsaUJBQU8sYUFBYSxLQUFLLFlBQVksSUFBSSxHQUFHLE9BQU87UUFDckQ7TUFDRjtBQUNBLFlBQU0sZUFBZSxZQUFZLE1BQU0sS0FBSztBQUM1QyxlQUFTLElBQUksUUFBUSxRQUFRLElBQUksUUFBUSxLQUFLO0FBQzVDLGNBQU0sT0FBTyxLQUFLLENBQUM7QUFDbkIsWUFBSSxLQUFNLFFBQU8sYUFBYSxLQUFLLFlBQVksSUFBSSxHQUFHLFlBQVk7TUFDcEU7QUFDQSxlQUFTLElBQUksUUFBUSxRQUFRLElBQUksUUFBUSxLQUFLO0FBQzVDLGNBQU0sVUFBVSxZQUFZLENBQUM7QUFDN0IsWUFBSSxDQUFDLFFBQVM7QUFDZCxhQUFLLGFBQWEsT0FBTztBQUN6QixnQkFBUSxPQUFBO01BQ1Y7SUFDRjs7SUFHUSxhQUFhLFNBQXNCLE1BQTJCO0FBQ3BFLFlBQU0sV0FBVyxLQUFLLFFBQVEsSUFBSSxPQUFPO0FBQ3pDLFlBQU0sYUFBYSxLQUFLLFVBQVUsT0FBTztBQUN6QyxVQUFJLGFBQWEsUUFBUSxXQUFZLFFBQU87QUFFNUMsWUFBTSxXQUFXLEtBQUssVUFBVSxJQUFJLE9BQU87QUFDM0MsVUFBSSxVQUFVO0FBQ1osWUFBSSxDQUFDLFNBQVMsVUFBVSxDQUFDLFNBQVMsT0FBTyxJQUFJLEVBQUcsUUFBTztBQUN2RCxhQUFLLFFBQVEsSUFBSSxTQUFTLElBQUk7QUFDOUIsYUFBSyxjQUFjLElBQUksU0FBUyxLQUFLLEtBQUs7QUFDMUMsWUFBSSxTQUFTLGNBQWMsQ0FBQyxLQUFLLFFBQVE7QUFDdkMsY0FBSSxLQUFLLGFBQWE7QUFDcEIsZ0JBQUksS0FBSyxrQkFBa0IsU0FBUyxZQUFZLFVBQVUsWUFBWSxJQUFJLEdBQUc7QUFDM0UsbUJBQUssYUFBYSxTQUFTLFlBQVksSUFBSTtZQUM3QztVQUNGLE9BQU87QUFDTCxpQkFBSyxjQUFjLFNBQVMsWUFBWSxLQUFLLE9BQU87VUFDdEQ7UUFDRjtBQUNBLGVBQU87TUFDVDtBQUVBLFlBQU0sT0FBTyxLQUFLLEtBQUssS0FBSyxTQUFTLElBQUk7QUFDekMsWUFBTSxZQUFZLE1BQU0sU0FBUyxDQUFBO0FBQ2pDLFVBQUksVUFBVTtBQUVaLGNBQU0sV0FBVyxTQUFTLEtBQUssS0FBSyxTQUFTLFFBQVEsR0FBRyxTQUFTLENBQUE7QUFDakUsbUJBQVcsUUFBUSxPQUFPLEtBQUssUUFBUSxHQUFHO0FBQ3hDLGNBQUksRUFBRSxRQUFRLFdBQVksU0FBUSxnQkFBZ0IsSUFBSTtRQUN4RDtNQUNGO0FBQ0EsaUJBQVcsQ0FBQyxNQUFNLEtBQUssS0FBSyxPQUFPLFFBQVEsU0FBUyxHQUFHO0FBT3JELFlBQUksUUFBUSxhQUFhLElBQUksTUFBTSxNQUFPLFNBQVEsYUFBYSxNQUFNLEtBQUs7TUFDNUU7QUFDQSxXQUFLLFFBQVEsSUFBSSxTQUFTLElBQUk7QUFDOUIsV0FBSyxjQUFjLElBQUksU0FBUyxLQUFLLEtBQUs7QUFDMUMsWUFBTSxVQUFVLEtBQUssaUJBQWlCLE9BQU87QUFDN0MsVUFBSSxLQUFLLFFBQVE7QUFFZixjQUFNLGVBQWUsV0FBVyxTQUFTLEtBQUssS0FBSyxTQUFTLFFBQVEsSUFBSTtBQUN4RSxZQUFJLE1BQU0sY0FBYyxjQUFjLGFBQWEsTUFBTSxTQUFTLGNBQWMsTUFBTTtBQUNwRixlQUFLLGVBQWUsU0FBUyxJQUFJO1FBQ25DO01BQ0YsV0FBVyxLQUFLLGFBQWE7QUFDM0IsWUFBSSxLQUFLLGtCQUFrQixTQUFTLFVBQVUsWUFBWSxJQUFJLEdBQUc7QUFDL0QsZUFBSyxhQUFhLFNBQVMsSUFBSTtRQUNqQztNQUNGLE9BQU87QUFDTCxhQUFLLGNBQWMsU0FBUyxLQUFLLE9BQU87TUFDMUM7QUFDQSxhQUFPO0lBQ1Q7O0lBR1EsZUFBZSxTQUFzQixNQUFrQztBQUM3RSxVQUFJLE1BQU0sY0FBYyxPQUFXLFNBQVEsWUFBWSxLQUFLO2VBQ25ELE1BQU0sU0FBUyxPQUFXLFNBQVEsY0FBYyxLQUFLO1VBQUEsU0FHakQsY0FBYztJQUM3Qjs7Ozs7Ozs7SUFTUSxrQkFDTixTQUNBLFVBQ0EsWUFDQSxNQUNTO0FBQ1QsVUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLFFBQVEsR0FBRyxLQUFLLE9BQU8sRUFBRyxRQUFPO0FBRTVELFVBQUksY0FBYyxhQUFhLEtBQU0sUUFBTztBQUM1QyxZQUFNLE9BQU8sS0FBSyxjQUFjLElBQUksS0FBSyxDQUFBO0FBQ3pDLGFBQU8sQ0FBQyxjQUFjLEtBQUssb0JBQW9CLElBQUksT0FBTyxLQUFLLENBQUEsR0FBSSxJQUFJO0lBQ3pFO0VBQ0Y7QUFHQSxXQUFTLGFBQ1AsTUFDQSxJQUNBLGFBQ29CO0FBQ3BCLFVBQU0sT0FBTyxvQkFBSSxJQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7QUFDdkMsZUFBVyxjQUFjLGFBQWE7QUFDcEMsVUFBSSxXQUFXLE9BQU8sUUFBUSxXQUFXLE9BQU8sR0FBSSxNQUFLLElBQUksV0FBVyxJQUFJO0FBQzVFLFVBQUksV0FBVyxLQUFLLFFBQVEsV0FBVyxLQUFLLEdBQUksTUFBSyxJQUFJLFdBQVcsRUFBRTtJQUN4RTtBQUNBLFVBQU0sU0FBUyxDQUFDLEdBQUcsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDO0FBQzdDLFVBQU0sV0FBK0IsQ0FBQTtBQUNyQyxhQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sU0FBUyxHQUFHLEtBQUs7QUFDMUMsZUFBUyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQWEsT0FBTyxJQUFJLENBQUMsQ0FBVyxDQUFDO0lBQzlEO0FBQ0EsV0FBTztFQUNUO0FDdFlBLE1BQU0sZ0JBQWdCO0FBR3RCLE1BQU0sV0FBVztBQXFDakIsV0FBUyxZQUFxQjtBQUM1QixRQUFJLE9BQU8sY0FBYyxZQUFhLFFBQU87QUFDN0MsVUFBTSxXQUFXLFVBQVUsWUFBWTtBQUN2QyxXQUFPLHFCQUFxQixLQUFLLFlBQVksVUFBVSxhQUFhLEVBQUU7RUFDeEU7QUFTQSxNQUFNQyxhQUFZO0FBRVgsTUFBTSxhQUFOLE1BQWlCO0lBcUJ0QixZQUNXRixTQUNULE9BQ0EsVUFBNkIsQ0FBQSxHQUM3QjtBQUhTLFdBQUEsU0FBQUE7QUFJVCxXQUFLLFdBQVcsTUFBTTtBQUN0QixXQUFLLE1BQU0sS0FBSyxTQUFTLGNBQWMsS0FBSztBQUM1QyxXQUFLLElBQUksWUFBWTtBQUNyQixXQUFLLElBQUksYUFBYSxRQUFRLFNBQVM7QUFDdkMsV0FBSyxJQUFJLGFBQWEsa0JBQWtCLE1BQU07QUFDOUMsV0FBSyxJQUFJLGFBQWEsY0FBYyxRQUFRLGFBQWEsVUFBVTtBQUNuRSxZQUFNLGVBQXVFLENBQUE7QUFDN0UsaUJBQVcsQ0FBQyxNQUFNLE9BQU8sS0FBSyxPQUFPLFFBQVEsUUFBUSxhQUFhLENBQUEsQ0FBRSxHQUFHO0FBQ3JFLHFCQUFhLElBQUksSUFBSSxDQUFDLFNBQVMsUUFBUSxNQUFNQSxPQUFNO01BQ3JEO0FBQ0EsV0FBSyxXQUFXLElBQUksWUFBWSxLQUFLLFVBQVUsWUFBWTtBQUMzRCxVQUFJLENBQUNBLFFBQU8sS0FBTSxDQUFBQSxRQUFPLE9BQU87QUFDaEMsV0FBSyxhQUFhLFFBQVEsY0FBYyxrQkFBQTtBQUN4QyxXQUFLLFlBQ0gsUUFBUSxhQUFhLFFBQVEsT0FBTyxnQkFBZ0IsS0FBSyxVQUFVLEVBQUUsV0FBVyxNQUFBLENBQU87QUFDekYsV0FBSyxpQkFBaUIsS0FBSyxZQUFZLEtBQUssc0JBQXNCLEtBQUssU0FBUyxJQUFJO0FBQ3BGLFdBQUssY0FBYyxRQUFRLGVBQWU7QUFDMUMsVUFBSSxLQUFLLFlBQWEsTUFBSyxJQUFJLFFBQVEsc0JBQXNCLEtBQUs7QUFDbEUsWUFBTSxZQUFZLEtBQUssR0FBRztBQUMxQixXQUFLLFlBQVksUUFBUSxhQUFhLEtBQUs7QUFDM0MsVUFBSSxRQUFRLGVBQWUsT0FBVyxNQUFLLGNBQWMsUUFBUSxVQUFVO0FBRTNFLFdBQUssWUFBWTtRQUNmO1VBQ0UsR0FBRyxXQUFBO1VBQ0gsZUFBZSxNQUFNO0FBQ25CLGlCQUFLLGlCQUFpQjtBQUN0QixtQkFBTztVQUNUO1VBQ0EsR0FBSSxRQUFRLFVBQVUsQ0FBQTtRQUFDO1FBRXpCQTtRQUNBLFVBQUE7TUFBVTtBQUdaLFdBQUssSUFBSSxpQkFBaUIsZUFBZSxLQUFLLGFBQThCO0FBQzVFLFdBQUssSUFBSSxpQkFBaUIsYUFBYSxLQUFLLFdBQTRCO0FBQ3hFLFdBQUssSUFBSSxpQkFBaUIsV0FBVyxLQUFLLFNBQVM7QUFDbkQsV0FBSyxJQUFJLGlCQUFpQixvQkFBb0IsS0FBSyxrQkFBa0I7QUFDckUsV0FBSyxJQUFJLGlCQUFpQixrQkFBa0IsS0FBSyxnQkFBZ0I7QUFDakUsV0FBSyxJQUFJLGlCQUFpQixRQUFRLEtBQUssTUFBdUI7QUFDOUQsV0FBSyxJQUFJLGlCQUFpQixPQUFPLEtBQUssS0FBc0I7QUFDNUQsV0FBSyxJQUFJLGlCQUFpQixTQUFTLEtBQUssT0FBd0I7QUFDaEUsV0FBSyxTQUFTLGlCQUFpQixtQkFBbUIsS0FBSyxpQkFBaUI7QUFFeEUsVUFBSSxPQUFPLHFCQUFxQixhQUFhO0FBQzNDLGFBQUssV0FBVyxJQUFJLGlCQUFpQixLQUFLLFdBQVc7QUFDckQsYUFBSyxTQUFTLFFBQVEsS0FBSyxLQUFLLEVBQUUsV0FBVyxNQUFNLGVBQWUsTUFBTSxTQUFTLEtBQUEsQ0FBTTtNQUN6RjtBQUVBLFdBQUssY0FBY0EsUUFBTyxHQUFHLGVBQWUsTUFBTSxLQUFLLE9BQUEsQ0FBUTtBQUMvRCxXQUFLLE9BQUE7QUFDTCxVQUFJLFFBQVEsVUFBVyxNQUFLLE1BQUE7SUFDOUI7SUF6RFc7SUFyQkY7O0lBRUE7SUFDUTtJQUNBO0lBQ0E7SUFDQTtJQUNBO0lBQ1QsV0FBb0M7SUFDcEMsWUFBWTtJQUNaLGNBQWM7SUFDZCxZQUFZO0lBQ1osV0FBVztJQUNYLGlCQUFpQjtJQUNqQixhQUFxQyxDQUFBO0lBQzVCLG1CQUFBLG9CQUF1QixJQUFBO0lBQ3ZCLHNCQUFBLG9CQUEwQixJQUFBO0lBQzFCO0lBQ0E7O0lBK0RqQixTQUFlO0FBQ2IsVUFBSSxLQUFLLGFBQWEsS0FBSyxVQUFXO0FBQ3RDLFdBQUssY0FBYyxNQUFNLEtBQUssU0FBUyxVQUFVLEtBQUssT0FBTyxNQUFNLEtBQUssS0FBSyxHQUFHLENBQUM7QUFDakYsV0FBSyxrQkFBQTtBQUNMLFdBQUssbUJBQUE7SUFDUDs7SUFHQSxZQUFZLFVBQXlCO0FBQ25DLFdBQUssV0FBVztBQUNoQixXQUFLLElBQUksa0JBQWtCLE9BQU8sUUFBUTtBQUMxQyxXQUFLLElBQUksYUFBYSxpQkFBaUIsT0FBTyxDQUFDLFFBQVEsQ0FBQztJQUMxRDtJQUVBLElBQUksYUFBc0I7QUFDeEIsYUFBTyxLQUFLO0lBQ2Q7Ozs7Ozs7Ozs7OztJQWFBLGNBQWMsU0FBd0I7QUFDcEMsWUFBTSxVQUFVLEtBQUssZUFBZTtBQUNwQyxXQUFLLElBQUksYUFBYSxjQUFjLE9BQU8sT0FBTyxDQUFDO0FBQ25ELFVBQUksQ0FBQyxXQUFXLENBQUMsUUFBUztBQUMxQixXQUFLLGNBQWMsTUFBTSxLQUFLLGlCQUFpQixLQUFLLEdBQUcsQ0FBQztBQUV4RCxXQUFLLG1CQUFBO0lBQ1A7Ozs7Ozs7Ozs7O0lBWVEsaUJBQWlCLFFBQStCO0FBQ3RELGlCQUFXLFNBQVMsQ0FBQyxHQUFHLE9BQU8sVUFBVSxHQUFHO0FBQzFDLFlBQUksTUFBTSxhQUFhRSxZQUFXO0FBQ2hDLGVBQUssaUJBQWlCLEtBQUs7QUFDM0I7UUFDRjtBQUNBLGNBQU0sUUFBUSxLQUFLLFNBQVMsZUFBZSxNQUFNLGVBQWUsRUFBRTtBQUdsRSxjQUFNLFFBQVEsS0FBSyxTQUFTLFFBQVEsSUFBSSxLQUFLO0FBQzdDLFlBQUksTUFBTyxNQUFLLFNBQVMsUUFBUSxJQUFJLE9BQU8sS0FBSztBQUMvQyxjQUEwQixZQUFZLEtBQUs7TUFDL0M7SUFDRjs7SUFHQSxJQUFJLGFBQXNCO0FBQ3hCLGFBQU8sS0FBSyxJQUFJLGFBQWEsWUFBWSxNQUFNO0lBQ2pEOzs7OztJQU1BLGNBQWMsU0FBdUM7QUFDbkQsV0FBSyxhQUFhO0FBQ2xCLFVBQUksUUFBUSxXQUFXLEdBQUc7QUFDeEIsYUFBSyxtQkFBbUIsVUFBVSxJQUFJO0FBQ3RDO01BQ0Y7QUFDQSxZQUFNLFNBQUEsb0JBQWEsUUFBQTtBQUNuQixpQkFBVyxTQUFTLFNBQVM7QUFDM0IsY0FBTSxPQUFPLFdBQVcsS0FBSyxPQUFPLE1BQU0sS0FBSyxNQUFNLElBQUk7QUFDekQsWUFBSSxDQUFDLEtBQU07QUFDWCxjQUFNLE9BQU8sT0FBTyxJQUFJLElBQUksS0FBSyxDQUFBO0FBQ2pDLGFBQUssS0FBSyxFQUFFLE1BQU0sTUFBTSxNQUFNLElBQUksTUFBTSxJQUFJLFdBQVcsd0JBQUEsQ0FBeUI7QUFDaEYsZUFBTyxJQUFJLE1BQU0sSUFBSTtNQUN2QjtBQUNBLFdBQUssbUJBQW1CLFVBQVUsQ0FBQyxTQUFTLE9BQU8sSUFBSSxJQUFJLEtBQUssSUFBSTtJQUN0RTtJQUVBLElBQUksb0JBQTRDO0FBQzlDLGFBQU8sS0FBSztJQUNkOzs7Ozs7SUFPQSxtQkFBbUIsS0FBYSxRQUF1QztBQUNyRSxVQUFJLE9BQVEsTUFBSyxpQkFBaUIsSUFBSSxLQUFLLE1BQU07ZUFDeEMsQ0FBQyxLQUFLLGlCQUFpQixPQUFPLEdBQUcsRUFBRztBQUM3QyxVQUFJLEtBQUssaUJBQWlCLFNBQVMsR0FBRztBQUNwQyxhQUFLLFNBQVMsZUFBZSxJQUFJO01BQ25DLE9BQU87QUFDTCxjQUFNLFNBQVMsQ0FBQyxHQUFHLEtBQUssaUJBQWlCLE9BQUEsQ0FBUTtBQUNqRCxhQUFLLFNBQVMsZUFBZSxDQUFDLFNBQVM7QUFDckMsY0FBSSxTQUFvQztBQUN4QyxxQkFBVyxTQUFTLFFBQVE7QUFDMUIsa0JBQU0sY0FBYyxNQUFNLElBQUk7QUFDOUIsZ0JBQUksZUFBZSxZQUFZLFNBQVMsR0FBRztBQUN6Qyx1QkFBUyxTQUFTLE9BQU8sT0FBTyxXQUFXLElBQUksQ0FBQyxHQUFHLFdBQVc7WUFDaEU7VUFDRjtBQUNBLGlCQUFPO1FBQ1QsQ0FBQztNQUNIO0FBQ0EsV0FBSyxPQUFBO0lBQ1A7Ozs7OztJQU9BLHNCQUFzQixhQUE0RDtBQUNoRixXQUFLLG9CQUFvQixJQUFJLFdBQVc7QUFDeEMsYUFBTyxNQUFNLEtBQUssb0JBQW9CLE9BQU8sV0FBVztJQUMxRDtJQUVRLG9CQUEwQjtBQUNoQyxVQUFJLENBQUMsS0FBSyxZQUFhO0FBQ3ZCLFlBQU0sTUFBTSxLQUFLLE9BQU8sTUFBTTtBQUM5QixZQUFNLFFBQ0osSUFBSSxlQUFlLEtBQUssSUFBSSxNQUFNLENBQUMsRUFBRSxlQUFlLGFBQWEsSUFBSSxNQUFNLENBQUMsRUFBRSxPQUFPLE1BQU07QUFDN0YsVUFBSSxPQUFPO0FBQ1QsYUFBSyxJQUFJLFFBQVEsZ0JBQWdCO01BQ25DLE9BQU87QUFDTCxlQUFPLEtBQUssSUFBSSxRQUFRO01BQzFCO0lBQ0Y7Ozs7Ozs7Ozs7OztJQWFBLFFBQWM7QUFNWixXQUFLLG1CQUFBO0FBQ0wsV0FBSyxjQUFjLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxlQUFlLEtBQUEsQ0FBTSxDQUFDO0FBQ2hFLFdBQUssbUJBQUE7SUFDUDs7Ozs7Ozs7SUFTQSx3QkFBd0IsVUFBaUMsRUFBRSxPQUFPLFVBQUEsR0FBbUI7QUFDbkYsWUFBTSxRQUFRLHFCQUFxQixLQUFLLEtBQUssS0FBSyxVQUFVLEtBQUssT0FBTyxNQUFNLFVBQVUsSUFBSTtBQUM1RixZQUFNLE9BQU8sT0FBTztBQUNwQixZQUFNLFVBQVUsZ0JBQWdCLFVBQVUsT0FBUSxNQUFNLGlCQUFpQjtBQUN6RSxlQUFTLGlCQUFpQixPQUFPO0lBQ25DO0lBRUEsVUFBZ0I7QUFDZCxVQUFJLEtBQUssVUFBVztBQUNwQixXQUFLLFlBQVk7QUFDakIsV0FBSyxZQUFBO0FBQ0wsV0FBSyxVQUFVLFdBQUE7QUFDZixXQUFLLElBQUksb0JBQW9CLGVBQWUsS0FBSyxhQUE4QjtBQUMvRSxXQUFLLElBQUksb0JBQW9CLGFBQWEsS0FBSyxXQUE0QjtBQUMzRSxXQUFLLElBQUksb0JBQW9CLFdBQVcsS0FBSyxTQUFTO0FBQ3RELFdBQUssSUFBSSxvQkFBb0Isb0JBQW9CLEtBQUssa0JBQWtCO0FBQ3hFLFdBQUssSUFBSSxvQkFBb0Isa0JBQWtCLEtBQUssZ0JBQWdCO0FBQ3BFLFdBQUssSUFBSSxvQkFBb0IsUUFBUSxLQUFLLE1BQXVCO0FBQ2pFLFdBQUssSUFBSSxvQkFBb0IsT0FBTyxLQUFLLEtBQXNCO0FBQy9ELFdBQUssSUFBSSxvQkFBb0IsU0FBUyxLQUFLLE9BQXdCO0FBQ25FLFdBQUssU0FBUyxvQkFBb0IsbUJBQW1CLEtBQUssaUJBQWlCO0FBQzNFLGlCQUFXLFNBQVMsQ0FBQyxHQUFHLEtBQUssSUFBSSxRQUFRLEdBQUc7QUFDMUMsYUFBSyxTQUFTLGFBQWEsS0FBb0I7TUFDakQ7QUFDQSxXQUFLLGlCQUFBO0FBQ0wsV0FBSyxXQUFXLFFBQUE7QUFDaEIsV0FBSyxJQUFJLE9BQUE7QUFDVCxVQUFJLEtBQUssT0FBTyxTQUFTLEtBQU0sTUFBSyxPQUFPLE9BQU87SUFDcEQ7Ozs7O0lBTVEsc0JBQXNCLFdBQWtDO0FBQzlELFlBQU0sY0FBYyxDQUFDLFVBQ25CLFdBQVcsTUFBTSxLQUFLLE1BQU0sVUFBVSxLQUFLLElBQUksR0FBRyxLQUFLLFFBQVE7QUFDakUsYUFBTyxLQUFLLE9BQU8sY0FBYyxDQUFDLEVBQUUsUUFBUSxNQUFBLE1BQVk7QUFDdEQsWUFBSSxLQUFLLFVBQVc7QUFDcEIsY0FBTSxVQUFVO1VBQ2QsT0FBTztVQUNQLE1BQU07VUFDTixZQUFZLE1BQU07VUFDbEIsWUFBWSxLQUFLO1FBQUE7QUFFbkIsWUFBSSxRQUFTLFdBQVUsU0FBUyxPQUFPO01BQ3pDLENBQUM7SUFDSDs7SUFJUSxjQUFjLElBQXNCO0FBQzFDLFdBQUssY0FBYztBQUNuQixVQUFJO0FBQ0YsV0FBQTtNQUNGLFVBQUE7QUFFRSxhQUFLLFVBQVUsWUFBQTtBQUNmLGFBQUssY0FBYztNQUNyQjtJQUNGOztJQUlRLHFCQUEyQjtBQUNqQyxZQUFNLFlBQVksS0FBSyxPQUFPLE1BQU07QUFDcEMsVUFBSSxFQUFFLHFCQUFxQixlQUFnQjtBQUMzQyxZQUFNLGVBQWUsS0FBSyxTQUFTLGVBQUE7QUFDbkMsVUFBSSxDQUFDLGdCQUFnQixPQUFPLGFBQWEscUJBQXFCLFdBQVk7QUFDMUUsWUFBTSxTQUFTLHFCQUFxQixLQUFLLEtBQUssS0FBSyxVQUFVLFVBQVUsTUFBTTtBQUM3RSxZQUFNLE9BQU8scUJBQXFCLEtBQUssS0FBSyxLQUFLLFVBQVUsVUFBVSxJQUFJO0FBQ3pFLFVBQUksQ0FBQyxVQUFVLENBQUMsS0FBTTtBQUN0QixVQUNFLGFBQWEsZUFBZSxPQUFPLFFBQ25DLGFBQWEsaUJBQWlCLE9BQU8sVUFDckMsYUFBYSxjQUFjLEtBQUssUUFDaEMsYUFBYSxnQkFBZ0IsS0FBSyxRQUNsQztBQUNBO01BQ0Y7QUFFQSxZQUFNLFNBQVMsS0FBSyxTQUFTO0FBQzdCLFVBQUksV0FBVyxLQUFLLE9BQU8sQ0FBQyxLQUFLLElBQUksU0FBUyxNQUFNLEVBQUc7QUFDdkQsVUFBSTtBQUtGLGFBQUssY0FBYyxNQUFNO0FBQ3ZCLHVCQUFhLGlCQUFpQixPQUFPLE1BQU0sT0FBTyxRQUFRLEtBQUssTUFBTSxLQUFLLE1BQU07UUFDbEYsQ0FBQztNQUNILFFBQVE7TUFFUjtJQUNGOzs7Ozs7O0lBUUEsdUJBQTZCO0FBQzNCLFdBQUssa0JBQUE7SUFDUDs7SUFHUSxvQkFBb0IsTUFBWTtBQUN0QyxVQUFJLEtBQUssYUFBYSxLQUFLLGFBQWEsS0FBSyxZQUFhO0FBQzFELFlBQU0sZUFBZSxLQUFLLFNBQVMsZUFBQTtBQUNuQyxZQUFNLGFBQWEsY0FBYztBQUNqQyxVQUFJLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEtBQUssSUFBSSxTQUFTLFVBQVUsRUFBRztBQUNwRSxZQUFNLFNBQVM7UUFDYixLQUFLO1FBQ0wsS0FBSztRQUNMO1FBQ0EsYUFBYTtNQUFBO0FBRWYsWUFBTSxPQUFPLGFBQWEsWUFDdEI7UUFDRSxLQUFLO1FBQ0wsS0FBSztRQUNMLGFBQWE7UUFDYixhQUFhO01BQUEsSUFFZjtBQUNKLFVBQUksQ0FBQyxVQUFVLENBQUMsS0FBTTtBQUN0QixZQUFNLE9BQU8sSUFBSSxjQUFjLFFBQVEsSUFBSTtBQUMzQyxVQUFJLEtBQUssT0FBTyxNQUFNLFVBQVUsR0FBRyxJQUFJLEVBQUc7QUFDMUMsV0FBSyxPQUFPLFNBQVMsS0FBSyxPQUFPLE1BQU0sR0FBRyxhQUFhLElBQUksQ0FBQztJQUM5RDs7Ozs7Ozs7Ozs7Ozs7SUFnQlEsY0FBYyxDQUFDLFVBQTRCO0FBQ2pELFVBQUksS0FBSyxhQUFhLENBQUMsS0FBSyxZQUFZLE1BQU0sV0FBVyxFQUFHO0FBQzVELFlBQU0sU0FBUyxNQUFNO0FBQ3JCLFVBQUksQ0FBQyxVQUFXLE9BQTJCLGFBQWEsRUFBRztBQUMzRCxZQUFNLFVBQVU7QUFDaEIsWUFBTSxRQUFRLEtBQUssU0FBUyxRQUFRLElBQUksT0FBTztBQUMvQyxVQUFJLE9BQU8sS0FBSyxTQUFTLFdBQVk7QUFDckMsWUFBTSxNQUFNLFFBQVEsc0JBQUE7QUFDcEIsWUFBTSxTQUFTLE9BQU87U0FDbkIsUUFBUSxjQUFjLGFBQWEsaUJBQWlCLE9BQU8sRUFBRSxlQUFlLFFBQVE7TUFBQTtBQUV2RixZQUFNLFdBQVcsT0FBTyxTQUFTLE1BQU0sSUFDbkMsTUFBTSxVQUFVLElBQUksT0FBTyxTQUMzQixNQUFNLFVBQVUsSUFBSTtBQUN4QixVQUFJLENBQUMsU0FBVTtBQUNmLFlBQU0sT0FBTyxjQUFjLEtBQUssS0FBSyxLQUFLLFVBQVUsT0FBTztBQUMzRCxVQUFJLENBQUMsS0FBTTtBQUNYLFlBQU0sZUFBQTtBQUNOLFdBQUssT0FBTyxLQUFLLGVBQWUsTUFBTSxNQUFNLE1BQU0sWUFBWSxJQUFJLENBQUM7SUFDckU7SUFFUSxZQUFZLENBQUMsVUFBK0I7QUFDbEQsVUFBSSxLQUFLLGFBQWEsS0FBSyxhQUFhLENBQUMsS0FBSyxTQUFVO0FBRXhELFdBQUssa0JBQUE7QUFDTCxpQkFBVyxlQUFlLEtBQUsscUJBQXFCO0FBQ2xELFlBQUksWUFBWSxLQUFLLEdBQUc7QUFDdEIsZ0JBQU0sZUFBQTtBQUNOO1FBQ0Y7TUFDRjtBQUNBLFVBQUksS0FBSyxVQUFVLEtBQUssRUFBQSxPQUFTLGVBQUE7SUFDbkM7SUFFUSxnQkFBZ0IsQ0FBQyxVQUE0QjtBQUNuRCxVQUFJLEtBQUssVUFBVztBQUNwQixVQUFJLENBQUMsS0FBSyxVQUFVO0FBQ2xCLGNBQU0sZUFBQTtBQUNOO01BQ0Y7QUFDQSxZQUFNLE9BQU8sTUFBTTtBQUNuQixVQUFJLEtBQUssYUFBYSxTQUFTLHdCQUF5QjtBQUV4RCxXQUFLLGtCQUFBO0FBRUwsWUFBTSxVQUFVLENBQUMsWUFBa0M7QUFDakQsY0FBTSxlQUFBO0FBQ04sWUFBSSxRQUFTLE1BQUssT0FBTyxLQUFLLE9BQU87TUFDdkM7QUFFQSxjQUFRLE1BQUE7UUFDTixLQUFLO1FBQ0wsS0FBSyx5QkFBeUI7QUFDNUIsZ0JBQU0sT0FBTyxNQUFNLFFBQVEsTUFBTSxjQUFjLFFBQVEsWUFBWSxLQUFLO0FBQ3hFLGNBQUksQ0FBQyxNQUFNO0FBQ1Qsa0JBQU0sZUFBQTtBQUNOO1VBQ0Y7QUFFQSxnQkFBTSxTQUFTLGdCQUFnQixLQUFLLE9BQU8sT0FBTyxNQUFNLEtBQUssVUFBVTtBQUN2RSxjQUFJLFFBQVE7QUFDVixrQkFBTSxlQUFBO0FBQ04saUJBQUssT0FBTyxTQUFTLE1BQU07QUFDM0I7VUFDRjtBQUVBLGtCQUFRLGNBQWMsbUJBQW1CLElBQUksR0FBRyxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQ2pFO1FBQ0Y7UUFDQSxLQUFLO0FBQ0gsa0JBQVEsY0FBYywwQkFBMEIsZUFBZSxVQUFVLENBQUM7QUFDMUU7UUFDRixLQUFLO0FBQ0gsa0JBQVEsY0FBYyw2QkFBNkIsaUJBQWlCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGO1FBQ0YsS0FBSztBQUNILGtCQUFRLGNBQWMsOEJBQThCLGtCQUFrQixDQUFDO0FBQ3ZFO1FBQ0YsS0FBSztRQUNMLEtBQUs7QUFDSCxrQkFBUSxrQkFBa0I7QUFDMUI7UUFDRixLQUFLO1FBQ0wsS0FBSztBQUNILGtCQUFRLGlCQUFpQjtBQUN6QjtRQUNGLEtBQUs7UUFDTCxLQUFLO0FBQ0gsa0JBQVEsZUFBZTtBQUN2QjtRQUNGLEtBQUs7QUFDSCxnQkFBTSxlQUFBO0FBQ04sZUFBSyxPQUFPLEtBQUE7QUFDWjtRQUNGLEtBQUs7QUFDSCxnQkFBTSxlQUFBO0FBQ04sZUFBSyxPQUFPLEtBQUE7QUFDWjtRQUNGLEtBQUs7QUFDSCxrQkFBUSxXQUFXLE1BQU0sQ0FBQztBQUMxQjtRQUNGLEtBQUs7QUFDSCxrQkFBUSxXQUFXLFFBQVEsQ0FBQztBQUM1QjtRQUNGLEtBQUs7QUFDSCxrQkFBUSxXQUFXLFdBQVcsQ0FBQztBQUMvQjtRQUNGLEtBQUssbUJBQW1CO0FBRXRCLGdCQUFNLGVBQUE7QUFDTixjQUFJLE1BQU0sYUFBYyxNQUFLLG9CQUFvQixNQUFNLFlBQVk7QUFDbkU7UUFDRjtRQUNBO0FBRUUsZ0JBQU0sZUFBQTtNQUFlO0lBRTNCOztJQUlRLFNBQVMsQ0FBQyxVQUFnQztBQUNoRCxVQUFJLEtBQUssYUFBYSxDQUFDLE1BQU0sY0FBZTtBQUM1QyxVQUFJLEtBQUssZUFBZSxNQUFNLGFBQWEsRUFBQSxPQUFTLGVBQUE7SUFDdEQ7SUFFUSxRQUFRLENBQUMsVUFBZ0M7QUFDL0MsVUFBSSxLQUFLLGFBQWEsQ0FBQyxNQUFNLGNBQWU7QUFDNUMsVUFBSSxDQUFDLEtBQUssZUFBZSxNQUFNLGFBQWEsRUFBRztBQUMvQyxZQUFNLGVBQUE7QUFDTixVQUFJLEtBQUssU0FBVSxNQUFLLE9BQU8sS0FBSyxlQUFlO0lBQ3JEO0lBRVEsVUFBVSxDQUFDLFVBQWdDO0FBQ2pELFVBQUksS0FBSyxhQUFhLENBQUMsS0FBSyxZQUFZLENBQUMsTUFBTSxjQUFlO0FBQzlELFlBQU0sZUFBQTtBQUNOLFdBQUssa0JBQUE7QUFDTCxXQUFLLG9CQUFvQixNQUFNLGFBQWE7SUFDOUM7O0lBR1EsZUFBZSxNQUE2QjtBQUNsRCxZQUFNLFFBQVEsS0FBSyxPQUFPO0FBQzFCLFlBQU0sWUFBWSxNQUFNO0FBQ3hCLFVBQUksVUFBVSxNQUFPLFFBQU87QUFDNUIsWUFBTSxTQUFTLGNBQWMsTUFBTSxLQUFLLFVBQVUsTUFBTSxVQUFVLEVBQUUsRUFDakUsT0FBTyxDQUFDLFVBQVUsTUFBTSxPQUFPLE1BQU0sRUFBRSxFQUN2QyxJQUFJLENBQUMsVUFBVSxNQUFNLEtBQUssWUFBWSxZQUFZLE1BQU0sS0FBSyxTQUFTLE1BQU0sTUFBTSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQy9GLFVBQUksT0FBTyxXQUFXLEVBQUcsUUFBTztBQUNoQyxXQUFLLFFBQVEsYUFBYSxPQUFPLElBQUksQ0FBQyxTQUFTLGdCQUFnQixJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUM5RSxXQUFLLFFBQVEsY0FBYyxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUssV0FBVyxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQzVFLFdBQUssUUFBUSxlQUFlLEtBQUssVUFBVSxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUssT0FBQSxDQUFRLENBQUMsQ0FBQztBQUMvRSxhQUFPO0lBQ1Q7O0lBR1Esb0JBQW9CLE1BQTBCO0FBQ3BELFlBQU0sWUFBWSxLQUFLO0FBQ3ZCLFdBQUssaUJBQWlCO0FBQ3RCLFlBQU1DLFVBQVMsS0FBSyxPQUFPO0FBSzNCLFVBQUksS0FBSywrQkFBQSxHQUFrQztBQUN6QyxjQUFNLFNBQVMsS0FBSyxRQUFRLFlBQVk7QUFDeEMsWUFBSSxPQUFRLE1BQUssT0FBTyxLQUFLLFdBQVcsTUFBTSxDQUFDO0FBQy9DO01BQ0Y7QUFFQSxVQUFJLENBQUMsV0FBVztBQUNkLGNBQU0sTUFBTSxLQUFLLFFBQVEsYUFBYTtBQUN0QyxZQUFJLEtBQUs7QUFDUCxjQUFJO0FBQ0Ysa0JBQU0sU0FBa0IsS0FBSyxNQUFNLEdBQUc7QUFDdEMsZ0JBQUksTUFBTSxRQUFRLE1BQU0sR0FBRztBQUN6QixvQkFBTUMsU0FBUSxPQUFPLElBQUksQ0FBQyxTQUFTLGFBQWFELFNBQVEsSUFBSSxDQUFDO0FBQzdELG1CQUFLLE9BQU8sS0FBSyxjQUFjQyxNQUFLLENBQUM7QUFDckM7WUFDRjtVQUNGLFFBQVE7VUFFUjtRQUNGO0FBQ0EsY0FBTSxPQUFPLEtBQUssUUFBUSxXQUFXO0FBQ3JDLFlBQUksTUFBTTtBQUlSLGdCQUFNLFNBQVMsVUFBVUQsU0FBUSxnQkFBZ0IsSUFBSSxHQUFHLEtBQUssUUFBUTtBQUNyRSxlQUFLLE9BQU8sS0FBSyxjQUFjLE9BQU8sUUFBUSxRQUFRLENBQUM7QUFDdkQ7UUFDRjtNQUNGO0FBRUEsWUFBTSxPQUFPLEtBQUssUUFBUSxZQUFZO0FBQ3RDLFVBQUksQ0FBQyxLQUFNO0FBQ1gsWUFBTSxRQUFRLEtBQUssTUFBTSxPQUFPO0FBQ2hDLFlBQU0sV0FBVyxLQUFLLHdCQUFBO0FBQ3RCLFVBQUksTUFBTSxXQUFXLEdBQUc7QUFDdEIsY0FBTSxVQUFVLEtBQUssS0FBQTtBQUdyQixZQUFJLFlBQVksQ0FBQyxLQUFLLE9BQU8sTUFBTSxVQUFVLFNBQVMsU0FBUyxLQUFLLE9BQU8sR0FBRztBQUM1RSxnQkFBTSxPQUFPLFNBQVMsVUFBVSxLQUFLLE9BQU8sSUFBSSxXQUFXLE9BQU8sS0FBSyxPQUFPO0FBQzlFLGNBQUksUUFBUSxLQUFLLE9BQU8sS0FBSyxRQUFRLFFBQVEsRUFBRSxLQUFBLENBQU0sQ0FBQyxFQUFHO1FBQzNEO0FBQ0EsY0FBTSxTQUFTLFdBQVcsWUFBWUEsU0FBUSxJQUFJLElBQUk7QUFDdEQsYUFBSyxPQUFPLEtBQUssU0FBUyxjQUFjLE1BQU0sSUFBSSxXQUFXLElBQUksQ0FBQztBQUNsRTtNQUNGO0FBQ0EsWUFBTSxZQUFZQSxRQUFPLG1CQUFBO0FBQ3pCLFlBQU0sUUFBUSxNQUFNLElBQUksQ0FBQyxTQUFTO0FBQ2hDLFlBQUksQ0FBQyxLQUFNLFFBQU8sVUFBVSxPQUFBO0FBQzVCLGNBQU0sVUFBVSxXQUFXLFlBQVlBLFNBQVEsSUFBSSxJQUFJLFNBQVMsQ0FBQ0EsUUFBTyxLQUFLLElBQUksQ0FBQztBQUNsRixlQUFPLFVBQVUsT0FBTyxRQUFXLFNBQVMsS0FBSyxNQUFNLENBQUM7TUFDMUQsQ0FBQztBQUNELFdBQUssT0FBTyxLQUFLLGNBQWMsS0FBSyxDQUFDO0lBQ3ZDOztJQUdRLGlDQUEwQztBQUNoRCxZQUFNLFFBQVEsV0FBVyxLQUFLLE9BQU8sTUFBTSxLQUFLLEtBQUssT0FBTyxNQUFNLFVBQVUsS0FBSyxJQUFJO0FBQ3JGLGFBQU8sT0FBTyxLQUFLLEtBQUssdUJBQXVCO0lBQ2pEOztJQUdRLDBCQUFtQztBQUN6QyxZQUFNLE9BQU8sS0FBSyxPQUFPLE9BQU8sTUFBTTtBQUN0QyxVQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFlBQU0sUUFBUSxXQUFXLEtBQUssT0FBTyxNQUFNLEtBQUssS0FBSyxPQUFPLE1BQU0sVUFBVSxLQUFLLElBQUk7QUFDckYsYUFBTyxPQUFPLGdCQUFnQixRQUFRLE1BQU0sS0FBSyxlQUFlLElBQUk7SUFDdEU7O0lBSVEscUJBQXFCLE1BQVk7QUFDdkMsVUFBSSxDQUFDLEtBQUssVUFBVyxNQUFLLFlBQVk7SUFDeEM7SUFFUSxtQkFBbUIsTUFBWTtBQUNyQyxVQUFJLEtBQUssYUFBYSxDQUFDLEtBQUssVUFBVztBQUN2QyxXQUFLLFlBQVk7QUFDakIsWUFBTSxlQUFlLEtBQUssU0FBUyxlQUFBO0FBQ25DLFlBQU0sYUFBYSxjQUFjLGNBQWM7QUFDL0MsWUFBTSxTQUFTLGFBQWEsS0FBSyxtQkFBbUIsVUFBVSxJQUFJLFNBQVMsS0FBSyxlQUFBO0FBQ2hGLFVBQUksT0FBTztBQUNULGFBQUssWUFBWSxLQUFLO01BQ3hCLE9BQU87QUFDTCxhQUFLLE9BQUE7TUFDUDtJQUNGOztJQUdRLGlCQUFxQztBQUMzQyxZQUFNLE9BQU8sQ0FBQyxZQUE2QztBQUN6RCxjQUFNLFFBQVEsS0FBSyxTQUFTLFFBQVEsSUFBSSxPQUFPO0FBQy9DLFlBQUksT0FBTyxhQUFhO0FBQ3RCLGdCQUFNLFVBQVUsS0FBSyxTQUFTLGlCQUFpQixPQUFPO0FBQ3RELGtCQUFRLFFBQVEsZUFBZSxRQUFRLE1BQU0sY0FBYyxPQUFPO1FBQ3BFO0FBQ0EsbUJBQVcsU0FBUyxDQUFDLEdBQUcsUUFBUSxRQUFRLEdBQUc7QUFDekMsZ0JBQU0sUUFBUSxLQUFLLEtBQW9CO0FBQ3ZDLGNBQUksTUFBTyxRQUFPO1FBQ3BCO0FBQ0EsZUFBTztNQUNUO0FBQ0EsaUJBQVcsU0FBUyxDQUFDLEdBQUcsS0FBSyxJQUFJLFFBQVEsR0FBRztBQUMxQyxjQUFNLFFBQVEsS0FBSyxLQUFvQjtBQUN2QyxZQUFJLE1BQU8sUUFBTztNQUNwQjtBQUNBLGFBQU87SUFDVDs7SUFJUSxjQUFjLENBQUMsWUFBb0M7QUFDekQsVUFBSSxLQUFLLGFBQWEsS0FBSyxlQUFlLEtBQUssYUFBYSxRQUFRLFdBQVcsRUFBRztBQUNsRixZQUFNLFNBQUEsb0JBQWEsSUFBQTtBQUNuQixVQUFJLFdBQVc7QUFDZixpQkFBVyxVQUFVLFNBQVM7QUFDNUIsY0FBTSxRQUFRLEtBQUssbUJBQW1CLE9BQU8sTUFBTTtBQUNuRCxZQUFJLE1BQU8sUUFBTyxJQUFJLEtBQUs7WUFDdEIsWUFBVztNQUNsQjtBQUNBLFlBQU0sQ0FBQyxJQUFJLElBQUk7QUFDZixVQUFJLENBQUMsWUFBWSxPQUFPLFNBQVMsS0FBSyxNQUFNO0FBQzFDLGFBQUssWUFBWSxJQUFJO01BQ3ZCLE9BQU87QUFFTCxhQUFLLE9BQUE7TUFDUDtJQUNGO0lBRVEsbUJBQW1CLE1BQTJDO0FBQ3BFLGVBQ00sVUFBa0MsTUFDdEMsV0FBVyxZQUFZLEtBQUssSUFBSSxZQUNoQyxVQUFVLFFBQVEsWUFDbEI7QUFDQSxjQUFNLFFBQVEsS0FBSyxTQUFTLFFBQVEsSUFBSSxPQUFPO0FBQy9DLFlBQUksT0FBTyxZQUFhLFFBQU87QUFDL0IsWUFBSSxZQUFZLEtBQUssSUFBSztNQUM1QjtBQUNBLGFBQU87SUFDVDs7Ozs7O0lBT1EsWUFBWSxjQUFpQztBQUNuRCxZQUFNLE9BQU8sY0FBYyxLQUFLLEtBQUssS0FBSyxVQUFVLFlBQVk7QUFDaEUsWUFBTSxRQUFRLE9BQU8sV0FBVyxLQUFLLE9BQU8sTUFBTSxLQUFLLElBQUksSUFBSTtBQUMvRCxVQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sYUFBYTtBQUNoQyxhQUFLLE9BQUE7QUFDTDtNQUNGO0FBQ0EsWUFBTSxVQUFVLEtBQUssU0FBUyxpQkFBaUIsWUFBWTtBQU0zRCxVQUFJLEtBQUssYUFBYSxTQUFTLEtBQUssR0FBRztBQUNyQyxhQUFLLE9BQUE7QUFDTDtNQUNGO0FBQ0EsWUFBTSxVQUFVLFFBQVEsZUFBZTtBQUN2QyxZQUFNLFVBQVUsTUFBTTtBQUN0QixVQUFJLFlBQVksU0FBUztBQUN2QixhQUFLLE9BQUE7QUFDTDtNQUNGO0FBQ0EsVUFBSSxRQUFRO0FBQ1osYUFBTyxRQUFRLFFBQVEsVUFBVSxRQUFRLFFBQVEsVUFBVSxRQUFRLEtBQUssTUFBTSxRQUFRLEtBQUssR0FBRztBQUM1RjtNQUNGO0FBQ0EsVUFBSSxTQUFTLFFBQVE7QUFDckIsVUFBSSxTQUFTLFFBQVE7QUFDckIsYUFBTyxTQUFTLFNBQVMsU0FBUyxTQUFTLFFBQVEsU0FBUyxDQUFDLE1BQU0sUUFBUSxTQUFTLENBQUMsR0FBRztBQUN0RjtBQUNBO01BQ0Y7QUFDQSxZQUFNLFdBQVcsUUFBUSxNQUFNLE9BQU8sTUFBTTtBQUM1QyxZQUFNLE9BQU8scUJBQXFCLE1BQU0sU0FBUyxLQUFLO0FBQ3RELFlBQU0sS0FBSyxxQkFBcUIsTUFBTSxTQUFTLE1BQU07QUFDckQsWUFBTSxRQUFRLEtBQUssT0FBTztBQUMxQixZQUFNLFFBQVEsb0JBQW9CLE1BQU0sU0FBUyxJQUFJLEVBQUU7UUFBTyxDQUFDLFNBQzdELE1BQU0sS0FBSyxlQUFlLEtBQUssSUFBSTtNQUFBO0FBRXJDLFlBQU0sV0FBVyxXQUFXLFNBQVMsR0FBRyxNQUFNLE9BQU8sS0FBSyxVQUFVLEtBQUssQ0FBQyxJQUFJLFNBQVM7QUFDdkYsWUFBTSxLQUFLLE1BQU0sR0FBRyxLQUFLLElBQUksa0JBQWtCLE1BQU0sTUFBTSxJQUFJLFFBQVEsQ0FBQztBQUV4RSxZQUFNLGVBQWUsS0FBSyxTQUFTLGVBQUE7QUFDbkMsWUFBTSxRQUNKLGNBQWMsY0FBYyxLQUFLLElBQUksU0FBUyxhQUFhLFVBQVUsSUFDakU7UUFDRSxLQUFLO1FBQ0wsS0FBSztRQUNMLGFBQWE7UUFDYixhQUFhO01BQUEsSUFFZjtBQUNOLFNBQUcsYUFBYSxJQUFJLGNBQWMsU0FBUyxJQUFJLE1BQU0sT0FBTyxTQUFTLE1BQU0sQ0FBQyxDQUFDO0FBQzdFLFdBQUssT0FBTyxTQUFTLEVBQUU7SUFDekI7Ozs7OztJQU9RLGFBQWEsU0FBc0IsT0FBNEI7QUFDckUsWUFBTSxXQUFXLE1BQU0sUUFBUSxTQUFTLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxNQUFNLEVBQUU7QUFDekUsVUFBSSxRQUFRO0FBQ1osaUJBQVcsV0FBVyxRQUFRLGlCQUFpQixHQUFHLEdBQUc7QUFDbkQsWUFBSSxLQUFLLFNBQVMsUUFBUSxJQUFJLE9BQXNCLEdBQUcsT0FBUTtNQUNqRTtBQUNBLGFBQU8sVUFBVTtJQUNuQjtFQUNGO0FLL3RCTyxNQUFNLFNBQU4sTUFBYTtJQUNsQjtJQUNTOztJQUVULE9BQTBCO0lBQ1Q7SUFDQTtJQUNBO0lBQ1QsWUFBQSxvQkFBZ0IsSUFBQTtJQUNoQixjQUFBLG9CQUFrQixJQUFBO0lBQ2xCLGFBQWtDLENBQUE7SUFDbEMsWUFBWTtJQUNaLGdCQUF1Qzs7SUFFdkMsZUFBc0M7SUFFOUMsWUFBWSxTQUF3QjtBQUNsQyxXQUFLLFFBQVEsWUFBWSxPQUFPO1FBQzlCLFFBQVEsUUFBUTtRQUNoQixLQUFLLFFBQVE7UUFDYixTQUFTLFFBQVE7TUFBQSxDQUNsQjtBQUNELFdBQUssVUFBVSxJQUFJLFFBQVEsUUFBUSxPQUFPO0FBQzFDLFdBQUssV0FBVyxRQUFRO0FBQ3hCLFdBQUssWUFBWSxRQUFRLGFBQWE7QUFDdEMsV0FBSyxXQUFXLElBQUksZUFBZSxJQUFJO0FBQ3ZDLFVBQUksUUFBUSxTQUFTO0FBQ25CLGFBQUssT0FBTyxJQUFJLFdBQVcsTUFBTSxRQUFRLFNBQVM7VUFDaEQsV0FBVyxRQUFRO1VBQ25CLFFBQVEsUUFBUTtVQUNoQixhQUFhLFFBQVE7VUFDckIsV0FBVyxRQUFRO1VBQ25CLFVBQVUsUUFBUTtVQUNsQixZQUFZLFFBQVE7VUFDcEIsWUFBWSxRQUFRO1VBQ3BCLFdBQVcsUUFBUTtVQUNuQixVQUFVLFFBQVE7UUFBQSxDQUNuQjtNQUNIO0lBQ0Y7SUFFQSxJQUFJLFNBQWlCO0FBQ25CLGFBQU8sS0FBSyxNQUFNO0lBQ3BCO0lBRUEsSUFBSSxjQUF1QjtBQUN6QixhQUFPLEtBQUs7SUFDZDs7SUFHQSxLQUFLLFNBQTJCO0FBQzlCLFVBQUksS0FBSyxVQUFXLFFBQU87QUFJM0IsV0FBSyxNQUFNLHFCQUFBO0FBQ1gsWUFBTSxLQUFLLFFBQVEsS0FBSyxLQUFLO0FBQzdCLFVBQUksQ0FBQyxHQUFJLFFBQU87QUFDaEIsV0FBSyxTQUFTLEVBQUU7QUFDaEIsYUFBTztJQUNUO0lBRUEsU0FBUyxJQUF1QjtBQUM5QixVQUFJLEtBQUssVUFBVztBQUNwQixZQUFNLFNBQVMsS0FBSztBQUNwQixVQUFJLGNBQWM7QUFDbEIsaUJBQVcsYUFBYSxLQUFLLFlBQVk7QUFDdkMsc0JBQWMsVUFBVSxhQUFhLE1BQU0sS0FBSztNQUNsRDtBQUNBLFVBQUksS0FBSyxjQUFjLFFBQVEsWUFBWSxZQUFZO0FBQ3JELGNBQU0sT0FBTyxlQUFlLFlBQVksR0FBRztBQUMzQyxZQUFJLE9BQU8sS0FBSyxhQUFhLE9BQU8sZUFBZSxPQUFPLEdBQUcsRUFBRztNQUNsRTtBQUNBLFdBQUssUUFBUSxPQUFPLGFBQWEsT0FBTyxTQUFTO0FBQ2pELFdBQUssUUFBUSxPQUFPLE1BQU0sV0FBVztBQUNyQyxXQUFLLGdCQUFnQjtBQUNyQixXQUFLLEtBQUssYUFBYTtBQUN2QixpQkFBVyxZQUFZLENBQUMsR0FBRyxLQUFLLFdBQVcsR0FBRztBQUM1QyxpQkFBUyxFQUFFLFFBQVEsTUFBTSxhQUFhLFFBQVEsT0FBTyxLQUFLLE1BQUEsQ0FBTztNQUNuRTtBQUNBLFVBQUksWUFBWSxZQUFZO0FBQzFCLGFBQUssS0FBSyxRQUFRO0FBQ2xCLGFBQUssV0FBVyxFQUFFLFFBQVEsTUFBTSxNQUFNLEtBQUssUUFBQSxHQUFXLE1BQU0sS0FBSyxRQUFBLEVBQVEsQ0FBRztNQUM5RTtBQUNBLFVBQUksQ0FBQyxLQUFLLE1BQU0sVUFBVSxHQUFHLE9BQU8sU0FBUyxFQUFHLE1BQUssS0FBSyxpQkFBaUI7SUFDN0U7O0lBR0EsY0FBYyxVQUF5RDtBQUNyRSxXQUFLLFlBQVksSUFBSSxRQUFRO0FBQzdCLGFBQU8sTUFBTSxLQUFLLFlBQVksT0FBTyxRQUFRO0lBQy9DOztJQUdBLHFCQUFxQixXQUEwQztBQUM3RCxXQUFLLFdBQVcsS0FBSyxTQUFTO0FBQzlCLGFBQU8sTUFBTTtBQUNYLGFBQUssYUFBYSxLQUFLLFdBQVcsT0FBTyxDQUFDLFVBQVUsVUFBVSxTQUFTO01BQ3pFO0lBQ0Y7O0lBR0EsUUFBZTtBQUNiLGFBQU8sSUFBSSxNQUFNLElBQUk7SUFDdkI7SUFFQSxPQUFnQjtBQUNkLFlBQU0sS0FBSyxLQUFLLFFBQVEsS0FBSyxLQUFLLEtBQUs7QUFDdkMsVUFBSSxDQUFDLEdBQUksUUFBTztBQUNoQixXQUFLLFNBQVMsRUFBRTtBQUNoQixhQUFPO0lBQ1Q7SUFFQSxPQUFnQjtBQUNkLFlBQU0sS0FBSyxLQUFLLFFBQVEsS0FBSyxLQUFLLEtBQUs7QUFDdkMsVUFBSSxDQUFDLEdBQUksUUFBTztBQUNoQixXQUFLLFNBQVMsRUFBRTtBQUNoQixhQUFPO0lBQ1Q7SUFFQSxJQUFJLFVBQW1CO0FBQ3JCLGFBQU8sS0FBSyxRQUFRO0lBQ3RCO0lBRUEsSUFBSSxVQUFtQjtBQUNyQixhQUFPLEtBQUssUUFBUTtJQUN0Qjs7SUFHQSxpQkFHRTtBQUNBLGFBQU8sRUFBRSxNQUFNLEtBQUssUUFBUSxhQUFhLE1BQU0sS0FBSyxRQUFRLFlBQUE7SUFDOUQ7O0lBR0EsZUFBcUI7QUFDbkIsV0FBSyxRQUFRLE1BQUE7QUFDYixXQUFLLGdCQUFnQjtBQUNyQixXQUFLLEtBQUssYUFBYTtJQUN6Qjs7Ozs7OztJQVFBLFdBQVcsU0FBK0IsVUFBNkIsQ0FBQSxHQUFVO0FBQy9FLFVBQUksS0FBSyxVQUFXO0FBQ3BCLFlBQU0sTUFBTTtRQUNWLG1CQUFtQixhQUFhLFVBQVUsYUFBYSxLQUFLLFFBQVEsT0FBTztNQUFBO0FBRTdFLFlBQU0sS0FBSyxLQUFLLE1BQU07QUFDdEIsU0FBRyxLQUFLLElBQUksaUJBQWlCLENBQUEsR0FBSSxHQUFHLEtBQUssTUFBTSxJQUFJLFlBQVksSUFBSSxPQUFPLENBQUM7QUFDM0UsU0FBRyxhQUFhLGNBQWMsR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbEQsVUFBSSxRQUFRLGlCQUFpQixLQUFNLElBQUcsUUFBUSxnQkFBZ0IsS0FBSztBQUNuRSxXQUFLLFNBQVMsRUFBRTtBQUNoQixVQUFJLFFBQVEsaUJBQWlCLEtBQU0sTUFBSyxRQUFRLE1BQUE7SUFDbEQ7SUFFQSxVQUFtQjtBQUNqQixhQUFPLEtBQUssTUFBTSxJQUFJLE9BQUE7SUFDeEI7SUFFQSxVQUFrQjtBQUNoQixhQUFPLGdCQUFnQixLQUFLLE1BQU0sR0FBRztJQUN2QztJQUVBLFVBQWtCO0FBQ2hCLGFBQU8sZ0JBQWdCLEtBQUssTUFBTSxHQUFHO0lBQ3ZDO0lBRUEsb0JBQTRCO0FBQzFCLGFBQU8sZUFBZSxLQUFLLE1BQU0sR0FBRztJQUN0QztJQUVBLGVBQXVCO0FBQ3JCLGFBQU8sVUFBVSxLQUFLLE1BQU0sR0FBRztJQUNqQztJQUVBLG1CQUEyQjtBQUN6QixhQUFPLGNBQWMsS0FBSyxNQUFNLEdBQUc7SUFDckM7SUFFQSxvQkFBNEI7QUFDMUIsYUFBTyxlQUFlLEtBQUssTUFBTSxHQUFHO0lBQ3RDOztJQUdBLFlBQVksVUFBeUI7QUFDbkMsV0FBSyxNQUFNLFlBQVksUUFBUTtJQUNqQzs7SUFHQSxjQUFjLFNBQXdCO0FBQ3BDLFdBQUssTUFBTSxjQUFjLE9BQU87SUFDbEM7SUFFQSxJQUFJLGFBQXNCO0FBQ3hCLGFBQU8sS0FBSyxNQUFNLGNBQWM7SUFDbEM7SUFFQSxTQUFTLFVBQTJCO0FBQ2xDLGFBQU8sYUFBYSxLQUFLLE9BQU8sUUFBUTtJQUMxQzs7Ozs7Ozs7Ozs7Ozs7SUFlQSxjQUE4QjtBQUM1QixVQUFJLEtBQUssY0FBZSxRQUFPLEtBQUs7QUFDcEMsWUFBTSxZQUF1QixLQUFLLE1BQU07QUFDeEMsVUFBSSxRQUFRLFdBQVcsS0FBSyxNQUFNLEtBQUssVUFBVSxLQUFLLElBQUk7QUFDMUQsVUFBSSxTQUFTLENBQUMsTUFBTSxhQUFhO0FBRS9CLGdCQUFRLE1BQU0sUUFBUSxXQUFXLFVBQVUsS0FBSyxNQUFNLEtBQUs7TUFDN0Q7QUFDQSxZQUFNLFlBQVksT0FBTyxjQUFjLFFBQVE7QUFDL0MsWUFBTSxjQUFjLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxLQUFLLEVBQUU7UUFBTyxDQUFDLFNBQy9ELGFBQWEsS0FBSyxPQUFPLElBQUk7TUFBQTtBQUUvQixZQUFNLFlBQW1DLENBQUE7QUFDekMsaUJBQVcsUUFBUSxhQUFhO0FBQzlCLGNBQU0sUUFBUSxnQkFBZ0IsS0FBSyxPQUFPLElBQUk7QUFDOUMsWUFBSSxNQUFPLFdBQVUsSUFBSSxJQUFJO01BQy9CO0FBQ0EsWUFBTSxTQUFTLFdBQVcsTUFBTTtBQUNoQyxZQUFNLE9BQXVCO1FBQzNCO1FBQ0E7UUFDQSxXQUFXLFdBQVcsS0FBSyxRQUFRO1FBQ25DLFlBQVksV0FBVyxTQUFTO1FBQ2hDLFVBQVUsa0JBQWtCLEtBQUssTUFBTSxLQUFLLFVBQVUsS0FBSyxJQUFJO1FBQy9ELE9BQU8sT0FBTyxXQUFXLE1BQU0sVUFBVSxXQUFXLFVBQVUsTUFBTSxRQUFRO1FBQzVFLFFBQVEsT0FBTyxXQUFXLFdBQVcsU0FBUztRQUM5QyxTQUFTLEtBQUs7UUFDZCxTQUFTLEtBQUs7UUFDZCxnQkFBZ0IsVUFBVTtNQUFBO0FBSzVCLFlBQU0sV0FBVyxLQUFLLGdCQUFnQixlQUFlLEtBQUssY0FBYyxJQUFJO0FBQzVFLFdBQUssZ0JBQWdCLFdBQVksS0FBSyxlQUFrQztBQUN4RSxXQUFLLGVBQWUsS0FBSztBQUN6QixhQUFPLEtBQUs7SUFDZDs7SUFHQSxVQUFVLFVBQWtDO0FBQzFDLGFBQU8sS0FBSyxHQUFHLGVBQWUsUUFBUTtJQUN4QztJQUVBLEdBQUcsT0FBb0IsVUFBa0M7QUFDdkQsVUFBSSxNQUFNLEtBQUssVUFBVSxJQUFJLEtBQUs7QUFDbEMsVUFBSSxDQUFDLEtBQUs7QUFDUixjQUFBLG9CQUFVLElBQUE7QUFDVixhQUFLLFVBQVUsSUFBSSxPQUFPLEdBQUc7TUFDL0I7QUFDQSxVQUFJLElBQUksUUFBUTtBQUNoQixhQUFPLE1BQU0sSUFBSSxPQUFPLFFBQVE7SUFDbEM7SUFFQSxVQUFnQjtBQUNkLFdBQUssTUFBTSxRQUFBO0FBQ1gsV0FBSyxPQUFPO0FBQ1osV0FBSyxZQUFZO0FBQ2pCLFdBQUssVUFBVSxNQUFBO0FBQ2YsV0FBSyxZQUFZLE1BQUE7QUFDakIsV0FBSyxhQUFhLENBQUE7SUFDcEI7SUFFUSxLQUFLLE9BQTBCO0FBQ3JDLGlCQUFXLFlBQVksS0FBSyxVQUFVLElBQUksS0FBSyxLQUFLLENBQUEsRUFBSSxVQUFBO0lBQzFEO0VBQ0Y7QUFNQSxXQUFTLGtCQUFrQixLQUFpQixNQUEyQjtBQUNyRSxRQUFJLEtBQUssU0FBUyxFQUFHLFFBQU87QUFDNUIsVUFBTSxPQUFPLFdBQVcsS0FBSyxLQUFLLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDOUMsUUFBSSxNQUFNLEtBQUssU0FBUyxjQUFjLE1BQU0sS0FBSyxTQUFTLFdBQVksUUFBTztBQUM3RSxXQUFPLFdBQVcsS0FBSyxLQUFLLE1BQU0sR0FBRyxFQUFFLENBQUMsR0FBRyxLQUFLLFFBQVE7RUFDMUQ7QUFHQSxXQUFTLGdCQUFnQixPQUFvQixNQUE0QjtBQUN2RSxVQUFNLE9BQU8sTUFBTSxPQUFPLE1BQU0sSUFBSTtBQUNwQyxRQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFVBQU0sWUFBWSxNQUFNO0FBQ3hCLFFBQUksVUFBVSxTQUFTLHFCQUFxQixlQUFlO0FBQ3pELFlBQU0sUUFBUSxXQUFXLE1BQU0sS0FBSyxVQUFVLEtBQUssSUFBSTtBQUN2RCxZQUFNLFFBQ0osTUFBTSxnQkFDTCxPQUFPLGNBQWMsb0JBQW9CLE1BQU0sU0FBUyxVQUFVLEtBQUssTUFBTSxJQUFJLENBQUE7QUFDcEYsYUFBTyxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssU0FBUyxJQUFJLEdBQUcsU0FBUztJQUM1RDtBQUNBLGVBQVcsU0FBUyxjQUFjLE1BQU0sS0FBSyxVQUFVLE1BQU0sVUFBVSxFQUFFLEdBQUc7QUFDMUUsVUFBSSxNQUFNLFFBQVEsTUFBTSxHQUFJO0FBQzVCLFlBQU0sQ0FBQyxLQUFLLElBQUksZUFBZSxNQUFNLEtBQUssU0FBUyxNQUFNLE1BQU0sTUFBTSxJQUFJLElBQUk7QUFDN0UsVUFBSSxNQUFPLFFBQU8sTUFBTSxLQUFLO0lBQy9CO0FBQ0EsV0FBTztFQUNUO0FBSUEsV0FBUyxlQUFlLEdBQW1CLEdBQTRCO0FBQ3JFLFdBQ0UsRUFBRSxjQUFjLEVBQUUsYUFDbEIsRUFBRSxhQUFhLEVBQUUsWUFDakIsRUFBRSxVQUFVLEVBQUUsU0FDZCxFQUFFLFdBQVcsRUFBRSxVQUNmLEVBQUUsWUFBWSxFQUFFLFdBQ2hCLEVBQUUsWUFBWSxFQUFFLFdBQ2hCLEVBQUUsbUJBQW1CLEVBQUUsa0JBQ3ZCLFlBQVksRUFBRSxhQUFhLEVBQUUsV0FBVyxLQUN4Q0UsV0FBVSxFQUFFLFlBQVksRUFBRSxVQUFVLEtBQ3BDLFlBQVksRUFBRSxXQUFXLEVBQUUsU0FBUztFQUV4QztBQUVBLFdBQVMsWUFBWSxHQUFzQixHQUErQjtBQUN4RSxXQUFPLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsT0FBTyxVQUFVLFVBQVUsRUFBRSxLQUFLLENBQUM7RUFDOUU7QUFFQSxXQUFTQSxXQUFVLEdBQWlCLEdBQTBCO0FBQzVELFFBQUksTUFBTSxFQUFHLFFBQU87QUFDcEIsUUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFHLFFBQU87QUFDckIsV0FBTyxRQUFRLEdBQUcsQ0FBQztFQUNyQjtBQUVBLFdBQVMsWUFDUCxHQUNBLEdBQ1M7QUFDVCxVQUFNLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFDMUIsUUFBSSxLQUFLLFdBQVcsT0FBTyxLQUFLLENBQUMsRUFBRSxPQUFRLFFBQU87QUFDbEQsV0FBTyxLQUFLLE1BQU0sQ0FBQyxRQUFRO0FBQ3pCLFlBQU0sUUFBUSxFQUFFLEdBQUc7QUFDbkIsYUFBTyxVQUFVLFVBQWEsUUFBUSxFQUFFLEdBQUcsR0FBWSxLQUFLO0lBQzlELENBQUM7RUFDSDtBQUVPLE1BQU0saUJBQU4sTUFBcUI7SUFDMUIsWUFBNkJDLFNBQWdCO0FBQWhCLFdBQUEsU0FBQUE7SUFBaUI7SUFBakI7SUFFN0IsV0FBVyxNQUF1QjtBQUNoQyxhQUFPLEtBQUssT0FBTyxLQUFLLFdBQVcsSUFBSSxDQUFDO0lBQzFDO0lBRUEsa0JBQTJCO0FBQ3pCLGFBQU8sS0FBSyxPQUFPLEtBQUssZUFBZTtJQUN6QztJQUVBLFdBQVcsTUFBYyxPQUF3QjtBQUMvQyxhQUFPLEtBQUssT0FBTyxLQUFLLFdBQVcsTUFBTSxLQUFLLENBQUM7SUFDakQ7O0lBR0EsUUFBUSxNQUFjLE9BQXVCO0FBQzNDLGFBQU8sS0FBSyxPQUFPLEtBQUssUUFBUSxNQUFNLEtBQUssQ0FBQztJQUM5QztJQUVBLFVBQVUsTUFBdUI7QUFDL0IsYUFBTyxLQUFLLE9BQU8sS0FBSyxVQUFVLElBQUksQ0FBQztJQUN6QztJQUVBLGNBQWMsUUFBeUI7QUFDckMsYUFBTyxLQUFLLFFBQVEsY0FBYyxFQUFFLE9BQUEsQ0FBUTtJQUM5QztJQUVBLFlBQVksTUFBdUI7QUFDakMsYUFBTyxLQUFLLFFBQVEsWUFBWSxFQUFFLEtBQUEsQ0FBTTtJQUMxQztJQUVBLGFBQWEsT0FBd0I7QUFDbkMsYUFBTyxLQUFLLFFBQVEsYUFBYSxFQUFFLE1BQUEsQ0FBTztJQUM1QztJQUVBLG1CQUFtQixPQUF3QjtBQUN6QyxhQUFPLEtBQUssUUFBUSxtQkFBbUIsRUFBRSxNQUFBLENBQU87SUFDbEQ7SUFFQSxRQUFRLE1BQWMsT0FBeUI7QUFDN0MsYUFBTyxLQUFLLFFBQVEsUUFBUSxRQUFRLEVBQUUsTUFBTSxNQUFBLElBQVUsRUFBRSxLQUFBLENBQU07SUFDaEU7SUFFQSxZQUFxQjtBQUNuQixhQUFPLEtBQUssVUFBVSxNQUFNO0lBQzlCO0lBRUEsa0JBQTJCO0FBQ3pCLGFBQU8sS0FBSyxPQUFPLEtBQUssZUFBZTtJQUN6QztJQUVBLHVCQUFnQztBQUM5QixhQUFPLEtBQUssT0FBTyxLQUFLLG9CQUFvQjtJQUM5QztJQUVBLHFCQUE4QjtBQUM1QixhQUFPLEtBQUssT0FBTyxLQUFLLGtCQUFrQjtJQUM1QztJQUVBLGFBQWEsT0FBZ0U7QUFDM0UsYUFBTyxLQUFLLE9BQU8sS0FBSyxhQUFhLEtBQUssQ0FBQztJQUM3Qzs7SUFHQSxjQUFjLE9BQXdDO0FBQ3BELGFBQU8sS0FBSyxPQUFPLEtBQUssY0FBYyxLQUFLLENBQUM7SUFDOUM7O0lBR0Esb0JBQW9CLE1BQWtFO0FBQ3BGLGFBQU8sS0FBSyxPQUFPLEtBQUssb0JBQW9CLElBQUksQ0FBQztJQUNuRDs7SUFHQSxpQkFBaUIsU0FBaUM7QUFDaEQsYUFBTyxLQUFLLE9BQU8sS0FBSyxpQkFBaUIsT0FBTyxDQUFDO0lBQ25EO0lBRUEsa0JBQTJCO0FBQ3pCLGFBQU8sS0FBSyxPQUFPLEtBQUssZUFBZTtJQUN6Qzs7SUFHQSxZQUFZLE1BQXlCO0FBQ25DLGFBQU8sS0FBSyxPQUFPLEtBQUssWUFBWSxJQUFJLENBQUM7SUFDM0M7SUFFQSxTQUFrQjtBQUNoQixhQUFPLEtBQUssT0FBTyxLQUFLLGFBQWEsQ0FBQyxDQUFDO0lBQ3pDO0lBRUEsVUFBbUI7QUFDakIsYUFBTyxLQUFLLE9BQU8sS0FBSyxhQUFhLEVBQUUsQ0FBQztJQUMxQztJQUVBLGNBQWMsT0FBdUI7QUFDbkMsYUFBTyxLQUFLLE9BQU8sS0FBSyxjQUFjLEtBQUssQ0FBQztJQUM5QztJQUVBLGFBQWEsTUFBYyxPQUF3QjtBQUNqRCxhQUFPLEtBQUssT0FBTyxLQUFLLGFBQWEsTUFBTSxLQUFLLENBQUM7SUFDbkQ7SUFFQSxlQUF3QjtBQUN0QixhQUFPLEtBQUssYUFBYSxXQUFXO0lBQ3RDO0lBRUEsV0FBVyxPQUF3QjtBQUNqQyxhQUFPLEtBQUssYUFBYSxXQUFXLEVBQUUsTUFBQSxDQUFPO0lBQy9DO0lBRUEsYUFBc0I7QUFDcEIsYUFBTyxLQUFLLE9BQU8sS0FBSyxVQUFVO0lBQ3BDO0lBRUEsZUFBd0I7QUFDdEIsYUFBTyxLQUFLLE9BQU8sS0FBSyxZQUFZO0lBQ3RDO0lBRUEsa0JBQTJCO0FBQ3pCLGFBQU8sS0FBSyxPQUFPLEtBQUssaUJBQWlCLFdBQVcsQ0FBQztJQUN2RDtJQUVBLHVCQUFnQztBQUM5QixhQUFPLEtBQUssT0FBTyxLQUFLLGlCQUFpQixnQkFBZ0IsQ0FBQztJQUM1RDtJQUVBLE9BQU8sTUFBYyxPQUF3QjtBQUMzQyxhQUFPLEtBQUssT0FBTyxLQUFLLE9BQU8sTUFBTSxLQUFLLENBQUM7SUFDN0M7SUFFQSxtQkFBNEI7QUFDMUIsYUFBTyxLQUFLLE9BQU8sS0FBSyxXQUFXLFlBQVksQ0FBQztJQUNsRDtJQUVBLG9CQUE2QjtBQUMzQixhQUFPLEtBQUssT0FBTyxLQUFLLFdBQVcsYUFBYSxDQUFDO0lBQ25EO0lBRUEsaUJBQTBCO0FBQ3hCLGFBQU8sS0FBSyxPQUFPLEtBQUssY0FBYztJQUN4Qzs7SUFHQSxvQkFBNkI7QUFDM0IsYUFBTyxLQUFLLE9BQU8sS0FBSyxpQkFBaUI7SUFDM0M7O0lBR0EsYUFBYSxPQUErQjtBQUMxQyxhQUFPLEtBQUssT0FBTyxLQUFLLGFBQWEsS0FBSyxDQUFDO0lBQzdDO0lBRUEsbUJBQTRCO0FBQzFCLGFBQU8sS0FBSyxPQUFPLEtBQUssZ0JBQWdCO0lBQzFDO0lBRUEsa0JBQWtCLE9BQXdCO0FBQ3hDLGFBQU8sS0FBSyxPQUFPLEtBQUssa0JBQWtCLEtBQUssQ0FBQztJQUNsRDtJQUVBLGdDQUF5QztBQUN2QyxhQUFPLEtBQUssT0FBTyxLQUFLLDZCQUE2QjtJQUN2RDtJQUVBLGdCQUF5QjtBQUN2QixhQUFPLEtBQUssT0FBTyxLQUFLLGFBQWE7SUFDdkM7SUFFQSxlQUF3QjtBQUN0QixhQUFPLEtBQUssT0FBTyxLQUFLLFlBQVk7SUFDdEM7SUFFQSxlQUF3QjtBQUN0QixhQUFPLEtBQUssT0FBTyxLQUFLLFlBQVk7SUFDdEM7SUFFQSxlQUF3QjtBQUN0QixhQUFPLEtBQUssYUFBYSxXQUFXO0lBQ3RDO0lBRUEsT0FBZ0I7QUFDZCxhQUFPLEtBQUssT0FBTyxLQUFLLElBQUk7SUFDOUI7SUFFQSxZQUFxQjtBQUNuQixhQUFPLEtBQUssT0FBTyxLQUFLLFNBQVM7SUFDbkM7SUFFQSxPQUFnQjtBQUNkLGFBQU8sS0FBSyxPQUFPLEtBQUE7SUFDckI7SUFFQSxPQUFnQjtBQUNkLGFBQU8sS0FBSyxPQUFPLEtBQUE7SUFDckI7RUFDRjtBQUdPLE1BQU0sUUFBTixNQUFZO0lBR2pCLFlBQTZCQSxTQUFnQjtBQUFoQixXQUFBLFNBQUFBO0lBQWlCO0lBQWpCO0lBRlosUUFBMkIsQ0FBQTs7SUFLNUMsUUFBYztBQUNaLFdBQUssTUFBTSxLQUFLLE1BQU07QUFDcEIsYUFBSyxPQUFPLE1BQU0sTUFBQTtBQUNsQixlQUFPO01BQ1QsQ0FBQztBQUNELGFBQU87SUFDVDtJQUVBLFFBQVEsU0FBd0I7QUFDOUIsV0FBSyxNQUFNLEtBQUssTUFBTSxLQUFLLE9BQU8sS0FBSyxPQUFPLENBQUM7QUFDL0MsYUFBTztJQUNUO0lBRUEsV0FBVyxNQUFvQjtBQUM3QixXQUFLLE1BQU0sS0FBSyxNQUFNLEtBQUssT0FBTyxTQUFTLFdBQVcsSUFBSSxDQUFDO0FBQzNELGFBQU87SUFDVDtJQUVBLFdBQVcsTUFBYyxPQUFxQjtBQUM1QyxXQUFLLE1BQU0sS0FBSyxNQUFNLEtBQUssT0FBTyxTQUFTLFdBQVcsTUFBTSxLQUFLLENBQUM7QUFDbEUsYUFBTztJQUNUO0lBRUEsYUFBYSxNQUFjLE9BQXFCO0FBQzlDLFdBQUssTUFBTSxLQUFLLE1BQU0sS0FBSyxPQUFPLFNBQVMsYUFBYSxNQUFNLEtBQUssQ0FBQztBQUNwRSxhQUFPO0lBQ1Q7SUFFQSxXQUFXLE9BQXFCO0FBQzlCLFdBQUssTUFBTSxLQUFLLE1BQU0sS0FBSyxPQUFPLFNBQVMsV0FBVyxLQUFLLENBQUM7QUFDNUQsYUFBTztJQUNUO0lBRUEsZUFBcUI7QUFDbkIsV0FBSyxNQUFNLEtBQUssTUFBTSxLQUFLLE9BQU8sU0FBUyxhQUFBLENBQWM7QUFDekQsYUFBTztJQUNUO0lBRUEsTUFBZTtBQUNiLGFBQU8sS0FBSyxNQUFNLE9BQU8sQ0FBQyxJQUFJLFNBQVMsS0FBQSxLQUFVLElBQUksSUFBSTtJQUMzRDtFQUNGO0FBR08sV0FBUyxhQUFhLFNBQWdDO0FBQzNELFdBQU8sSUFBSSxPQUFPLE9BQU87RUFDM0I7OztBQy90Qk8sTUFBTSxxQkFBcUI7QUFNM0IsV0FBUyxvQkFBOEM7QUFDNUQsVUFBTSxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsR0FBRyxHQUFHLFdBQVcsRUFBRSxTQUFTLEVBQUUsRUFBRTtBQUNuRSxVQUFNLFlBQVksQ0FBQyxNQUFZLGVBQStDO01BQzVFLE9BQU87TUFDUCx3QkFBd0IsT0FBTyxLQUFLLE1BQU0sVUFBVSxFQUFFO01BQ3RELDJCQUEyQixPQUFPLE9BQU8sS0FBSyxNQUFNLGFBQWEsQ0FBQyxLQUFLLENBQUM7SUFDMUU7QUFDQSxVQUFNLGNBQWMsQ0FBQyxhQUEwQjtNQUM3QyxRQUFRLFFBQVEsYUFBYSxzQkFBc0IsS0FBSztNQUN4RCxXQUFXLE9BQU8sUUFBUSxhQUFhLHlCQUF5QixLQUFLLEdBQUcsS0FBSztJQUMvRTtBQUNBLFdBQU87TUFDTCxXQUFXO1FBQ1Q7UUFDQSxVQUFVO1FBQ1YsUUFBUSxDQUFDLFVBQVUsRUFBRSxLQUFLLE9BQU8sT0FBTyxVQUFVLE1BQU0sb0JBQW9CLEVBQUU7UUFDOUUsV0FBVyxDQUFDLEVBQUUsS0FBSyxPQUFPLFVBQVUsWUFBWSxDQUFDO01BQ25EO01BQ0EsVUFBVTtRQUNSO1FBQ0EsVUFBVTtRQUNWLFFBQVEsQ0FBQyxVQUFVLEVBQUUsS0FBSyxPQUFPLE9BQU8sVUFBVSxNQUFNLG1CQUFtQixFQUFFOzs7O1FBSTdFLFdBQVc7VUFDVCxFQUFFLEtBQUssT0FBTyxXQUFXLHdCQUF3QixVQUFVLFlBQVk7VUFDdkUsRUFBRSxLQUFLLE9BQU8sVUFBVSxZQUFZO1FBQ3RDO01BQ0Y7SUFDRjtFQUNGO0FBMkNBLFdBQVMsU0FBUyxNQUFrQixPQUF3QixRQUFnQztBQUMxRixRQUFJLENBQUMsS0FBSyxPQUFRLFFBQU87QUFDekIsVUFBTSxNQUFNLEtBQUssTUFBTTtNQUNyQixDQUFDLFNBQVMsS0FBSyxTQUFTLE1BQU0sYUFBYSxLQUFLLE1BQU0sV0FBVztJQUNuRTtBQUNBLFFBQUksSUFBSyxRQUFPO0FBQ2hCLFdBQU8sS0FBSyxNQUFNLEtBQUssQ0FBQyxTQUFTLEtBQUssU0FBUyxNQUFNLFFBQVEsSUFBSSxTQUFTO0VBQzVFO0FBR0EsV0FBUyxpQkFDUCxPQUNBLE1BQ0EsSUFDQSxPQUNBLFFBQzRCO0FBQzVCLFVBQU0sV0FBOEIsQ0FBQztBQUNyQyxRQUFJLFNBQVM7QUFDYixlQUFXLFNBQVMsTUFBTSxRQUFRLFVBQVU7QUFDMUMsWUFBTUMsU0FBUTtBQUNkLGdCQUFVLFdBQVcsS0FBSztBQUMxQixVQUFJQSxVQUFTLE1BQU0sVUFBVSxLQUFNO0FBQ25DLFlBQU0sU0FBUyxTQUFTLE9BQU8sT0FBTyxNQUFNO0FBQzVDLFlBQU0sVUFBVSxFQUFFLE1BQU0sS0FBSyxJQUFJQSxRQUFPLElBQUksR0FBRyxJQUFJLEtBQUssSUFBSSxRQUFRLEVBQUUsR0FBRyxPQUFPO0FBQ2hGLFlBQU0sT0FBTyxTQUFTLFNBQVMsU0FBUyxDQUFDO0FBQ3pDLFVBQUksUUFBUSxLQUFLLE9BQU8sUUFBUSxRQUFRLEtBQUssV0FBVyxRQUFRO0FBQzlELGlCQUFTLFNBQVMsU0FBUyxDQUFDLElBQUksRUFBRSxNQUFNLEtBQUssTUFBTSxJQUFJLFFBQVEsSUFBSSxPQUFPO01BQzVFLE9BQU87QUFDTCxpQkFBUyxLQUFLLE9BQU87TUFDdkI7SUFDRjtBQUNBLFdBQU87RUFDVDtBQWlCQSxXQUFTLFVBQVUsS0FBa0IsUUFBa0M7QUFDckUsZUFBVyxPQUFPLE9BQU8sU0FBUyxHQUFHO0FBQ25DLFVBQUksUUFBUSxtQkFBb0I7QUFDaEMsVUFBSSxRQUFRLEtBQUssT0FBTyxRQUFRLEdBQUcsQ0FBQztJQUN0QztBQUNBLFdBQU87RUFDVDtBQUdBLFdBQVMsY0FBYyxPQUFtQixPQUF1QztBQUMvRSxRQUFJLFFBQVEsRUFBRyxRQUFPO0FBQ3RCLFFBQUksU0FBUztBQUNiLGVBQVcsU0FBUyxNQUFNLFFBQVEsVUFBVTtBQUMxQyxZQUFNLE9BQU8sV0FBVyxLQUFLO0FBQzdCLFVBQUksUUFBUSxTQUFTLEtBQU0sUUFBTyxNQUFNLFNBQVMsTUFBTSxRQUFRO0FBQy9ELGdCQUFVO0lBQ1o7QUFDQSxXQUFPO0VBQ1Q7QUFFQSxXQUFTLGVBQWUsT0FBbUIsTUFBYyxJQUFxQjtBQUM1RSxRQUFJLFNBQVM7QUFDYixlQUFXLFNBQVMsTUFBTSxRQUFRLFVBQVU7QUFDMUMsWUFBTSxPQUFPLFdBQVcsS0FBSztBQUM3QixVQUFJLFNBQVMsTUFBTSxTQUFTLE9BQU8sUUFBUSxDQUFDLE1BQU0sT0FBUSxRQUFPO0FBQ2pFLGdCQUFVO0lBQ1o7QUFDQSxXQUFPO0VBQ1Q7QUFVTyxNQUFNLGVBQU4sTUFBbUI7SUFJeEIsWUFDbUJDLFNBQ0EsU0FDakI7QUFGaUIsV0FBQSxTQUFBQTtBQUNBLFdBQUEsVUFBQTtJQUNoQjtJQUZnQjtJQUNBO0lBTFgsU0FBOEI7SUFDckIsWUFBWSxvQkFBSSxJQUFnQztJQU9qRSxJQUFJLFlBQXFCO0FBQ3ZCLGFBQU8sS0FBSyxXQUFXO0lBQ3pCOzs7Ozs7Ozs7O0lBV0EsZ0JBQWdCLFVBQWtEO0FBQ2hFLFdBQUssVUFBVSxJQUFJLFFBQVE7QUFDM0IsYUFBTyxNQUFNLEtBQUssVUFBVSxPQUFPLFFBQVE7SUFDN0M7SUFFUSxXQUFpQjtBQUN2QixZQUFNLFVBQVUsS0FBSztBQUNyQixpQkFBVyxZQUFZLENBQUMsR0FBRyxLQUFLLFNBQVMsRUFBRyxVQUFTLE9BQU87SUFDOUQ7SUFFQSxTQUFlO0FBQ2IsVUFBSSxLQUFLLE9BQVE7QUFDakIsV0FBSyxTQUFTLEtBQUssT0FBTyxxQkFBcUIsS0FBSyxTQUFTO0FBQzdELFdBQUssU0FBUztJQUNoQjtJQUVBLFVBQWdCO0FBQ2QsVUFBSSxDQUFDLEtBQUssT0FBUTtBQUNsQixXQUFLLE9BQU87QUFDWixXQUFLLFNBQVM7QUFDZCxXQUFLLFNBQVM7SUFDaEI7O0lBR0EsY0FBMEM7QUFDeEMsWUFBTSxNQUF5QixDQUFDO0FBQ2hDLFlBQU1DLFVBQVMsS0FBSyxPQUFPO0FBQzNCLGlCQUFXLEVBQUUsTUFBTSxLQUFLLEtBQUssV0FBVyxLQUFLLE9BQU8sTUFBTSxHQUFHLEdBQUc7QUFDOUQsY0FBTSxTQUFTLGFBQWEsS0FBSyxPQUFPO0FBQ3hDLG1CQUFXLFFBQVEsQ0FBQyxhQUFhLFVBQVUsR0FBWTtBQUNyRCxnQkFBTSxPQUFPQSxRQUFPLE1BQU0sSUFBSTtBQUM5QixjQUFJLENBQUMsS0FBTTtBQUNYLHFCQUFXLFNBQVMsZUFBZSxLQUFLLFNBQVMsR0FBRyxRQUFRLElBQUksR0FBRztBQUNqRSxnQkFBSSxLQUFLO2NBQ1A7Y0FDQSxNQUFNLE1BQU07Y0FDWixJQUFJLE1BQU07Y0FDVjtjQUNBLFFBQVEsT0FBTyxNQUFNLEtBQUssTUFBTSxVQUFVLEVBQUU7Y0FDNUMsV0FBVyxPQUFPLE1BQU0sS0FBSyxNQUFNLGFBQWEsQ0FBQztjQUNqRCxNQUFNLE1BQU07WUFDZCxDQUFDO1VBQ0g7UUFDRjtNQUNGO0FBQ0EsYUFBTyxJQUFJLEtBQUssQ0FBQyxHQUFHLE1BQU0sYUFBYSxFQUFFLE1BQU0sRUFBRSxJQUFJLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSTtJQUMzRTtJQUVBLElBQUksaUJBQTBCO0FBQzVCLGFBQU8sS0FBSyxZQUFZLEVBQUUsU0FBUztJQUNyQztJQUVBLFlBQXFCO0FBQ25CLGFBQU8sS0FBSyxNQUFNLEtBQUssWUFBWSxHQUFHLFFBQVE7SUFDaEQ7SUFFQSxZQUFxQjtBQUNuQixhQUFPLEtBQUssTUFBTSxLQUFLLFlBQVksR0FBRyxRQUFRO0lBQ2hEOztJQUdBLE9BQU8sYUFBa0Q7QUFDdkQsYUFBTyxLQUFLLE1BQU0sYUFBYSxRQUFRO0lBQ3pDO0lBRUEsT0FBTyxhQUFrRDtBQUN2RCxhQUFPLEtBQUssTUFBTSxhQUFhLFFBQVE7SUFDekM7O0lBR0EsU0FBUyxVQUE2QjtBQUNwQyxhQUFPLEtBQUssTUFBTSxLQUFLLEdBQUcsUUFBUSxHQUFHLFFBQVE7SUFDL0M7SUFFQSxTQUFTLFVBQTZCO0FBQ3BDLGFBQU8sS0FBSyxNQUFNLEtBQUssR0FBRyxRQUFRLEdBQUcsUUFBUTtJQUMvQztJQUVRLEdBQUcsVUFBZ0Q7QUFDekQsWUFBTSxRQUFRLEtBQUssWUFBWSxFQUFFO1FBQy9CLENBQUMsZUFDQyxXQUFXLFdBQVcsTUFBTSxTQUFTLElBQUksS0FDekMsV0FBVyxRQUFRLFNBQVMsVUFDNUIsU0FBUyxVQUFVLFdBQVc7TUFDbEM7QUFDQSxhQUFPLFFBQVEsQ0FBQyxLQUFLLElBQUksQ0FBQztJQUM1QjtJQUVRLE1BQU0sYUFBeUMsTUFBb0M7QUFDekYsVUFBSSxZQUFZLFdBQVcsRUFBRyxRQUFPO0FBQ3JDLFlBQU0sS0FBSyxLQUFLLE9BQU8sTUFBTSxHQUFHLFFBQVEsb0JBQW9CLElBQUk7QUFFaEUsWUFBTUMsV0FBVSxDQUFDLEdBQUcsV0FBVyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDOUMsY0FBTSxTQUFTLGFBQWEsRUFBRSxNQUFNLEVBQUUsSUFBSTtBQUMxQyxlQUFPLFdBQVcsSUFBSSxTQUFTLEVBQUUsT0FBTyxFQUFFO01BQzVDLENBQUM7QUFDRCxpQkFBVyxjQUFjQSxVQUFTO0FBQ2hDLGNBQU0sV0FBWSxXQUFXLFNBQVMsaUJBQWtCLFNBQVM7QUFDakUsWUFBSSxVQUFVO0FBQ1osYUFBRztZQUNELElBQUksZUFBZSxXQUFXLE1BQU0sV0FBVyxNQUFNLFdBQVcsSUFBSSxXQUFXLElBQUk7VUFDckY7UUFDRixPQUFPO0FBQ0wsYUFBRztZQUNELElBQUksa0JBQWtCLFdBQVcsTUFBTSxXQUFXLE1BQU0sV0FBVyxJQUFJLFNBQVMsS0FBSztVQUN2RjtRQUNGO01BQ0Y7QUFDQSxXQUFLLE9BQU8sU0FBUyxFQUFFO0FBQ3ZCLGFBQU87SUFDVDtJQUVRLFlBQStCLENBQUMsSUFBSSxVQUFVO0FBQ3BELFVBQUksQ0FBQyxHQUFHLGNBQWMsR0FBRyxRQUFRLGNBQWMsTUFBTSxNQUFPLFFBQU87QUFDbkUsVUFBSSxHQUFHLFFBQVEsa0JBQWtCLEVBQUcsUUFBTztBQUMzQyxZQUFNLE9BQU8sb0JBQW9CLEdBQUcsS0FBSztBQUN6QyxVQUFJLENBQUMsS0FBTSxRQUFPO0FBQ2xCLFlBQU1ELFVBQVMsTUFBTTtBQUNyQixZQUFNLFlBQVlBLFFBQU8sTUFBTTtBQUMvQixZQUFNLFdBQVdBLFFBQU8sTUFBTTtBQUM5QixVQUFJLENBQUMsYUFBYSxDQUFDLFNBQVUsUUFBTztBQUNwQyxZQUFNLFFBQVEsV0FBVyxNQUFNLEtBQUssS0FBSyxTQUFTO0FBQ2xELFVBQUksQ0FBQyxPQUFPLGVBQWUsQ0FBQyxNQUFNLEtBQUssZUFBZSxRQUFRLEVBQUcsUUFBTztBQUN4RSxVQUFJLEtBQUssT0FBTyxTQUFTLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxNQUFNLEVBQUcsUUFBTztBQUNoRSxVQUFJLEtBQUssT0FBTyxLQUFLLE1BQU0sQ0FBQyxlQUFlLE9BQU8sS0FBSyxNQUFNLEtBQUssRUFBRSxFQUFHLFFBQU87QUFFOUUsWUFBTSxTQUFTLEtBQUssUUFBUTtBQUM1QixZQUFNLFlBQVksS0FBSyxRQUFRLE1BQU0sS0FBSyxLQUFLLElBQUk7QUFHbkQsWUFBTSxXQUFXLENBQUMsT0FBZSxTQUMvQixjQUFjLE9BQU8sS0FBSyxHQUFHO1FBQzNCLENBQUMsU0FBUyxLQUFLLFNBQVMsUUFBUSxLQUFLLE1BQU0sV0FBVztNQUN4RCxLQUFLO0FBRVAsWUFBTSxXQUNKLEtBQUssT0FBTyxLQUFLLEtBQ2IsaUJBQWlCLE9BQU8sS0FBSyxNQUFNLEtBQUssSUFBSSxFQUFFLFdBQVcsU0FBUyxHQUFHLE1BQU0sSUFDM0UsQ0FBQztBQUNQLFlBQU0sWUFBWSxTQUFTO1FBQ3pCLENBQUMsT0FBTyxZQUNOLFFBQVEsV0FBVyxXQUFXLFNBQVMsUUFBUSxLQUFLLFFBQVEsUUFBUTtRQUN0RTtNQUNGO0FBR0EsWUFBTUUsWUFBVyxLQUFLLEtBQUs7QUFRM0IsWUFBTSxnQkFDSixTQUFTLEtBQUssT0FBTyxHQUFHLFNBQVMsS0FDakMsU0FBUyxLQUFLLElBQUksU0FBUyxLQUMzQkYsUUFBTyxLQUFLLGFBQWEsRUFBRSxRQUFRLFVBQVUsQ0FBQztBQUNoRCxZQUFNLGVBQWUsU0FBUztRQUM1QixLQUFLLE9BQU8sU0FBUyxJQUFJLENBQUMsVUFBVTtBQUNsQyxnQkFBTSxPQUFPO0FBQ2IsaUJBQU9BLFFBQU8sS0FBSyxLQUFLLE1BQU0sY0FBYyxTQUFTLEtBQUssS0FBSyxDQUFDO1FBQ2xFLENBQUM7TUFDSDtBQUNBLFlBQU0sTUFBTSxVQUFVLE1BQU0sSUFBSSxFQUFFO0FBQ2xDLFlBQU0sVUFBVSxDQUFDLFdBQXlCO0FBQ3hDLFlBQUksYUFBYSxJQUFJRyxjQUFjQyxJQUFJLEtBQUssV0FBVyxNQUFNLENBQUMsQ0FBQztNQUNqRTtBQUdBLFVBQUksS0FBSyxTQUFTLEtBQUssSUFBSTtBQUN6QixZQUFJLGFBQWEsZUFBZSxFQUFHLFFBQU87QUFDMUMsWUFBSSxLQUFLLElBQUksa0JBQWtCLEtBQUssV0FBVyxLQUFLLE1BQU0sS0FBSyxNQUFNLFlBQVksQ0FBQztBQUNsRixnQkFBUSxLQUFLLE9BQU8sYUFBYSxZQUFZLENBQUM7QUFDOUMsZUFBTztNQUNUO0FBRUEsWUFBTSxPQUNKLE1BQU0scUJBQXFCRCxpQkFDM0IsV0FBVyxNQUFNLFVBQVUsS0FBSyxNQUFNLEtBQUssU0FBUyxJQUNoRCxNQUFNLFVBQVUsS0FBSyxTQUNyQjtBQUNOLFlBQU0sV0FBVyxTQUFTLEtBQUs7QUFJL0IsZUFBUyxRQUFRLFNBQVMsU0FBUyxHQUFHLFNBQVMsR0FBRyxTQUFTO0FBQ3pELGNBQU0sVUFBVSxTQUFTLEtBQUs7QUFDOUIsWUFBSSxRQUFRLFdBQVcsVUFBVTtBQUMvQixjQUFJLEtBQUssSUFBSSxrQkFBa0IsS0FBSyxXQUFXLFFBQVEsTUFBTSxRQUFRLElBQUksU0FBUyxLQUFLLENBQUM7UUFDMUYsV0FBVyxRQUFRLFdBQVcsVUFBVTtBQUN0QyxnQkFBTSxPQUNKLFNBQVMsUUFBUSxJQUFJLFFBQVEsS0FDN0IsU0FBUyxRQUFRLE9BQU8sR0FBRyxRQUFRLEtBQ25DSCxRQUFPLEtBQUssWUFBWSxFQUFFLFFBQVEsVUFBVSxDQUFDO0FBQy9DLGNBQUksS0FBSyxJQUFJLFlBQVksS0FBSyxXQUFXLFFBQVEsTUFBTSxRQUFRLElBQUksSUFBSSxDQUFDO1FBQzFFO01BQ0Y7QUFFQSxVQUFJLGFBQWEsYUFBYSxHQUFHO0FBRS9CLFlBQUksS0FBSyxJQUFJLGtCQUFrQixLQUFLLFdBQVdFLFdBQVVBLFdBQVUsWUFBWSxDQUFDO0FBQ2hGLGdCQUFRQSxZQUFXLGFBQWEsWUFBWSxDQUFDO01BQy9DLE9BQU87QUFHTCxnQkFBUSxXQUFXLEtBQUssT0FBT0EsU0FBUTtNQUN6QztBQUNBLGFBQU87SUFDVDtFQUNGO0FBT0EsV0FBUyxvQkFBb0IsT0FBcUQ7QUFDaEYsUUFBSSxNQUFNLFdBQVcsR0FBRztBQUN0QixhQUFPLE1BQU0sQ0FBQyxhQUFhLG9CQUFvQixNQUFNLENBQUMsSUFBSTtJQUM1RDtBQUNBLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdEIsWUFBTSxDQUFDLE9BQU8sTUFBTSxJQUFJO0FBQ3hCLFVBQ0UsaUJBQWlCLHFCQUNqQixrQkFBa0IscUJBQ2xCLFdBQVcsTUFBTSxXQUFXLE9BQU8sU0FBUyxLQUM1QyxNQUFNLE9BQU8sZUFBZSxLQUM1QixNQUFNLE9BQU8sTUFBTSxNQUNuQixPQUFPLFNBQVMsT0FBTyxNQUN2QixPQUFPLFNBQVMsTUFBTSxNQUN0QjtBQUNBLGVBQU8sSUFBSSxrQkFBa0IsTUFBTSxXQUFXLE1BQU0sTUFBTSxNQUFNLElBQUksT0FBTyxNQUFNO01BQ25GO0lBQ0Y7QUFDQSxXQUFPO0VBQ1Q7QUFFQSxXQUFTLGFBQWEsR0FBUyxHQUFpQjtBQUM5QyxVQUFNLFNBQVMsS0FBSyxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU07QUFDMUMsYUFBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLEtBQUs7QUFDL0IsWUFBTSxRQUFTLEVBQUUsQ0FBQyxJQUFnQixFQUFFLENBQUM7QUFDckMsVUFBSSxVQUFVLEVBQUcsUUFBTztJQUMxQjtBQUNBLFdBQU8sRUFBRSxTQUFTLEVBQUU7RUFDdEI7OztBRXhiQSxNQUFNLFNBQVMsSUFBSSxPQUFPO0FBQUEsSUFDeEIsT0FBTyxhQUFhO0FBQUEsSUFDcEIsT0FBTyxFQUFFLEdBQUcsYUFBYSxHQUFHLEdBQUcsa0JBQWtCLEVBQUU7QUFBQSxFQUNyRCxDQUFDO0FBRUQsV0FBUyxNQUFNLElBQXlCO0FBQ3RDLFVBQU0sVUFBVSxTQUFTLGVBQWUsRUFBRTtBQUMxQyxRQUFJLENBQUMsUUFBUyxPQUFNLElBQUksTUFBTSxZQUFZLEVBQUUsRUFBRTtBQUM5QyxXQUFPO0FBQUEsRUFDVDtBQUVBLE1BQU0sU0FBUyxhQUFhLEVBQUUsUUFBUSxTQUFTLE1BQU0sUUFBUSxFQUFFLENBQUM7QUFDaEUsTUFBTSxRQUFRLElBQUksYUFBYSxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFJdkQsU0FBTyxtQkFBbUI7QUFBQSxJQUN4QjtBQUFBO0FBQUE7QUFBQSxJQUdBLGFBQWEsQ0FBQyxVQUFVLFlBQVksUUFBUSxhQUFhO0FBQ3ZELGFBQU87QUFBQSxRQUNMLE9BQU8sTUFBTSxHQUFHO0FBQUEsVUFDZCxJQUFJLGNBQWMsSUFBSSxVQUFVLFVBQVUsR0FBRyxJQUFJLFFBQVEsUUFBUSxDQUFDO0FBQUEsUUFDcEU7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBRUEsV0FBUyxlQUFlLFdBQVcsR0FBRyxpQkFBaUIsU0FBUyxNQUFNLE1BQU0sT0FBTyxDQUFDO0FBQ3BGLFdBQVMsZUFBZSxXQUFXLEdBQUcsaUJBQWlCLFNBQVMsTUFBTSxNQUFNLFVBQVUsQ0FBQztBQUN2RixXQUFTLGVBQWUsV0FBVyxHQUFHLGlCQUFpQixTQUFTLE1BQU0sTUFBTSxVQUFVLENBQUM7IiwKICAibmFtZXMiOiBbImNvdW50IiwgInNjaGVtYSIsICJwb3MiLCAic2NoZW1hIiwgInNjaGVtYSIsICJjaGlsZEluZGV4IiwgImFjdGl2ZSIsICJ0ciIsICJpdGVtVHlwZSIsICJpdGVtcyIsICJzY2hlbWEiLCAiY291bnQiLCAic2NoZW1hIiwgImRvY3VtZW50IiwgImRvY3VtZW50IiwgImJlZm9yZSIsICJjb250ZW50IiwgImVkaXRvciIsICJlbGVtZW50IiwgIlRFWFRfTk9ERSIsICJzY2hlbWEiLCAibm9kZXMiLCAic2FtZUF0dHJzIiwgImVkaXRvciIsICJzdGFydCIsICJlZGl0b3IiLCAic2NoZW1hIiwgIm9yZGVyZWQiLCAiaW5zZXJ0QXQiLCAiVGV4dFNlbGVjdGlvbiIsICJwb3MiXQp9Cg==

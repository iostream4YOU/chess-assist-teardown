// Pass 2: turn the constant-folded output of deob.js into readable code.
//   - removes the javascript-obfuscator anti-tamper / console-hijack blocks
//   - inlines lookup-table constants (UCI words, socket event names)
//   - folds "a" + " " + "b" string chains
//   - splits comma-sequences and `a && b()` / `a ? b() : c()` statements into if/else
//   - collapses `var X = {}; X.k = v; use(X)` builder pattern into `use({ k: v })`
//   - renames variables / functions using a rename map, and attaches explanatory comments
// Usage: node readable.js <in.js> <out.js> <map.json>
// Never executes the input.
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const [, , inFile, outFile, mapFile] = process.argv;
const map = mapFile ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
const renames = map.renames || {};           // bindings in the top-level wrapper function
const globals = map.globals || {};           // implicit globals (assigned without var)
const inlineTables = map.inlineTables || []; // names of string-array tables to inline
const comments = map.comments || {};         // name -> leading comment
const header = map.header || '';

const reparse = (code) => parser.parse(code, { sourceType: 'script', errorRecovery: true });
let ast = reparse(fs.readFileSync(inFile, 'utf8'));

// ---------- 1. remove anti-tamper blocks ----------
function stripAntiTamper() {
  const removedNames = new Set();
  traverse(ast, {
    VariableDeclaration(path) {
      const code = generate(path.node).code;
      if (code.includes('(((.+)+)+)+$') || (/["']exception["']/.test(code) && /["']trace["']/.test(code) && code.includes('__proto__'))) {
        path.node.declarations.forEach((d) => t.isIdentifier(d.id) && removedNames.add(d.id.name));
        path.remove();
      }
    },
  });
  traverse(ast, {
    ExpressionStatement(path) {
      const e = path.node.expression;
      if (t.isCallExpression(e) && t.isIdentifier(e.callee) && removedNames.has(e.callee.name) && e.arguments.length === 0) path.remove();
    },
    SequenceExpression(path) {
      const keep = path.node.expressions.filter((e) => !(t.isCallExpression(e) && t.isIdentifier(e.callee) && removedNames.has(e.callee.name) && e.arguments.length === 0));
      if (keep.length !== path.node.expressions.length) {
        if (keep.length === 1) path.replaceWith(keep[0]); else path.node.expressions = keep;
      }
    },
  });
  return removedNames.size > 0;
}
const hadAntiTamper = stripAntiTamper();

// ---------- 2. inline string tables ----------
if (inlineTables.length) {
  const tables = {};
  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (t.isIdentifier(id) && inlineTables.includes(id.name) && t.isArrayExpression(init) && init.elements.every((e) => t.isStringLiteral(e))) {
        tables[id.name] = init.elements.map((e) => e.value);
        path.remove();
      }
    },
  });
  traverse(ast, {
    MemberExpression(path) {
      const { object, property, computed } = path.node;
      if (computed && t.isIdentifier(object) && tables[object.name] && t.isNumericLiteral(property)) {
        path.replaceWith(t.stringLiteral(tables[object.name][property.value]));
      }
    },
  });
}

// ---------- 3. structural cleanup (loop to fixpoint) ----------
const negate = (e) => {
  if (t.isUnaryExpression(e, { operator: '!' })) return e.argument;
  if (t.isBinaryExpression(e)) {
    const flip = { '==': '!=', '!=': '==', '===': '!==', '!==': '===' }[e.operator];
    if (flip) return t.binaryExpression(flip, e.left, e.right);
  }
  return t.unaryExpression('!', e);
};
const inStatementList = (path) => Array.isArray(path.container) && ['body', 'consequent'].includes(path.listKey);
const block = (s) => (t.isBlockStatement(s) ? s : t.blockStatement([s]));
const exprToStmt = (e) => t.expressionStatement(e);

for (let pass = 0, changed = true; changed && pass < 25; pass++) {
  changed = false;
  traverse(ast, {
    IfStatement(path) {
      const n = path.node;
      if (!t.isBlockStatement(n.consequent)) { n.consequent = block(n.consequent); changed = true; }
      if (n.alternate && !t.isBlockStatement(n.alternate) && !t.isIfStatement(n.alternate)) { n.alternate = block(n.alternate); changed = true; }
      // else { if (...) } -> else if (...)
      if (n.alternate && t.isBlockStatement(n.alternate) && n.alternate.body.length === 1 && t.isIfStatement(n.alternate.body[0]) && !(n.alternate.body[0].leadingComments || []).length) {
        n.alternate = n.alternate.body[0]; changed = true;
      }
    },
    'ForStatement|WhileStatement|DoWhileStatement|ForOfStatement|ForInStatement'(path) {
      if (!t.isBlockStatement(path.node.body)) { path.node.body = block(path.node.body); changed = true; }
    },
    ExpressionStatement(path) {
      if (!inStatementList(path)) return;
      const e = path.node.expression;
      if (t.isSequenceExpression(e)) { path.replaceWithMultiple(e.expressions.map(exprToStmt)); changed = true; return; }
      if (t.isLogicalExpression(e) && (e.operator === '&&' || e.operator === '||')) {
        const test = e.operator === '&&' ? e.left : negate(e.left);
        path.replaceWith(t.ifStatement(test, t.blockStatement([exprToStmt(e.right)]))); changed = true; return;
      }
      if (t.isConditionalExpression(e)) {
        path.replaceWith(t.ifStatement(e.test, t.blockStatement([exprToStmt(e.consequent)]), t.blockStatement([exprToStmt(e.alternate)]))); changed = true; return;
      }
      if (t.isParenthesizedExpression && t.isParenthesizedExpression(e)) { path.node.expression = e.expression; changed = true; }
    },
    VariableDeclaration(path) {
      // var a = f(), X = {};  ->  var a = f(); var X = {};   (lets step 4 collapse X)
      const ds = path.node.declarations;
      if (!inStatementList(path) || ds.length < 2) return;
      if (!ds.some((d) => t.isObjectExpression(d.init) && d.init.properties.length === 0)) return;
      path.replaceWithMultiple(ds.map((d) => t.variableDeclaration(path.node.kind, [d]))); changed = true;
    },
    ReturnStatement(path) {
      if (!inStatementList(path)) return;
      const a = path.node.argument;
      if (t.isSequenceExpression(a) && a.expressions.length > 1) {
        const exprs = a.expressions.slice();
        const last = exprs.pop();
        path.replaceWithMultiple([...exprs.map(exprToStmt), t.returnStatement(last)]); changed = true;
      }
    },
    BinaryExpression: { exit(path) {
      const { operator, left, right } = path.node;
      if (operator !== '+' || !t.isStringLiteral(right)) return;
      if (t.isStringLiteral(left)) { path.replaceWith(t.stringLiteral(left.value + right.value)); changed = true; return; }
      if (t.isBinaryExpression(left, { operator: '+' }) && t.isStringLiteral(left.right)) {
        path.replaceWith(t.binaryExpression('+', left.left, t.stringLiteral(left.right.value + right.value))); changed = true;
      }
    }},
  });
}

// ---------- 4. collapse `var X = {}; X.a = 1; use(X)` ----------
const isPure = (node) => {
  let pure = true;
  traverse(t.file(t.program([t.expressionStatement(node)])), { 'CallExpression|NewExpression|AssignmentExpression|UpdateExpression'() { pure = false; } }, undefined, undefined);
  return pure;
};
const countRefs = (node, name) => {
  let c = 0, inFn = false;
  traverse(t.file(t.program([t.isStatement(node) ? node : t.expressionStatement(node)])), {
    Identifier(p) {
      if (p.node.name !== name) return;
      if (p.parentPath.isMemberExpression({ property: p.node, computed: false })) return;
      if (p.parentPath.isObjectProperty({ key: p.node, computed: false })) return;
      c++;
      if (p.getFunctionParent()) inFn = true;
    },
  });
  return { c, inFn };
};
function collapseBuilders(list) {
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!t.isVariableDeclaration(s) || s.declarations.length !== 1) continue;
    const d = s.declarations[0];
    if (!t.isIdentifier(d.id) || !t.isObjectExpression(d.init) || d.init.properties.length !== 0) continue;
    const name = d.id.name;
    const props = [];
    let j = i + 1;
    for (; j < list.length; j++) {
      const a = list[j];
      if (!t.isExpressionStatement(a) || !t.isAssignmentExpression(a.expression, { operator: '=' })) break;
      const l = a.expression.left;
      if (!t.isMemberExpression(l) || !t.isIdentifier(l.object, { name })) break;
      let key;
      if (!l.computed && t.isIdentifier(l.property)) key = t.identifier(l.property.name);
      else if (l.computed && t.isStringLiteral(l.property)) key = t.stringLiteral(l.property.value);
      else break;
      if (countRefs(a.expression.right, name).c) break;
      props.push(t.objectProperty(key, a.expression.right));
    }
    if (!props.length) continue;
    // find the single statement that uses `name`, skipping over other builder statements
    let k = j, useIdx = -1;
    for (; k < list.length; k++) {
      const st = list[k];
      if (t.isVariableDeclaration(st) && st.declarations.some((dd) => t.isIdentifier(dd.id, { name }))) break; // redeclared
      const { c } = countRefs(st, name);
      if (c) { if (useIdx === -1 && c === 1) { useIdx = k; continue; } useIdx = -2; break; }
      const isBuilder = (t.isVariableDeclaration(st) && st.declarations.length === 1 && t.isObjectExpression(st.declarations[0].init) && st.declarations[0].init.properties.length === 0)
        || (t.isExpressionStatement(st) && t.isAssignmentExpression(st.expression) && t.isMemberExpression(st.expression.left) && t.isIdentifier(st.expression.left.object) && !t.isCallExpression(st.expression.right));
      if (useIdx === -1 && !isBuilder) { useIdx = -2; break; }
    }
    if (useIdx < 0) continue;
    const obj = t.objectExpression(props);
    const { inFn } = countRefs(list[useIdx], name);
    if (inFn && !props.every((p) => isPure(p.value))) continue;
    // substitute
    let done = false;
    traverse(t.file(t.program([list[useIdx]])), {
      Identifier(p) {
        if (done || p.node.name !== name) return;
        if (p.parentPath.isMemberExpression({ property: p.node, computed: false })) return;
        if (p.parentPath.isObjectProperty({ key: p.node, computed: false })) return;
        p.replaceWith(obj); done = true; p.stop();
      },
    });
    if (!done) continue;
    list.splice(i, j - i); // drop declaration + assignments
    i--;
  }
}
traverse(ast, {
  'BlockStatement|Program'(path) { collapseBuilders(path.node.body); },
  SwitchCase(path) { collapseBuilders(path.node.consequent); },
});
ast = reparse(generate(ast).code); // refresh scopes

// ---------- 5. renames ----------
traverse(ast, {
  Program(path) {
    for (const [from, to] of Object.entries(renames)) if (path.scope.hasOwnBinding(from)) path.scope.rename(from, to);
  },
});
traverse(ast, {
  FunctionDeclaration(path) {
    if (path.parentPath.isProgram()) {
      for (const [from, to] of Object.entries(renames)) if (path.scope.hasOwnBinding(from)) path.scope.rename(from, to);
      path.stop();
    }
  },
});
const renamesAll = map.renamesAll || {};    // bindings in ANY scope (only safe for small files)
if (Object.keys(renamesAll).length) {
  traverse(ast, {
    Scopable(path) {
      for (const [from, to] of Object.entries(renamesAll)) if (path.scope.hasOwnBinding(from)) path.scope.rename(from, to);
    },
  });
}
traverse(ast, {
  Identifier(path) {
    const to = globals[path.node.name];
    if (!to) return;
    if (path.parentPath.isMemberExpression({ property: path.node, computed: false })) return;
    if (path.parentPath.isObjectProperty({ key: path.node, computed: false })) return;
    if (path.scope.hasBinding(path.node.name)) return;
    path.node.name = to;
  },
});

// ---------- 5b. per-function parameter / local renames ----------
const fnScopes = map.fnScopes || {};
function renameInFn(fnPath, key) {
  const table = fnScopes[key];
  if (!table || !fnPath || !fnPath.isFunction()) return;
  for (const [from, to] of Object.entries(table)) {
    if (!fnPath.scope.hasOwnBinding(from)) { console.warn(`[${key}] no binding ${from}`); continue; }
    let clash = false;
    fnPath.traverse({ Identifier(p) { if (p.node.name === to) clash = true; } });
    if (clash || fnPath.scope.hasBinding(to)) { console.warn(`[${key}] skip ${from}->${to}: name in use`); continue; }
    fnPath.scope.rename(from, to);
  }
}
traverse(ast, {
  AssignmentExpression(path) {
    const l = path.node.left;
    const key = t.isIdentifier(l) ? l.name : t.isMemberExpression(l) ? generate(l).code : null;
    if (key && fnScopes[key]) renameInFn(path.get('right'), key);
  },
  CallExpression(path) {
    const callee = generate(path.node.callee).code;
    const a0 = path.node.arguments[0];
    const withArg = t.isStringLiteral(a0) ? callee + ':' + a0.value : null;
    const key = withArg && fnScopes[withArg] ? withArg : callee;
    if (!fnScopes[key]) return;
    const fnArg = path.get('arguments').find((a) => a.isFunction());
    renameInFn(fnArg, key);
  },
});

// ---------- 6. comments ----------
const attached = new Set();
const attach = (node, name) => {
  if (!comments[name] || attached.has(name)) return;
  attached.add(name);
  const text = comments[name].split('\n').map((l) => ' ' + l).join('\n *');
  t.addComment(node, 'leading', '*\n *' + text + '\n ', false);
};
traverse(ast, {
  ExpressionStatement(path) {
    const e = path.node.expression;
    if (t.isAssignmentExpression(e) && t.isIdentifier(e.left)) attach(path.node, e.left.name);
    if (t.isAssignmentExpression(e) && t.isMemberExpression(e.left) && t.isIdentifier(e.left.object) && t.isIdentifier(e.left.property)) attach(path.node, e.left.object.name + '.' + e.left.property.name);
    if (t.isCallExpression(e) && t.isMemberExpression(e.callee)) {
      const code = generate(e.callee).code;
      attach(path.node, code);
    }
  },
  VariableDeclarator(path) { if (t.isIdentifier(path.node.id)) attach(path.node, path.node.id.name); },
  FunctionDeclaration(path) { if (path.node.id) attach(path.node, path.node.id.name); },
});
for (const k of Object.keys(comments)) if (!attached.has(k) && k !== '__file__') console.warn('comment not attached:', k);

// drop raw source text of string literals so the generator re-escapes them minimally (\x20 -> space)
traverse(ast, { StringLiteral(path) { delete path.node.extra; } });
const out = generate(ast, { comments: true, jsescOption: { minimal: true, quotes: 'double' } }).code;
const banner = header ? '/**\n' + header.split('\n').map((l) => ' * ' + l).join('\n') + '\n */\n' : '';
const tamperNote = hadAntiTamper
  ? '// NOTE: the original file starts with two javascript-obfuscator guards that were removed here:\n' +
    '//   1. "self-defending" code: re-tests its own source with the regex (((.+)+)+)+$ so that a\n' +
    '//      beautified copy hangs the browser with catastrophic regex backtracking;\n' +
    '//   2. a console hijack that replaces console.log/warn/info/error/exception/table/trace with no-ops.\n\n'
  : '';
fs.writeFileSync(outFile, banner + tamperNote + out);
console.log('ok', outFile, out.length);

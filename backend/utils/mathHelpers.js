const splitArgs = (s) => {
    const args = [];
    let bal = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') bal++;
        else if (s[i] === ')') bal--;
        else if (s[i] === ',' && bal === 0) {
            args.push(s.substring(start, i).trim());
            start = i + 1;
        }
    }
    args.push(s.substring(start).trim());
    return args;
};

const convertPrefixToInfix = (s) => {
    if (!s) return "";
    try {
        const clean = s.trim();
        const idx = clean.indexOf('(');
        if (idx === -1) return clean;

        const op = clean.substring(0, idx);
        const argsStr = clean.substring(idx + 1, clean.length - 1);
        const args = splitArgs(argsStr).map(convertPrefixToInfix);

        switch (op) {
            case 'add': return `(${args[0]} + ${args[1]})`;
            case 'sub': return `(${args[0]} - ${args[1]})`;
            case 'mul': return `(${args[0]} * ${args[1]})`;
            case 'div': return `(${args[0]} / ${args[1]})`;
            case 'sqrt': case 'log': case 'sin': case 'cos': case 'exp': case 'tan': case 'abs': case 'inv':
                return `${op}(${args[0]})`;
            default: return `${op}(${args.join(', ')})`;
        }
    } catch (e) { return s; }
};

const mapVariables = (formula, names) => {
    if (!formula || !names) return formula;
    let res = formula;
    // Map X0, X1... to real names. Sort by length to avoid partial replacement issues.
    names.map((n, i) => ({ name: n, idx: i }))
         .sort((a, b) => b.idx - a.idx)
         .forEach(item => {
             res = res.replace(new RegExp(`\\bX${item.idx}\\b`, 'g'), item.name);
         });
    return res;
};

const validateConstants = (formula) => {
    const piCount = (formula.match(/pi/gi) || []).length;
    const eCount = (formula.match(/\be\b/g) || []).length; 
    if (piCount > 3) return { valid: false, reason: "Too many 'pi' constants (>3)" };
    if (eCount > 2) return { valid: false, reason: "Too many 'e' constants (>2)" };
    return { valid: true };
};

module.exports = { convertPrefixToInfix, mapVariables, validateConstants };


(function () {
    var tokenise = function (str) {
        var tokens = []
        ,   re = {
                "float":        /^-?(([0-9]+\.[0-9]*|[0-9]*\.[0-9]+)([Ee][-+]?[0-9]+)?|[0-9]+[Ee][-+]?[0-9]+)/
            ,   "integer":      /^-?(0([Xx][0-9A-Fa-f]+|[0-7]*)|[1-9][0-9]*)/
            ,   "identifier":   /^[A-Z_a-z][0-9A-Z_a-z]*/
            ,   "string":       /^"[^"]*"/
            ,   "whitespace":   /^(?:[\t\n\r ]+|[\t\n\r ]*((\/\/.*|\/\*(.|\n|\r)*?\*\/)[\t\n\r ]*))+/
            ,   "other":        /^[^\t\n\r 0-9A-Z_a-z]/
            }
        ,   types = []
        ;
        for (var k in re) types.push(k);
        while (str.length > 0) {
            var matched = false;
            for (var i = 0, n = types.length; i < n; i++) {
                var type = types[i];
                str = str.replace(re[type], function (tok) {
                    tokens.push({ type: type, value: tok });
                    matched = true;
                    return "";
                });
                if (matched) break;
            }
            if (matched) continue;
            throw new Error("Token stream not progressing");
        }
        return tokens;
    };
    
    var parse = function (tokens, opt) {
        var line = 1;
        tokens = tokens.slice();
        
        var FLOAT = "float"
        ,   INT = "integer"
        ,   ID = "identifier"
        ,   STR = "string"
        ,   OTHER = "other"
        ;
        
        var WebIDLParseError = function (str, line, input, tokens) {
            this.message = str;
            this.line = line;
            this.input = input;
            this.tokens = tokens;
        };
        WebIDLParseError.prototype.toString = function () {
            return this.message + ", line " + this.line + " (tokens: '" + this.input + "')\n" +
                   JSON.stringify(this.tokens, null, 4);
        };
        
        var error = function (str) {
            var tok = "", numTokens = 0, maxTokens = 5;
            while (numTokens < maxTokens && tokens.length > numTokens) {
                tok += tokens[numTokens].value;
                numTokens++;
            }
            throw new WebIDLParseError(str, line, tok, tokens.slice(0, 5));
        };
        
        var last_token = null;
        
        var consume = function (type, value) {
            if (!tokens.length || tokens[0].type !== type) return;
            if (typeof value === "undefined" || tokens[0].value === value) {
                 last_token = tokens.shift();
                 if (type === ID) last_token.value = last_token.value.replace(/^_/, "");
                 return last_token;
             }
        };
        
        var ws = function () {
            if (!tokens.length) return;
            if (tokens[0].type === "whitespace") {
                var t = tokens.shift();
                t.value.replace(/\n/g, function (m) { line++; return m; });
                return t;
            }
        };
        
        var all_ws = function (store, pea) { // pea == post extended attribute, tpea = same for types
            var t = { type: "whitespace", value: "" };
            while (true) {
                var w = ws();
                if (!w) break;
                t.value += w.value;
            }
            if (t.value.length > 0) {
                if (store) {
                    var w = t.value
                    ,   re = {
                            "ws":                   /^([\t\n\r ]+)/
                        ,   "line-comment":         /^\/\/(.*)\n?/m
                        ,   "multiline-comment":    /^\/\*((?:.|\n|\r)*?)\*\//
                        }
                    ,   wsTypes = []
                    ;
                    for (var k in re) wsTypes.push(k);
                    while (w.length) {
                        var matched = false;
                        for (var i = 0, n = wsTypes.length; i < n; i++) {
                            var type = wsTypes[i];
                            w = w.replace(re[type], function (tok, m1) {
                                store.push({ type: type + (pea ? ("-" + pea) : ""), value: m1 });
                                matched = true;
                                return "";
                            });
                            if (matched) break;
                        }
                        if (matched) continue;
                        throw new Error("Surprising white space construct."); // this shouldn't happen
                    }
                }
                return t;
            }
        };
        
        var integer_type = function () {
            var ret = "";
            all_ws();
            if (consume(ID, "unsigned")) ret = "unsigned ";
            all_ws();
            if (consume(ID, "short")) return ret + "short";
            if (consume(ID, "long")) {
                ret += "long";
                all_ws();
                if (consume(ID, "long")) return ret + " long";
                return ret;
            }
            if (ret) error("Failed to parse integer type");
        };
        
        var float_type = function () {
            var ret = "";
            all_ws();
            if (consume(ID, "unrestricted")) ret = "unrestricted ";
            all_ws();
            if (consume(ID, "float")) return ret + "float";
            if (consume(ID, "double")) return ret + "double";
            if (ret) error("Failed to parse float type");
        };
        
        var primitive_type = function () {
            var num_type = integer_type() || float_type();
            if (num_type) return num_type;
            all_ws();
            if (consume(ID, "boolean")) return "boolean";
            if (consume(ID, "byte")) return "byte";
            if (consume(ID, "octet")) return "octet";
        };
        
        var const_value = function () {
            if (consume(ID, "true")) return { type: "boolean", value: true };
            if (consume(ID, "false")) return { type: "boolean", value: false };
            if (consume(ID, "null")) return { type: "null" };
            if (consume(ID, "Infinity")) return { type: "Infinity", negative: false };
            if (consume(ID, "NaN")) return { type: "NaN" };
            var ret = consume(FLOAT) || consume(INT);
            if (ret) return { type: "number", value: 1 * ret.value };
            var tok = consume(OTHER, "-");
            if (tok) {
                if (consume(ID, "Infinity")) return { type: "Infinity", negative: true };
                else tokens.unshift(tok);
            }
        };
        
        var type_suffix = function (obj) {
            while (true) {
                all_ws();
                if (consume(OTHER, "?")) {
                    if (obj.nullable) error("Can't nullable more than once");
                    obj.nullable = true;
                }
                else if (consume(OTHER, "[")) {
                    all_ws();
                    consume(OTHER, "]") || error("Unterminated array type");
                    if (!obj.array) {
                        obj.array = 1;
                        obj.nullableArray = [obj.nullable];
                    }
                    else {
                        obj.array++;
                        obj.nullableArray.push(obj.nullable);
                    }
                    obj.nullable = false;
                }
                else return;
            }
        };
        
        var single_type = function () {
            var prim = primitive_type()
            ,   ret = { sequence: false, generic: null, nullable: false, array: false, union: false }
            ,   name
            ,   value
            ;
            if (prim) {
                ret.idlType = prim;
            }
            else if (name = consume(ID)) {
                value = name.value;
                all_ws();
                // Generic types
                if (consume(OTHER, "<")) {
                    // backwards compat
                    if (value === "sequence") {
                        ret.sequence = true;
                    }
                    ret.generic = value;
                    ret.idlType = type() || error("Error parsing generic type " + value);
                    all_ws();
                    if (!consume(OTHER, ">")) error("Unterminated generic type " + value);
                    type_suffix(ret);
                    return ret;
                }
                else {
                    ret.idlType = value;
                }
            }
            else {
                return;
            }
            type_suffix(ret);
            if (ret.nullable && !ret.array && ret.idlType === "any") error("Type any cannot be made nullable");
            return ret;
        };
        
        var union_type = function () {
            all_ws();
            if (!consume(OTHER, "(")) return;
            var ret = { sequence: false, generic: null, nullable: false, array: false, union: true, idlType: [] };
            var fst = type() || error("Union type with no content");
            ret.idlType.push(fst);
            while (true) {
                all_ws();
                if (!consume(ID, "or")) break;
                var typ = type() || error("No type after 'or' in union type");
                ret.idlType.push(typ);
            }
            if (!consume(OTHER, ")")) error("Unterminated union type");
            type_suffix(ret);
            return ret;
        };
        
        var type = function () {
            return single_type() || union_type();
        };
        
        var argument = function (store) {
            var ret = { optional: false, variadic: false };
            ret.extAttrs = extended_attrs(store);
            all_ws(store, "pea");
            var opt_token = consume(ID, "optional");
            if (opt_token) {
                ret.optional = true;
                all_ws();
            }
            ret.idlType = type();
            if (!ret.idlType) {
                if (opt_token) tokens.unshift(opt_token);
                return;
            }
            var type_token = last_token;
            if (!ret.optional) {
                all_ws();
                if (tokens.length >= 3 &&
                    tokens[0].type === "other" && tokens[0].value === "." &&
                    tokens[1].type === "other" && tokens[1].value === "." &&
                    tokens[2].type === "other" && tokens[2].value === "."
                    ) {
                    tokens.shift();
                    tokens.shift();
                    tokens.shift();
                    ret.variadic = true;
                }
            }
            all_ws();
            var name = consume(ID);
            if (!name) {
                if (opt_token) tokens.unshift(opt_token);
                tokens.unshift(type_token);
                return;
            }
            ret.name = name.value;
            if (ret.optional) {
                all_ws();
                ret["default"] = default_();
            }
            return ret;
        };
        
        var argument_list = function (store) {
            var ret = []
            ,   arg = argument(store ? ret : null)
            ;
            if (!arg) return;
            ret.push(arg);
            while (true) {
                all_ws(store ? ret : null);
                if (!consume(OTHER, ",")) return ret;
                var nxt = argument(store ? ret : null) || error("Trailing comma in arguments list");
                ret.push(nxt);
            }
        };
        
        var type_pair = function () {
            all_ws();
            var k = type();
            if (!k) return;
            all_ws()
            if (!consume(OTHER, ",")) return;
            all_ws();
            var v = type();
            if (!v) return;
            return [k, v];
        };
        
        var simple_extended_attr = function (store) {
            all_ws();
            var name = consume(ID);
            if (!name) return;
            var ret = {
                name: name.value
            ,   "arguments": null
            };
            all_ws();
            var eq = consume(OTHER, "=");
            if (eq) {
                var rhs;
                all_ws();
                if (rhs = consume(ID)) {
                  ret.rhs = rhs
                }
                else if (consume(OTHER, "(")) {
                    // [Exposed=(Window,Worker)]
                    rhs = [];
                    var id = consume(ID);
                    if (id) {
                      rhs = [id.value];
                    }
                    identifiers(rhs);
                    consume(OTHER, ")") || error("Unexpected token in extended attribute argument list or type pair");
                    ret.rhs = {
                        type: "identifier-list",
                        value: rhs
                    };
                }
                if (!ret.rhs) return error("No right hand side to extended attribute assignment");
            }
            all_ws();
            if (consume(OTHER, "(")) {
                var args, pair;
                // [Constructor(DOMString str)]
                if (args = argument_list(store)) {
                    ret["arguments"] = args;
                }
                // [MapClass(DOMString, DOMString)]
                else if (pair = type_pair()) {
                    ret.typePair = pair;
                }
                // [Constructor()]
                else {
                    ret["arguments"] = [];
                }
                all_ws();
                consume(OTHER, ")") || error("Unexpected token in extended attribute argument list or type pair");
            }
            return ret;
        };
        
        // Note: we parse something simpler than the official syntax. It's all that ever
        // seems to be used
        var extended_attrs = function (store) {
            var eas = [];
            all_ws(store);
            if (!consume(OTHER, "[")) return eas;
            eas[0] = simple_extended_attr(store) || error("Extended attribute with not content");
            all_ws();
            while (consume(OTHER, ",")) {
                eas.push(simple_extended_attr(store) || error("Trailing comma in extended attribute"));
                all_ws();
            }
            consume(OTHER, "]") || error("No end of extended attribute");
            return eas;
        };
        
        var default_ = function () {
            all_ws();
            if (consume(OTHER, "=")) {
                all_ws();
                var def = const_value();
                if (def) {
                    return def;
                }
                else if (consume(OTHER, "[")) {
                    if (!consume(OTHER, "]")) error("Default sequence value must be empty");
                    return { type: "sequence", value: [] };
                }
                else {
                    var str = consume(STR) || error("No value for default");
                    str.value = str.value.replace(/^"/, "").replace(/"$/, "");
                    return str;
                }
            }
        };
        
        var const_ = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "const")) return;
            var ret = { type: "const", nullable: false };
            all_ws();
            var typ = primitive_type();
            if (!typ) {
                typ = consume(ID) || error("No type for const");
                typ = typ.value;
            }
            ret.idlType = typ;
            all_ws();
            if (consume(OTHER, "?")) {
                ret.nullable = true;
                all_ws();
            }
            var name = consume(ID) || error("No name for const");
            ret.name = name.value;
            all_ws();
            consume(OTHER, "=") || error("No value assignment for const");
            all_ws();
            var cnt = const_value();
            if (cnt) ret.value = cnt;
            else error("No value for const");
            all_ws();
            consume(OTHER, ";") || error("Unterminated const");
            return ret;
        };
        
        var inheritance = function () {
            all_ws();
            if (consume(OTHER, ":") || (opt.allowExtends && consume(ID, "extends"))) {
                all_ws();
                var inh = consume(ID) || error ("No type in inheritance");
                return inh.value;
            }
        };
        
        var operation_rest = function (ret, store) {
            all_ws();
            if (!ret) ret = {};
            var name = consume(ID);
            ret.name = name ? name.value : null;
            all_ws();
            consume(OTHER, "(") || error("Invalid operation");
            ret["arguments"] = argument_list(store) || [];
            all_ws();
            consume(OTHER, ")") || error("Unterminated operation");
            all_ws();
            consume(OTHER, ";") || error("Unterminated operation");
            return ret;
        };
        
        var callback = function (store) {
            all_ws(store, "pea");
            var ret;
            if (!consume(ID, "callback")) return;
            all_ws();
            var tok = consume(ID, "interface");
            if (tok) {
                tokens.unshift(tok);
                ret = interface_();
                if (ret.type === "class")
                    error("No such thing as callback class");
                ret.type = "callback interface";
                return ret;
            }
            var name = consume(ID) || error("No name for callback");
            ret = { type: "callback", name: name.value };
            all_ws();
            consume(OTHER, "=") || error("No assignment in callback");
            all_ws();
            ret.idlType = return_type();
            all_ws();
            consume(OTHER, "(") || error("No arguments in callback");
            ret["arguments"] = argument_list(store) || [];
            all_ws();
            consume(OTHER, ")") || error("Unterminated callback");
            all_ws();
            consume(OTHER, ";") || error("Unterminated callback");
            return ret;
        };

        var attribute = function (store) {
            all_ws(store, "pea");
            var grabbed = []
            ,   ret = {
                type:           "attribute"
            ,   "static":       false
            ,   stringifier:    false
            ,   inherit:        false
            ,   readonly:       false
            };
            if (consume(ID, "static")) {
                ret["static"] = true;
                grabbed.push(last_token);
            }
            else if (consume(ID, "stringifier")) {
                ret.stringifier = true;
                grabbed.push(last_token);
            }
            var w = all_ws();
            if (w) grabbed.push(w);
            if (consume(ID, "inherit")) {
                if (ret["static"] || ret.stringifier) error("Cannot have a static or stringifier inherit");
                ret.inherit = true;
                grabbed.push(last_token);
                var w = all_ws();
                if (w) grabbed.push(w);
            }
            if (consume(ID, "readonly")) {
                ret.readonly = true;
                grabbed.push(last_token);
                var w = all_ws();
                if (w) grabbed.push(w);
            }
            if (!consume(ID, "attribute")) {
                tokens = grabbed.concat(tokens);
                return;
            }
            all_ws();
            ret.idlType = type() || error("No type in attribute");
            if (ret.idlType.sequence) error("Attributes cannot accept sequence types");
            all_ws();
            var name = consume(ID) || error("No name in attribute");
            ret.name = name.value;
            all_ws();
            consume(OTHER, ";") || error("Unterminated attribute");
            return ret;
        };
        
        var return_type = function () {
            var typ = type();
            if (!typ) {
                if (consume(ID, "void")) {
                    return "void";
                }
                else error("No return type");
            }
            return typ;
        };
        
        var operation = function (store) {
            all_ws(store, "pea");
            var ret = {
                type:           "operation"
            ,   getter:         false
            ,   setter:         false
            ,   creator:        false
            ,   deleter:        false
            ,   legacycaller:   false
            ,   "static":       false
            ,   stringifier:    false
            };
            while (true) {
                all_ws();
                if (consume(ID, "getter")) ret.getter = true;
                else if (consume(ID, "setter")) ret.setter = true;
                else if (consume(ID, "creator")) ret.creator = true;
                else if (consume(ID, "deleter")) ret.deleter = true;
                else if (consume(ID, "legacycaller")) ret.legacycaller = true;
                else break;
            }
            if (ret.getter || ret.setter || ret.creator || ret.deleter || ret.legacycaller) {
                all_ws();
                ret.idlType = return_type();
                operation_rest(ret, store);
                return ret;
            }
            if (consume(ID, "static")) {
                ret["static"] = true;
                ret.idlType = return_type();
                operation_rest(ret, store);
                return ret;
            }
            else if (consume(ID, "stringifier")) {
                ret.stringifier = true;
                all_ws();
                if (consume(OTHER, ";")) return ret;
                ret.idlType = return_type();
                operation_rest(ret, store);
                return ret;
            }
            ret.idlType = return_type();
            all_ws();
            if (consume(ID, "iterator")) {
                all_ws();
                ret.type = "iterator";
                if (consume(ID, "object")) {
                    ret.iteratorObject = "object";
                }
                else if (consume(OTHER, "=")) {
                    all_ws();
                    var name = consume(ID) || error("No right hand side in iterator");
                    ret.iteratorObject = name.value;
                }
                all_ws();
                consume(OTHER, ";") || error("Unterminated iterator");
                return ret;
            }
            else {
                operation_rest(ret, store);
                return ret;
            }
        };
        
        var identifiers = function (arr) {
            while (true) {
                all_ws();
                if (consume(OTHER, ",")) {
                    all_ws();
                    var name = consume(ID) || error("Trailing comma in identifiers list");
                    arr.push(name.value);
                }
                else break;
            }
        };
        
        var serialiser = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "serializer")) return;
            var ret = { type: "serializer" };
            all_ws();
            if (consume(OTHER, "=")) {
                all_ws();
                if (consume(OTHER, "{")) {
                    ret.patternMap = true;
                    all_ws();
                    var id = consume(ID);
                    if (id && id.value === "getter") {
                        ret.names = ["getter"];
                    }
                    else if (id && id.value === "inherit") {
                        ret.names = ["inherit"];
                        identifiers(ret.names);
                    }
                    else if (id) {
                        ret.names = [id.value];
                        identifiers(ret.names);
                    }
                    else {
                        ret.names = [];
                    }
                    all_ws();
                    consume(OTHER, "}") || error("Unterminated serializer pattern map");
                }
                else if (consume(OTHER, "[")) {
                    ret.patternList = true;
                    all_ws();
                    var id = consume(ID);
                    if (id && id.value === "getter") {
                        ret.names = ["getter"];
                    }
                    else if (id) {
                        ret.names = [id.value];
                        identifiers(ret.names);
                    }
                    else {
                        ret.names = [];
                    }
                    all_ws();
                    consume(OTHER, "]") || error("Unterminated serializer pattern list");
                }
                else {
                    var name = consume(ID) || error("Invalid serializer");
                    ret.name = name.value;
                }
                all_ws();
                consume(OTHER, ";") || error("Unterminated serializer");
                return ret;
            }
            else if (consume(OTHER, ";")) {
                // noop, just parsing
            }
            else {
                ret.idlType = return_type();
                all_ws();
                ret.operation = operation_rest(null, store);
            }
            return ret;
        };

        var iterable_type = function() {
            if (consume(ID, "iterable")) return "iterable";
            else if (consume(ID, "legacyiterable")) return "legacyiterable";
            else if (consume(ID, "maplike")) return "maplike";
            else if (consume(ID, "setlike")) return "setlike";
            else return;
        }

        var readonly_iterable_type = function() {
            if (consume(ID, "maplike")) return "maplike";
            else if (consume(ID, "setlike")) return "setlike";
            else return;
        }

        var iterable = function (store) {
            all_ws(store, "pea");
            var grabbed = [],
                ret = {type: null, idlType: null, readonly: false};
            if (consume(ID, "readonly")) {
                ret.readonly = true;
                grabbed.push(last_token);
                var w = all_ws();
                if (w) grabbed.push(w);
            }
            var consumeItType = ret.readonly ? readonly_iterable_type : iterable_type;

            var ittype = consumeItType();
            if (!ittype) {
                tokens = grabbed.concat(tokens);
                return;
            }

            var secondTypeRequired = ittype === "maplike";
            var secondTypeAllowed = secondTypeRequired || ittype === "iterable";
            ret.type = ittype;
            if (ret.type !== 'maplike' && ret.type !== 'setlike')
                delete ret.readonly;
            all_ws();
            if (consume(OTHER, "<")) {
                ret.idlType = type() || error("Error parsing " + ittype + " declaration");
                all_ws();
                if (secondTypeAllowed) {
                    var type2 = null;
                    if (consume(OTHER, ",")) {
                        all_ws();
                        type2 = type();
                        all_ws();                        
                    }
                    if (type2)
                        ret.idlType = [ret.idlType, type2];
                    else if (secondTypeRequired)
                        error("Missing second type argument in " + ittype + " declaration");
                }
                if (!consume(OTHER, ">")) error("Unterminated " + ittype + " declaration");
                all_ws();
                if (!consume(OTHER, ";")) error("Missing semicolon after " + ittype + " declaration");
            }
            else
                error("Error parsing " + ittype + " declaration");

            return ret;            
        }        
        
        var interface_ = function (isPartial, store) {
            all_ws(isPartial ? null : store, "pea");
            var isClass = false;
            if (!consume(ID, "interface"))
            {
                if (!opt.allowClass)
                    return;
                else if (consume(ID, "class"))
                    isClass = true;
                else
                    return;
            }
            all_ws();
            var name = consume(ID) || error("No name for interface");
            var mems = []
            ,   ret = {
                type:   isClass ? "class" : "interface"
            ,   name:   name.value
            ,   partial:    false
            ,   members:    mems
            };
            if (!isPartial) ret.inheritance = inheritance() || null;
            all_ws();
            consume(OTHER, "{") || error("Bodyless interface");
            while (true) {
                all_ws(store ? mems : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("Missing semicolon after interface");
                    return ret;
                }
                var ea = extended_attrs(store ? mems : null);
                all_ws();
                var cnt = const_(store ? mems : null);
                if (cnt) {
                    cnt.extAttrs = ea;
                    ret.members.push(cnt);
                    continue;
                }
                var mem = (opt.allowNestedTypedefs && typedef(store ? mems : null)) ||
                          iterable(store ? mems : null) ||
                          serialiser(store ? mems : null) ||
                          attribute(store ? mems : null) ||
                          operation(store ? mems : null) ||
                          error("Unknown member");
                mem.extAttrs = ea;
                ret.members.push(mem);
            }
        };
        
        var partial = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "partial")) return;
            var thing = dictionary(true, store) ||
                        interface_(true, store) ||
                        error("Partial doesn't apply to anything");
            thing.partial = true;
            return thing;
        };
        
        var dictionary = function (isPartial, store) {
            all_ws(isPartial ? null : store, "pea");
            if (!consume(ID, "dictionary")) return;
            all_ws();
            var name = consume(ID) || error("No name for dictionary");
            var mems = []
            ,   ret = {
                type:   "dictionary"
            ,   name:   name.value
            ,   partial:    false
            ,   members:    mems
            };
            if (!isPartial) ret.inheritance = inheritance() || null;
            all_ws();
            consume(OTHER, "{") || error("Bodyless dictionary");
            while (true) {
                all_ws(store ? mems : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("Missing semicolon after dictionary");
                    return ret;
                }
                var ea = extended_attrs(store ? mems : null);
                all_ws(store ? mems : null, "pea");
                var required = consume(ID, "required");
                var typ = type() || error("No type for dictionary member");
                all_ws();
                var name = consume(ID) || error("No name for dictionary member");
                var dflt = default_();
                if (required && dflt) error("Required member must not have a default");
                ret.members.push({
                    type:       "field"
                ,   name:       name.value
                ,   required:   !!required
                ,   idlType:    typ
                ,   extAttrs:   ea
                ,   "default":  dflt
                });
                all_ws();
                consume(OTHER, ";") || error("Unterminated dictionary member");
            }
        };
        
        var exception = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "exception")) return;
            all_ws();
            var name = consume(ID) || error("No name for exception");
            var mems = []
            ,   ret = {
                type:   "exception"
            ,   name:   name.value
            ,   members:    mems
            };
            ret.inheritance = inheritance() || null;
            all_ws();
            consume(OTHER, "{") || error("Bodyless exception");
            while (true) {
                all_ws(store ? mems : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("Missing semicolon after exception");
                    return ret;
                }
                var ea = extended_attrs(store ? mems : null);
                all_ws(store ? mems : null, "pea");
                var cnt = const_();
                if (cnt) {
                    cnt.extAttrs = ea;
                    ret.members.push(cnt);
                }
                else {
                    var typ = type();
                    all_ws();
                    var name = consume(ID);
                    all_ws();
                    if (!typ || !name || !consume(OTHER, ";")) error("Unknown member in exception body");
                    ret.members.push({
                        type:       "field"
                    ,   name:       name.value
                    ,   idlType:    typ
                    ,   extAttrs:   ea
                    });
                }
            }
        };
        
        var enum_ = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "enum")) return;
            all_ws();
            var name = consume(ID) || error("No name for enum");
            var vals = []
            ,   ret = {
                type:   "enum"
            ,   name:   name.value
            ,   values: vals
            };
            all_ws();
            consume(OTHER, "{") || error("No curly for enum");
            var saw_comma = false;
            while (true) {
                all_ws(store ? vals : null);
                if (consume(OTHER, "}")) {
                    all_ws();
                    consume(OTHER, ";") || error("No semicolon after enum");
                    return ret;
                }
                var val = consume(STR) || error("Unexpected value in enum");
                ret.values.push(val.value.replace(/"/g, ""));
                all_ws(store ? vals : null);
                if (consume(OTHER, ",")) {
                    if (store) vals.push({ type: "," });
                    all_ws(store ? vals : null);
                    saw_comma = true;
                }
                else {
                    saw_comma = false;
                }
            }
        };
        
        var typedef = function (store) {
            all_ws(store, "pea");
            if (!consume(ID, "typedef")) return;
            var ret = {
                type:   "typedef"
            };
            all_ws();
            ret.typeExtAttrs = extended_attrs();
            all_ws(store, "tpea");
            ret.idlType = type() || error("No type in typedef");
            all_ws();
            var name = consume(ID) || error("No name in typedef");
            ret.name = name.value;
            all_ws();
            consume(OTHER, ";") || error("Unterminated typedef");
            return ret;
        };
        
        var implements_ = function (store) {
            all_ws(store, "pea");
            var target = consume(ID);
            if (!target) return;
            var w = all_ws();
            if (consume(ID, "implements")) {
                var ret = {
                    type:   "implements"
                ,   target: target.value
                };
                all_ws();
                var imp = consume(ID) || error("Incomplete implements statement");
                ret["implements"] = imp.value;
                all_ws();
                consume(OTHER, ";") || error("No terminating ; for implements statement");
                return ret;
            }
            else {
                // rollback
                tokens.unshift(w);
                tokens.unshift(target);
            }
        };
        
        var definition = function (store) {
            return  callback(store)             ||
                    interface_(false, store)    ||
                    partial(store)              ||
                    dictionary(false, store)    ||
                    exception(store)            ||
                    enum_(store)                ||
                    typedef(store)              ||
                    implements_(store)
                    ;
        };
        
        var definitions = function (store) {
            if (!tokens.length) return [];
            var defs = [];
            while (true) {
                var ea = extended_attrs(store ? defs : null)
                ,   def = definition(store ? defs : null);
                if (!def) {
                    if (ea.length) error("Stray extended attributes");
                    break;
                }
                def.extAttrs = ea;
                defs.push(def);
            }
            return defs;
        };
        var res = definitions(opt.ws);
        if (tokens.length) error("Unrecognised tokens");
        return res;
    };

    var inNode = typeof module !== "undefined" && module.exports
    ,   obj = {
            parse:  function (str, opt) {
                if (!opt) opt = {};
                var tokens = tokenise(str);
                return parse(tokens, opt);
            }
    };

    if (inNode) module.exports = obj;
    else        self.WebIDL2 = obj;
}());
var write = function (ast, opt) {
    var curPea = ""
    ,   curTPea = ""
    ,   opt = opt || {}
    ,   noop = function (str) { return str; }
    ,   optNames = "type".split(" ")
    ,   context = []
    ;
    for (var i = 0, n = optNames.length; i < n; i++) {
        var o = optNames[i];
        if (!opt[o]) opt[o] = noop;
    }
    
    var literal = function (it) {
        return it.value;
    };
    var wsPea = function (it) {
        curPea += it.value;
        return "";
    };
    var wsTPea = function (it) {
        curTPea += it.value;
        return "";
    };
    var lineComment = function (it) {
        return "//" + it.value + "\n";
    };
    var multilineComment = function (it) {
        return "/*" + it.value + "*/";
    };
    var type = function (it) {
        if (typeof it === "string") return opt.type(it); // XXX should maintain some context
        if (it.union) return "(" + it.idlType.map(type).join(" or ") + ")";
        var ret = "";
        if (it.sequence) ret += "sequence<";
        ret += type(it.idlType);
        if (it.array) {
            for (var i = 0, n = it.nullableArray.length; i < n; i++) {
                var val = it.nullableArray[i];
                if (val) ret += "?";
                ret += "[]";
            }
        }
        if (it.sequence) ret += ">";
        if (it.nullable) ret += "?";

        return ret;
    };
    var const_value = function (it) {
        var tp = it. type;
        if (tp === "boolean") return it.value ? "true" : "false";
        else if (tp === "null") return "null";
        else if (tp === "Infinity") return (it.negative ? "-" : "") + "Infinity";
        else if (tp === "NaN") return "NaN";
        else if (tp === "number") return it.value;
        else return '"' + it.value + '"';
    };
    var argument = function (arg, pea) {
        var ret = extended_attributes(arg.extAttrs, pea);
        if (arg.optional) ret += "optional ";
        ret += type(arg.idlType);
        if (arg.variadic) ret += "...";
        ret += " " + arg.name;
        if (arg["default"]) ret += " = " + const_value(arg["default"]);
        return ret;
    };
    var args = function (its) {
        var res = ""
        ,   pea = ""
        ;
        for (var i = 0, n = its.length; i < n; i++) {
            var arg = its[i];
            if (arg.type === "ws") res += arg.value;
            else if (arg.type === "ws-pea") pea += arg.value;
            else {
                res += argument(arg, pea);
                if (i < n - 1) res += ",";
                pea = "";
            }
        }
        return res;
    };
    var make_ext_at = function (it) {
        if (it["arguments"] === null) return it.name;
        context.unshift(it);
        var ret = it.name + "(" + (it["arguments"].length ? args(it["arguments"]) : "") + ")";
        context.shift(); // XXX need to add more contexts, but not more than needed for ReSpec
        return ret;
    };
    var extended_attributes = function (eats, pea) {
        if (!eats || !eats.length) return "";
        return "[" + eats.map(make_ext_at).join(", ") + "]" + pea;
    };
    
    var modifiers = "getter setter creator deleter legacycaller stringifier static".split(" ");
    var operation = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        if (it.stringifier && !it.idlType) return "stringifier;";
        for (var i = 0, n = modifiers.length; i < n; i++) {
            var mod = modifiers[i];
            if (it[mod]) ret += mod + " ";
        }
        ret += type(it.idlType) + " ";
        if (it.name) ret += it.name;
        ret += "(" + args(it["arguments"]) + ");";
        return ret;
    };

    var attribute = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        if (it["static"]) ret += "static ";
        if (it.stringifier) ret += "stringifier ";
        if (it.readonly) ret += "readonly ";
        if (it.inherit) ret += "inherit ";
        ret += "attribute " + type(it.idlType) + " " + it.name + ";";
        return ret;
    };
    
    var interface_ = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        if (it.partial) ret += "partial ";
        ret += "interface " + it.name + " ";
        if (it.inheritance) ret += ": " + it.inheritance + " ";
        ret += "{" + iterate(it.members) + "};";
        return ret;
    };
    
    var dictionary = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        if (it.partial) ret += "partial ";
        ret += "dictionary " + it.name + " ";
        ret += "{" + iterate(it.members) + "};";
        return ret;
    };
    var field = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        ret += type(it.idlType) + " " + it.name;
        if (it["default"]) ret += " = " + const_value(it["default"]);
        ret += ";";
        return ret;
    };
    var exception = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        ret += "exception " + it.name + " ";
        if (it.inheritance) ret += ": " + it.inheritance + " ";
        ret += "{" + iterate(it.members) + "};";
        return ret;
    };
    var const_ = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        return ret + "const " + type(it.idlType) + " " + it.name + " = " + const_value(it.value) + ";";
    };
    var typedef = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        ret += "typedef " + extended_attributes(it.typeExtAttrs, curTPea);
        curTPea = "";
        return ret + type(it.idlType) + " " + it.name + ";";
    };
    var implements_ = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        return ret + it.target + " implements " + it["implements"] + ";";
    };
    var callback = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        return ret + "callback " + it.name + " = " + type(it.idlType) +
                "(" + args(it["arguments"]) + ");";
    };
    var enum_ = function (it) {
        var ret = extended_attributes(it.extAttrs, curPea);
        curPea = "";
        ret += "enum " + it.name + " {";
        for (var i = 0, n = it.values.length; i < n; i++) {
            var v = it.values[i];
            if (typeof v === "string") ret += '"' + v + '"';
            else if (v.type === "ws") ret += v.value;
            else if (v.type === ",") ret += ",";
        }
        return ret + "};";
    };
    
    var table = {
        ws:                     literal
    ,   "ws-pea":               wsPea
    ,   "ws-tpea":              wsTPea
    ,   "line-comment":         lineComment
    ,   "multiline-comment":    multilineComment
    ,   "interface":            interface_
    ,   operation:              operation
    ,   attribute:              attribute
    ,   dictionary:             dictionary
    ,   field:                  field
    ,   exception:              exception
    ,   "const":                const_
    ,   typedef:                typedef
    ,   "implements":           implements_
    ,   callback:               callback
    ,   "enum":                 enum_
    };
    var dispatch = function (it) {
        return table[it.type](it);
    };
    var iterate = function (things) {
        if (!things) return;
        var ret = "";
        for (var i = 0, n = things.length; i < n; i++) ret += dispatch(things[i]);
        return ret;
    };
    return iterate(ast);
};





/**
 * Pretty print WebIDL. The main goal is to:
 * 
 * 1. Collect the partial definitions into one
 * 2. Produce a pretty output of the result, with types and variables properly aligned
 * 
 * This is done by parsing the WebIDL with a proper parser, merging the partials turned back the parsed tree into a
 * text and pretty print it.
 * 
 * @param {String} webidl 
 */
function pretty_print_webidl(webidl) {
    /**
     * Pretty print of an idl, as created by the WebIDL parser's companion 'write' function
     * 
     * @param {String} idl 
     */
    const pretty_print_members = (idl) => {
        /**
         * Prettify the full declaration (ie, the content of a dictionary or an enum block). The individual type declarations
         * are printed one at a line, with four spaces left indent and the variables aligned.
         * 
         * @param {String} definition - the text of the declaration: 'dictionary...' or 'enum...' 
         * @param {String} all_members - the full value of the declaration
         * @returns - prettified value
         */
        const pretty_print_value = (definition, all_members) => {
            if (definition.startsWith('dictionary')) {
                // Get the individual typed variable declarations:
                let members = all_members.split(';').filter((t) => t !== '');

                // Calculate the maximum length of the variable types
                const type_length = members.reduce((num, variable) => {
                    const [t, v] = variable.split(' ');
                    return (num < t.length) ? t.length : num;
                }, 0);

                // Create the cumulative and prettified declarations 
                return members.reduce((pretty_members,variable) => {
                    let [t, v] = variable.split(' ');
                    pretty_members += `    ${t}${Array(type_length - t.length + 1).join(' ')} ${v};\n`;
                    return pretty_members;
                }, '');          
            } else {
                const allEnum = all_members.replace(/""/g,'","').split(',');
                return allEnum.reduce( (pretty_values, v, index) => {
                    const output =  `    ${v}`;
                    pretty_values += (index !== allEnum.length - 1) ? `${output},\n` : `${output}\n`;
                    return pretty_values;
                }, '');
            }
        }

        const separator = /{|}/;
        // Split the WebIDL into an array consisting either of the declaration or the content.
        const blocks    = idl.split(separator)
                        .filter((t) => t !== ';')
                        .map((t) => t[0] === ';' ? t.slice(1) : t)
                        ;
        
        // Combine the results in blocks consisting of the declaration and the content; the latter prettified on the fly
        const pairs = [];
        for (let i = 0; i < blocks.length; i = i + 2) {
            pairs.push({
                definition : blocks[i],
                members    : pretty_print_value(blocks[i], blocks[i+1]),
            })
        };

        return pairs.reduce( (output, p) => {
            output += `${p.definition} {\n${p.members}};\n\n`
            return output;
        }, '');
    }

    /**
     * Merging the partial definitions in an array of (parsed) WebIDL structures
     * 
     * @param {Array} webidl - An array of parsed WebIDL structures 
     */
    function merge_partials(webidl) {
        let retval = [];

        webidl.forEach( (definition) => {
            // See if it is partial or not
            if (definition.partial) {
                // We have to find the definition that has already preceded this partial one.
                const def = retval.find((def) => def.name === definition.name);
                if (def === undefined) {
                    console.error(`Partial definition comes before the real one (${definition.name})`);
                } else {
                    def.members = def.members.concat(definition.members);
                }
            } else {
                // This is a bona-fide definition
                retval.push(definition);
            }
        });
        return retval;
    }

    const tree = merge_partials(WebIDL2.parse(webidl));
    return pretty_print_members(write(tree));
};

function full_webidl() {
    const add_idl = (idl) => {
        const target = document.getElementById('our-idl-index');
        pre = document.createElement('pre');
        pre.textContent = idl;
        pre.classList.add('idl','def','no-link-warnings');
        pre.id = "actual-idl-index";
        target.appendChild(pre);
    }
    
    let full_idl_text = Array.from(document.querySelectorAll('pre.idl')).map((node) => node.textContent).join('\n');    
    add_idl(pretty_print_webidl(full_idl_text));
}

function clean_full_webidl() {
    const pre = document.getElementById('actual-idl-index');
    pre.querySelectorAll("*[id]").forEach(elem => elem.removeAttribute("id"));
    // pre.classList.add('idl', 'def');
}

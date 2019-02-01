



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


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

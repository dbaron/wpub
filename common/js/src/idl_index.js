function full_webidl() {
    const add_idl = (idl) => {
        const target = document.getElementById('our-idl-index');
        h2 = document.createElement('h2');
        h2.textContent = 'IDL Index';
        target.appendChild(h2);

        pre = document.createElement('pre');
        pre.textContent = idl;
        pre.classList.add('idl','def');
        pre.id = "actual-idl-index";
        target.appendChild(pre);
    }


    let full_idl_text = ''
    document.querySelectorAll('pre.idl').forEach((node) => {
        full_idl_text += node.textContent
    });


    add_idl(pretty_print_webidl(full_idl_text));
}

function clean_full_webidl() {
    const pre = document.getElementById('actual-idl-index');
    pre.querySelectorAll("*[id]").forEach(elem => elem.removeAttribute("id"));
}

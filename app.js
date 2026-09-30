/* ======================================================================
   VISOR SOC — versión en línea (Firebase Auth + Firestore)
   ====================================================================== */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;   // { uid, email }
let currentRole = null;   // 'admin' | 'lectura'
let currentWorkspace = 'ids'; // 'ids' | 'mesa'
let unsubscribeWorkspace = null;
let unsubscribeUsuarios = null;

let DATA = { tabs: [], registro: [] };
let currentTab = null;
let editMode = false;
let modalTarget = null; // {tabIdx, sectionIdx, buttonIdx} buttonIdx null = nuevo

function isAdmin(){ return currentRole === 'admin'; }

/* ===================== LOGIN / SESIÓN ===================== */

function doLogin(){
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;
    const errBox = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    errBox.textContent = '';

    if (!email || !pass){
        errBox.textContent = 'Escribe tu correo y contraseña.';
        return;
    }

    btn.disabled = true;
    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => {
            errBox.textContent = traduceErrorAuth(err);
            btn.disabled = false;
        });
}

function doLogout(){
    if (unsubscribeWorkspace) { unsubscribeWorkspace(); unsubscribeWorkspace = null; }
    if (unsubscribeUsuarios) { unsubscribeUsuarios(); unsubscribeUsuarios = null; }
    auth.signOut();
}

function traduceErrorAuth(err){
    const code = err && err.code;
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'){
        return 'Correo o contraseña incorrectos.';
    }
    if (code === 'auth/invalid-email') return 'El correo no es válido.';
    if (code === 'auth/too-many-requests') return 'Demasiados intentos. Intenta más tarde.';
    if (code === 'auth/email-already-in-use') return 'Ese correo ya tiene una cuenta.';
    if (code === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
    return 'Error: ' + (err && err.message ? err.message : 'desconocido');
}

auth.onAuthStateChanged(async (user) => {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.disabled = false;

    if (!user){
        currentUser = null;
        currentRole = null;
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('appShell').classList.add('hidden');
        return;
    }

    let roleDoc;
    try {
        roleDoc = await db.collection('usuarios').doc(user.uid).get();
    } catch (e){
        document.getElementById('loginError').textContent = 'No se pudo verificar tu cuenta: ' + e.message;
        auth.signOut();
        return;
    }

    if (!roleDoc.exists || !roleDoc.data().rol){
        document.getElementById('loginError').textContent = 'Tu cuenta no tiene un rol asignado. Contacta al administrador.';
        auth.signOut();
        return;
    }

    currentUser = { uid: user.uid, email: user.email };
    currentRole = roleDoc.data().rol;

    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').textContent = '';
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userRoleBadge').textContent = isAdmin() ? 'ADMIN' : 'SOLO LECTURA';

    document.querySelectorAll('[data-admin-only]').forEach(el => {
        el.classList.toggle('hidden-role', !isAdmin());
    });

    if (isAdmin()) subscribeUsuarios();

    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('chooserScreen').classList.remove('hidden');
});

/* ===================== SELECCIÓN DE ÁREA ===================== */

const AREA_LABELS = { ids: '🛡️ IDS', mesa: '🗒️ MESA SOPORTE' };

function chooseWorkspace(name){
    document.getElementById('chooserScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    switchWorkspace(name);
}

function backToChooser(){
    if (unsubscribeWorkspace) { unsubscribeWorkspace(); unsubscribeWorkspace = null; }
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('chooserScreen').classList.remove('hidden');
}

/* ===================== WORKSPACES (IDS / MESA) ===================== */

function switchWorkspace(name){
    currentWorkspace = name;
    document.getElementById('currentAreaLabel').textContent = AREA_LABELS[name] || name;

    document.getElementById('searchInput').value = '';
    document.getElementById('viewer').classList.add('hidden');
    document.getElementById('menu').classList.remove('menu-hidden');

    if (unsubscribeWorkspace) unsubscribeWorkspace();

    unsubscribeWorkspace = db.collection('workspaces').doc(name)
        .onSnapshot(snap => {
            const docMissing = !snap.exists;

            if (snap.exists && snap.data().dataJson){
                try {
                    DATA = JSON.parse(snap.data().dataJson);
                } catch(e){
                    DATA = { tabs: [], registro: [] };
                }
            } else {
                DATA = { tabs: [], registro: [] };
            }
            if (!DATA.tabs) DATA.tabs = [];
            if (!DATA.registro) DATA.registro = [];

            // Primera vez que existe este espacio: si es "ids", se autocompleta con
            // todo el contenido original de respuestas3 (sin necesidad de botón).
            if (docMissing && name === 'ids' && isAdmin()){
                DATA = JSON.parse(JSON.stringify(SEED_IDS));
                if (!DATA.registro) DATA.registro = [];
                currentTab = DATA.tabs.length ? DATA.tabs[0].id : null;
                renderApp();
                renderRegistro();
                saveWorkspace();
                return;
            }

            if (currentTab !== '__busquedas__' && (!currentTab || !DATA.tabs.find(t => t.id === currentTab))){
                currentTab = DATA.tabs.length ? DATA.tabs[0].id : null;
            }

            renderApp();
            renderRegistro();
        }, err => {
            showSyncNote('Error leyendo datos: ' + err.message, true);
        });
}

let saveTimer = null;
function saveWorkspace(){
    showSyncNote('Guardando…', false, true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        db.collection('workspaces').doc(currentWorkspace).set({
            dataJson: JSON.stringify({ tabs: DATA.tabs, registro: DATA.registro }),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser ? currentUser.email : null
        }, { merge: true }).then(() => {
            showSyncNote('Guardado ✓');
        }).catch(err => {
            showSyncNote('Error al guardar: ' + err.message, true);
        });
    }, 250);
}

let syncNoteTimer = null;
function showSyncNote(msg, isError, sticky){
    const el = document.getElementById('syncNote');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.toggle('saving', !!sticky);
    clearTimeout(syncNoteTimer);
    if (!sticky){
        syncNoteTimer = setTimeout(() => { el.textContent = ''; el.classList.remove('error'); }, 2200);
    }
}

function seedIDS(){
    if (!isAdmin()) return;
    if (currentWorkspace !== 'ids'){
        alert('Cámbiate primero al espacio IDS para cargar el contenido inicial ahí.');
        return;
    }
    if (DATA.tabs.length > 0){
        if (!confirm('El espacio IDS ya tiene contenido. ¿Reemplazarlo por el contenido inicial de fábrica? Esto NO se puede deshacer.')) return;
    } else {
        if (!confirm('¿Cargar el contenido inicial de IDS (pestañas y respuestas ya elaboradas)?')) return;
    }
    DATA = JSON.parse(JSON.stringify(SEED_IDS));
    if (!DATA.registro) DATA.registro = [];
    currentTab = DATA.tabs.length ? DATA.tabs[0].id : null;
    renderApp();
    renderRegistro();
    saveWorkspace();
}

function exportBackup(){
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-' + currentWorkspace + '-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ===================== GESTIÓN DE USUARIOS (ADMIN) ===================== */

function openUsersModal(){
    if (!isAdmin()) return;
    document.getElementById('usersModalOverlay').classList.remove('hidden');
    document.getElementById('moreActionsMenu').classList.add('hidden');
}

function closeUsersModal(){
    document.getElementById('usersModalOverlay').classList.add('hidden');
}

function toggleMoreActions(){
    document.getElementById('moreActionsMenu').classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('moreActionsMenu');
    const btn = document.getElementById('moreActionsBtn');
    if (!menu || menu.classList.contains('hidden')) return;
    if (e.target === btn || menu.contains(e.target)) return;
    menu.classList.add('hidden');
});

function subscribeUsuarios(){
    if (unsubscribeUsuarios) unsubscribeUsuarios();
    unsubscribeUsuarios = db.collection('usuarios').onSnapshot(snap => {
        const items = [];
        snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        renderUsuarios(items);
    }, err => {
        console.error('Error leyendo usuarios:', err.message);
    });
}

function renderUsuarios(items){
    const list = document.getElementById('usersList');
    if (!list) return;
    items.sort((a,b) => (a.email||'').localeCompare(b.email||''));
    if (items.length === 0){
        list.innerHTML = '<div class="registro-empty">Sin usuarios todavía.</div>';
        return;
    }
    list.innerHTML = items.map(u => (
        '<div class="user-item">' +
            '<span class="role-badge">' + (u.rol === 'admin' ? 'ADMIN' : 'LECTURA') + '</span>' +
            '<span class="u-email-text">' + escapeHTML(u.email || u.id) + '</span>' +
            '<span class="u-fecha">' + escapeHTML(u.fecha || '') + '</span>' +
            (u.id !== (currentUser && currentUser.uid) ?
                '<button class="u-del" title="Quitar acceso" onclick="removeUsuario(\'' + u.id + '\')">🗑</button>' : '') +
        '</div>'
    )).join('');
}

function addUsuario(){
    if (!isAdmin()) return;
    const email = document.getElementById('uEmail').value.trim();
    const pass = document.getElementById('uPass').value;
    const rol = document.getElementById('uRol').value;

    if (!email || !pass){
        alert('Escribe correo y contraseña para el nuevo usuario.');
        return;
    }
    if (pass.length < 6){
        alert('La contraseña debe tener al menos 6 caracteres.');
        return;
    }

    const btn = document.getElementById('usersAddBtn');
    btn.disabled = true;

    const secondaryApp = firebase.apps.find(a => a.name === 'Secondary') || firebase.initializeApp(firebaseConfig, 'Secondary');
    const secondaryAuth = secondaryApp.auth();

    secondaryAuth.createUserWithEmailAndPassword(email, pass)
        .then(cred => {
            const uid = cred.user.uid;
            return secondaryAuth.signOut().then(() => uid);
        })
        .then(uid => db.collection('usuarios').doc(uid).set({
            email, rol,
            creadoPor: currentUser.email,
            fecha: new Date().toISOString().slice(0, 10)
        }))
        .then(() => {
            document.getElementById('uEmail').value = '';
            document.getElementById('uPass').value = '';
            btn.disabled = false;
        })
        .catch(err => {
            alert(traduceErrorAuth(err));
            btn.disabled = false;
        });
}

function removeUsuario(uid){
    if (!isAdmin()) return;
    if (!confirm('¿Quitar el acceso de este usuario? (su cuenta de correo seguirá existiendo, pero ya no podrá entrar)')) return;
    db.collection('usuarios').doc(uid).delete().catch(err => alert('Error: ' + err.message));
}

/* ===================== helpers generales ===================== */

function findTabIdx(id){
    return DATA.tabs.findIndex(t => t.id === id);
}

function slugify(str){
    return str.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/(^-|-$)/g,'') || 'tab';
}

function escapeHTML(str){
    const d = document.createElement('div');
    d.textContent = str == null ? '' : str;
    return d.innerHTML;
}

/* ===================== RENDER ===================== */

function renderApp(){
    renderTabsNav();
    renderTabsContent();
}

function renderTabsNav(){
    const nav = document.getElementById('tabsNav');
    nav.innerHTML = '';

    DATA.tabs.forEach((tab, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'tab-btn-wrap' + (tab.id === currentTab ? ' active' : '');

        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.textContent = tab.label;
        btn.onclick = () => switchTab(tab.id);
        wrap.appendChild(btn);

        if (editMode && isAdmin()){
            if (idx > 0){
                const left = document.createElement('button');
                left.className = 'mini-btn';
                left.title = 'Mover a la izquierda';
                left.textContent = '◀';
                left.onclick = (e) => { e.stopPropagation(); moveTab(idx, -1); };
                wrap.appendChild(left);
            }
            if (idx < DATA.tabs.length - 1){
                const right = document.createElement('button');
                right.className = 'mini-btn';
                right.title = 'Mover a la derecha';
                right.textContent = '▶';
                right.onclick = (e) => { e.stopPropagation(); moveTab(idx, 1); };
                wrap.appendChild(right);
            }
            const rename = document.createElement('button');
            rename.className = 'mini-btn';
            rename.title = 'Renombrar pestaña';
            rename.textContent = '✎';
            rename.onclick = (e) => { e.stopPropagation(); renameTab(idx); };
            wrap.appendChild(rename);

            const del = document.createElement('button');
            del.className = 'mini-btn danger';
            del.title = 'Eliminar pestaña';
            del.textContent = '🗑';
            del.onclick = (e) => { e.stopPropagation(); deleteTab(idx); };
            wrap.appendChild(del);
        }

        nav.appendChild(wrap);
    });

    if (editMode && isAdmin()){
        const addBtn = document.createElement('button');
        addBtn.id = 'addTabBtn';
        addBtn.textContent = '+ Nueva pestaña';
        addBtn.onclick = addTab;
        nav.appendChild(addBtn);
    }

    const busquedasWrap = document.createElement('div');
    busquedasWrap.className = 'tab-btn-wrap' + (currentTab === '__busquedas__' ? ' active' : '');
    const busquedasBtn = document.createElement('button');
    busquedasBtn.className = 'tab-btn';
    busquedasBtn.textContent = '🔎 Búsquedas';
    busquedasBtn.onclick = () => switchTab('__busquedas__');
    busquedasWrap.appendChild(busquedasBtn);
    nav.appendChild(busquedasWrap);
}

function renderTabsContent(){
    const container = document.getElementById('tabsContainer');
    container.innerHTML = '';
    document.getElementById('busquedasPane').classList.toggle('active-tab', currentTab === '__busquedas__');

    if (DATA.tabs.length === 0 && currentTab !== '__busquedas__'){
        const empty = document.createElement('div');
        empty.className = 'tab-content active-tab';
        empty.innerHTML = '<div class="section"><div class="section-header"><h2 class="section-title">' +
            (isAdmin() ? 'Este espacio está vacío. Activa "✏️ Modo edición" y agrega tu primera pestaña.' : 'Este espacio todavía no tiene contenido.') +
            '</h2></div></div>';
        container.appendChild(empty);
        return;
    }

    DATA.tabs.forEach((tab, tabIdx) => {
        const tabDiv = document.createElement('div');
        tabDiv.className = 'tab-content' + (tab.id === currentTab ? ' active-tab' : '');
        tabDiv.id = 'tab-' + tab.id;

        tab.sections.forEach((section, sectionIdx) => {
            tabDiv.appendChild(renderSection(tab, tabIdx, section, sectionIdx));
        });

        if (editMode && isAdmin()){
            const row = document.createElement('div');
            row.className = 'add-section-row';
            const btn = document.createElement('button');
            btn.textContent = '+ Agregar sección';
            btn.onclick = () => addSection(tabIdx);
            row.appendChild(btn);
            tabDiv.appendChild(row);
        }

        container.appendChild(tabDiv);
    });
}

function renderSection(tab, tabIdx, section, sectionIdx){
    const secDiv = document.createElement('div');
    secDiv.className = 'section';

    const header = document.createElement('div');
    header.className = 'section-header';

    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = section.title;
    header.appendChild(title);

    if (editMode && isAdmin()){
        if (sectionIdx > 0){
            const up = document.createElement('button');
            up.className = 'mini-btn';
            up.title = 'Mover sección arriba';
            up.textContent = '▲';
            up.onclick = () => moveSection(tabIdx, sectionIdx, -1);
            header.appendChild(up);
        }
        if (sectionIdx < tab.sections.length - 1){
            const down = document.createElement('button');
            down.className = 'mini-btn';
            down.title = 'Mover sección abajo';
            down.textContent = '▼';
            down.onclick = () => moveSection(tabIdx, sectionIdx, 1);
            header.appendChild(down);
        }
        const rename = document.createElement('button');
        rename.className = 'mini-btn';
        rename.title = 'Renombrar sección';
        rename.textContent = '✎';
        rename.onclick = () => renameSection(tabIdx, sectionIdx);
        header.appendChild(rename);

        const del = document.createElement('button');
        del.className = 'mini-btn danger';
        del.title = 'Eliminar sección';
        del.textContent = '🗑';
        del.onclick = () => deleteSection(tabIdx, sectionIdx);
        header.appendChild(del);
    }

    secDiv.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'button-grid';

    section.buttons.forEach((button, buttonIdx) => {
        grid.appendChild(renderButton(tabIdx, sectionIdx, button, buttonIdx, section.buttons.length));
    });

    if (editMode && isAdmin()){
        const addTile = document.createElement('button');
        addTile.className = 'add-tile';
        addTile.textContent = '+ Agregar botón';
        addTile.onclick = () => openButtonModal(tabIdx, sectionIdx, null);
        grid.appendChild(addTile);
    }

    secDiv.appendChild(grid);
    return secDiv;
}

function renderButton(tabIdx, sectionIdx, button, buttonIdx, total){
    const wrap = document.createElement('div');
    wrap.className = 'button-edit-wrap';

    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = button.label;

    if (editMode && isAdmin()){
        btn.onclick = () => openButtonModal(tabIdx, sectionIdx, buttonIdx);
    } else {
        btn.onclick = () => activateButton(button);
    }

    wrap.appendChild(btn);

    if (editMode && isAdmin()){
        const toolbar = document.createElement('div');
        toolbar.className = 'button-toolbar';

        if (buttonIdx > 0){
            const left = document.createElement('button');
            left.className = 'mini-btn';
            left.textContent = '◀';
            left.title = 'Mover a la izquierda';
            left.onclick = (e) => { e.stopPropagation(); moveButton(tabIdx, sectionIdx, buttonIdx, -1); };
            toolbar.appendChild(left);
        }
        if (buttonIdx < total - 1){
            const right = document.createElement('button');
            right.className = 'mini-btn';
            right.textContent = '▶';
            right.title = 'Mover a la derecha';
            right.onclick = (e) => { e.stopPropagation(); moveButton(tabIdx, sectionIdx, buttonIdx, 1); };
            toolbar.appendChild(right);
        }
        const del = document.createElement('button');
        del.className = 'mini-btn danger';
        del.textContent = '🗑';
        del.title = 'Eliminar botón';
        del.onclick = (e) => { e.stopPropagation(); deleteButton(tabIdx, sectionIdx, buttonIdx); };
        toolbar.appendChild(del);

        wrap.appendChild(toolbar);
    }

    return wrap;
}

/* ===================== ACCIONES NORMALES ===================== */

function activateButton(button){
    if (button.type === 'link'){
        window.open(button.url, '_blank');
    } else {
        showViewer(button.label, button.content || '');
    }
}

function showViewer(titulo, contentHTML){
    const menu = document.getElementById('menu');
    const viewer = document.getElementById('viewer');

    menu.classList.add('menu-hidden');

    viewer.innerHTML =
        '<h2 class="auto-title">' + escapeHTML(titulo) + '</h2>' +
        '<div id="viewerBody">' + contentHTML + '</div>' +
        '<button class="back" onclick="back()">⬅ Regresar</button>' +
        '<button class="back" onclick="copyViewerContent(this)">📋 Copiar</button>';

    viewer.classList.remove('hidden');
    window.scrollTo(0,0);
}

function back(){
    document.getElementById('menu').classList.remove('menu-hidden');
    document.getElementById('viewer').classList.add('hidden');
    window.scrollTo(0,0);
}

function copyViewerContent(button){
    const body = document.getElementById('viewerBody');
    const textToCopy = body.innerText.trim();
    navigator.clipboard.writeText(textToCopy).then(() => {
        button.innerText = '✅ Copiado';
        setTimeout(() => { button.innerText = '📋 Copiar'; }, 1500);
    });
}

function switchTab(tabId){
    currentTab = tabId;
    document.getElementById('searchInput').value = '';
    renderApp();
}

/* ===================== BÚSQUEDA ===================== */

function filterButtons(){
    const search = document.getElementById('searchInput').value.toLowerCase().trim();
    const tabsNav = document.getElementById('tabsNav');

    if (search === ''){
        resetSearch();
        return;
    }

    tabsNav.classList.add('hidden');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('active-tab'));

    document.querySelectorAll('.section').forEach(section => {
        let anyVisible = false;
        section.querySelectorAll('.action-btn').forEach(btn => {
            const match = btn.textContent.toLowerCase().includes(search);
            btn.closest('.button-edit-wrap').style.display = match ? '' : 'none';
            if (match) anyVisible = true;
        });
        section.style.display = anyVisible ? '' : 'none';
    });
}

function resetSearch(){
    document.getElementById('searchInput').value = '';
    document.getElementById('tabsNav').classList.remove('hidden');
    document.getElementById('viewer').classList.add('hidden');
    document.getElementById('menu').classList.remove('menu-hidden');
    renderApp();
}

/* ===================== MODO EDICIÓN (solo admin) ===================== */

function toggleEditMode(){
    if (!isAdmin()) return;
    editMode = !editMode;
    document.getElementById('editToggleBtn').classList.toggle('active', editMode);
    document.getElementById('editToggleBtn').textContent = editMode ? '👁️ Salir de edición' : '✏️ Modo edición';
    closeModal();
    renderApp();
}

/* ---- Tabs ---- */

function addTab(){
    if (!isAdmin()) return;
    const label = prompt('Nombre de la nueva pestaña:', 'Nueva pestaña');
    if (!label) return;
    const id = slugify(label) + '-' + Date.now();
    DATA.tabs.push({ id, label, sections: [] });
    currentTab = id;
    renderApp();
    saveWorkspace();
}

function renameTab(idx){
    if (!isAdmin()) return;
    const tab = DATA.tabs[idx];
    const label = prompt('Nuevo nombre de la pestaña:', tab.label);
    if (!label) return;
    tab.label = label;
    renderApp();
    saveWorkspace();
}

function deleteTab(idx){
    if (!isAdmin()) return;
    const tab = DATA.tabs[idx];
    if (!confirm('¿Eliminar la pestaña "' + tab.label + '" y todo su contenido? Esta acción no se puede deshacer.')) return;
    DATA.tabs.splice(idx, 1);
    if (currentTab === tab.id){
        currentTab = DATA.tabs.length ? DATA.tabs[0].id : null;
    }
    renderApp();
    saveWorkspace();
}

function moveTab(idx, dir){
    if (!isAdmin()) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= DATA.tabs.length) return;
    const tmp = DATA.tabs[idx];
    DATA.tabs[idx] = DATA.tabs[newIdx];
    DATA.tabs[newIdx] = tmp;
    renderApp();
    saveWorkspace();
}

/* ---- Secciones ---- */

function addSection(tabIdx){
    if (!isAdmin()) return;
    const title = prompt('Nombre de la nueva sección:', 'NUEVA SECCIÓN');
    if (!title) return;
    DATA.tabs[tabIdx].sections.push({ title, buttons: [] });
    renderApp();
    saveWorkspace();
}

function renameSection(tabIdx, sectionIdx){
    if (!isAdmin()) return;
    const section = DATA.tabs[tabIdx].sections[sectionIdx];
    const title = prompt('Nuevo nombre de la sección:', section.title);
    if (!title) return;
    section.title = title;
    renderApp();
    saveWorkspace();
}

function deleteSection(tabIdx, sectionIdx){
    if (!isAdmin()) return;
    const section = DATA.tabs[tabIdx].sections[sectionIdx];
    if (!confirm('¿Eliminar la sección "' + section.title + '" y todos sus botones?')) return;
    DATA.tabs[tabIdx].sections.splice(sectionIdx, 1);
    renderApp();
    saveWorkspace();
}

function moveSection(tabIdx, sectionIdx, dir){
    if (!isAdmin()) return;
    const sections = DATA.tabs[tabIdx].sections;
    const newIdx = sectionIdx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const tmp = sections[sectionIdx];
    sections[sectionIdx] = sections[newIdx];
    sections[newIdx] = tmp;
    renderApp();
    saveWorkspace();
}

/* ---- Botones ---- */

function moveButton(tabIdx, sectionIdx, buttonIdx, dir){
    if (!isAdmin()) return;
    const buttons = DATA.tabs[tabIdx].sections[sectionIdx].buttons;
    const newIdx = buttonIdx + dir;
    if (newIdx < 0 || newIdx >= buttons.length) return;
    const tmp = buttons[buttonIdx];
    buttons[buttonIdx] = buttons[newIdx];
    buttons[newIdx] = tmp;
    renderApp();
    saveWorkspace();
}

function deleteButton(tabIdx, sectionIdx, buttonIdx){
    if (!isAdmin()) return;
    const buttons = DATA.tabs[tabIdx].sections[sectionIdx].buttons;
    const button = buttons[buttonIdx];
    if (!confirm('¿Eliminar el botón "' + button.label + '"?')) return;
    buttons.splice(buttonIdx, 1);
    renderApp();
    saveWorkspace();
}

/* ---- Modal de botón ---- */

function openButtonModal(tabIdx, sectionIdx, buttonIdx){
    if (!isAdmin()) return;
    modalTarget = { tabIdx, sectionIdx, buttonIdx };
    const isNew = buttonIdx === null;
    const button = isNew ? null : DATA.tabs[tabIdx].sections[sectionIdx].buttons[buttonIdx];

    document.getElementById('modalTitle').textContent = isNew ? 'Nuevo botón' : 'Editar botón';
    document.getElementById('modalLabel').value = button ? button.label : '';
    document.getElementById('modalType').value = button ? button.type : 'text';
    document.getElementById('modalContent').value = button && button.type === 'text' ? (button.content || '') : '';
    document.getElementById('modalUrl').value = button && button.type === 'link' ? (button.url || '') : '';

    onModalTypeChange();
    document.getElementById('modalOverlay').classList.remove('hidden');
}

function onModalTypeChange(){
    const type = document.getElementById('modalType').value;
    document.getElementById('modalTextField').style.display = type === 'text' ? '' : 'none';
    document.getElementById('modalLinkField').style.display = type === 'link' ? '' : 'none';
}

function closeModal(){
    document.getElementById('modalOverlay').classList.add('hidden');
    modalTarget = null;
}

function saveModal(){
    if (!isAdmin()) return;
    if (!modalTarget) return;
    const label = document.getElementById('modalLabel').value.trim();
    if (!label){
        alert('El botón necesita un nombre.');
        return;
    }
    const type = document.getElementById('modalType').value;
    const newButton = { label, type };
    if (type === 'text'){
        newButton.content = document.getElementById('modalContent').value;
    } else {
        const url = document.getElementById('modalUrl').value.trim();
        if (!url){
            alert('Indica la ruta del archivo.');
            return;
        }
        newButton.url = url;
    }

    const { tabIdx, sectionIdx, buttonIdx } = modalTarget;
    const buttons = DATA.tabs[tabIdx].sections[sectionIdx].buttons;

    if (buttonIdx === null){
        buttons.push(newButton);
    } else {
        buttons[buttonIdx] = newButton;
    }

    closeModal();
    renderApp();
    saveWorkspace();
}

/* ===================== PANELES DESPLEGABLES ===================== */

function togglePanel(name){
    const content = document.getElementById(name + 'Content');
    const chevron = document.getElementById(name + 'Chevron');
    const title = chevron.closest('.ip-lookup-title');
    const isCollapsed = content.classList.contains('collapsed');

    content.classList.toggle('collapsed', !isCollapsed);
    chevron.classList.toggle('open', isCollapsed);
    title.classList.toggle('collapsed-title', !isCollapsed);
}

/* ===================== BUSCADOR DE IP (IP_DATA es estático, ip-data.js) ===================== */

function ipToInt(ip){
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts){
        if (!/^\d{1,3}$/.test(p)) return null;
        const v = parseInt(p, 10);
        if (v < 0 || v > 255) return null;
        n = (n * 256) + v;
    }
    return n >>> 0;
}

function intToIp(n){
    return [(n>>>24)&255, (n>>>16)&255, (n>>>8)&255, n&255].join('.');
}

function prefixToSize(prefix){
    return prefix >= 32 ? 1 : Math.pow(2, 32 - prefix);
}

const MAC_RE = /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/;
const MAC_PREFIX_RE = /^[0-9A-Fa-f]{2}([:\-][0-9A-Fa-f]{1,2}){0,5}$/;

function normalizeMac(m){
    return m.trim().toUpperCase().replace(/-/g, ':');
}

function parseIpQuery(raw){
    let s = raw.trim();
    let explicitPrefix = null;
    if (s.indexOf('/') !== -1){
        const parts = s.split('/');
        s = parts[0].trim();
        const p = parseInt(parts[1], 10);
        if (isNaN(p) || p < 0 || p > 32) return null;
        explicitPrefix = p;
    }
    const octets = s.split('.');
    if (octets.length < 1 || octets.length > 4) return null;
    const nums = [];
    for (const o of octets){
        if (!/^\d{1,3}$/.test(o)) return null;
        const v = parseInt(o, 10);
        if (v < 0 || v > 255) return null;
        nums.push(v);
    }
    while (nums.length < 4) nums.push(0);
    const start0 = (nums[0]*16777216) + (nums[1]*65536) + (nums[2]*256) + nums[3];
    const prefix = explicitPrefix !== null ? explicitPrefix : (octets.length * 8);
    const size = prefixToSize(prefix);
    const mask = prefix === 0 ? 0 : (~(size - 1) >>> 0);
    const qStart = (start0 & mask) >>> 0;
    const qEnd = (qStart + size - 1) >>> 0;
    const exact = (octets.length === 4 && explicitPrefix === null);
    return { qStart, qEnd, prefix, exact };
}

function findIPMatches(ipInt){
    const results = [];

    IP_DATA.services.forEach(([startStr, prefix, label, vlan, dev]) => {
        const start = ipToInt(startStr);
        const size = prefixToSize(prefix);
        const end = start + size - 1;
        if (ipInt >= start && ipInt <= end){
            results.push({ tipo: 'servicio', badge: 'SERVICIO', label, vlan, dev,
                start, end, size, cidr: startStr + '/' + prefix });
        }
    });

    IP_DATA.top.forEach(([startStr, prefix, sheetLabel]) => {
        const start = ipToInt(startStr);
        const size = prefixToSize(prefix);
        const end = start + size - 1;
        if (ipInt >= start && ipInt <= end){
            results.push({ tipo: 'red-principal', badge: 'RED PRINCIPAL', label: sheetLabel,
                start, end, size, cidr: startStr + '/' + prefix });
        }
    });

    IP_DATA.sub.forEach(([startStr, endStr, assign, sheetLabel]) => {
        const start = ipToInt(startStr);
        const end = ipToInt(endStr);
        if (ipInt >= start && ipInt <= end){
            results.push({ tipo: 'bloque', badge: 'BLOQUE / CAPACIDAD', label: (assign || sheetLabel),
                sheetLabel, start, end, size: (end - start + 1),
                cidr: intToIp(start) + ' - ' + intToIp(end) });
        }
    });

    IP_DATA.detail.forEach(([startStr, prefix, site, sheetLabel]) => {
        const start = ipToInt(startStr);
        const size = prefixToSize(prefix);
        const end = start + size - 1;
        if (ipInt >= start && ipInt <= end){
            results.push({ tipo: 'sitio', badge: 'SEGMENTO ASIGNADO', label: site, sheetLabel,
                start, end, size, cidr: startStr + '/' + prefix });
        }
    });

    results.sort((a, b) => a.size - b.size);
    return results;
}

function overlaps(aStart, aEnd, bStart, bEnd){
    return aStart <= bEnd && aEnd >= bStart;
}

function findRangeMatches(qStart, qEnd){
    const results = [];

    IP_DATA.services.forEach(([startStr, prefix, label, vlan, dev]) => {
        const start = ipToInt(startStr);
        const end = start + prefixToSize(prefix) - 1;
        if (overlaps(start, end, qStart, qEnd)){
            results.push({ tipo: 'servicio', badge: 'SERVICIO', label, sheetLabel: null,
                start, end, cidr: startStr + '/' + prefix });
        }
    });

    IP_DATA.top.forEach(([startStr, prefix, sheetLabel]) => {
        const start = ipToInt(startStr);
        const end = start + prefixToSize(prefix) - 1;
        if (overlaps(start, end, qStart, qEnd)){
            results.push({ tipo: 'red-principal', badge: 'RED PRINCIPAL', label: sheetLabel, sheetLabel: null,
                start, end, cidr: startStr + '/' + prefix });
        }
    });

    IP_DATA.sub.forEach(([startStr, endStr, assign, sheetLabel]) => {
        const start = ipToInt(startStr);
        const end = ipToInt(endStr);
        if (overlaps(start, end, qStart, qEnd)){
            results.push({ tipo: 'bloque', badge: 'BLOQUE / CAPACIDAD', label: (assign || sheetLabel),
                sheetLabel, start, end, cidr: intToIp(start) + ' - ' + intToIp(end) });
        }
    });

    IP_DATA.detail.forEach(([startStr, prefix, site, sheetLabel]) => {
        const start = ipToInt(startStr);
        const end = start + prefixToSize(prefix) - 1;
        if (overlaps(start, end, qStart, qEnd)){
            results.push({ tipo: 'sitio', badge: 'SEGMENTO ASIGNADO', label: site, sheetLabel,
                start, end, cidr: startStr + '/' + prefix });
        }
    });

    (DATA.registro || []).forEach(r => {
        if (r.tipo !== 'ip') return;
        const ip = ipToInt(r.valor);
        if (ip === null) return;
        if (ip >= qStart && ip <= qEnd){
            results.push({ tipo: 'caso', badge: 'CASO / INVESTIGACIÓN', label: r.caso || '(sin caso)',
                sheetLabel: r.nota || null, start: ip, end: ip, cidr: r.valor, fecha: r.fecha });
        }
    });

    results.sort((a, b) => a.start - b.start);
    return results;
}

function lookupIP(){
    const raw = document.getElementById('ipLookupInput').value.trim();
    const box = document.getElementById('ipLookupBox');
    const out = document.getElementById('ipLookupResults');
    box.classList.remove('match-found', 'match-notfound');

    if (!raw){
        out.innerHTML = '';
        return;
    }

    const looksLikeMac = (raw.indexOf(':') !== -1 || raw.indexOf('-') !== -1) && MAC_PREFIX_RE.test(raw);
    if (looksLikeMac){
        renderMacResults(raw);
        return;
    }

    const parsed = parseIpQuery(raw);
    if (parsed === null){
        box.classList.add('match-notfound');
        out.innerHTML = '<div class="ip-error">⚠️ Escribe una IPv4 (completa o con 1-3 octetos), un bloque con /prefijo, o una MAC (ej: 00:1A:2B:3C:4D:5E).</div>';
        return;
    }

    if (parsed.exact){
        lookupExactIP(parsed.qStart);
    } else {
        renderRangeResults(parsed.qStart, parsed.qEnd);
    }
}

function lookupExactIP(ipInt){
    const box = document.getElementById('ipLookupBox');
    const out = document.getElementById('ipLookupResults');

    const matches = findIPMatches(ipInt);
    const casos = (DATA.registro || []).filter(r => r.tipo === 'ip' && ipToInt(r.valor) === ipInt);

    if (matches.length === 0 && casos.length === 0){
        box.classList.add('match-notfound');
        out.innerHTML = '<div class="ip-notfound">❌ La IP <b>' + intToIp(ipInt) + '</b> no aparece en el direccionamiento ni en el registro de casos.</div>';
        return;
    }

    box.classList.add('match-found');
    let html = '';

    casos.forEach(c => {
        html += '<div class="ip-result-best" style="border-color:#f4a62a;">' +
            '<span class="ip-tag" style="background:#f4a62a;color:#111;">CASO / INVESTIGACIÓN</span>' +
            '<div class="ip-site">' + escapeHTML(c.caso || '(sin caso)') + '</div>' +
            '<div class="ip-meta">IP: <b>' + escapeHTML(c.valor) + '</b>' +
                (c.nota ? '<br>Nota: ' + escapeHTML(c.nota) : '') +
                (c.fecha ? '<br>Fecha: ' + escapeHTML(c.fecha) : '') +
            '</div></div>';
    });

    if (matches.length){
        const best = matches[0];
        html += '<div class="ip-result-best">' +
            '<span class="ip-tag">' + escapeHTML(best.badge) + '</span>' +
            '<div class="ip-site">' + escapeHTML(best.label) + '</div>' +
            '<div class="ip-meta">' +
                'IP consultada: <b>' + intToIp(ipInt) + '</b> · Bloque: <b>' + escapeHTML(best.cidr) + '</b>' +
                (best.sheetLabel ? '<br>Servicio: <b>' + escapeHTML(best.sheetLabel) + '</b>' : '') +
                (best.vlan ? '<br>VLAN: <b>' + escapeHTML(best.vlan) + '</b>' : '') +
                (best.dev ? '<br>Dispositivos típicos: <b>' + escapeHTML(best.dev) + '</b>' : '') +
            '</div></div>';

        if (matches.length > 1){
            html += '<div class="ip-hierarchy">';
            matches.slice(1).forEach(m => {
                html += '<div class="ip-hier-item">' +
                    '<span class="ip-hier-badge">' + escapeHTML(m.badge) + '</span>' +
                    '<span class="ip-hier-label">' + escapeHTML(m.label) + (m.sheetLabel && m.sheetLabel !== m.label ? ' — ' + escapeHTML(m.sheetLabel) : '') + '</span>' +
                    '<span class="ip-hier-cidr">' + escapeHTML(m.cidr) + '</span>' +
                '</div>';
            });
            html += '</div>';
        }
    }

    out.innerHTML = html;
}

function renderRangeResults(qStart, qEnd){
    const box = document.getElementById('ipLookupBox');
    const out = document.getElementById('ipLookupResults');

    const matches = findRangeMatches(qStart, qEnd);

    if (matches.length === 0){
        box.classList.add('match-notfound');
        out.innerHTML = '<div class="ip-notfound">❌ No hay nada registrado dentro de <b>' + intToIp(qStart) + ' - ' + intToIp(qEnd) + '</b>.</div>';
        return;
    }

    box.classList.add('match-found');
    const LIMIT = 200;
    const shown = matches.slice(0, LIMIT);

    let html = '<div class="ip-range-count">Bloque consultado: <b>' + intToIp(qStart) + ' - ' + intToIp(qEnd) + '</b> · ' +
        matches.length + ' resultado(s)' + (matches.length > LIMIT ? ' (mostrando ' + LIMIT + ')' : '') + '</div>';
    html += '<div class="ip-range-list">';
    shown.forEach(m => {
        const isCaso = m.tipo === 'caso';
        html += '<div class="ip-hier-item"' + (isCaso ? ' style="border-color:#f4a62a;"' : '') + '>' +
            '<span class="ip-hier-badge"' + (isCaso ? ' style="color:#f4a62a;"' : '') + '>' + escapeHTML(m.badge) + '</span>' +
            '<span class="ip-hier-label">' + escapeHTML(m.label) + (m.sheetLabel && m.sheetLabel !== m.label ? ' — ' + escapeHTML(m.sheetLabel) : '') +
                (m.fecha ? ' <span style="color:#6b7280;">(' + escapeHTML(m.fecha) + ')</span>' : '') + '</span>' +
            '<span class="ip-hier-cidr">' + escapeHTML(m.cidr) + '</span>' +
        '</div>';
    });
    html += '</div>';
    out.innerHTML = html;
}

function renderMacResults(raw){
    const box = document.getElementById('ipLookupBox');
    const out = document.getElementById('ipLookupResults');
    const q = normalizeMac(raw);

    const all = (DATA.registro || []).filter(r => r.tipo === 'mac');
    const matches = all.filter(r => {
        const v = normalizeMac(r.valor);
        return v === q || v.indexOf(q) === 0;
    });

    if (matches.length === 0){
        box.classList.add('match-notfound');
        out.innerHTML = '<div class="ip-notfound">❌ No hay ninguna MAC registrada que coincida con <b>' + escapeHTML(raw) + '</b>.</div>';
        return;
    }

    box.classList.add('match-found');
    let html = '<div class="ip-range-count">' + matches.length + ' resultado(s) en el registro de casos</div>';
    html += '<div class="ip-range-list">';
    matches.forEach(m => {
        html += '<div class="ip-hier-item" style="border-color:#f4a62a;">' +
            '<span class="ip-hier-badge" style="color:#f4a62a;">CASO / INVESTIGACIÓN</span>' +
            '<span class="ip-hier-label">' + escapeHTML(m.caso || '(sin caso)') +
                (m.nota ? ' — ' + escapeHTML(m.nota) : '') +
                (m.fecha ? ' <span style="color:#6b7280;">(' + escapeHTML(m.fecha) + ')</span>' : '') + '</span>' +
            '<span class="ip-hier-cidr">' + escapeHTML(m.valor) + '</span>' +
        '</div>';
    });
    html += '</div>';
    out.innerHTML = html;
}

function clearIPLookup(){
    document.getElementById('ipLookupInput').value = '';
    document.getElementById('ipLookupResults').innerHTML = '';
    document.getElementById('ipLookupBox').classList.remove('match-found', 'match-notfound');
    document.getElementById('ipLookupInput').focus();
}

document.getElementById('ipLookupInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookupIP();
});

document.getElementById('loginPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
});

/* ===================== REGISTRO DE IP/MAC DE CASOS ===================== */

function addRegistro(){
    if (!isAdmin()) return;
    const tipo = document.getElementById('regTipo').value;
    const valorRaw = document.getElementById('regValor').value.trim();
    const caso = document.getElementById('regCaso').value.trim();
    const nota = document.getElementById('regNota').value.trim();

    if (!valorRaw){
        alert('Escribe la IP o MAC.');
        return;
    }

    let valor = valorRaw;
    if (tipo === 'ip'){
        if (ipToInt(valorRaw) === null){
            alert('La IP no es válida. Ej: 10.140.5.20');
            return;
        }
    } else {
        if (!MAC_RE.test(valorRaw)){
            alert('La MAC no es válida. Ej: 00:1A:2B:3C:4D:5E');
            return;
        }
        valor = normalizeMac(valorRaw);
    }

    const fecha = new Date().toISOString().slice(0, 10);
    if (!DATA.registro) DATA.registro = [];
    DATA.registro.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), tipo, valor, caso, nota, fecha });

    document.getElementById('regValor').value = '';
    document.getElementById('regCaso').value = '';
    document.getElementById('regNota').value = '';

    renderRegistro();
    saveWorkspace();
}

function deleteRegistro(id){
    if (!isAdmin()) return;
    const item = DATA.registro.find(r => r.id === id);
    if (!item) return;
    if (!confirm('¿Eliminar el registro "' + (item.caso || item.valor) + '"?')) return;
    DATA.registro = DATA.registro.filter(r => r.id !== id);
    renderRegistro();
    saveWorkspace();
}

function renderRegistro(){
    const list = document.getElementById('registroList');
    if (!list) return;
    const filterEl = document.getElementById('registroFilter');
    const filter = (filterEl ? filterEl.value : '').toLowerCase().trim();

    let items = DATA.registro || [];
    if (filter){
        items = items.filter(r =>
            (r.valor || '').toLowerCase().includes(filter) ||
            (r.caso || '').toLowerCase().includes(filter) ||
            (r.nota || '').toLowerCase().includes(filter)
        );
    }

    items = items.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    if (items.length === 0){
        list.innerHTML = '<div class="registro-empty">Sin registros' + (filter ? ' que coincidan con el filtro.' : ' todavía.') + '</div>';
        return;
    }

    list.innerHTML = items.map(r => (
        '<div class="registro-item">' +
            '<span class="reg-badge">' + (r.tipo === 'ip' ? 'IP' : 'MAC') + '</span>' +
            '<div class="reg-body">' +
                '<div class="reg-valor">' + escapeHTML(r.valor) + '</div>' +
                (r.caso ? '<div class="reg-caso">' + escapeHTML(r.caso) + '</div>' : '') +
                (r.nota ? '<div class="reg-nota">' + escapeHTML(r.nota) + '</div>' : '') +
                '<div class="reg-fecha">' + escapeHTML(r.fecha || '') + '</div>' +
            '</div>' +
            (isAdmin() ? '<button class="reg-del" title="Eliminar" onclick="deleteRegistro(\'' + r.id + '\')">🗑</button>' : '') +
        '</div>'
    )).join('');
}

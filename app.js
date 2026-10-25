/**
 * SISTEMA DE ESCALAS LITÚRGICAS E COMUNITÁRIAS
 * Gerenciamento de ministros, fila circular (round-robin) e 3 tipos de escala:
 * 1. Segunda à Sexta
 * 2. Sábado e Domingo
 * 3. Dias de Festas ("Festa")
 */

const App = (() => {
  // Constantes de chaves do LocalStorage
  const STORAGE_KEYS = {
    MEMBERS: 'escala_pnsa_members',
    FESTAS: 'escala_pnsa_festas',
    SCHEDULE: 'escala_pnsa_current_schedule',
    POINTER: 'escala_pnsa_rotation_pointer',
    THEME: 'escala_pnsa_theme',
        WEEK_CONFIG: 'escala_pnsa_week_config_v3'
  };

  /**
   * Configuração padrão canônica de dias e horários da Paróquia
   * Regras paroquiais de contingente mínimo:
   * - De Segunda a Sábado: mínimo de 2 ministros em cada missa
   * - Aos Domingos e Dias de Festa / Solenidades: mínimo de 4 ministros em cada missa
   */
  function getDefaultScheduleWeekConfig() {
    return {
      1: {
        name: 'Segunda-feira',
        borderClass: 'card-border-weekday',
        tagText: 'Seg a Sex',
        tagClass: '',
        enabled: true,
        times: [
          { time: '07:00', persons: 2, active: true },
          { time: '15:00', persons: 2, active: false },
          { time: '19:00', persons: 2, active: false }
        ]
      },
      2: {
        name: 'Terça-feira',
        borderClass: 'card-border-tuesday',
        tagText: '⭐ Novena N. Sra. Aparecida (15h)',
        tagClass: 'tag-novena',
        enabled: true,
        isTuesdayNovenaDay: true,
        times: [
          { time: '07:00', persons: 2, active: false },
          { time: '15:00', persons: 2, active: true, isNovena: true },
          { time: '19:00', persons: 2, active: false }
        ]
      },
      3: {
        name: 'Quarta-feira',
        borderClass: 'card-border-weekday',
        tagText: 'Seg a Sex',
        tagClass: '',
        enabled: false,
        times: [
          { time: '07:00', persons: 2, active: false },
          { time: '15:00', persons: 2, active: false },
          { time: '19:00', persons: 2, active: false }
        ]
      },
      4: {
        name: 'Quinta-feira',
        borderClass: 'card-border-weekday',
        tagText: 'Seg a Sex',
        tagClass: '',
        enabled: true,
        times: [
          { time: '07:00', persons: 2, active: true },
          { time: '15:00', persons: 2, active: false },
          { time: '19:00', persons: 2, active: true }
        ]
      },
      5: {
        name: 'Sexta-feira',
        borderClass: 'card-border-weekday',
        tagText: 'Seg a Sex',
        tagClass: '',
        enabled: true,
        times: [
          { time: '07:00', persons: 2, active: false },
          { time: '15:00', persons: 2, active: false },
          { time: '19:00', persons: 2, active: true }
        ]
      },
      6: {
        name: 'Sábado',
        borderClass: 'card-border-weekend',
        tagText: 'Final de Semana',
        tagClass: 'tag-weekend',
        enabled: true,
        times: [
          { time: '07:00', persons: 2, active: false },
          { time: '15:00', persons: 2, active: false },
          { time: '19:00', persons: 2, active: true }
        ]
      },
      0: {
        name: 'Domingo',
        borderClass: 'card-border-weekend',
        tagText: 'Final de Semana',
        tagClass: 'tag-weekend',
        enabled: true,
        times: [
          { time: '07:00', persons: 4, active: false },
          { time: '15:00', persons: 4, active: false },
          { time: '19:00', persons: 4, active: true }
        ]
      },
      festa: {
        name: 'Dias de Festa & Solenidades',
        borderClass: 'card-border-festa',
        tagText: 'Celebração Solene',
        tagClass: 'tag-festa',
        enabled: false,
        times: [
          { time: '07:00', persons: 4, active: false },
          { time: '15:00', persons: 4, active: false },
          { time: '19:00', persons: 4, active: false }
        ]
      }
    };
  }

  let scheduleWeekConfig = getDefaultScheduleWeekConfig();

  // Estado da Aplicação
  let state = {
    members: [],
    festas: [],
    currentSchedule: null,
    rotationPointer: 0,
    currentFilter: 'all',
    selectedModalities: [], // Array cumulativo (ex: ['weekday', 'weekend']). Vazio = todas
    selectedCommunities: [], // Array cumulativo de comunidades (ex: ['Matriz', 'Santa Terezinha']). Vazio = todas
    selectedRole: 'all',
    selectedCommunity: 'all',
    membersCurrentPage: 1,
    membersPerPage: 20,
    currentViewMode: 'cards', // 'cards' (padrão), 'calendar' ou 'table'
    excludedDays: [], // Dias específicos do mês sem celebração
    theme: 'light'
  };

  // Dados iniciais padrão (demonstração elegante)
  const DEFAULT_MEMBERS = [
    { id: '1', name: 'Maria da Penha', community: 'Matriz', role: 'Ministro da Eucaristia', pref: 'all', timePrefs: ['07:00', '15:00', '19:00'], active: true, count: 0 },
    { id: '2', name: 'Antônio Carlos', community: 'Santa Terezinha', role: 'Leitor / Proclamador', pref: 'weekday', timePrefs: ['19:00', 'outro'], timeOutroText: '19:30', active: true, count: 0 },
    { id: '3', name: 'Regina Célia', community: 'São Cristóvão', role: 'Acolhida', pref: 'weekend', timePrefs: ['07:00', '19:00'], active: true, count: 0 },
    { id: '4', name: 'Paulo Roberto', community: 'Matriz', role: 'Ministro da Eucaristia', pref: 'all', timePrefs: ['07:00', '15:00', '19:00'], active: true, count: 0 },
    { id: '5', name: 'Lúcia Helena', community: 'São Miguel', role: 'Leitor / Proclamador', pref: 'all', timePrefs: ['07:00', '19:00'], active: true, count: 0 },
    { id: '6', name: 'Francisco de Assis', community: 'São José Operário', role: 'Cerimoniário', pref: 'festa', timePrefs: ['19:00'], active: true, count: 0 },
    { id: '7', name: 'Tereza Cristina', community: 'Matriz', role: 'Acolhida', pref: 'weekend', timePrefs: ['07:00'], active: true, count: 0 },
    { id: '8', name: 'Marcos Vinícius', community: 'Santa Terezinha', role: 'Ministro da Eucaristia', pref: 'all', timePrefs: ['15:00', '19:00'], active: true, count: 0 },
    { id: '9', name: 'Ana Beatriz', community: 'São Cristóvão', role: 'Leitor / Proclamador', pref: 'weekday', timePrefs: ['15:00', 'outro'], timeOutroText: '19:30', active: true, count: 0 },
    { id: '10', name: 'Gabriel Santos', community: 'Matriz', role: 'Cerimoniário', pref: 'all', timePrefs: ['07:00', '15:00', '19:00'], active: true, count: 0 }
  ];

  const DEFAULT_FESTAS = [
    { id: 'f1', title: 'Padroeira Nossa Senhora Aparecida', date: '2026-10-12', notes: 'Missa Solene e Procissão' },
    { id: 'f2', title: 'Solenidade de Todos os Santos', date: '2026-11-01', notes: 'Missa Solene às 19:00' },
    { id: 'f3', title: 'Imaculada Conceição', date: '2026-12-08', notes: 'Celebração Mariana' },
    { id: 'f4', title: 'Vigília de Natal', date: '2026-12-24', notes: 'Missa da Noite de Natal' },
    { id: 'f5', title: 'Natal do Senhor', date: '2026-12-25', notes: 'Missa do Dia' }
  ];

  /**
   * Inicialização do Sistema
   */
  function init() {
    loadFromStorage();
    setupTheme();
    setupTabNavigation();
    setupDateDefaults();
    setupModals();
    setupValidationListeners();
    
    // Se não há escala gerada ainda, gerar automaticamente a do mês atual para o usuário já ver o dashboard preenchido
    if (!state.currentSchedule) {
      autoGenerateCurrentMonth();
    }

    renderAll();

    // 1. Inicializa sincronização com a Nuvem (Firebase Firestore)
    const firebaseReady = initFirebase();
    if (firebaseReady) {
      listenToCloudFirestore();
    }
  }

  /**
   * Gerenciamento centralizado de modais e trava de rolagem do body
   */
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
      document.body.classList.add('modal-open');
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
    }
    // Remove a trava de rolagem se nenhum outro modal estiver aberto
    setTimeout(() => {
      if (!document.querySelector('.modal-backdrop.open')) {
        document.body.classList.remove('modal-open');
      }
    }, 50);
  }

  function setupModals() {
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          if (backdrop.id === 'modal-confirm') {
            closeConfirmModal(false);
          } else {
            closeModal(backdrop.id);
          }
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openBackdrop = document.querySelector('.modal-backdrop.open');
        if (openBackdrop) {
          if (openBackdrop.id === 'modal-confirm') {
            closeConfirmModal(false);
          } else {
            closeModal(openBackdrop.id);
          }
        }
      }
    });

    // Vincula o botão de exclusão de escala com segurança
    const btnRemoveSched = document.getElementById('btn-remove-schedule');
    if (btnRemoveSched) {
      btnRemoveSched.addEventListener('click', (e) => {
        e.preventDefault();
        confirmDeleteCurrentSchedule();
      });
    }

    // Vincula o botão de marcar dias sem missa
    const btnOpenExcluded = document.getElementById('btn-open-excluded-modal');
    if (btnOpenExcluded) {
      btnOpenExcluded.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openExcludedDaysModal();
      });
    }

    // Fecha o dropdown customizado de substituição ao clicar fora
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('swap-person-dropdown-container');
      if (dropdown && dropdown.classList.contains('is-open') && !dropdown.contains(e.target)) {
        dropdown.classList.remove('is-open');
        const trigger = document.getElementById('swap-person-btn-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /**
   * Carrega dados do LocalStorage
   */
  function loadFromStorage() {
    try {
      const savedMembers = localStorage.getItem(STORAGE_KEYS.MEMBERS);
      state.members = savedMembers ? JSON.parse(savedMembers) : DEFAULT_MEMBERS;
      if (!Array.isArray(state.members) || state.members.length === 0) {
        state.members = DEFAULT_MEMBERS;
      }
      // Garante retrocompatibilidade: preenche timePrefs e comunidade padrão caso não existam
      state.members.forEach(m => {
        if (!m.timePrefs || !Array.isArray(m.timePrefs)) {
          m.timePrefs = ['07:00', '15:00', '19:00'];
        }
        if (!m.community) {
          m.community = 'Matriz';
        }
      });

      const savedFestas = localStorage.getItem(STORAGE_KEYS.FESTAS);
      state.festas = savedFestas ? JSON.parse(savedFestas) : DEFAULT_FESTAS;
      if (!Array.isArray(state.festas)) {
        state.festas = DEFAULT_FESTAS;
      }

      const savedSchedule = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
      state.currentSchedule = savedSchedule ? JSON.parse(savedSchedule) : null;

      const savedWeekConfig = localStorage.getItem(STORAGE_KEYS.WEEK_CONFIG);
      if (savedWeekConfig) {
        try {
          const parsed = JSON.parse(savedWeekConfig);
          if (parsed && typeof parsed === 'object') {
            scheduleWeekConfig = parsed;
          }
        } catch (e) {}
      }

      const savedPointer = localStorage.getItem(STORAGE_KEYS.POINTER);
      const parsedPointer = savedPointer ? parseInt(savedPointer, 10) : 0;
      state.rotationPointer = isNaN(parsedPointer) ? 0 : parsedPointer;

      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme) {
        state.theme = savedTheme;
      }
    } catch (e) {
      console.error('Erro ao ler LocalStorage:', e);
      state.members = DEFAULT_MEMBERS;
      state.festas = DEFAULT_FESTAS;
      state.rotationPointer = 0;
    }
  }

  let firebaseDb = null;
  let isCloudConnected = false;
  let isSavingToCloud = false;
  let cloudSyncDebounceTimer = null;
  let lastKnownCloudHash = '';

  /**
   * Inicializa o Firebase Cloud Firestore de forma leve (sem travar abas)
   */
  function initFirebase() {
    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
      return false;
    }
    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      firebaseDb = firebase.firestore();

      // Habilita persistência offline sem sincronização pesada de abas (evita travamentos)
      try {
        firebaseDb.enablePersistence({ synchronizeTabs: false }).catch(() => {});
      } catch (e) {}

      return true;
    } catch (e) {
      console.warn('Erro ao inicializar Firebase:', e);
      return false;
    }
  }

  /**
   * Escuta alterações em tempo real no Cloud Firestore (Multi-dispositivos)
   */
  function listenToCloudFirestore() {
    if (!firebaseDb) return;
    try {
      const docRef = firebaseDb.collection('paroquia').doc('escala_pnsa');
      docRef.onSnapshot((doc) => {
        isCloudConnected = true;
        updateDbStatusUi('cloud');

        // Ignora escritas locais ainda em trânsito para não re-renderizar em cima da digitação/clique do usuário
        if (doc.metadata && doc.metadata.hasPendingWrites) {
          return;
        }

        if (doc.exists) {
          const data = doc.data();
          if (isSavingToCloud) return;

          if (data && data.members && Array.isArray(data.members)) {
            // Verifica se houve mudança real nos dados antes de re-renderizar a tela
            const newHash = `${data.members.length}_${data.rotationPointer}_${(data.festas || []).length}_${data.lastUpdated || ''}`;
            if (newHash === lastKnownCloudHash) {
              return;
            }
            lastKnownCloudHash = newHash;

            state.members = data.members;
            state.festas = data.festas || state.festas;
            state.currentSchedule = ('currentSchedule' in data) ? data.currentSchedule : state.currentSchedule;
            state.rotationPointer = typeof data.rotationPointer === 'number' ? data.rotationPointer : state.rotationPointer;
            if (data.theme) state.theme = data.theme;

            saveLocalCacheOnly();
            renderAll();
          }
        } else {
          // Documento inicial ainda não existe no Firestore: envia os dados atuais para inicializar a nuvem!
          syncToCloudFirestoreDebounced();
        }
      }, (err) => {
        console.warn('Firestore offline ou aguardando conexão:', err);
        isCloudConnected = false;
        updateDbStatusUi('local');
      });
    } catch (e) {
      console.warn('Erro ao escutar Firestore:', e);
    }
  }

  /**
   * Salva dados no Cloud Firestore de forma debounced (não sobrecarrega requisições)
   */
  function syncToCloudFirestoreDebounced() {
    if (!firebaseDb) return;
    if (cloudSyncDebounceTimer) clearTimeout(cloudSyncDebounceTimer);
    cloudSyncDebounceTimer = setTimeout(() => {
      syncToCloudFirestore();
    }, 350);
  }

  /**
   * Salva dados no Cloud Firestore (Google Firebase)
   */
  async function syncToCloudFirestore() {
    if (!firebaseDb) return false;
    try {
      isSavingToCloud = true;
      const docRef = firebaseDb.collection('paroquia').doc('escala_pnsa');
      await docRef.set({
        members: state.members,
        festas: state.festas,
        currentSchedule: state.currentSchedule,
        rotationPointer: state.rotationPointer,
        theme: state.theme,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      isCloudConnected = true;
      updateDbStatusUi('cloud');
      return true;
    } catch (e) {
      console.warn('Erro ao salvar no Firestore:', e);
      isCloudConnected = false;
      updateDbStatusUi('local');
      return false;
    } finally {
      setTimeout(() => { isSavingToCloud = false; }, 400);
    }
  }

  function updateDbStatusUi(mode) {
    const chip = document.getElementById('db-status-chip');
    const dot = document.getElementById('db-status-dot');
    const text = document.getElementById('db-status-text');
    if (!chip || !dot || !text) return;

    if (mode === 'cloud') {
      dot.style.background = '#38bdf8';
      dot.style.boxShadow = '0 0 7px #38bdf8';
      text.textContent = '☁️ Nuvem Ativa (Firebase)';
      chip.title = 'Conectado ao Google Firebase Cloud Firestore. Sincronização em tempo real e backup na nuvem!';
    } else {
      dot.style.background = '#10b981';
      dot.style.boxShadow = 'none';
      text.textContent = '💾 Cache Local (Navegador)';
      chip.title = 'Dados salvos com segurança no armazenamento local do navegador.';
    }
  }

  function saveLocalCacheOnly() {
    try {
      localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(state.members));
      localStorage.setItem(STORAGE_KEYS.FESTAS, JSON.stringify(state.festas));
      if (state.currentSchedule) {
        localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(state.currentSchedule));
      } else {
        localStorage.removeItem(STORAGE_KEYS.SCHEDULE);
      }
      localStorage.setItem(STORAGE_KEYS.WEEK_CONFIG, JSON.stringify(scheduleWeekConfig));
      localStorage.setItem(STORAGE_KEYS.POINTER, state.rotationPointer.toString());
      localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
    } catch (e) {
      console.error('Erro ao salvar no cache local:', e);
    }
  }

  /**
   * Salva dados no LocalStorage e na Nuvem (Firebase)
   */
  function saveToStorage() {
    // 1. Cache Local ultra-rápido e síncrono (0ms de latência para a UI)
    saveLocalCacheOnly();

    // 2. Nuvem Google Firebase Firestore com debounce inteligente (assíncrono, nunca trava cliques)
    syncToCloudFirestoreDebounced();
  }

  /**
   * Configuração de Tema (Claro / Escuro)
   */
  function setupTheme() {
    state.theme = 'light';
    applyTheme('light');
  }

  function applyTheme() {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  }

  /**
   * Navegação de Abas
   */
  function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        switchTab(targetId);
      });
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    const targetPane = document.getElementById(tabId);
    if (targetPane) {
      targetPane.classList.add('active');
      window.scrollTo(0, 0);
    }
  }

  /**
   * Preenche selects com a data atual
   */
  function setupDateDefaults() {
    const now = new Date();
    const monthSelect = document.getElementById('gen-month-select');
    const yearSelect = document.getElementById('gen-year-select');
    const festaDateInput = document.getElementById('festa-date-input');

    if (monthSelect) {
      monthSelect.value = now.getMonth().toString();
      monthSelect.addEventListener('change', updateGenerationPreview);
    }
    if (yearSelect) {
      const currentYear = now.getFullYear();
      yearSelect.innerHTML = `
        <option value="${currentYear}">${currentYear}</option>
        <option value="${currentYear + 1}">${currentYear + 1}</option>
      `;
      yearSelect.value = currentYear.toString();
      yearSelect.addEventListener('change', updateGenerationPreview);
    }

    // Vincula atualização da prévia a todos os campos do gerador
    const genTab = document.getElementById('tab-generator');
    if (genTab) {
      genTab.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', () => updateGenerationPreview());
        el.addEventListener('change', () => updateGenerationPreview());
      });
    }

    if (festaDateInput) {
      festaDateInput.value = now.toISOString().split('T')[0];
    }

    // Inicializa limites e estado do seletor de período parcial
    handlePeriodTypeChange(false);
  }

  /**
   * Renderização Geral da Interface
   */
  function renderAll() {
    updateBadges();
    renderDashboardMetrics();
    renderRotationQueue();
    populateRoleFilter();
    renderMembersTable();
    populateSegmentSelect();
    renderSchedule();
    renderScheduleWeekConfig();
    renderFestasList();
    updateBadges();
    updateGenerationPreview();
  }

  function updateBadges() {
    const activeCount = getActiveMembers().length;
    const totalCount = (state.members && state.members.length) || 0;
    const festasCount = (state.festas && state.festas.length) || 0;
    
    const activeMembersCount = document.getElementById('active-members-count');
    if (activeMembersCount) {
      activeMembersCount.textContent = `${activeCount} de ${totalCount} Ministros Ativos`;
    }

    const membersBadge = document.getElementById('members-badge');
    if (membersBadge) membersBadge.textContent = totalCount.toString();

    const festasBadge = document.getElementById('festas-count-badge');
    if (festasBadge) festasBadge.textContent = festasCount.toString();

    const festasListBadge = document.getElementById('festas-list-badge');
    if (festasListBadge) festasListBadge.textContent = `${festasCount} celebrações`;
  }

  /* ==========================================================================
     GERENCIAMENTO DE INSCRITOS
     ========================================================================== */

  function normalizeTime(t) {
    if (!t || typeof t !== 'string') return '';
    const match = t.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return t.trim();
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  function getMemberPrefs(member) {
    if (!member) return ['weekday', 'weekend', 'festa'];
    if (Array.isArray(member.prefs)) return member.prefs;
    if (Array.isArray(member.pref)) return member.pref;
    if (typeof member.pref === 'string') {
      if (member.pref === 'all' || !member.pref) return ['weekday', 'weekend', 'festa'];
      return [member.pref];
    }
    return ['weekday', 'weekend', 'festa'];
  }

  function getMemberTimes(member) {
    if (!member) return ['07:00', '15:00', '19:00'];
    if (Array.isArray(member.timePrefs)) return member.timePrefs;
    if (Array.isArray(member.times)) return member.times;
    return ['07:00', '15:00', '19:00'];
  }

  function isMemberAvailableForTime(member, shiftTime) {
    if (!shiftTime) return true;
    const normShiftTime = normalizeTime(shiftTime);
    const mTimes = getMemberTimes(member);

    if (normShiftTime === '07:00') {
      return mTimes.includes('07:00');
    }
    if (normShiftTime === '15:00') {
      return mTimes.includes('15:00');
    }
    if (normShiftTime === '19:00') {
      return mTimes.includes('19:00');
    }

    // Demais horários (ex: 19:30, 08:00, etc.)
    if (!mTimes.includes('outro')) {
      return false;
    }

    const outroText = (member.timeOutroText || member.timeOutro || '').trim();
    if (!outroText) {
      // Se marcou OUTRO e deixou em branco, aceita qualquer horário diferente de 07:00, 15:00 e 19:00
      return true;
    }

    const customList = outroText.split(/[,;\s]+/).map(normalizeTime).filter(Boolean);
    if (customList.length === 0) return true;
    return customList.includes(normShiftTime);
  }

  function renderPrefBadges(member) {
    const pList = getMemberPrefs(member);
    const tList = getMemberTimes(member);

    const modTags = [];
    if (pList.length === 3 || pList.length === 0) {
      modTags.push('<span class="tag tag-all" style="font-size:0.72rem; padding:2px 6px;">Todas Modalidades</span>');
    } else {
      if (pList.includes('weekday')) modTags.push('<span class="tag tag-weekday" style="font-size:0.72rem; padding:2px 6px;">Seg-Sex</span>');
      if (pList.includes('weekend')) modTags.push('<span class="tag tag-weekend" style="font-size:0.72rem; padding:2px 6px;">Sáb-Dom</span>');
      if (pList.includes('festa')) modTags.push('<span class="tag tag-festa" style="font-size:0.72rem; padding:2px 6px;">Festas</span>');
    }

    const timeTags = [];
    const has07 = tList.includes('07:00');
    const has15 = tList.includes('15:00');
    const has19 = tList.includes('19:00');
    const hasOutro = tList.includes('outro');

    if (has07 && has15 && has19 && !hasOutro) {
      timeTags.push('<span class="tag tag-time-all" style="font-size:0.72rem; padding:2px 6px;">Padrão (07h, 15h, 19h)</span>');
    } else if (has07 && has15 && has19 && hasOutro) {
      const outroVal = (member.timeOutroText || member.timeOutro || '').trim();
      timeTags.push(`<span class="tag tag-time-all" style="font-size:0.72rem; padding:2px 6px;">Todos (${outroVal ? escapeHtml(outroVal) : 'Outro'})</span>`);
    } else {
      if (has07) timeTags.push('<span class="tag tag-time tag-time-07" style="font-size:0.72rem; padding:2px 6px;">🌅 07:00</span>');
      if (has15) timeTags.push('<span class="tag tag-time tag-time-15" style="font-size:0.72rem; padding:2px 6px;">☀️ 15:00</span>');
      if (has19) timeTags.push('<span class="tag tag-time tag-time-19" style="font-size:0.72rem; padding:2px 6px;">🌙 19:00</span>');
      if (hasOutro) {
        const outroVal = (member.timeOutroText || member.timeOutro || '').trim();
        timeTags.push(`<span class="tag tag-time tag-time-outro" style="font-size:0.72rem; padding:2px 6px;">⏰ ${outroVal ? escapeHtml(outroVal) : 'Outro'}</span>`);
      }
    }

    return `
      <div class="member-avail-badges">
        <div class="avail-row-mods">${modTags.join('')}</div>
        <div class="avail-row-times">${timeTags.join('')}</div>
      </div>
    `;
  }

  /**
   * Verifica se um ministro possui um determinado ministério/função
   * (compatível com múltiplas funções tanto em array `roles` quanto em string `role`)
   */
  function memberHasRole(member, roleTarget) {
    if (!roleTarget || roleTarget === 'all') return true;
    if (!member) return false;
    const targetLower = roleTarget.trim().toLowerCase();

    // 1. Checa array roles (novo modelo)
    if (Array.isArray(member.roles) && member.roles.length > 0) {
      if (member.roles.some(r => r && r.trim().toLowerCase() === targetLower)) {
        return true;
      }
    }

    // 2. Checa string role (ex: "Ministro da Eucaristia, Cerimoniário")
    if (typeof member.role === 'string') {
      const parts = member.role.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (parts.some(p => p === targetLower || p.includes(targetLower) || targetLower.includes(p))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Retorna os membros ativos, opcionalmente filtrados por segmento/função
   */
  function getActiveMembers(segmentFilter = null) {
    const active = state.members.filter(m => m.active !== false);
    if (!segmentFilter || segmentFilter === 'all') {
      return active;
    }
    return active.filter(m => memberHasRole(m, segmentFilter));
  }

  /**
   * Popula dinamicamente o seletor de segmentos/ministérios no formulário de geração
   * (A escala é sempre gerada especificamente para um segmento/ministério, nunca geral/todos)
   */
  function populateSegmentSelect() {
    const select = document.getElementById('gen-segment-select');
    if (!select) return;
    const currentVal = select.value;

    // Lista base de ministérios e pastorais paroquiais
    const knownRoles = [
      'Ministro da Eucaristia',
      'Acólito',
      'Coroinha',
      'Leitor / Proclamador',
      'Acolhida',
      'Cerimoniário',
      'Irmão do Santíssimo'
    ];

    const rolesSet = new Set(knownRoles);

    // Adiciona quaisquer outras funções personalizadas que estejam cadastradas nos membros
    state.members.forEach(m => {
      if (Array.isArray(m.roles)) {
        m.roles.forEach(r => { if (r && r.trim()) rolesSet.add(r.trim()); });
      } else if (typeof m.role === 'string') {
        m.role.split(',').forEach(r => { if (r && r.trim()) rolesSet.add(r.trim()); });
      }
    });

    const sortedRoles = Array.from(rolesSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    let html = '';

    sortedRoles.forEach(role => {
      const count = getActiveMembers(role).length;
      html += `<option value="${escapeHtml(role)}">${escapeHtml(role)} (${count} ministro${count === 1 ? '' : 's'} ativo${count === 1 ? '' : 's'})</option>`;
    });

    select.innerHTML = html;

    if (currentVal && currentVal !== 'all' && sortedRoles.includes(currentVal)) {
      select.value = currentVal;
    } else if (sortedRoles.includes('Ministro da Eucaristia')) {
      select.value = 'Ministro da Eucaristia';
    } else if (sortedRoles.length > 0) {
      select.value = sortedRoles[0];
    }
  }

  function handleSegmentChange() {
    state.excludedDays = [];
    renderExcludedDaysSummary();
    handlePeriodTypeChange(false);
    updateGenerationPreview();
  }

  /**
   * Título oficial da escala de acordo com o segmento selecionado
   */
  function getSegmentTitle(segment) {
    if (!segment || segment === 'all') {
      return 'ESCALA GERAL DE CELEBRAÇÕES';
    }
    const sLower = segment.toLowerCase();
    if (sLower.includes('ministro') || sLower.includes('mesc')) {
      return 'ESCALA DE MINISTROS EXTRAORDINÁRIOS DA SAGRADA COMUNHÃO - MESC';
    }
    if (sLower.includes('acólito') || sLower.includes('acolito')) {
      return 'ESCALA DE ACÓLITOS';
    }
    if (sLower.includes('coroinha')) {
      return 'ESCALA DE COROINHAS';
    }
    if (sLower.includes('leitor') || sLower.includes('proclamador')) {
      return 'ESCALA DE LEITORES E PROCLAMADORES DA PALAVRA';
    }
    if (sLower.includes('acolhida')) {
      return 'ESCALA DA PASTORAL DA ACOLHIDA';
    }
    if (sLower.includes('cerimoniário') || sLower.includes('cerimoniario')) {
      return 'ESCALA DE CERIMONIÁRIOS';
    }
    if (sLower.includes('santíssimo') || sLower.includes('santissimo')) {
      return 'ESCALA DA IRMANDADE DO SANTÍSSIMO SACRAMENTO';
    }
    return `ESCALA DE ${segment.toUpperCase()}`;
  }

  /**
   * Atualiza o rodapé de avisos/lembretes para a impressão (PDF) conforme o segmento
   */
  function updatePrintReminders(segment) {
    const badge = document.getElementById('print-reminders-badge');
    const list = document.getElementById('print-reminders-list');
    if (!badge || !list) return;

    const sLower = (segment ? String(segment) : 'all').toLowerCase();

    if (sLower.includes('ministro') || sLower.includes('mesc') || sLower === 'all' || !segment) {
      badge.textContent = 'LEMBRETES IMPORTANTES AOS MINISTROS (MESC)';
      list.innerHTML = `
        <li>CHEGAR UMA HORA ANTES DO HORÁRIO DA CELEBRAÇÃO</li>
        <li>CADA MINISTRO DEVERÁ LEVAR CONSIGO UM SANGUÍNEO PARA USÁ-LO NO MOMENTO DA DISTRIBUIÇÃO DA SANTA COMUNHÃO</li>
        <li>QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA</li>
      `;
    } else if (sLower.includes('acólito') || sLower.includes('acolito')) {
      badge.textContent = 'LEMBRETES IMPORTANTES AOS ACÓLITOS';
      list.innerHTML = `
        <li>CHEGAR COM 30 A 40 MINUTOS DE ANTECEDÊNCIA PARA PREPARAÇÃO DO ALTAR E VESTES</li>
        <li>VERIFICAR CREDÊNCIA, ÂNFORAS, GALHETAS E LIVROS LITÚRGICOS ANTES DO INÍCIO DA SANTA MISSA</li>
        <li>QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA</li>
      `;
    } else if (sLower.includes('coroinha')) {
      badge.textContent = 'LEMBRETES IMPORTANTES AOS COROINHAS';
      list.innerHTML = `
        <li>CHEGAR COM 30 MINUTOS DE ANTECEDÊNCIA DEVIDAMENTE UNIFORMIZADO(A)</li>
        <li>ATENÇÃO ESPECIAL À POSTURA, SILÊNCIO E ZELO NO PRESBITÉRIO DURANTE TODA A CELEBRAÇÃO</li>
        <li>QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA</li>
      `;
    } else if (sLower.includes('leitor') || sLower.includes('proclamador')) {
      badge.textContent = 'LEMBRETES IMPORTANTES AOS LEITORES / PROCLAMADORES';
      list.innerHTML = `
        <li>CHEGAR COM 30 MINUTOS DE ANTECEDÊNCIA PARA TREINO E REVISÃO DO LECIONÁRIO NO AMBÃO</li>
        <li>FAZER A LEITURA COM CALMA, BOA DICÇÃO E POSTURA RESPEITOSA NA PROCLAMAÇÃO DA PALAVRA</li>
        <li>QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA</li>
      `;
    } else if (sLower.includes('acolhida')) {
      badge.textContent = 'LEMBRETES IMPORTANTES À PASTORAL DA ACOLHIDA';
      list.innerHTML = `
        <li>CHEGAR COM 40 MINUTOS DE ANTECEDÊNCIA NA PORTA DA IGREJA</li>
        <li>ACOLHER OS FIÉIS COM ALEGRIA, DISTRIBUIR FOLHETOS E AUXILIAR NA ORGANIZAÇÃO DOS BANCOS</li>
        <li>QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA</li>
      `;
    } else {
      const segText = String(segment).toUpperCase();
      badge.textContent = `LEMBRETES IMPORTANTES - ${segText}`;
      list.innerHTML = `
        <li>CHEGAR UMA HORA ANTES DO HORÁRIO DA CELEBRAÇÃO</li>
        <li>CADA MINISTRO DEVERÁ LEVAR CONSIGO UM SANGUÍNEO PARA USÁ-LO NO MOMENTO DA DISTRIBUIÇÃO DA SANTA COMUNHÃO</li>
        <li>QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA</li>
      `;
    }
  }

  function handleRoleChange(scope) {
    const outroCheck = document.getElementById(`${scope}-role-outro-check`);
    const wrap = document.getElementById(`${scope}-role-outro-wrap`);
    const input = document.getElementById(`${scope}-role-outro-input`);
    if (outroCheck && wrap) {
      wrap.style.display = outroCheck.checked ? 'block' : 'none';
      if (outroCheck.checked && input) {
        input.focus();
      }
    }
  }

  function handleTimeCheckChange(scope) {
    const outroCheck = document.getElementById(`${scope}-time-outro-check`);
    const wrap = document.getElementById(`${scope}-time-outro-wrap`);
    const input = document.getElementById(`${scope}-time-outro-input`);
    if (outroCheck && wrap) {
      wrap.style.display = outroCheck.checked ? 'block' : 'none';
      if (outroCheck.checked && input) {
        input.focus();
      }
    }
  }

  function getSelectedRoles(scope) {
    const checkboxes = document.querySelectorAll(`input[name="role_${scope}"]:checked`);
    const roles = [];
    checkboxes.forEach(cb => {
      if (cb.value === 'Outro') {
        const outroVal = document.getElementById(`${scope}-role-outro-input`)?.value.trim();
        if (outroVal) {
          roles.push(outroVal);
        }
      } else {
        roles.push(cb.value);
      }
    });
    return roles;
  }

  function getTimePrefsFromForm(scope) {
    const times = [];
    if (document.getElementById(`${scope}-time-0700`)?.checked) times.push('07:00');
    if (document.getElementById(`${scope}-time-1500`)?.checked) times.push('15:00');
    if (document.getElementById(`${scope}-time-1900`)?.checked) times.push('19:00');
    const outroChecked = document.getElementById(`${scope}-time-outro-check`)?.checked;
    let outroText = '';
    if (outroChecked) {
      times.push('outro');
      outroText = document.getElementById(`${scope}-time-outro-input`)?.value.trim() || '';
    }
    return { times, outroText };
  }

  /**
   * Valida se o nome já existe no sistema, exibindo destaque vermelho e mensagem de erro imediata
   */
  function validateMemberNameInput(inputEl, currentMemberId = null) {
    if (!inputEl) return true;
    const val = inputEl.value.trim();
    if (!val) {
      setInputError(inputEl, false);
      return true;
    }

    const valLower = val.toLowerCase();
    const isDuplicate = state.members.some(m => {
      if (currentMemberId && String(m.id) === String(currentMemberId)) {
        return false;
      }
      return m.name.trim().toLowerCase() === valLower;
    });

    if (isDuplicate) {
      setInputError(inputEl, true, `Já existe um(a) ministro(a) cadastrado(a) com o nome "${val}". Para evitar confusões na escala, use um sobrenome ou apelido diferenciador.`);
      return false;
    } else {
      setInputError(inputEl, false);
      return true;
    }
  }

  function clearAllAddFormErrors() {
    document.querySelectorAll('.field-group-error').forEach(el => el.classList.remove('field-group-error'));
  }

  function clearAddFormGroupError(groupId) {
    const el = document.getElementById(groupId);
    if (el) el.classList.remove('field-group-error');
  }

  function markAddFormError(groupId, focusEl, message) {
    clearAllAddFormErrors();
    const group = document.getElementById(groupId);
    if (group) {
      group.classList.add('field-group-error');
      group.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (focusEl) {
      focusEl.focus();
    }
    if (message) {
      showToast(message, true);
    }
  }

  function setupValidationListeners() {
    const addInput = document.getElementById('member-name-input');
    if (addInput) {
      addInput.addEventListener('blur', () => {
        validateMemberNameInput(addInput);
      });
      addInput.addEventListener('input', () => {
        if (addInput.value.trim()) {
          clearAddFormGroupError('form-group-add-name');
        }
        if (addInput.classList.contains('input-field-error')) {
          validateMemberNameInput(addInput);
        }
      });
    }

    // Limpa destaque de função ao alterar qualquer checkbox de função ou digitar
    document.querySelectorAll('input[name="role_add"]').forEach(cb => {
      cb.addEventListener('change', () => clearAddFormGroupError('form-group-add-role'));
    });
    const roleOutroInput = document.getElementById('add-role-outro-input');
    if (roleOutroInput) {
      roleOutroInput.addEventListener('input', () => clearAddFormGroupError('form-group-add-role'));
    }

    // Limpa destaque de modalidade ao selecionar qualquer modalidade
    ['add-pref-weekday', 'add-pref-weekend', 'add-pref-festa'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => clearAddFormGroupError('form-group-add-pref'));
    });

    // Limpa destaque de horário ao selecionar qualquer horário ou digitar
    ['add-time-0700', 'add-time-1500', 'add-time-1900', 'add-time-outro-check'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => clearAddFormGroupError('form-group-add-time'));
    });
    const timeOutroInput = document.getElementById('add-time-outro-input');
    if (timeOutroInput) {
      timeOutroInput.addEventListener('input', () => clearAddFormGroupError('form-group-add-time'));
    }

    // Limpa destaque de comunidade
    const commSelect = document.getElementById('add-member-community');
    if (commSelect) {
      commSelect.addEventListener('change', () => clearAddFormGroupError('form-group-add-community'));
    }
    const commOutroInput = document.getElementById('add-community-outro-input');
    if (commOutroInput) {
      commOutroInput.addEventListener('input', () => clearAddFormGroupError('form-group-add-community'));
    }

    const editInput = document.getElementById('edit-member-name');
    if (editInput) {
      editInput.addEventListener('blur', () => {
        const id = document.getElementById('edit-member-id')?.value;
        validateMemberNameInput(editInput, id);
      });
      editInput.addEventListener('input', () => {
        if (editInput.classList.contains('input-field-error')) {
          const id = document.getElementById('edit-member-id')?.value;
          validateMemberNameInput(editInput, id);
        }
      });
    }
  }

  function handleAddMember(event) {
    event.preventDefault();
    clearAllAddFormErrors();

    // 1. Requisito Nome Completo (topo)
    const nameInput = document.getElementById('member-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      markAddFormError('form-group-add-name', nameInput, 'Por favor, informe o nome do ministro.');
      return;
    }
    if (!validateMemberNameInput(nameInput)) {
      markAddFormError('form-group-add-name', nameInput);
      return;
    }

    // 2. Requisito Função / Ministério (Fixo por padrão como Ministro da Eucaristia)
    const selectedRoles = ['Ministro da Eucaristia'];

    // 3. Requisito Disponibilidade (Modalidades)
    const prefs = [];
    if (document.getElementById('add-pref-weekday')?.checked) prefs.push('weekday');
    if (document.getElementById('add-pref-weekend')?.checked) prefs.push('weekend');
    if (document.getElementById('add-pref-festa')?.checked) prefs.push('festa');
    if (prefs.length === 0) {
      markAddFormError('form-group-add-pref', null, 'Selecione ao menos uma modalidade de disponibilidade.');
      return;
    }

    // 4. Requisito Horários de Disponibilidade
    const { times, outroText } = getTimePrefsFromForm('add');
    if (times.length === 0) {
      markAddFormError('form-group-add-time', null, 'Selecione ao menos um horário de disponibilidade.');
      return;
    }
    if (times.includes('outro') && !outroText) {
      markAddFormError('form-group-add-time', document.getElementById('add-time-outro-input'), 'Informe o horário específico no campo OUTRO (Ex: 20:00).');
      return;
    }

    // 5. Requisito Comunidade onde serve
    const commSelect = document.getElementById('add-member-community');
    let community = commSelect ? commSelect.value : 'Matriz';
    let communityOutroText = '';
    if (community === 'OUTRO') {
      communityOutroText = document.getElementById('add-community-outro-input')?.value.trim() || '';
      if (!communityOutroText) {
        markAddFormError('form-group-add-community', document.getElementById('add-community-outro-input'), 'Especifique a comunidade onde o ministro serve.');
        return;
      }
      community = communityOutroText;
    }

    // Todos os requisitos validados: limpa qualquer destaque residual de erro
    clearAllAddFormErrors();

    const roleStr = selectedRoles.length > 0 ? selectedRoles.join(', ') : 'Ministro(a)';

    const newMember = {
      id: Date.now().toString(),
      name,
      community,
      communityOutroText,
      role: roleStr,
      roles: selectedRoles,
      prefs,
      pref: prefs.length === 3 ? 'all' : prefs,
      timePrefs: times,
      timeOutroText: outroText,
      active: true,
      count: 0
    };

    state.members.push(newMember);
    saveToStorage();
    renderAll();

    // Limpeza completa de todos os campos voltando ao estado inicial (sem seleção padrão)
    nameInput.value = '';
    setInputError(nameInput, false);
    document.querySelectorAll('input[name="role_add"]').forEach(cb => cb.checked = false);
    const outroInput = document.getElementById('add-role-outro-input');
    if (outroInput) outroInput.value = '';
    const outroWrap = document.getElementById('add-role-outro-wrap');
    if (outroWrap) outroWrap.style.display = 'none';

    // Limpa modalidades (deixa sem seleção padrão)
    const prefWeekday = document.getElementById('add-pref-weekday');
    if (prefWeekday) prefWeekday.checked = false;
    const prefWeekend = document.getElementById('add-pref-weekend');
    if (prefWeekend) prefWeekend.checked = false;
    const prefFesta = document.getElementById('add-pref-festa');
    if (prefFesta) prefFesta.checked = false;

    // Limpa horários (deixa sem seleção padrão)
    const time07 = document.getElementById('add-time-0700');
    if (time07) time07.checked = false;
    const time15 = document.getElementById('add-time-1500');
    if (time15) time15.checked = false;
    const time19 = document.getElementById('add-time-1900');
    if (time19) time19.checked = false;
    const timeOutro = document.getElementById('add-time-outro-check');
    if (timeOutro) timeOutro.checked = false;
    const addOutroWrap = document.getElementById('add-time-outro-wrap');
    if (addOutroWrap) addOutroWrap.style.display = 'none';
    const addOutroInput = document.getElementById('add-time-outro-input');
    if (addOutroInput) addOutroInput.value = '';

    // Restaura comunidade padrão
    if (commSelect) commSelect.value = 'Matriz';
    const addCommOutroWrap = document.getElementById('add-community-outro-wrap');
    if (addCommOutroWrap) addCommOutroWrap.style.display = 'none';
    const addCommOutroInput = document.getElementById('add-community-outro-input');
    if (addCommOutroInput) addCommOutroInput.value = '';

    nameInput.focus();
    showToast(`"${name}" foi adicionado(a) com sucesso!`);
  }

  async function removeMember(id) {
    const member = state.members.find(m => m.id === id);
    if (!member) return;

    const confirmed = await showConfirmModal({
      title: 'Remover Inscrito',
      message: `Tem certeza de que deseja remover <strong>"${escapeHtml(member.name)}"</strong> da lista de ministros?<br><span style="font-size:0.8rem; color:var(--text-light); margin-top:6px; display:inline-block;">Essa pessoa deixará de participar das próximas escalas.</span>`,
      confirmText: 'Sim, Remover',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    state.members = state.members.filter(m => m.id !== id);
    
    // Ajusta o ponteiro se necessário
    const active = getActiveMembers();
    if (state.rotationPointer >= active.length) {
      state.rotationPointer = 0;
    }

    saveToStorage();
    renderAll();
    showToast(`"${member.name}" removido(a) com sucesso.`);
  }

  function toggleMemberStatus(id) {
    const member = state.members.find(m => m.id === id);
    if (!member) return;

    member.active = !member.active;
    saveToStorage();
    renderAll();
    showToast(`"${member.name}" está agora ${member.active ? 'ativo' : 'em pausa'}.`);
  }

  async function clearAllMembers() {
    if (state.members.length === 0) {
      showToast('A lista de ministros já está vazia.', true);
      return;
    }

    // 1º Alerta: Alerta de exclusão com contagem de ministros
    const firstConfirm = await showConfirmModal({
      title: 'Excluir Todos os Ministros?',
      message: `Você está prestes a excluir <strong>TODOS OS ${state.members.length} MINISTROS</strong> cadastrados no sistema.<br><span style="color:#ef4444; font-weight:600; font-size:0.85rem; margin-top:8px; display:inline-block;">⚠️ Isso removerá todos os nomes, disponibilidades e histórico de atendimento.</span>`,
      confirmText: 'Prosseguir com a Exclusão',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!firstConfirm) return;

    // 2º Alerta: Alerta rigoroso de impossibilidade de reversão
    const secondConfirm = await showConfirmModal({
      title: '🚨 CONFIRMAÇÃO FINAL: AÇÃO IRREVERSÍVEL!',
      message: `<strong>TEM ABSOLUTA CERTEZA?</strong><br><br>Esta ação <strong>NÃO PODERÁ SER DESFEITA</strong> nem recuperada.<br><span style="color:#b91c1c; font-weight:700; font-size:0.9rem;">Deseja realmente apagar definitivamente toda a base de ministros?</span>`,
      confirmText: 'SIM, APAGAR DEFINITIVAMENTE',
      cancelText: 'Não, Manter Ministros',
      type: 'danger'
    });

    if (!secondConfirm) return;

    state.members = [];
    state.rotationPointer = 0;
    saveToStorage();
    renderAll();
    showToast('Todos os ministros foram excluídos permanentemente.');
  }

  function handleCommunityChange(scope) {
    const select = document.getElementById(`${scope}-member-community`);
    const wrap = document.getElementById(`${scope}-community-outro-wrap`);
    const input = document.getElementById(`${scope}-community-outro-input`);
    if (select && wrap) {
      const isOutro = select.value === 'OUTRO';
      wrap.style.display = isOutro ? 'block' : 'none';
      if (isOutro && input) {
        input.focus();
      }
    }
  }

  /**
   * Popula o dropdown de filtro por tipo de serviço/função
   */
  function populateRoleFilter() {
    const select = document.getElementById('members-role-filter');
    if (!select) return;
    const currentVal = select.value || state.selectedRole || 'all';

    const rolesSet = new Set([
      'Ministro da Eucaristia',
      'Acólito',
      'Coroinha',
      'Leitor / Proclamador',
      'Acolhida',
      'Cerimoniário',
      'Irmão do Santíssimo'
    ]);

    state.members.forEach(m => {
      if (Array.isArray(m.roles)) {
        m.roles.forEach(r => { if (r && r.trim()) rolesSet.add(r.trim()); });
      } else if (typeof m.role === 'string') {
        m.role.split(',').forEach(r => { if (r && r.trim()) rolesSet.add(r.trim()); });
      }
    });

    let html = '<option value="all">Todos os Serviços</option>';
    Array.from(rolesSet).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(role => {
      html += `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`;
    });

    select.innerHTML = html;
    if (['all', ...Array.from(rolesSet)].includes(currentVal)) {
      select.value = currentVal;
    }
  }

  /**
   * Filtro cumulativo por Modalidade (multi-seleção com a mesma cor consistente)
   */
  function toggleMemberModalityFilter(modality) {
    if (modality === 'all') {
      state.selectedModalities = [];
    } else {
      const idx = state.selectedModalities.indexOf(modality);
      if (idx >= 0) {
        state.selectedModalities.splice(idx, 1);
      } else {
        state.selectedModalities.push(modality);
      }
    }

    // Atualiza classes ativas nos botões
    const allBtn = document.getElementById('mod-filter-all');
    const weekdayBtn = document.getElementById('mod-filter-weekday');
    const weekendBtn = document.getElementById('mod-filter-weekend');
    const festaBtn = document.getElementById('mod-filter-festa');

    if (allBtn) allBtn.classList.toggle('active', state.selectedModalities.length === 0);
    if (weekdayBtn) weekdayBtn.classList.toggle('active', state.selectedModalities.includes('weekday'));
    if (weekendBtn) weekendBtn.classList.toggle('active', state.selectedModalities.includes('weekend'));
    if (festaBtn) festaBtn.classList.toggle('active', state.selectedModalities.includes('festa'));

    state.membersCurrentPage = 1;
    renderMembersTable();
  }

  /**
   * Filtro cumulativo por Comunidade (multi-seleção com a mesma cor consistente e suporte a 'Todas')
   */
  function toggleMemberCommunityFilter(community) {
    if (!state.selectedCommunities) state.selectedCommunities = [];

    if (community === 'all') {
      state.selectedCommunities = [];
    } else {
      const idx = state.selectedCommunities.indexOf(community);
      if (idx >= 0) {
        state.selectedCommunities.splice(idx, 1);
      } else {
        state.selectedCommunities.push(community);
      }
    }

    state.selectedCommunity = state.selectedCommunities.length === 1 ? state.selectedCommunities[0] : (state.selectedCommunities.length === 0 ? 'all' : 'multiple');

    // Atualiza classes ativas nos botões de comunidade
    const allBtn = document.getElementById('comm-filter-all');
    if (allBtn) allBtn.classList.toggle('active', state.selectedCommunities.length === 0);

    const commButtons = document.querySelectorAll('[data-comm-filter]');
    commButtons.forEach(btn => {
      const val = btn.getAttribute('data-comm-filter');
      if (val !== 'all') {
        btn.classList.toggle('active', state.selectedCommunities.includes(val));
      }
    });

    state.membersCurrentPage = 1;
    renderMembersTable();
  }

  function handleMemberRoleFilterChange() {
    const select = document.getElementById('members-role-filter');
    state.selectedRole = select ? select.value : 'all';
    state.membersCurrentPage = 1;
    renderMembersTable();
  }

  function handleMemberCommunityFilterChange() {
    const select = document.getElementById('members-community-filter');
    if (select) {
      state.selectedCommunity = select.value;
      state.selectedCommunities = select.value === 'all' ? [] : [select.value];
    }
    state.membersCurrentPage = 1;
    renderMembersTable();
  }

  function changeMembersPage(delta) {
    state.membersCurrentPage += delta;
    renderMembersTable();
  }

  function renderMembersTable(filterText = '') {
    const tbody = document.getElementById('members-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('members-search');
    const query = (typeof filterText === 'string' && filterText ? filterText : (searchInput ? searchInput.value : '')).toLowerCase().trim();

    const filtered = state.members.filter(m => {
      // 1. Busca textual por nome
      if (query && !m.name.toLowerCase().includes(query)) {
        return false;
      }

      // 2. Filtro cumulativo por Modalidade
      if (state.selectedModalities && state.selectedModalities.length > 0) {
        const mPrefs = getMemberPrefs(m);
        const matchesAnyMod = state.selectedModalities.some(mod => mPrefs.includes(mod));
        if (!matchesAnyMod) return false;
      }

      // 3. Filtro por Serviço / Função
      if (state.selectedRole && state.selectedRole !== 'all') {
        if (!memberHasRole(m, state.selectedRole)) return false;
      }

      // 4. Filtro por Comunidade (cumulativo / multi-seleção)
      if (state.selectedCommunities && state.selectedCommunities.length > 0) {
        const mComm = m.community || 'Matriz';
        const standardComm = ['Matriz', 'Santa Terezinha', 'São Cristóvão', 'São Miguel', 'São José Operário'];
        const matchesComm = state.selectedCommunities.some(comm => {
          if (comm === 'OUTRO') {
            return !standardComm.includes(mComm);
          }
          return mComm === comm;
        });
        if (!matchesComm) return false;
      } else if (state.selectedCommunity && state.selectedCommunity !== 'all' && state.selectedCommunity !== 'multiple') {
        const mComm = m.community || 'Matriz';
        const standardComm = ['Matriz', 'Santa Terezinha', 'São Cristóvão', 'São Miguel', 'São José Operário'];
        if (state.selectedCommunity === 'OUTRO') {
          if (standardComm.includes(mComm)) return false;
        } else if (mComm !== state.selectedCommunity) {
          return false;
        }
      }

      return true;
    });

    const totalFiltered = filtered.length;
    const perPage = state.membersPerPage || 20;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));

    if (state.membersCurrentPage > totalPages) state.membersCurrentPage = totalPages;
    if (state.membersCurrentPage < 1) state.membersCurrentPage = 1;

    const start = (state.membersCurrentPage - 1) * perPage;
    const pageItems = filtered.slice(start, start + perPage);

    // Atualiza barra de paginação (20 em 20)
    const pagInfo = document.getElementById('members-pagination-info');
    const pageDisplay = document.getElementById('members-page-display');
    const prevBtn = document.getElementById('members-prev-btn');
    const nextBtn = document.getElementById('members-next-btn');

    if (pagInfo) {
      if (totalFiltered === 0) {
        pagInfo.textContent = 'Nenhum ministro encontrado';
      } else {
        const end = Math.min(start + perPage, totalFiltered);
        pagInfo.textContent = `Mostrando ${start + 1} - ${end} de ${totalFiltered} ministros`;
      }
    }
    if (pageDisplay) {
      pageDisplay.textContent = `Página ${state.membersCurrentPage} de ${totalPages}`;
    }
    if (prevBtn) {
      prevBtn.disabled = state.membersCurrentPage <= 1;
      prevBtn.style.opacity = state.membersCurrentPage <= 1 ? '0.4' : '1';
      prevBtn.style.cursor = state.membersCurrentPage <= 1 ? 'not-allowed' : 'pointer';
    }
    if (nextBtn) {
      nextBtn.disabled = state.membersCurrentPage >= totalPages;
      nextBtn.style.opacity = state.membersCurrentPage >= totalPages ? '0.4' : '1';
      nextBtn.style.cursor = state.membersCurrentPage >= totalPages ? 'not-allowed' : 'pointer';
    }

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
            Nenhum ministro encontrado para os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pageItems.map((m, index) => {
      const isActive = m.active !== false;
      const globalPos = start + index + 1;
      const communityName = m.community || 'Matriz';
      const roleName = m.role || 'Ministro da Eucaristia';

      return `
        <tr style="opacity: ${isActive ? '1' : '0.55'};">
          <td style="font-weight: 700; color: var(--text-muted); text-align: center;">${globalPos}</td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <strong style="color: var(--text-main); font-size: 0.9rem; line-height: 1.25;">${escapeHtml(m.name)}</strong>
              <span style="font-size: 0.74rem; color: var(--text-muted); font-weight: 500;">${escapeHtml(roleName)}</span>
            </div>
          </td>
          <td>
            <span class="badge" style="background: rgba(212, 175, 55, 0.15); color: var(--gold-600); font-weight: 700; border: 1px solid rgba(212, 175, 55, 0.3); font-size: 0.75rem; white-space: nowrap;">
              ⛪ ${escapeHtml(communityName)}
            </span>
          </td>
          <td>${renderPrefBadges(m)}</td>
          <td style="text-align: center; white-space: nowrap;">
            <span class="badge badge-primary" style="font-size: 0.76rem;">${m.count || 0}x</span>
            ${m.subsCount ? `<span class="badge badge-gold" title="Realizou ${m.subsCount} substituição(ões)" style="margin-left:3px; font-size: 0.72rem;">+${m.subsCount} sub</span>` : ''}
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn btn-sm ${isActive ? 'btn-outline' : 'btn-outline-danger'}" 
                    onclick="App.toggleMemberStatus('${m.id}')" 
                    title="Clique para alternar status"
                    style="font-size: 0.75rem; padding: 3px 8px;">
              ${isActive ? '🟢 Ativo' : '⚪ Pausa'}
            </button>
          </td>
          <td>
            <div class="action-buttons-cell">
              <button class="btn-icon-action edit" onclick="App.openEditMemberModal('${m.id}')" title="Editar dados do ministro">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn-icon-action delete" onclick="App.removeMember('${m.id}')" title="Remover Ministro">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  let filterMembersDebounceTimer = null;
  function filterMembersList() {
    state.membersCurrentPage = 1;
    if (filterMembersDebounceTimer) clearTimeout(filterMembersDebounceTimer);
    filterMembersDebounceTimer = setTimeout(() => {
      const input = document.getElementById('members-search');
      renderMembersTable(input ? input.value : '');
    }, 60);
  }

  /* ==========================================================================
     MODAL DE EDIÇÃO DE INSCRITO
     ========================================================================== */

  function openEditMemberModal(id) {
    const member = state.members.find(m => String(m.id) === String(id));
    if (!member) return;

    const modal = document.getElementById('modal-edit-member');
    if (!modal) return;

    const prefs = getMemberPrefs(member);

    const editNameInput = document.getElementById('edit-member-name');
    if (editNameInput) setInputError(editNameInput, false);

    document.getElementById('edit-member-id').value = member.id;
    if (editNameInput) editNameInput.value = member.name || '';
    
    // Preenche checklist de funções
    document.querySelectorAll('input[name="role_edit"]').forEach(cb => cb.checked = false);
    const outroCheck = document.getElementById('edit-role-outro-check');
    const outroInput = document.getElementById('edit-role-outro-input');
    const outroWrap = document.getElementById('edit-role-outro-wrap');
    if (outroCheck) outroCheck.checked = false;
    if (outroInput) outroInput.value = '';
    if (outroWrap) outroWrap.style.display = 'none';

    const memberRoles = member.roles || (member.role ? member.role.split(',').map(r => r.trim()).filter(Boolean) : []);
    const customRoles = [];

    memberRoles.forEach(r => {
      const match = Array.from(document.querySelectorAll('input[name="role_edit"]'))
        .find(cb => cb.value.toLowerCase() === r.toLowerCase());
      if (match) {
        match.checked = true;
      } else {
        customRoles.push(r);
      }
    });

    if (customRoles.length > 0 && outroCheck && outroInput && outroWrap) {
      outroCheck.checked = true;
      outroInput.value = customRoles.join(', ');
      outroWrap.style.display = 'block';
    }

    document.getElementById('edit-pref-weekday').checked = prefs.includes('weekday');
    document.getElementById('edit-pref-weekend').checked = prefs.includes('weekend');
    document.getElementById('edit-pref-festa').checked = prefs.includes('festa');

    // Preenche disponibilidade de horários
    const tList = getMemberTimes(member);
    document.getElementById('edit-time-0700').checked = tList.includes('07:00');
    document.getElementById('edit-time-1500').checked = tList.includes('15:00');
    document.getElementById('edit-time-1900').checked = tList.includes('19:00');
    const editOutroCheck = document.getElementById('edit-time-outro-check');
    const editOutroWrap = document.getElementById('edit-time-outro-wrap');
    const editOutroInput = document.getElementById('edit-time-outro-input');
    const hasOutro = tList.includes('outro');
    if (editOutroCheck) editOutroCheck.checked = hasOutro;
    if (editOutroWrap) editOutroWrap.style.display = hasOutro ? 'block' : 'none';
    if (editOutroInput) editOutroInput.value = member.timeOutroText || member.timeOutro || '';

    document.getElementById('edit-member-status').value = (member.active !== false) ? 'true' : 'false';
    document.getElementById('edit-member-count').value = member.count || 0;

    // Preenche comunidade
    const standardComm = ['Matriz', 'Santa Terezinha', 'São Cristóvão', 'São Miguel', 'São José Operário'];
    const editCommSelect = document.getElementById('edit-member-community');
    const editCommOutroWrap = document.getElementById('edit-community-outro-wrap');
    const editCommOutroInput = document.getElementById('edit-community-outro-input');

    const mComm = member.community || 'Matriz';
    if (standardComm.includes(mComm)) {
      if (editCommSelect) editCommSelect.value = mComm;
      if (editCommOutroWrap) editCommOutroWrap.style.display = 'none';
      if (editCommOutroInput) editCommOutroInput.value = '';
    } else {
      if (editCommSelect) editCommSelect.value = 'OUTRO';
      if (editCommOutroWrap) editCommOutroWrap.style.display = 'block';
      if (editCommOutroInput) editCommOutroInput.value = member.communityOutroText || mComm;
    }

    openModal('modal-edit-member');
    if (editNameInput) editNameInput.focus();
  }

  function closeEditMemberModal() {
    closeModal('modal-edit-member');
    const editNameInput = document.getElementById('edit-member-name');
    if (editNameInput) setInputError(editNameInput, false);
  }

  function handleSaveEditMember(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('edit-member-id').value;
    const nameInput = document.getElementById('edit-member-name');
    const name = nameInput.value.trim();
    const active = document.getElementById('edit-member-status').value === 'true';
    const count = parseInt(document.getElementById('edit-member-count').value, 10) || 0;

    if (!name) {
      setInputError(nameInput, true, 'O nome não pode ficar em branco.');
      nameInput.focus();
      return;
    }

    // Validação inline em tempo real contra nomes duplicados
    if (!validateMemberNameInput(nameInput, id)) {
      nameInput.focus();
      return;
    }

    const prefs = [];
    if (document.getElementById('edit-pref-weekday')?.checked) prefs.push('weekday');
    if (document.getElementById('edit-pref-weekend')?.checked) prefs.push('weekend');
    if (document.getElementById('edit-pref-festa')?.checked) prefs.push('festa');

    if (prefs.length === 0) {
      showToast('Selecione ao menos uma modalidade de disponibilidade.', true);
      return;
    }

    const { times, outroText } = getTimePrefsFromForm('edit');
    if (times.length === 0) {
      showToast('Selecione ao menos um horário de disponibilidade (07:00, 15:00, 19:00 ou OUTRO).', true);
      return;
    }

    const member = state.members.find(m => String(m.id) === String(id));
    if (!member) return;

    const selectedRoles = ['Ministro da Eucaristia'];
    const roleStr = 'Ministro da Eucaristia';

    // Comunidade
    const editCommSelect = document.getElementById('edit-member-community');
    let community = editCommSelect ? editCommSelect.value : 'Matriz';
    let communityOutroText = '';
    if (community === 'OUTRO') {
      communityOutroText = document.getElementById('edit-community-outro-input')?.value.trim() || '';
      if (communityOutroText) {
        community = communityOutroText;
      }
    }

    member.name = name;
    member.community = community;
    member.communityOutroText = communityOutroText;
    member.role = roleStr;
    member.roles = selectedRoles;
    member.prefs = prefs;
    member.pref = prefs.length === 3 ? 'all' : prefs;
    member.timePrefs = times;
    member.timeOutroText = outroText;
    member.active = active;
    member.count = Math.max(0, count);

    // Se o nome ou função mudou e a pessoa está alocada na escala atual gerada, sincroniza na escala também!
    if (state.currentSchedule && state.currentSchedule.shifts) {
      state.currentSchedule.shifts.forEach(shift => {
        shift.assigned.forEach(assigned => {
          if (String(assigned.id) === String(id)) {
            assigned.name = name;
            assigned.role = member.role;
          }
          if (String(assigned.originalId) === String(id)) {
            assigned.originalName = name;
          }
        });
      });
    }

    closeEditMemberModal();
    saveToStorage();
    renderAll();
    showToast(`Inscrito "${name}" atualizado com sucesso!`);
  }

  /* ==========================================================================
     MÁSCARA E FORMATAÇÃO DE HORÁRIO (XX:XX)
     ========================================================================== */

  function formatTimeInput(input) {
    if (!input) return;
    let val = input.value.replace(/\D/g, ''); // apenas dígitos
    if (val.length > 4) val = val.substring(0, 4);

    // Valida hora (00-23)
    if (val.length >= 1 && parseInt(val[0], 10) > 2) {
      val = '2' + val.substring(1);
    }
    if (val.length >= 2) {
      const hh = parseInt(val.substring(0, 2), 10);
      if (hh > 23) {
        val = '23' + val.substring(2);
      }
    }
    // Valida minutos (00-59)
    if (val.length >= 3 && parseInt(val[2], 10) > 5) {
      val = val.substring(0, 2) + '5' + val.substring(3);
    }

    if (val.length > 2) {
      input.value = val.substring(0, 2) + ':' + val.substring(2);
    } else {
      input.value = val;
    }
  }

  /* ==========================================================================
     ALGORITMO CIRCULAR (ROUND-ROBIN) & GERAÇÃO DE ESCALAS
     ========================================================================== */

  /**
   * Valida e extrai horários (suporta único ou múltiplos horários separados por vírgula).
   * Aceita tanto 7:00 quanto 07:00, 19:30, 08:00, etc.
   * Normaliza os horários para formato padronizado de 2 dígitos na hora (ex: "7:00" -> "07:00").
   * Rejeita entradas com erro como "19:00 18", "19:", "25:00", "19:65".
   */
  function parseAndValidateTimes(value) {
    if (!value || typeof value !== 'string') {
      return { isValid: false, times: [], error: 'Por favor, preencha o horário.' };
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return { isValid: false, times: [], error: 'Por favor, preencha o horário.' };
    }

    const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      return { isValid: false, times: [], error: 'Digite ao menos um horário válido.' };
    }

    // Aceita H:MM ou HH:MM (horas de 0 a 23, minutos de 00 a 59)
    const timePattern = /^(?:0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
    const normalizedTimes = [];

    for (const part of parts) {
      if (!timePattern.test(part)) {
        return {
          isValid: false,
          times: [],
          error: `Horário "${part}" inválido! Use o formato HH:MM (ex: 07:00 ou 19:00). Múltiplos horários podem ser separados por vírgula (ex: 07:00, 19:00).`
        };
      }
      const [h, m] = part.split(':');
      normalizedTimes.push(`${h.padStart(2, '0')}:${m}`);
    }

    return {
      isValid: true,
      times: normalizedTimes,
      error: null
    };
  }

  function validateTimeFormat(value) {
    return parseAndValidateTimes(value).isValid;
  }

  function setInputError(inputEl, hasError, customMsg = '') {
    if (!inputEl) return;
    const parent = inputEl.closest('.form-group') || inputEl.parentElement;
    let errorEl = parent.querySelector('.form-input-error-msg');

    if (hasError) {
      inputEl.classList.add('input-field-error');
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'form-input-error-msg';
        parent.appendChild(errorEl);
      }
      errorEl.innerHTML = `⚠️ ${customMsg || 'Formato incorreto! Digite o horário no padrão HH:MM (ex: 07:00 ou 19:00). Múltiplos horários podem ser separados por vírgula (ex: 07:00, 19:00).'}`;
      errorEl.style.display = 'flex';
    } else {
      inputEl.classList.remove('input-field-error');
      if (errorEl) {
        errorEl.style.display = 'none';
      }
    }
  }

  function handleTimeInput(inputEl) {
    if (!inputEl) return;
    const val = inputEl.value;
    // Se estiver em branco ou terminando com vírgula (usuário ainda digitando o próximo horário), não exibe erro imediatamente
    if (!val || val.trim().length === 0 || val.trim().endsWith(',')) {
      setInputError(inputEl, false);
      updateGenerationPreview();
      return;
    }
    const res = parseAndValidateTimes(val);
    if (res.isValid) {
      setInputError(inputEl, false);
    }
    updateGenerationPreview();
  }

  /**
   * Renderiza a matriz interativa semanal de dias e horários (Aba Gerar Escala)
   */
  function renderScheduleWeekConfig() {
    const container = document.getElementById('gen-week-schedule-container');
    if (!container) return;

    const orderKeys = [1, 2, 3, 4, 5, 6, 0, 'festa'];

    let html = '';
    orderKeys.forEach(key => {
      const day = scheduleWeekConfig[key];
      if (!day) return;

      const isEnabled = day.enabled !== false;
      const borderClass = day.borderClass || '';
      const tagText = day.tagText || '';
      const tagClass = day.tagClass || '';

      // Ordena horários em ordem crescente
      if (Array.isArray(day.times)) {
        day.times.sort((a, b) => a.time.localeCompare(b.time));
      }

      html += `
        <div class="week-day-card ${borderClass} ${isEnabled ? '' : 'is-disabled'}" id="week-day-card-${key}">
          <div class="week-day-header">
            <div class="week-day-title-wrap">
              <span class="week-day-name">${escapeHtml(day.name)}</span>
              ${tagText ? `<span class="week-day-tag ${tagClass}">${escapeHtml(tagText)}</span>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.75rem; font-weight:700; color:${isEnabled ? '#047857' : '#94a3b8'};">
                ${isEnabled ? 'Com Celebração' : 'Sem Missa'}
              </span>
              <label class="toggle-switch">
                <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="App.toggleDayEnabled('${key}')">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="week-day-body">
            ${!isEnabled ? `
              <div class="week-day-disabled-hint">
                Nenhuma missa será gerada neste dia da semana (o dia ficará inativo no quadro mensal).
              </div>
            ` : `
              <div class="week-day-times-wrap">
                ${(day.times || []).map(t => {
                  const isActive = t.active !== false;
                  const isCustom = !['07:00', '15:00', '19:00'].includes(t.time);
                  return `
                    <div class="time-slot-pill ${isActive ? 'is-active' : ''}">
                      <button type="button" class="time-slot-toggle-btn" onclick="App.toggleDayTime('${key}', '${t.time}')" title="${isActive ? 'Desabilitar este horário' : 'Habilitar este horário'}">
                        <span class="time-slot-check-icon">${isActive ? '✓' : ''}</span>
                        <span>${t.time}</span>
                      </button>
                      ${isActive ? `
                        <div class="time-slot-persons-group">
                          <span class="time-slot-persons-label">Vagas:</span>
                          <select class="time-slot-persons-select" onchange="App.updateDayTimePersons('${key}', '${t.time}', this.value)" title="Quantidade de ministros para este horário">
                            ${((key === 0 || key === '0' || key === 'festa') ? [4, 5, 6, 8, 10] : [2, 3, 4, 5, 6, 8, 10]).map(n => `
                              <option value="${n}" ${Number(t.persons || ((key === 0 || key === '0' || key === 'festa') ? 4 : 2)) === n ? 'selected' : ''}>${n}</option>
                            `).join('')}
                          </select>
                        </div>
                      ` : ''}
                      ${isCustom ? `
                        <button type="button" class="time-slot-remove-btn" onclick="App.removeCustomTime('${key}', '${t.time}')" title="Excluir este horário customizado">&times;</button>
                      ` : ''}
                    </div>
                  `;
                }).join('')}

                <button type="button" class="btn-add-time-slot" onclick="App.openAddTimeModal('${key}')" title="Adicionar um novo horário extra para este dia">
                  <span>➕ Outro Horário</span>
                </button>
              </div>
            `}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function toggleDayEnabled(key) {
    if (scheduleWeekConfig[key]) {
      scheduleWeekConfig[key].enabled = !scheduleWeekConfig[key].enabled;
      const cardEl = document.getElementById(`week-day-card-${key}`);
      if (cardEl) cardEl.classList.remove('has-validation-error');
      saveLocalCacheOnly();
      renderScheduleWeekConfig();
      updateGenerationPreview();
    }
  }

  function toggleDayTime(key, timeStr) {
    if (scheduleWeekConfig[key] && Array.isArray(scheduleWeekConfig[key].times)) {
      const item = scheduleWeekConfig[key].times.find(t => t.time === timeStr);
      if (item) {
        item.active = !item.active;
        const cardEl = document.getElementById(`week-day-card-${key}`);
        if (cardEl) cardEl.classList.remove('has-validation-error');
        saveLocalCacheOnly();
        renderScheduleWeekConfig();
        updateGenerationPreview();
      }
    }
  }

  function updateDayTimePersons(key, timeStr, persons) {
    if (scheduleWeekConfig[key] && Array.isArray(scheduleWeekConfig[key].times)) {
      const item = scheduleWeekConfig[key].times.find(t => t.time === timeStr);
      if (item) {
        item.persons = parseInt(persons, 10) || 1;
        saveLocalCacheOnly();
        updateGenerationPreview();
      }
    }
  }

  /**
   * Modal especializado para adição de novo horário com máscara HH:MM
   */
  function openAddTimeModal(key) {
    if (!scheduleWeekConfig[key]) return;
    const day = scheduleWeekConfig[key];
    const keyInput = document.getElementById('add-time-day-key');
    const titleEl = document.getElementById('add-time-modal-title');
    const timeInput = document.getElementById('add-time-input');
    const personsInput = document.getElementById('add-time-persons-input');
    const errEl = document.getElementById('add-time-error-msg');

    if (keyInput) keyInput.value = key;
    if (titleEl) titleEl.textContent = `Novo Horário - ${day.name}`;
    if (timeInput) {
      timeInput.value = '';
      timeInput.placeholder = '00:00';
    }
    if (personsInput) {
      personsInput.value = (key === 0 || key === '0' || key === 'festa') ? '4' : '2';
    }
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }

    openModal('modal-add-time-slot');
    setTimeout(() => {
      if (timeInput) timeInput.focus();
    }, 150);
  }

  function closeAddTimeModal() {
    closeModal('modal-add-time-slot');
  }

  function maskTimeInput(input) {
    if (!input) return;
    let val = input.value.replace(/\D/g, '').substring(0, 4);
    if (val.length >= 3) {
      input.value = val.substring(0, 2) + ':' + val.substring(2);
    } else {
      input.value = val;
    }
    const errEl = document.getElementById('add-time-error-msg');
    if (errEl) errEl.style.display = 'none';
  }

  function confirmAddTimeModal(event) {
    if (event) event.preventDefault();
    const key = document.getElementById('add-time-day-key').value;
    const input = document.getElementById('add-time-input');
    const personsSelect = document.getElementById('add-time-persons-input');
    const errEl = document.getElementById('add-time-error-msg');

    if (!scheduleWeekConfig[key] || !input) return;

    let raw = input.value.trim();
    if (!raw) {
      if (errEl) {
        errEl.textContent = 'Por favor, digite o horário desejado (ex: 08:30 ou 10:00).';
        errEl.style.display = 'block';
      }
      return;
    }

    if (/^\d{1,2}$/.test(raw)) {
      raw = String(parseInt(raw, 10)).padStart(2, '0') + ':00';
    }

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(raw)) {
      if (errEl) {
        errEl.textContent = 'Horário inválido. Digite um horário válido entre 00:00 e 23:59.';
        errEl.style.display = 'block';
      }
      return;
    }

    const normalized = normalizeTime(raw);
    const minPersons = (key === 0 || key === '0' || key === 'festa') ? 4 : 2;
    const persons = personsSelect ? Math.max(minPersons, parseInt(personsSelect.value, 10) || minPersons) : minPersons;

    const exists = scheduleWeekConfig[key].times.some(t => t.time === normalized);
    if (exists) {
      const item = scheduleWeekConfig[key].times.find(t => t.time === normalized);
      if (item) {
        item.active = true;
        item.persons = persons;
      }
      showToast(`O horário ${normalized} já estava cadastrado e foi ativado!`);
    } else {
      scheduleWeekConfig[key].times.push({
        time: normalized,
        persons: persons,
        active: true
      });
      showToast(`Horário ${normalized} adicionado com sucesso!`);
    }

    scheduleWeekConfig[key].times.sort((a, b) => a.time.localeCompare(b.time));
    saveLocalCacheOnly();
    renderScheduleWeekConfig();
    updateGenerationPreview();
    closeAddTimeModal();
  }

  function addCustomTime(key) {
    openAddTimeModal(key);
  }

  function removeCustomTime(key, timeStr) {
    if (scheduleWeekConfig[key] && Array.isArray(scheduleWeekConfig[key].times)) {
      scheduleWeekConfig[key].times = scheduleWeekConfig[key].times.filter(t => t.time !== timeStr);
      saveLocalCacheOnly();
      renderScheduleWeekConfig();
      updateGenerationPreview();
      showToast(`Horário ${timeStr} removido.`);
    }
  }

  function resetScheduleConfigToDefault() {
    scheduleWeekConfig = getDefaultScheduleWeekConfig();
    saveLocalCacheOnly();
    renderScheduleWeekConfig();
    updateGenerationPreview();
    showToast('Horários canônicos padrão da paróquia restaurados com sucesso!');
  }

  /* ==========================================================================
     GERENCIADOR DE PERÍODO DA ESCALA (MÊS COMPLETO OU PARCIAL)
     ========================================================================== */

  function getSelectedScheduleRange() {
    const monthSelect = document.getElementById('gen-month-select');
    const yearSelect = document.getElementById('gen-year-select');
    const periodTypeSelect = document.getElementById('gen-period-type');
    const startDayInput = document.getElementById('gen-start-day');
    const endDayInput = document.getElementById('gen-end-day');

    const month = monthSelect ? parseInt(monthSelect.value, 10) : new Date().getMonth();
    const year = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const periodType = periodTypeSelect ? periodTypeSelect.value : 'full';

    let isPartial = false;
    let startDay = 1;
    let endDay = daysInMonth;

    if (periodType !== 'full') {
      isPartial = true;
      startDay = startDayInput ? parseInt(startDayInput.value, 10) : 1;
      endDay = endDayInput ? parseInt(endDayInput.value, 10) : daysInMonth;

      if (isNaN(startDay) || startDay < 1) startDay = 1;
      if (isNaN(endDay) || endDay > daysInMonth) endDay = daysInMonth;
      if (startDay > daysInMonth) startDay = daysInMonth;
    }

    return { month, year, daysInMonth, isPartial, startDay, endDay, periodType };
  }

  function handlePeriodTypeChange(triggerPreview = true) {
    const periodTypeSelect = document.getElementById('gen-period-type');
    const customDaysGroup = document.getElementById('gen-custom-days-group');
    const startDayInput = document.getElementById('gen-start-day');
    const endDayInput = document.getElementById('gen-end-day');
    const badge = document.getElementById('gen-period-badge');
    const helperSpan = document.getElementById('gen-period-helper-span');
    const hint = document.getElementById('gen-days-count-hint');

    const monthSelect = document.getElementById('gen-month-select');
    const yearSelect = document.getElementById('gen-year-select');
    const month = monthSelect ? parseInt(monthSelect.value, 10) : new Date().getMonth();
    const year = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (startDayInput) {
      startDayInput.max = daysInMonth.toString();
    }
    if (endDayInput) {
      endDayInput.max = daysInMonth.toString();
    }

    const type = periodTypeSelect ? periodTypeSelect.value : 'full';

    if (type === 'full') {
      if (customDaysGroup) customDaysGroup.style.display = 'none';
      if (badge) {
        badge.className = 'badge badge-secondary period-badge-chip';
        badge.textContent = 'Mês Completo';
      }
      if (helperSpan) {
        helperSpan.textContent = `A escala será gerada para todos os dias do mês (${daysInMonth} dias).`;
        helperSpan.style.color = '';
      }
      if (startDayInput) startDayInput.value = '1';
      if (endDayInput) endDayInput.value = daysInMonth.toString();
    } else if (type === 'quinzena1') {
      if (customDaysGroup) customDaysGroup.style.display = 'block';
      const endQ1 = Math.min(15, daysInMonth);
      if (startDayInput) startDayInput.value = '1';
      if (endDayInput) endDayInput.value = endQ1.toString();
      if (badge) {
        badge.className = 'badge badge-primary period-badge-chip';
        badge.textContent = '1ª Quinzena';
      }
      if (hint) {
        hint.textContent = `${endQ1} dias`;
      }
      if (helperSpan) {
        helperSpan.textContent = `Escala parcial do dia 01 ao dia ${String(endQ1).padStart(2, '0')} (${endQ1} dias de celebrações).`;
        helperSpan.style.color = '';
      }
    } else if (type === 'quinzena2') {
      if (customDaysGroup) customDaysGroup.style.display = 'block';
      const startQ2 = Math.min(16, daysInMonth);
      if (startDayInput) startDayInput.value = startQ2.toString();
      if (endDayInput) endDayInput.value = daysInMonth.toString();
      const countQ2 = (daysInMonth - startQ2 + 1);
      if (badge) {
        badge.className = 'badge badge-primary period-badge-chip';
        badge.textContent = '2ª Quinzena';
      }
      if (hint) {
        hint.textContent = `${countQ2} dias`;
      }
      if (helperSpan) {
        helperSpan.textContent = `Escala parcial do dia ${startQ2} ao dia ${daysInMonth} (${countQ2} dias de celebrações).`;
        helperSpan.style.color = '';
      }
    } else { // 'custom'
      if (customDaysGroup) customDaysGroup.style.display = 'block';
      let s = startDayInput ? parseInt(startDayInput.value, 10) : 1;
      let e = endDayInput ? parseInt(endDayInput.value, 10) : 15;
      if (isNaN(s) || s < 1) s = 1;
      if (isNaN(e) || e > daysInMonth) e = daysInMonth;
      if (badge) {
        badge.className = 'badge badge-gold period-badge-chip';
        badge.textContent = 'Personalizado';
      }
      const countCustom = (e >= s ? (e - s + 1) : 0);
      if (hint) {
        hint.textContent = `${countCustom} dias`;
      }
      if (helperSpan) {
        if (s > e) {
          helperSpan.textContent = `Atenção: O dia inicial (${s}) deve ser menor ou igual ao dia final (${e}).`;
          helperSpan.style.color = 'var(--danger-500, #ef4444)';
        } else {
          helperSpan.textContent = `Escala parcial personalizada do dia ${String(s).padStart(2, '0')} ao dia ${String(e).padStart(2, '0')} (${countCustom} dias).`;
          helperSpan.style.color = '';
        }
      }
    }

    if (triggerPreview) {
      updateGenerationPreview();
    }
  }

  function handlePartialDaysInput() {
    const periodTypeSelect = document.getElementById('gen-period-type');
    const startDayInput = document.getElementById('gen-start-day');
    const endDayInput = document.getElementById('gen-end-day');
    const badge = document.getElementById('gen-period-badge');
    const helperSpan = document.getElementById('gen-period-helper-span');
    const hint = document.getElementById('gen-days-count-hint');

    const monthSelect = document.getElementById('gen-month-select');
    const yearSelect = document.getElementById('gen-year-select');
    const month = monthSelect ? parseInt(monthSelect.value, 10) : new Date().getMonth();
    const year = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let s = startDayInput ? parseInt(startDayInput.value, 10) : 1;
    let e = endDayInput ? parseInt(endDayInput.value, 10) : daysInMonth;

    if (isNaN(s)) s = 1;
    if (isNaN(e)) e = daysInMonth;

    if (s === 1 && e === Math.min(15, daysInMonth)) {
      if (periodTypeSelect) periodTypeSelect.value = 'quinzena1';
      if (badge) {
        badge.className = 'badge badge-primary period-badge-chip';
        badge.textContent = '1ª Quinzena';
      }
    } else if (s === Math.min(16, daysInMonth) && e === daysInMonth) {
      if (periodTypeSelect) periodTypeSelect.value = 'quinzena2';
      if (badge) {
        badge.className = 'badge badge-primary period-badge-chip';
        badge.textContent = '2ª Quinzena';
      }
    } else if (s === 1 && e === daysInMonth) {
      if (periodTypeSelect) periodTypeSelect.value = 'full';
      if (badge) {
        badge.className = 'badge badge-secondary period-badge-chip';
        badge.textContent = 'Mês Completo';
      }
    } else {
      if (periodTypeSelect) periodTypeSelect.value = 'custom';
      if (badge) {
        badge.className = 'badge badge-gold period-badge-chip';
        badge.textContent = 'Personalizado';
      }
    }

    const countDays = e >= s ? (e - s + 1) : 0;
    if (hint) hint.textContent = `${countDays} dias`;
    if (helperSpan) {
      if (s > e) {
        helperSpan.textContent = `Atenção: O dia inicial (${s}) deve ser menor ou igual ao dia final (${e}).`;
        helperSpan.style.color = 'var(--danger-500, #ef4444)';
      } else {
        helperSpan.textContent = `Escala parcial do dia ${String(s).padStart(2, '0')} ao dia ${String(e).padStart(2, '0')} (${countDays} dias).`;
        helperSpan.style.color = '';
      }
    }

    updateGenerationPreview();
  }

  /**
   * Atualiza a prévia e cálculo de demandas antes de gerar a escala
   */
  function updateGenerationPreview() {
    const monthSelect = document.getElementById('gen-month-select');
    const yearSelect = document.getElementById('gen-year-select');
    if (!monthSelect || !yearSelect) return;

    const range = getSelectedScheduleRange();
    const { month, year, daysInMonth, isPartial, startDay, endDay } = range;
    const monthName = getMonthName(month);

    const prevMonthLabel = document.getElementById('prev-month-label');
    if (prevMonthLabel) {
      if (isPartial) {
        const countDays = endDay >= startDay ? (endDay - startDay + 1) : 0;
        prevMonthLabel.textContent = `Mês Selecionado: ${monthName} de ${year} • Parcial (Dias ${String(startDay).padStart(2, '0')} a ${String(endDay).padStart(2, '0')} • ${countDays} dias)`;
      } else {
        prevMonthLabel.textContent = `Mês Selecionado: ${monthName} de ${year} (${daysInMonth} dias)`;
      }
    }

    const selectedSegment = 'Ministro da Eucaristia';
    const activeMembers = getActiveMembers(selectedSegment);
    const activeMembersBadge = document.getElementById('prev-active-members-badge');
    if (activeMembersBadge) {
      activeMembersBadge.textContent = `${activeMembers.length} Ministros Ativos (MESC)`;
    }

    let countWeekdayShifts = 0;
    let countWeekdaySlots = 0;
    let countTuesdayShifts = 0;
    let countTuesdaySlots = 0;
    let countWeekendShifts = 0;
    let countWeekendSlots = 0;
    let countFestaShifts = 0;
    let countFestaSlots = 0;

    for (let day = startDay; day <= endDay; day++) {
      if (Array.isArray(state.excludedDays) && state.excludedDays.includes(day)) {
        continue;
      }
      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isFesta = state.festas.some(f => f.date === dateStr);

      if (isFesta) {
        const festaCfg = scheduleWeekConfig['festa'];
        if (festaCfg && festaCfg.enabled !== false) {
          const activeTimes = (festaCfg.times || []).filter(t => t.active !== false);
          activeTimes.forEach(t => {
            countFestaShifts++;
            countFestaSlots += (parseInt(t.persons, 10) || 3);
          });
        }
      } else if (dayOfWeek === 0 || dayOfWeek === 6) {
        const weekendCfg = scheduleWeekConfig[dayOfWeek];
        if (weekendCfg && weekendCfg.enabled !== false) {
          const activeTimes = (weekendCfg.times || []).filter(t => t.active !== false);
          activeTimes.forEach(t => {
            countWeekendShifts++;
            countWeekendSlots += (parseInt(t.persons, 10) || 2);
          });
        }
      } else if (dayOfWeek === 2) {
        const tuesdayCfg = scheduleWeekConfig[2];
        if (tuesdayCfg && tuesdayCfg.enabled !== false) {
          const activeTimes = (tuesdayCfg.times || []).filter(t => t.active !== false);
          activeTimes.forEach(t => {
            if (t.time === '15:00' || t.isNovena) {
              countTuesdayShifts++;
              countTuesdaySlots += (parseInt(t.persons, 10) || 2);
            } else {
              countWeekdayShifts++;
              countWeekdaySlots += (parseInt(t.persons, 10) || 1);
            }
          });
        }
      } else {
        const weekdayCfg = scheduleWeekConfig[dayOfWeek];
        if (weekdayCfg && weekdayCfg.enabled !== false) {
          const activeTimes = (weekdayCfg.times || []).filter(t => t.active !== false);
          activeTimes.forEach(t => {
            countWeekdayShifts++;
            countWeekdaySlots += (parseInt(t.persons, 10) || 1);
          });
        }
      }
    }

    const totalShifts = countWeekdayShifts + countTuesdayShifts + countWeekendShifts + countFestaShifts;
    const totalSlots = countWeekdaySlots + countTuesdaySlots + countWeekendSlots + countFestaSlots;
    const avgPerPerson = activeMembers.length > 0 ? (totalSlots / activeMembers.length).toFixed(1) : '0';

    const prevTotalShifts = document.getElementById('prev-total-shifts');
    const prevTotalSlots = document.getElementById('prev-total-slots');
    const prevAvg = document.getElementById('prev-avg-per-volunteer');
    if (prevTotalShifts) prevTotalShifts.textContent = totalShifts.toString();
    if (prevTotalSlots) prevTotalSlots.textContent = totalSlots.toString();
    if (prevAvg) prevAvg.textContent = `~${avgPerPerson}x`;

    const prevCountWeekday = document.getElementById('prev-count-weekday');
    const prevCountTuesday = document.getElementById('prev-count-tuesday');
    const prevCountWeekend = document.getElementById('prev-count-weekend');
    const prevCountFesta = document.getElementById('prev-count-festa');

    if (prevCountWeekday) prevCountWeekday.textContent = `${countWeekdayShifts} celebrações (${countWeekdaySlots} vagas)`;
    if (prevCountTuesday) prevCountTuesday.textContent = `${countTuesdayShifts} novenas (${countTuesdaySlots} vagas)`;
    if (prevCountWeekend) prevCountWeekend.textContent = `${countWeekendShifts} missas (${countWeekendSlots} vagas)`;
    if (prevCountFesta) prevCountFesta.textContent = `${countFestaShifts} celebrações (${countFestaSlots} vagas)`;

    const alertBox = document.getElementById('prev-alert-box');
    const alertIcon = document.getElementById('prev-alert-icon');
    const alertText = document.getElementById('prev-alert-text');

    if (alertBox && alertText && alertIcon) {
      if (activeMembers.length === 0) {
        alertBox.className = 'preview-alert-box alert-warning';
        alertIcon.textContent = '⚠️';
        alertText.textContent = `Nenhum Ministro da Eucaristia ativo cadastrado. Cadastre ministros ativos primeiro.`;
      } else if (parseFloat(avgPerPerson) > 6) {
        alertBox.className = 'preview-alert-box alert-warning';
        alertIcon.textContent = '⚠️';
        alertText.textContent = `Atenção: média de ~${avgPerPerson} escalas por ministro pode sobrecarregar a equipe neste mês.`;
      } else {
        alertBox.className = 'preview-alert-box alert-success';
        alertIcon.textContent = '✅';
        alertText.textContent = `Equipe bem dimensionada: média de ~${avgPerPerson} escalas por ministro neste mês.`;
      }
    }
  }

  async function handleGenerateSchedule(event) {
    if (event) event.preventDefault();

    const selectedSegment = 'Ministro da Eucaristia';
    const activeMembers = getActiveMembers(selectedSegment);
    if (activeMembers.length === 0) {
      showToast('Não há Ministros da Eucaristia ativos cadastrados. Cadastre ministros primeiro.', true);
      return;
    }

    // Trava e validação de dias ativos sem horários marcados
    document.querySelectorAll('.week-day-card.has-validation-error').forEach(el => el.classList.remove('has-validation-error'));
    const daysWithErrors = [];
    const checkKeys = [1, 2, 3, 4, 5, 6, 0];
    if (scheduleWeekConfig['festa'] && scheduleWeekConfig['festa'].enabled !== false) {
      checkKeys.push('festa');
    }

    for (const key of checkKeys) {
      const dayCfg = scheduleWeekConfig[key];
      if (dayCfg && dayCfg.enabled !== false) {
        const activeTimes = (dayCfg.times || []).filter(t => t.active !== false);
        if (activeTimes.length === 0) {
          daysWithErrors.push({ key, name: dayCfg.name });
          const cardEl = document.getElementById(`week-day-card-${key}`);
          if (cardEl) {
            cardEl.classList.add('has-validation-error');
          }
        }
      }
    }

    if (daysWithErrors.length > 0) {
      const firstCard = document.getElementById(`week-day-card-${daysWithErrors[0].key}`);
      if (firstCard) {
        firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const namesList = daysWithErrors.map(d => d.name).join(', ');
      showToast(`Atenção: O(s) dia(s) [${namesList}] está(ão) ativo(s) mas sem nenhum horário selecionado. Marque ao menos um horário ou desative o dia no botão de alternância.`, true);
      return;
    }

    // Trava e validação do Modo de Rodízio dos Ministros
    const queueModeSelect = document.getElementById('gen-queue-mode');
    const queueModeGroup = document.getElementById('form-group-queue-mode');
    const queueModeError = document.getElementById('queue-mode-error-msg');
    const queueMode = queueModeSelect ? queueModeSelect.value : '';

    if (!queueMode || queueMode === '') {
      if (queueModeSelect) {
        queueModeSelect.classList.add('has-validation-error');
        queueModeSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (queueModeGroup) {
        queueModeGroup.classList.add('has-validation-error');
      }
      if (queueModeError) {
        queueModeError.style.display = 'block';
      }
      showToast('Atenção: Selecione obrigatoriamente o Modo de Rodízio dos Ministros antes de gerar a escala.', true);
      return;
    } else {
      if (queueModeSelect) queueModeSelect.classList.remove('has-validation-error');
      if (queueModeGroup) queueModeGroup.classList.remove('has-validation-error');
      if (queueModeError) queueModeError.style.display = 'none';
    }

    // Alerta de confirmação se já existe uma escala montada e em andamento
    const hasExistingSchedule = state.currentSchedule && state.currentSchedule.shifts && state.currentSchedule.shifts.length > 0;
    if (hasExistingSchedule) {
      const curTitle = state.currentSchedule.segmentTitle || 'Escala Vigente';
      const curMonth = state.currentSchedule.monthName || '';
      const curYear = state.currentSchedule.year || '';
      const curDesc = curMonth ? `${curTitle} (${curMonth} de ${curYear})` : curTitle;

      const confirmed = await showConfirmModal({
        title: 'Substituir Escala em Andamento?',
        message: `Já existe uma escala montada e em andamento: <strong>${escapeHtml(curDesc)}</strong>.<br><br>Se você gerar uma nova escala agora, a escala existente será <strong>substituída</strong> e uma nova rodada de distribuição será montada para os ministros.<br><br>Deseja realmente prosseguir e gerar uma nova escala?`,
        confirmText: 'Sim, Gerar Nova Escala',
        cancelText: 'Manter Escala Atual',
        type: 'warning'
      });

      if (!confirmed) {
        return;
      }
    }

    const range = getSelectedScheduleRange();
    const { month, year, daysInMonth, isPartial, startDay, endDay } = range;

    if (isPartial) {
      if (startDay > endDay) {
        showToast('O dia inicial não pode ser maior que o dia final da escala parcial.', true);
        const startInput = document.getElementById('gen-start-day');
        if (startInput) startInput.focus();
        return;
      }
      if (startDay < 1 || endDay > daysInMonth) {
        showToast(`Os dias da escala parcial devem estar entre 1 e ${daysInMonth}.`, true);
        return;
      }
    }

    const shifts = [];

    // Fila circular pointer (suporta modo unificado e filas independentes por modalidade)
    let pointerUnified = state.rotationPointer;
    let pointerWeekday = state.rotationPointer;
    let pointerWeekend = state.rotationPointer;
    let pointerFesta = state.rotationPointer;
    const totalMembers = activeMembers.length;
    let unfilledSlotsTotal = 0;

    // Função auxiliar para pegar os próximos N ministros no ciclo respeitando estritamente a disponibilidade de modalidade e horário
    function pickNextMembers(count, shiftType, shiftTime, dateStr) {
      const picked = [];
      let attempts = 0;
      const maxAttempts = totalMembers * 4;

      while (picked.length < count && attempts < maxAttempts) {
        let currentPtr = pointerUnified;
        if (queueMode === 'split') {
          currentPtr = (shiftType === 'weekend') ? pointerWeekend : ((shiftType === 'festa') ? pointerFesta : pointerWeekday);
        }

        const member = activeMembers[currentPtr % totalMembers];
        const prefs = getMemberPrefs(member);
        
        // Regra estrita: o ministro deve estar disponível na modalidade e no horário solicitado
        const modalityOk = prefs.includes(shiftType);
        const timeOk = isMemberAvailableForTime(member, shiftTime);
        const isEligible = modalityOk && timeOk;

        if (isEligible && !picked.some(p => p.id === member.id)) {
          // Evita escalar a mesma pessoa duas vezes no mesmo dia caso ainda haja outros ministros disponíveis
          const alreadyAssignedToday = dateStr && shifts.some(s => s.date === dateStr && s.assigned.some(a => a.id === member.id));
          if (alreadyAssignedToday && attempts < totalMembers) {
            if (queueMode === 'split') {
              if (shiftType === 'weekend') pointerWeekend = (pointerWeekend + 1) % totalMembers;
              else if (shiftType === 'festa') pointerFesta = (pointerFesta + 1) % totalMembers;
              else pointerWeekday = (pointerWeekday + 1) % totalMembers;
            } else {
              pointerUnified = (pointerUnified + 1) % totalMembers;
            }
            attempts++;
            continue;
          }

          picked.push({
            id: member.id,
            name: member.name,
            role: member.role || 'Ministro da Eucaristia'
          });
          
          // Incrementa a contagem de escalas da pessoa
          const original = state.members.find(m => m.id === member.id);
          if (original) original.count = (original.count || 0) + 1;
        }

        if (queueMode === 'split') {
          if (shiftType === 'weekend') pointerWeekend = (pointerWeekend + 1) % totalMembers;
          else if (shiftType === 'festa') pointerFesta = (pointerFesta + 1) % totalMembers;
          else pointerWeekday = (pointerWeekday + 1) % totalMembers;
        } else {
          pointerUnified = (pointerUnified + 1) % totalMembers;
        }
        attempts++;
      }

      if (picked.length < count) {
        unfilledSlotsTotal += (count - picked.length);
      }

      return picked;
    }

    // Processa cada dia do período selecionado a partir de scheduleWeekConfig
    for (let day = startDay; day <= endDay; day++) {
      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Verifica se o dia foi excluído especificamente pelo usuário (Sem Missa)
      if (Array.isArray(state.excludedDays) && state.excludedDays.includes(day)) {
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        shifts.push({
          id: `shift_${dateStr}_sem_missa`,
          date: dateStr,
          day,
          dayOfWeek,
          type: 'sem_missa',
          originalType: isWeekend ? 'weekend' : 'weekday',
          title: getDayName(dayOfWeek),
          time: '--:--',
          isExcludedDay: true,
          notes: 'SEM MISSA - Removido pelo escalante',
          assigned: []
        });
        continue;
      }

      // 1. Verifica se é dia de festa cadastrado de forma inteligente
      const festaMatch = state.festas.find(f => f.date === dateStr);
      const festaCfg = scheduleWeekConfig['festa'];

      if (festaMatch) {
        // Dia de Festa Solene pré-definido detectado inteligentemente
        let festaTimes = [];
        if (festaCfg && festaCfg.enabled !== false && Array.isArray(festaCfg.times)) {
          festaTimes = festaCfg.times.filter(t => t.active !== false);
        }
        if (festaTimes.length === 0) {
          const dayCfg = scheduleWeekConfig[dayOfWeek];
          if (dayCfg && Array.isArray(dayCfg.times)) {
            festaTimes = dayCfg.times.filter(t => t.active !== false);
          }
        }
        if (festaTimes.length === 0) {
          festaTimes = [{ time: '19:00', persons: 4, active: true }];
        }

        festaTimes.forEach((tCfg, tIndex) => {
          // Aos domingos e festas são 4 ministros no mínimo
          const personsNeeded = Math.max(4, parseInt(tCfg.persons, 10) || 4);
          shifts.push({
            id: `shift_${dateStr}_festa_${tIndex}`,
            date: dateStr,
            day,
            dayOfWeek,
            type: 'festa',
            title: `⭐ ${festaMatch.title}`,
            time: tCfg.time,
            notes: festaMatch.notes || 'Celebração Solene',
            assigned: pickNextMembers(personsNeeded, 'festa', tCfg.time, dateStr)
          });
        });
      } else {
        const dayCfg = scheduleWeekConfig[dayOfWeek];
        if (dayCfg && dayCfg.enabled !== false) {
          const activeTimes = (dayCfg.times || []).filter(t => t.active !== false);
          const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
          const dayType = isWeekend ? 'weekend' : 'weekday';

          activeTimes.forEach((tCfg, tIndex) => {
            // Mínimo de 2 ministros de segunda a sábado; 4 aos domingos
            const minAllowed = (dayOfWeek === 0) ? 4 : 2;
            const personsNeeded = Math.max(minAllowed, parseInt(tCfg.persons, 10) || minAllowed);
            const isNovena = (dayOfWeek === 2 && (tCfg.time === '15:00' || tCfg.isNovena));
            
            shifts.push({
              id: `shift_${dateStr}_${dayType}_${tIndex}`,
              date: dateStr,
              day,
              dayOfWeek,
              type: dayType,
              title: isNovena ? 'Terça-feira • Novena de N. Sra. Aparecida' : getDayName(dayOfWeek),
              time: tCfg.time,
              isTuesdayNovena: isNovena,
              notes: isNovena ? 'Missa com Novena de Nossa Senhora Aparecida' : '',
              assigned: pickNextMembers(personsNeeded, dayType, tCfg.time, dateStr)
            });
          });
        }
      }
    }

    // Atualiza estado e ponteiro da fila
    state.rotationPointer = (queueMode === 'split') ? pointerWeekend : pointerUnified;
    state.currentSchedule = {
      month,
      year,
      monthName: getMonthName(month),
      isPartial,
      startDay: isPartial ? startDay : 1,
      endDay: isPartial ? endDay : daysInMonth,
      periodLabel: isPartial ? `Dias ${String(startDay).padStart(2, '0')} a ${String(endDay).padStart(2, '0')}` : '',
      segment: 'Ministro da Eucaristia',
      segmentTitle: 'Ministério Extraordinário da Sagrada Comunhão (MESC)',
      excludedDays: [...(state.excludedDays || [])],
      generatedAt: new Date().toISOString(),
      shifts
    };

    saveToStorage();
    renderAll();
    setScheduleView('cards');
    switchTab('tab-calendar');

    const periodDesc = isPartial ? ` (Dias ${String(startDay).padStart(2, '0')} a ${String(endDay).padStart(2, '0')})` : '';
    if (unfilledSlotsTotal > 0) {
      showToast(`Escala de ${getMonthName(month)} de ${year}${periodDesc} gerada! (${unfilledSlotsTotal} vaga(s) não preenchida(s) para respeitar a disponibilidade dos ministros).`);
    } else {
      showToast(`Escala de ${getMonthName(month)} de ${year}${periodDesc} gerada com sucesso!`);
    }
  }

  function autoGenerateCurrentMonth() {
    if (state.members.length === 0) return;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const active = getActiveMembers();
    if (active.length === 0) return;

    let ptr = state.rotationPointer;
    const shifts = [];

    function pick(n, shiftType, shiftTime, dateStr) {
      const res = [];
      let attempts = 0;
      const maxAttempts = active.length * 4;

      while (res.length < n && attempts < maxAttempts) {
        const m = active[ptr % active.length];
        const prefs = getMemberPrefs(m);
        const modalityOk = prefs.includes(shiftType);
        const timeOk = isMemberAvailableForTime(m, shiftTime);

        if (modalityOk && timeOk && !res.some(p => p.id === m.id)) {
          const alreadyToday = dateStr && shifts.some(s => s.date === dateStr && s.assigned.some(a => a.id === m.id));
          if (alreadyToday && attempts < active.length) {
            ptr = (ptr + 1) % active.length;
            attempts++;
            continue;
          }
          res.push({ id: m.id, name: m.name, role: m.role });
          m.count = (m.count || 0) + 1;
        }

        ptr = (ptr + 1) % active.length;
        attempts++;
      }
      return res;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(now.getFullYear(), now.getMonth(), day);
      const dow = dateObj.getDay();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const festaMatch = state.festas.find(f => f.date === dateStr);

      if (festaMatch) {
        shifts.push({
          id: `shift_${dateStr}_festa`,
          date: dateStr,
          day,
          dayOfWeek: dow,
          type: 'festa',
          title: festaMatch.title,
          time: '19:00',
          assigned: pick(2, 'festa', '19:00', dateStr)
        });
      } else if (dow === 0 || dow === 6) {
        const weekendTimes = dow === 0 ? ['07:00', '19:00'] : ['19:00'];
        weekendTimes.forEach((wTime, wIdx) => {
          shifts.push({
            id: `shift_${dateStr}_weekend_${wIdx}`,
            date: dateStr,
            day,
            dayOfWeek: dow,
            type: 'weekend',
            title: dow === 0 ? 'Domingo' : 'Sábado',
            time: wTime,
            assigned: pick(2, 'weekend', wTime, dateStr)
          });
        });
      } else if (dow === 2) {
        shifts.push({
          id: `shift_${dateStr}_tuesday_novena`,
          date: dateStr,
          day,
          dayOfWeek: dow,
          type: 'weekday',
          title: 'Terça-feira • Novena de N. Sra. Aparecida',
          time: '15:00',
          isTuesdayNovena: true,
          assigned: pick(2, 'weekday', '15:00', dateStr)
        });
        shifts.push({
          id: `shift_${dateStr}_weekday`,
          date: dateStr,
          day,
          dayOfWeek: dow,
          type: 'weekday',
          title: 'Terça-feira',
          time: '19:00',
          assigned: pick(1, 'weekday', '19:00', dateStr)
        });
      } else {
        shifts.push({
          id: `shift_${dateStr}_weekday`,
          date: dateStr,
          day,
          dayOfWeek: dow,
          type: 'weekday',
          title: getDayName(dow),
          time: '19:00',
          assigned: pick(1, 'weekday', '19:00', dateStr)
        });
      }
    }

    state.rotationPointer = ptr;
    state.currentSchedule = {
      month: now.getMonth(),
      year: now.getFullYear(),
      monthName: getMonthName(now.getMonth()),
      segment: 'all',
      segmentTitle: getSegmentTitle('all'),
      generatedAt: new Date().toISOString(),
      shifts
    };

    saveToStorage();
  }

  async function resetRotationPointer() {
    const confirmed = await showConfirmModal({
      title: 'Reiniciar Fila Circular',
      message: 'Deseja reiniciar a ordem da fila de rotação?<br>O próximo escalado voltará a ser a <strong>primeira pessoa</strong> cadastrada.',
      confirmText: 'Reiniciar Fila',
      cancelText: 'Cancelar',
      type: 'warning'
    });

    if (!confirmed) return;

    state.rotationPointer = 0;
    saveToStorage();
    renderRotationQueue();
    renderDashboardMetrics();
    showToast('Ponteiro de rotação reiniciado para a primeira posição!');
  }

  /* ==========================================================================
     RENDERIZAÇÃO DO DASHBOARD & FILA
     ========================================================================== */

  function renderDashboardMetrics() {
    updateBadges();
    const totalMembers = state.members.length;
    const activeMembers = getActiveMembers();
    
    // Total Inscritos
    const dashTotal = document.getElementById('dash-total-members');
    if (dashTotal) dashTotal.textContent = totalMembers.toString();

    const dashActiveRatio = document.getElementById('dash-active-ratio');
    if (dashActiveRatio) {
      dashActiveRatio.textContent = `${activeMembers.length} de ${totalMembers} Ministros Ativos`;
    }

    // Status do Ciclo
    const dashCyclePos = document.getElementById('dash-cycle-pos');
    const dashNextPerson = document.getElementById('dash-next-person');
    if (activeMembers.length > 0) {
      const nextIndex = state.rotationPointer % activeMembers.length;
      const nextMember = activeMembers[nextIndex];
      if (dashCyclePos) dashCyclePos.textContent = `${nextIndex + 1} / ${activeMembers.length}`;
      if (dashNextPerson) dashNextPerson.textContent = `Próximo: ${nextMember ? nextMember.name : '-'}`;
    } else {
      if (dashCyclePos) dashCyclePos.textContent = '0 / 0';
      if (dashNextPerson) dashNextPerson.textContent = 'Próximo: Nenhum';
    }

    // Escala Vigente
    const dashMonth = document.getElementById('dash-current-month');
    const dashTotalShifts = document.getElementById('dash-total-shifts');
    if (state.currentSchedule) {
      const pSuffix = state.currentSchedule.isPartial
        ? ` (${String(state.currentSchedule.startDay || 1).padStart(2, '0')} a ${String(state.currentSchedule.endDay || 31).padStart(2, '0')})`
        : '';
      if (dashMonth) dashMonth.textContent = `${state.currentSchedule.monthName} ${state.currentSchedule.year}${pSuffix}`;
      if (dashTotalShifts) dashTotalShifts.textContent = `${state.currentSchedule.shifts.length} celebrações escaladas`;
    } else {
      if (dashMonth) dashMonth.textContent = 'Nenhuma';
      if (dashTotalShifts) dashTotalShifts.textContent = 'Clique para gerar';
    }

    // Festas
    const dashFestas = document.getElementById('dash-festas-count');
    if (dashFestas) dashFestas.textContent = state.festas.length.toString();

    // Contagem por Categoria no Dashboard
    let countWeekday = 0;
    let countWeekend = 0;
    let countFesta = 0;

    if (state.currentSchedule && state.currentSchedule.shifts) {
      state.currentSchedule.shifts.forEach(s => {
        if (s.type === 'weekday') countWeekday++;
        else if (s.type === 'weekend') countWeekend++;
        else if (s.type === 'festa') countFesta++;
      });
    }

    const cWeekdayEl = document.getElementById('count-shift-weekday');
    const cWeekendEl = document.getElementById('count-shift-weekend');
    const cFestaEl = document.getElementById('count-shift-festa');

    if (cWeekdayEl) cWeekdayEl.textContent = countWeekday.toString();
    if (cWeekendEl) cWeekendEl.textContent = countWeekend.toString();
    if (cFestaEl) cFestaEl.textContent = countFesta.toString();
  }

  function renderRotationQueue() {
    const container = document.getElementById('rotation-queue-list');
    if (!container) return;

    const activeMembers = getActiveMembers();
    if (activeMembers.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-muted); font-size: 0.88rem;">
          Nenhum participante ativo na rotação.
        </div>
      `;
      return;
    }

    const currentPointer = state.rotationPointer % activeMembers.length;

    // Renderiza a fila com destaque para quem está na vez
    container.innerHTML = activeMembers.map((m, index) => {
      const isNext = index === currentPointer;
      return `
        <div class="queue-item ${isNext ? 'current-next' : ''}">
          <div class="queue-item-left">
            <span class="queue-pos-badge">${index + 1}</span>
            <div>
              <div class="queue-name">${escapeHtml(m.name)}</div>
              <div class="queue-role">${escapeHtml(m.role || 'Ministro')}</div>
            </div>
          </div>
          <div>
            ${isNext ? '<span class="queue-tag" style="background: var(--gold-500); color: #000; font-weight:800;">👉 PRÓXIMO</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /* ==========================================================================
     VISUALIZADOR DA ESCALA (CARTÕES OU TABELA)
     ========================================================================== */

  function renderSchedule() {
    const container = document.getElementById('schedule-display-container');

    // Assegura que dias excluídos apareçam na escala existente como 'sem_missa'
    if (state.currentSchedule && Array.isArray(state.currentSchedule.excludedDays) && state.currentSchedule.excludedDays.length > 0 && Array.isArray(state.currentSchedule.shifts)) {
      const year = state.currentSchedule.year;
      const month = state.currentSchedule.month;
      const isPartial = !!state.currentSchedule.isPartial;
      const pStart = state.currentSchedule.startDay || 1;
      const pEnd = state.currentSchedule.endDay || 31;
      let modified = false;
      state.currentSchedule.excludedDays.forEach(d => {
        if (isPartial && (d < pStart || d > pEnd)) return;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!state.currentSchedule.shifts.some(s => s.date === dateStr)) {
          const dateObj = new Date(year, month, d);
          const dayOfWeek = dateObj.getDay();
          const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
          state.currentSchedule.shifts.push({
            id: `shift_${dateStr}_sem_missa`,
            date: dateStr,
            day: d,
            dayOfWeek,
            type: 'sem_missa',
            originalType: isWeekend ? 'weekend' : 'weekday',
            title: getDayName(dayOfWeek),
            time: '--:--',
            isExcludedDay: true,
            notes: 'SEM MISSA - Removido pelo escalante',
            assigned: []
          });
          modified = true;
        }
      });
      if (modified) {
        state.currentSchedule.shifts.sort((a, b) => a.day - b.day);
      }
    }
    const titleEl = document.getElementById('schedule-view-title');
    const activePill = document.getElementById('schedule-active-pill');
    const printTitle = document.getElementById('print-sheet-period');
    const printArea = document.getElementById('print-calendar-area');
    const printDateStamp = document.getElementById('print-date-stamp');

    if (!container) return;

    if (!state.currentSchedule || !state.currentSchedule.shifts || state.currentSchedule.shifts.length === 0) {
      if (titleEl) titleEl.textContent = 'Escala do Mês';
      if (activePill) activePill.style.display = 'none';
      if (printArea) printArea.innerHTML = '';
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <h3>Nenhuma escala gerada no momento</h3>
          <p>Defina as opções na aba "Gerar Escala" e o algoritmo distribuirá automaticamente os ministros de acordo com a rotação cíclica.</p>
          <button class="btn btn-gold" onclick="App.switchTab('tab-generator')">
            Ir para o Gerador de Escalas
          </button>
        </div>
      `;
      return;
    }

    const { monthName, year, shifts, segment, segmentTitle, isPartial, startDay, endDay, periodLabel } = state.currentSchedule;
    const finalTitle = segmentTitle || getSegmentTitle(segment);
    const periodSuffix = isPartial ? ` (Dias ${String(startDay || 1).padStart(2, '0')} a ${String(endDay || 31).padStart(2, '0')})` : '';

    if (titleEl) titleEl.textContent = `${finalTitle} • ${monthName} de ${year}${periodSuffix}`;
    if (activePill) {
      activePill.style.display = 'inline-block';
      activePill.textContent = isPartial ? `Vigente: ${periodLabel || `${startDay} a ${endDay}`}` : 'Escala Vigente';
    }

    // Atualiza título da folha de impressão / PDF
    const printSheetTitle = document.getElementById('print-sheet-title');
    if (printSheetTitle) {
      printSheetTitle.textContent = finalTitle;
    }
    if (printTitle) {
      const printPeriodSuffix = isPartial ? ` (DIAS ${String(startDay || 1).padStart(2, '0')} A ${String(endDay || 31).padStart(2, '0')})` : '';
      printTitle.textContent = `${monthName.toUpperCase()} DE ${year}${printPeriodSuffix} • PARÓQUIA NOSSA SENHORA APARECIDA`;
    }

    // Atualiza lembretes específicos do segmento no rodapé da folha de impressão / PDF
    updatePrintReminders(segment);

    // Sempre preenche a área de impressão com o Quadro de Mês completo em formato 7xN
    if (printArea) {
      printArea.innerHTML = generateMonthCalendarHtml(state.currentSchedule, { isPrint: true });
    }

    if (printDateStamp) {
      const now = new Date();
      printDateStamp.textContent = `Documento gerado em ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} às ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    // Aplica o filtro de visualização na tela
    let filteredShifts = shifts;
    if (state.currentFilter !== 'all') {
      filteredShifts = shifts.filter(s => s.type === state.currentFilter);
    }

    if (filteredShifts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>Nenhum plantão nesta modalidade</h3>
          <p>Tente selecionar outro filtro acima para visualizar os demais dias.</p>
        </div>
      `;
      return;
    }

    if (state.currentViewMode === 'calendar') {
      renderScheduleCalendar(container, state.currentSchedule, filteredShifts);
    } else if (state.currentViewMode === 'cards') {
      renderScheduleCards(container, filteredShifts);
    } else {
      renderScheduleTable(container, filteredShifts);
    }

    // Reaplica o destaque na escala caso haja busca ativa por ministro
    applyCurrentScheduleHighlight();
  }

  /* ==========================================================================
     LOCALIZADOR E DESTAQUE DE MINISTROS NA ESCALA (ABA VISUALIZAR ESCALAS)
     ========================================================================== */
  let scheduleHighlightQuery = '';

  function normalizeSearchText(text) {
    if (!text) return '';
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  let scheduleHighlightDebounceTimer = null;
  function highlightSchedulePerson(query) {
    scheduleHighlightQuery = typeof query === 'string' ? query : '';
    if (scheduleHighlightDebounceTimer) clearTimeout(scheduleHighlightDebounceTimer);
    scheduleHighlightDebounceTimer = setTimeout(() => {
      applyCurrentScheduleHighlight();
    }, 40);
  }

  function applyCurrentScheduleHighlight() {
    const container = document.getElementById('schedule-display-container');
    const clearBtn = document.getElementById('schedule-person-clear');
    const badge = document.getElementById('schedule-highlight-count');

    if (!container) return;

    const trimmed = scheduleHighlightQuery.trim();

    if (!trimmed) {
      container.classList.remove('is-searching');
      container.querySelectorAll('.cal-vol-highlighted').forEach(el => el.classList.remove('cal-vol-highlighted'));
      if (clearBtn) clearBtn.style.display = 'none';
      if (badge) {
        badge.style.display = 'none';
        badge.textContent = '';
        badge.className = 'schedule-search-badge';
      }
      return;
    }

    if (clearBtn) clearBtn.style.display = 'flex';
    container.classList.add('is-searching');

    const normQuery = normalizeSearchText(trimmed);
    let matchCount = 0;

    // 1. Itens da grade do Quadro de Mês
    const calItems = container.querySelectorAll('.cal-vol-item');
    calItems.forEach(item => {
      const nameEl = item.querySelector('.cal-vol-name');
      const text = nameEl ? nameEl.textContent : item.textContent;
      if (normalizeSearchText(text).includes(normQuery)) {
        item.classList.add('cal-vol-highlighted');
        matchCount++;
      } else {
        item.classList.remove('cal-vol-highlighted');
      }
    });

    // 2. Itens dos Cartões e Tabela
    const chipItems = container.querySelectorAll('.assigned-person-chip');
    chipItems.forEach(chip => {
      const isMatch = normalizeSearchText(chip.textContent).includes(normQuery);
      if (isMatch) {
        chip.classList.add('cal-vol-highlighted');
        matchCount++;
      } else {
        chip.classList.remove('cal-vol-highlighted');
      }
    });

    if (badge) {
      badge.style.display = 'inline-block';
      if (matchCount > 0) {
        badge.className = 'schedule-search-badge';
        badge.textContent = `🎯 ${matchCount} ${matchCount === 1 ? 'plantão encontrado' : 'plantões encontrados'}`;
      } else {
        badge.className = 'schedule-search-badge none-found';
        badge.textContent = 'Nenhum plantão encontrado';
      }
    }
  }

  function clearScheduleHighlight() {
    scheduleHighlightQuery = '';
    const input = document.getElementById('schedule-person-search');
    if (input) {
      input.value = '';
      input.focus();
    }
    applyCurrentScheduleHighlight();
  }

  /* ==========================================================================
     GERADOR DO QUADRO DE MÊS (GRADE 7xN - DOM À SÁB)
     ========================================================================== */

  function generateMonthCalendarHtml(schedule, options = {}) {
    if (!schedule || !schedule.shifts) return '';
    const { month, year, monthName, shifts } = schedule;
    const isPrint = !!options.isPrint;

    // Primeiro dia da semana do mês (0 = Domingo, 1 = Segunda, ... 6 = Sábado)
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Nomes dos 7 dias da semana (de Domingo a Sábado)
    const weekDays = [
      { full: 'Domingo', short: 'DOM' },
      { full: 'Segunda-feira', short: 'SEG' },
      { full: 'Terça-feira', short: 'TER' },
      { full: 'Quarta-feira', short: 'QUA' },
      { full: 'Quinta-feira', short: 'QUI' },
      { full: 'Sexta-feira', short: 'SEX' },
      { full: 'Sábado', short: 'SÁB' }
    ];

    // Mapeia os shifts por dia (1..totalDays)
    const shiftsByDay = {};
    shifts.forEach(shift => {
      const d = Number(shift.day);
      if (!shiftsByDay[d]) {
        shiftsByDay[d] = [];
      }
      shiftsByDay[d].push(shift);
    });

    // Monta o array de quadrículas
    const cells = [];

    // 1. Quadrículas vazias antes do dia 1
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ type: 'empty', day: null });
    }

    // 2. Dias do mês (1 até totalDays)
    const isSchedulePartial = !!schedule.isPartial;
    const pStart = schedule.startDay || 1;
    const pEnd = schedule.endDay || totalDays;

    for (let d = 1; d <= totalDays; d++) {
      const dateObj = new Date(year, month, d);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayShifts = shiftsByDay[d] || [];
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const festaMatch = state.festas.find(f => f.date === dateStr);
      const hasFesta = dayShifts.some(s => s.type === 'festa') || !!festaMatch;
      const isOutsidePeriod = isSchedulePartial && (d < pStart || d > pEnd);

      cells.push({
        type: 'day',
        day: d,
        dayOfWeek,
        dateStr,
        isWeekend,
        hasFesta,
        isOutsidePeriod,
        festaTitle: festaMatch ? festaMatch.title : '',
        shifts: dayShifts
      });
    }

    // 3. Quadrículas vazias para completar a última semana (múltiplo de 7)
    const remainder = cells.length % 7;
    if (remainder !== 0) {
      const trailingEmpty = 7 - remainder;
      for (let i = 0; i < trailingEmpty; i++) {
        cells.push({ type: 'empty', day: null });
      }
    }

    // Divide em semanas (linhas de 7 colunas)
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    return `
      <div class="cal-board-container ${isPrint ? 'is-print-mode' : ''}">
        ${!isPrint ? `
          <div class="cal-board-header-bar">
            <div class="cal-board-title">
              <span class="cal-board-icon">📅</span>
              <span>Quadro Mensal Litúrgico • <strong>${monthName} de ${year}${schedule.isPartial ? ` (Dias ${String(schedule.startDay).padStart(2, '0')} a ${String(schedule.endDay).padStart(2, '0')})` : ''}</strong></span>
            </div>
            <div class="cal-board-legend">
              <span class="cal-legend-badge bg-festa">⭐ Festa</span>
              <span class="cal-legend-badge bg-weekend">Sáb / Dom</span>
              <span class="cal-legend-badge bg-subst">🔄 Substituto</span>
              ${schedule.isPartial ? '<span class="cal-legend-badge" style="background:var(--bg-muted);color:var(--text-muted);border:1px dashed var(--border-color);">⚪ Fora do período</span>' : ''}
            </div>
          </div>
        ` : ''}

        <div class="cal-table-scroll-wrap">
          <table class="cal-month-table">
          <thead>
            <tr>
              ${weekDays.map((wd, idx) => `
                <th class="cal-th ${idx === 0 || idx === 6 ? 'cal-th-weekend' : ''}">
                  <span class="cal-th-full">${wd.full}</span>
                  <span class="cal-th-short">${wd.short}</span>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${weeks.map(week => `
              <tr>
                ${week.map(cell => {
                  if (cell.type === 'empty') {
                    return `
                      <td class="cal-cell cal-cell-empty">
                        <div class="cal-empty-content"></div>
                      </td>
                    `;
                  }

                  const cellClasses = ['cal-cell'];
                  if (cell.isWeekend) cellClasses.push('cal-cell-weekend');
                  if (cell.hasFesta) cellClasses.push('cal-cell-festa');
                  if (cell.isOutsidePeriod) cellClasses.push('cal-cell-outside-period');
                  if (cell.shifts.length === 0) cellClasses.push('cal-cell-no-shift');
                  if (cell.shifts.some(s => s.isExcludedDay || s.type === 'sem_missa')) cellClasses.push('cal-cell-excluded');

                  const rawFestaTitle = cell.festaTitle || (cell.shifts.find(s => s.type === 'festa') ? cell.shifts.find(s => s.type === 'festa').title : '');
                  const cleanFestaTitle = rawFestaTitle ? rawFestaTitle.replace(/^[⭐\s*]+/, '').trim() : '';

                  let cellBodyHtml = '';
                  if (cell.isOutsidePeriod) {
                    cellBodyHtml = `
                      <div class="cal-no-shift-container cal-outside-period-box">
                        <span class="cal-outside-text">Fora do período</span>
                        <span class="cal-outside-sub">Não escalado</span>
                      </div>
                    `;
                  } else if (cell.shifts.length === 0) {
                    cellBodyHtml = `
                      <div class="cal-no-shift-container">
                        <span class="cal-no-shift-text">Sem celebração</span>
                      </div>
                    `;
                  } else if (cell.shifts.some(s => s.isExcludedDay || s.type === 'sem_missa')) {
                    cellBodyHtml = `
                      <div class="cal-no-shift-container cal-excluded-day-box">
                        <span class="cal-excluded-icon">🚫</span>
                        <strong class="cal-excluded-title">SEM MISSA</strong>
                        <span class="cal-excluded-sub">Removido pelo escalante</span>
                      </div>
                    `;
                  } else {
                    cellBodyHtml = cell.shifts.map(shift => `
                      <div class="cal-shift-block ${shift.type === 'festa' ? 'is-festa-shift' : (shift.type === 'weekend' ? 'is-weekend-shift' : '')}">
                        <div class="cal-shift-meta">
                          <span class="cal-shift-time">⏰ ${shift.time}</span>
                          ${!isPrint ? `
                            <div class="cal-shift-actions-group">
                              <button type="button" class="cal-shift-add-btn" onclick="App.openAddMinisterModal('${shift.id}')" title="Adicionar ministro de última hora">➕</button>
                              <button type="button" class="cal-shift-remove-btn" onclick="App.openRemoveMinisterModal('${shift.id}')" title="Remover ministro desta celebração">➖</button>
                              <button type="button" class="cal-shift-swap-btn" onclick="App.openSwapForShift('${shift.id}')" title="Substituir ministro nesta celebração">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
                              </button>
                            </div>
                          ` : ''}
                        </div>
                        <div class="cal-volunteers-list">
                          ${shift.assigned.map(p => {
                            if (isPrint) {
                              return `
                                <div class="cal-vol-item">
                                  <span class="cal-vol-icon">•</span>
                                  <span class="cal-vol-name">${escapeHtml(p.name)}</span>
                                </div>
                              `;
                            }
                            if (p.isExtra) {
                              return `
                                <div class="cal-vol-item is-extra" title="Ministro de última hora (${escapeHtml(p.role || 'MESC')})">
                                  <span class="cal-vol-icon">⚡</span>
                                  <span class="cal-vol-name"><strong>${escapeHtml(p.name)}</strong></span>
                                  <span class="cal-extra-tag">Extra</span>
                                  ${!isPrint ? `
                                    <button class="cal-remove-extra-btn" onclick="App.removeExtraMinister('${shift.id}', '${p.id}')" title="Remover este ministro adicionado">×</button>
                                  ` : ''}
                                </div>
                              `;
                            }
                            if (p.isSubstitute) {
                              return `
                                <div class="cal-vol-item is-sub" title="Substituto(a) no lugar de ${escapeHtml(p.originalName || 'Original')}">
                                  <span class="cal-vol-icon">🔄</span>
                                  <span class="cal-vol-name"><strong>${escapeHtml(p.name)}</strong></span>
                                  <span class="cal-sub-tag">subst.</span>
                                  ${!isPrint ? `
                                    <button class="cal-remove-person-btn" onclick="App.confirmRemovePersonFromShift('${shift.id}', '${p.id}')" title="Remover ${escapeHtml(p.name)} desta celebração">×</button>
                                  ` : ''}
                                </div>
                              `;
                            }
                            return `
                              <div class="cal-vol-item" title="${escapeHtml(p.role || 'Ministro')}">
                                <span class="cal-vol-icon">•</span>
                                <span class="cal-vol-name">${escapeHtml(p.name)}</span>
                                ${!isPrint ? `
                                  <button class="cal-remove-person-btn" onclick="App.confirmRemovePersonFromShift('${shift.id}', '${p.id}')" title="Remover ${escapeHtml(p.name)} desta celebração">×</button>
                                ` : ''}
                              </div>
                            `;
                          }).join('')}
                        </div>
                      </div>
                    `).join('');
                  }

                  return `
                    <td class="${cellClasses.join(' ')}">
                      <div class="cal-cell-content">
                        <div class="cal-cell-header">
                          <span class="cal-day-num">${String(cell.day).padStart(2, '0')}</span>
                          ${cell.hasFesta ? `<span class="cal-badge-festa" title="${escapeHtml(cleanFestaTitle || 'Solenidade')}">⭐ Solenidade</span>` : ''}
                        </div>

                        <div class="cal-cell-body">
                          ${cell.hasFesta && cleanFestaTitle ? `
                            <div class="cal-festa-banner" title="${escapeHtml(cleanFestaTitle)}">
                              <span class="cal-festa-banner-title">⭐ ${escapeHtml(cleanFestaTitle)}</span>
                            </div>
                          ` : ''}

                          ${cellBodyHtml}
                        </div>
                      </div>
                    </td>
                  `;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
          </table>
        </div>

        ${!isPrint ? `
          <div class="screen-reminders-card">
            <div class="screen-reminders-layout">
              <div class="screen-reminders-main">
                <div class="screen-reminders-header">
                  <span class="reminders-badge">LEMBRETES IMPORTANTES AOS MINISTROS (MESC)</span>
                </div>
                <ul class="screen-reminders-list">
                  <li>CHEGAR UMA HORA ANTES DO HORÁRIO DA CELEBRAÇÃO</li>
                  <li>CADA MINISTRO DEVERÁ LEVAR CONSIGO UM SANGUÍNEO PARA USÁ-LO NO MOMENTO DA DISTRIBUIÇÃO DA SANTA COMUNHÃO</li>
                  <li>QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA</li>
                </ul>
              </div>
              <div class="screen-invocation-col">
                <img src="NSA.png" alt="Nossa Senhora Aparecida" class="invocation-nsa-img">
                <span class="invocation-phrase">Nossa Senhora Aparecida, rogai por nós!</span>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderScheduleCalendar(container, schedule, filteredShifts) {
    const activeSchedule = {
      ...schedule,
      shifts: filteredShifts
    };
    container.innerHTML = generateMonthCalendarHtml(activeSchedule, { isPrint: false });
  }

  function renderScheduleCards(container, shifts) {
    container.innerHTML = `
      <div class="schedule-cards-grid">
        ${shifts.map(shift => {
          if (shift.isExcludedDay || shift.type === 'sem_missa') {
            return `
              <div class="shift-card shift-card-excluded">
                <div class="shift-card-header">
                  <div class="shift-date-block">
                    <span class="shift-day-num">${String(shift.day).padStart(2, '0')}</span>
                    <span class="shift-day-name">${shift.title}</span>
                  </div>
                  <div>
                    <span class="badge badge-excluded-chip">🚫 Sem Celebração</span>
                  </div>
                </div>
                <div class="shift-excluded-banner">
                  <span class="shift-excluded-icon">🚫</span>
                  <div>
                    <strong class="shift-excluded-title">SEM MISSA</strong>
                    <span class="shift-excluded-sub">Removido pelo escalante</span>
                  </div>
                </div>
              </div>
            `;
          }

          const typeClasses = {
            weekday: 'type-weekday',
            weekend: 'type-weekend',
            festa: 'type-festa'
          };

          const typeBadges = {
            weekday: '<span class="tag tag-weekday">Seg à Sex</span>',
            weekend: '<span class="tag tag-weekend">Sáb / Dom</span>',
            festa: '<span class="tag tag-festa">Festa</span>'
          };

          return `
            <div class="shift-card ${typeClasses[shift.type] || ''}">
              <div class="shift-card-header">
                <div class="shift-date-block">
                  <span class="shift-day-num">${String(shift.day).padStart(2, '0')}</span>
                  <span class="shift-day-name">${shift.title}</span>
                </div>
                <div>
                  <span class="shift-time-chip">⏰ ${shift.time}</span>
                </div>
              </div>

              ${shift.type === 'festa' ? `
                <div class="shift-festa-badge">
                  <span>⭐ Solenidade: ${escapeHtml(shift.title)}</span>
                </div>
              ` : ''}

              <div class="shift-assigned-list">
                ${shift.assigned.map(person => {
                  if (person.isExtra) {
                    return `
                      <div class="assigned-person-chip is-extra-minister">
                        <div class="extra-top-bar">
                          <span class="extra-badge">⚡ Ministro Extra</span>
                          <span class="role-tag">${escapeHtml(person.role || 'MESC')}</span>
                        </div>
                        <div class="extra-person-row">
                          <span class="extra-person-name">👤 <strong>${escapeHtml(person.name)}</strong></span>
                        </div>
                      </div>
                    `;
                  }

                  if (person.isSubstitute) {
                    return `
                      <div class="assigned-person-chip is-substitute">
                        <div class="substitute-top-bar">
                          <span class="substitute-badge">🔄 Substituto</span>
                          <span class="role-tag">${escapeHtml(person.role || 'Ministro')}</span>
                        </div>
                        <div class="substitute-person-row">
                          <span class="substitute-person-name">👤 ${escapeHtml(person.name)}</span>
                          <button class="btn-undo-sub" onclick="App.revertSwap('${shift.id}', '${person.id}')" title="Desfazer e voltar ao ministro original">
                            Desfazer
                          </button>
                        </div>
                        <div class="substitute-origin-row">
                          <span class="substitute-origin">no lugar de <s>${escapeHtml(person.originalName || 'Original')}</s></span>
                          <span style="font-size:0.7rem; opacity:0.8;">(contagem congelada)</span>
                        </div>
                      </div>
                    `;
                  }

                  return `
                    <div class="assigned-person-chip">
                      <span>👤 <strong>${escapeHtml(person.name)}</strong></span>
                      <span class="role-tag">${escapeHtml(person.role || 'Ministro')}</span>
                    </div>
                  `;
                }).join('')}
              </div>

              <div style="margin-top: 12px; display:flex; justify-content:flex-end; align-items:center; gap:6px;">
                <button class="btn btn-sm btn-emerald-outline" onclick="App.openAddMinisterModal('${shift.id}')" title="Adicionar ministro de última hora para esta celebração">
                  ➕ Adicionar
                </button>
                <button class="btn btn-sm btn-outline" style="color:#e11d48; border-color:#fda4af;" onclick="App.openRemoveMinisterModal('${shift.id}')" title="Remover ministro desta celebração">
                  ➖ Remover
                </button>
                <button class="btn btn-sm btn-outline" style="color:#2563eb; border-color:#93c5fd;" onclick="App.openSwapForShift('${shift.id}')" title="Substituir ministro nesta celebração">
                  🔄 Substituir
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderScheduleTable(container, shifts) {
    container.innerHTML = `
      <div class="card" style="padding:0; overflow:hidden; width:100%; max-width:100%; box-sizing:border-box;">
        <div class="schedule-table-container" style="overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%; max-width:100%; box-sizing:border-box;">
          <table class="modern-table" style="min-width:620px; width:100%;">
          <thead>
            <tr>
              <th style="width: 80px;">Data</th>
              <th style="width: 140px;">Dia / Tipo</th>
              <th style="width: 90px;">Horário</th>
              <th>Ministros Escalados</th>
              <th style="text-align:right; width: 130px;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${shifts.map(shift => {
              const dateFormatted = `${String(shift.day).padStart(2, '0')}/${String(state.currentSchedule.month + 1).padStart(2, '0')}`;
              if (shift.isExcludedDay || shift.type === 'sem_missa') {
                return `
                  <tr class="table-row-excluded">
                    <td><strong style="color: #475569;">${dateFormatted}</strong></td>
                    <td>
                      <div style="font-weight: 700; color: #475569;">${escapeHtml(shift.title)}</div>
                      <div><span class="tag tag-excluded-tag">🚫 Sem Missa</span></div>
                    </td>
                    <td><span style="color: #94a3b8; font-weight: 700;">--:--</span></td>
                    <td>
                      <div style="display:flex; align-items:center; gap:6px; color:#334155; font-weight:700;">
                        <span>🚫 SEM MISSA - Removido pelo escalante</span>
                      </div>
                    </td>
                    <td style="text-align:right; color:#94a3b8;">-</td>
                  </tr>
                `;
              }
              const typeBadge = shift.type === 'festa' 
                ? '<span class="tag tag-festa">⭐ Festa</span>' 
                : (shift.type === 'weekend' ? '<span class="tag tag-weekend">Fim de Semana</span>' : '<span class="tag tag-weekday">Semana</span>');

              return `
                <tr>
                  <td><strong>${dateFormatted}</strong></td>
                  <td>
                    <div><strong>${escapeHtml(shift.title)}</strong></div>
                    <div>${typeBadge}</div>
                  </td>
                  <td><span class="shift-time-chip">${shift.time}</span></td>
                  <td>
                    <div style="display:flex; flex-direction:column; gap: 6px;">
                      ${shift.assigned.map(p => {
                        if (p.isExtra) {
                          return `
                            <div class="assigned-person-chip is-extra-minister" style="display:flex; padding:4px 8px;">
                              <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                                <span>⚡ <strong>${escapeHtml(p.name)}</strong> (Extra)</span>
                                <button class="btn-undo-extra" onclick="App.removeExtraMinister('${shift.id}', '${p.id}')">Remover</button>
                              </div>
                            </div>
                          `;
                        }
                        if (p.isSubstitute) {
                          return `
                            <div class="assigned-person-chip is-substitute" style="display:flex;">
                              <div class="substitute-top-bar">
                                <span class="substitute-badge">🔄 Substituto</span>
                                <span class="substitute-origin">no lugar de <s>${escapeHtml(p.originalName)}</s></span>
                              </div>
                              <div class="substitute-person-row">
                                <span class="substitute-person-name">👤 ${escapeHtml(p.name)}</span>
                                <button class="btn-undo-sub" onclick="App.revertSwap('${shift.id}', '${p.id}')">Desfazer</button>
                              </div>
                            </div>
                          `;
                        }
                        return `
                          <div class="assigned-person-chip" style="display:flex; align-items:center; justify-content:space-between; padding:3px 8px;">
                            <span>👤 ${escapeHtml(p.name)}</span>
                            <button class="cal-remove-person-btn" onclick="App.confirmRemovePersonFromShift('${shift.id}', '${p.id}')" title="Remover ${escapeHtml(p.name)}">×</button>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </td>
                  <td style="text-align:right;">
                    <div style="display:inline-flex; gap:4px;">
                      <button class="btn btn-sm btn-emerald-outline" onclick="App.openAddMinisterModal('${shift.id}')" title="Adicionar ministro">
                        ➕
                      </button>
                      <button class="btn btn-sm btn-outline" style="color:#e11d48; border-color:#fda4af;" onclick="App.openRemoveMinisterModal('${shift.id}')" title="Remover ministro">
                        ➖
                      </button>
                      <button class="btn btn-sm btn-outline" onclick="App.openSwapForShift('${shift.id}')" title="Substituir ministro">
                        Trocar
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function setScheduleFilter(filterType) {
    state.currentFilter = filterType;
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
    });
    renderSchedule();
  }

  function setScheduleView(viewMode) {
    state.currentViewMode = viewMode;
    const btnCalendar = document.getElementById('view-mode-calendar');
    const btnCards = document.getElementById('view-mode-cards');
    const btnTable = document.getElementById('view-mode-table');
    if (btnCalendar) btnCalendar.classList.toggle('active', viewMode === 'calendar');
    if (btnCards) btnCards.classList.toggle('active', viewMode === 'cards');
    if (btnTable) btnTable.classList.toggle('active', viewMode === 'table');
    renderSchedule();
  }

  /* ==========================================================================
     DIAS DE FESTA & SOLENIDADES
     ========================================================================== */

  function handleAddFesta(event) {
    event.preventDefault();
    const titleInput = document.getElementById('festa-name-input');
    const dateInput = document.getElementById('festa-date-input');
    const notesInput = document.getElementById('festa-notes-input');

    const title = titleInput.value.trim();
    const date = dateInput.value;
    if (!title || !date) return;

    state.festas.push({
      id: Date.now().toString(),
      title,
      date,
      notes: notesInput.value.trim() || 'Missa Solene'
    });

    state.festas.sort((a, b) => a.date.localeCompare(b.date));
    saveToStorage();
    renderAll();

    titleInput.value = '';
    notesInput.value = '';
    showToast(`Festa "${title}" cadastrada!`);
  }

  async function removeFesta(id) {
    const festa = state.festas.find(f => f.id === id);
    if (!festa) return;

    const confirmed = await showConfirmModal({
      title: 'Remover Celebração',
      message: `Deseja remover <strong>"${escapeHtml(festa.title)}"</strong> das festas e solenidades cadastradas?`,
      confirmText: 'Sim, Remover',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    state.festas = state.festas.filter(f => f.id !== id);
    saveToStorage();
    renderAll();
    showToast('Festa removida.');
  }

  async function loadDefaultHolidays() {
    const confirmed = await showConfirmModal({
      title: 'Solenidades Litúrgicas',
      message: 'Deseja carregar a lista de celebrações e solenidades litúrgicas sugeridas para a paróquia?',
      confirmText: 'Carregar Solenidades',
      cancelText: 'Cancelar',
      type: 'warning'
    });

    if (!confirmed) return;

    state.festas = [...DEFAULT_FESTAS];
    saveToStorage();
    renderAll();
    showToast('Solenidades padrão carregadas!');
  }

  function renderFestasList() {
    const container = document.getElementById('festas-list-container');
    if (!container) return;

    if (state.festas.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-muted);">
          Nenhuma festa cadastrada. Adicione uma no formulário ao lado ou clique em carregar solenidades padrão.
        </div>
      `;
      return;
    }

    container.innerHTML = state.festas.map(f => {
      const parts = f.date.split('-');
      const dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

      return `
        <div class="festa-item-card">
          <div style="display:flex; align-items:center;">
            <span class="festa-date-pill">📅 ${dateFormatted}</span>
            <div>
              <strong style="color:var(--text-main); font-size:0.95rem;">${escapeHtml(f.title)}</strong>
              <div style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(f.notes || '')}</div>
            </div>
          </div>
          <div>
            <button class="btn-icon-action delete" onclick="App.removeFesta('${f.id}')" title="Excluir festa">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ==========================================================================
     SUBSTITUIÇÃO / TROCA DE PLANTÃO
     ========================================================================== */

  let currentSwapShiftId = null;

  function openSwapModal() {
    if (!state.currentSchedule || !state.currentSchedule.shifts || state.currentSchedule.shifts.length === 0) {
      showToast('Gere uma escala primeiro para poder realizar trocas.', true);
      return;
    }

    const modal = document.getElementById('modal-swap');
    if (!modal) return;

    // Exibe o seletor com todos os dias caso aberto pelo botão geral
    const shiftGroup = document.getElementById('swap-shift-group');
    if (shiftGroup) shiftGroup.style.display = 'block';

    const fixedBox = document.getElementById('swap-fixed-shift-box');
    if (fixedBox) fixedBox.style.display = 'none';

    const desc = document.getElementById('swap-modal-desc');
    if (desc) {
      desc.textContent = 'Selecione o plantão e o ministro que assumirá a vaga:';
    }

    const shiftSelect = document.getElementById('swap-shift-select');
    if (shiftSelect) {
      shiftSelect.innerHTML = state.currentSchedule.shifts.map(s => {
        const dateParts = s.date.split('-');
        return `<option value="${s.id}">Dia ${dateParts[2]}/${dateParts[1]} - ${s.title} (${s.time})</option>`;
      }).join('');
    }

    handleSwapShiftChange();
    openModal('modal-swap');
  }

  function openSwapForShift(shiftId, preferredPersonId = null) {
    if (!state.currentSchedule || !state.currentSchedule.shifts || state.currentSchedule.shifts.length === 0) {
      showToast('Gere uma escala primeiro para poder realizar trocas.', true);
      return;
    }

    const modal = document.getElementById('modal-swap');
    if (!modal) return;

    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) {
      showToast('Celebração não encontrada.', true);
      return;
    }

    // Configura o seletor interno exclusivamente com o shiftId deste dia
    const shiftSelect = document.getElementById('swap-shift-select');
    if (shiftSelect) {
      const dateParts = shift.date.split('-');
      shiftSelect.innerHTML = `<option value="${shift.id}" selected>Dia ${dateParts[2]}/${dateParts[1]} - ${shift.title} (${shift.time})</option>`;
      shiftSelect.value = shift.id;
    }

    // Oculta a caixa com a lista de dias do mês inteiro e exibe o destaque fixo do plantão
    const shiftGroup = document.getElementById('swap-shift-group');
    if (shiftGroup) shiftGroup.style.display = 'none';

    const fixedBox = document.getElementById('swap-fixed-shift-box');
    if (fixedBox) fixedBox.style.display = 'flex';

    const dateParts = shift.date.split('-');
    const fixedTitle = document.getElementById('swap-fixed-shift-title');
    if (fixedTitle) {
      fixedTitle.textContent = `Dia ${dateParts[2]}/${dateParts[1]} - ${shift.title}`;
    }
    const fixedBadge = document.getElementById('swap-fixed-shift-badge');
    if (fixedBadge) {
      fixedBadge.textContent = `⏰ ${shift.time}`;
    }

    const desc = document.getElementById('swap-modal-desc');
    if (desc) {
      desc.textContent = 'Selecione o ministro deste plantão que será substituído:';
    }

    handleSwapShiftChange(preferredPersonId);
    openModal('modal-swap');
  }

  function closeSwapModal() {
    toggleSwapPersonDropdown(true);
    closeModal('modal-swap');
  }

  function handleSwapShiftChange(preferredPersonId = null) {
    const shiftSelect = document.getElementById('swap-shift-select');
    const oldPersonSelect = document.getElementById('swap-old-person-select');
    const newPersonSelect = document.getElementById('swap-new-person-select');
    const customItemsContainer = document.getElementById('swap-person-items-list');
    const selectedDisplay = document.getElementById('swap-person-selected-display');
    const searchInput = document.getElementById('swap-person-search-input');

    if (searchInput) searchInput.value = '';

    if (!shiftSelect || !state.currentSchedule) return;

    const shiftId = shiftSelect.value;
    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    // Atualiza o banner fixo caso o select mude
    const dateParts = shift.date.split('-');
    const fixedTitle = document.getElementById('swap-fixed-shift-title');
    if (fixedTitle) {
      fixedTitle.textContent = `Dia ${dateParts[2]}/${dateParts[1]} - ${shift.title}`;
    }
    const fixedBadge = document.getElementById('swap-fixed-shift-badge');
    if (fixedBadge) {
      fixedBadge.textContent = `⏰ ${shift.time}`;
    }

    // Preenche lista de pessoas atualmente escaladas neste turno (apenas ministros deste plantão)
    if (!shift.assigned || shift.assigned.length === 0) {
      oldPersonSelect.innerHTML = '<option value="">Nenhum ministro escalado neste dia</option>';
    } else {
      oldPersonSelect.innerHTML = shift.assigned.map(p => `
        <option value="${p.id}" ${preferredPersonId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (${p.role || 'Ministro da Eucaristia'}${p.isSubstitute ? ' - Substituto' : ''})</option>
      `).join('');

      if (preferredPersonId && shift.assigned.some(p => p.id === preferredPersonId)) {
        oldPersonSelect.value = preferredPersonId;
      }
    }

    // Preenche lista de todos os ministros disponíveis para substituição (não escalados neste turno)
    const assignedIds = (shift.assigned || []).map(p => p.id);
    const availableMembers = state.members.filter(m => !assignedIds.includes(m.id));

    // Ordena: primeiro os que atendem ao horário e à modalidade da celebração
    availableMembers.sort((a, b) => {
      const aTimeOk = isMemberAvailableForTime(a, shift.time);
      const aModOk = getMemberPrefs(a).includes(shift.type);
      const bTimeOk = isMemberAvailableForTime(b, shift.time);
      const bModOk = getMemberPrefs(b).includes(shift.type);
      const aScore = (aTimeOk ? 2 : 0) + (aModOk ? 1 : 0);
      const bScore = (bTimeOk ? 2 : 0) + (bModOk ? 1 : 0);
      return bScore - aScore;
    });

    // 1. Preenche o select nativo (para compatibilidade contínua de formulário)
    newPersonSelect.innerHTML = availableMembers.map(m => {
      const timeOk = isMemberAvailableForTime(m, shift.time);
      const modOk = getMemberPrefs(m).includes(shift.type);
      let statusTag = '';
      if (timeOk && modOk) {
        statusTag = 'Disponível';
      } else if (timeOk) {
        statusTag = 'No horário (outra modalidade)';
      } else {
        statusTag = 'Fora do horário habitual';
      }
      const activeText = m.active ? 'Ativo' : 'Em pausa';
      return `
        <option value="${m.id}">${escapeHtml(m.name)} • ${statusTag} (${activeText})</option>
      `;
    }).join('');

    // 2. Preenche o menu customizado com Nome em Negrito e "Disponível" em Verde Vivo
    if (customItemsContainer) {
      if (availableMembers.length === 0) {
        customItemsContainer.innerHTML = '<div style="padding:14px; text-align:center; color:var(--text-muted); font-size:0.85rem;">Nenhum ministro disponível para substituição</div>';
        if (selectedDisplay) selectedDisplay.innerHTML = '<span style="color:var(--text-muted);">Nenhum ministro disponível</span>';
      } else {
        customItemsContainer.innerHTML = availableMembers.map((m, idx) => {
          const timeOk = isMemberAvailableForTime(m, shift.time);
          const modOk = getMemberPrefs(m).includes(shift.type);
          let statusHtml = '';
          if (timeOk && modOk) {
            statusHtml = '<span class="opt-status-available">Disponível</span>';
          } else if (timeOk) {
            statusHtml = '<span class="opt-status-other">No horário (outra modalidade)</span>';
          } else {
            statusHtml = '<span class="opt-status-outside">Fora do horário habitual</span>';
          }
          const activeText = m.active ? 'Ativo' : 'Em pausa';

          return `
            <div class="custom-dropdown-item ${idx === 0 ? 'is-selected' : ''}" data-id="${m.id}" data-name="${escapeHtml(m.name)}" onclick="App.selectSwapPerson('${m.id}')">
              <span class="opt-name">${escapeHtml(m.name)}</span>
              <span class="opt-sep">•</span>
              ${statusHtml}
              <span class="opt-active-tag">(${activeText})</span>
            </div>
          `;
        }).join('');

        // Seleciona o primeiro ministro por padrão
        const first = availableMembers[0];
        newPersonSelect.value = first.id;
        if (selectedDisplay) {
          const timeOk = isMemberAvailableForTime(first, shift.time);
          const modOk = getMemberPrefs(first).includes(shift.type);
          const statusHtml = (timeOk && modOk)
            ? '<span class="opt-status-available">Disponível</span>'
            : (timeOk ? '<span class="opt-status-other">No horário</span>' : '<span class="opt-status-outside">Fora do horário</span>');

          selectedDisplay.innerHTML = `
            <span class="opt-name">${escapeHtml(first.name)}</span>
            <span class="opt-sep">•</span>
            ${statusHtml}
            <span class="opt-active-tag">(${first.active ? 'Ativo' : 'Em pausa'})</span>
          `;
        }
      }
    }
  }

  function handleQueueModeChange(selectEl) {
    if (selectEl && selectEl.value) {
      selectEl.classList.remove('has-validation-error');
      const group = document.getElementById('form-group-queue-mode');
      if (group) group.classList.remove('has-validation-error');
      const err = document.getElementById('queue-mode-error-msg');
      if (err) err.style.display = 'none';
    }
  }

  function toggleSwapPersonDropdown(forceClose = false) {
    const container = document.getElementById('swap-person-dropdown-container');
    const trigger = document.getElementById('swap-person-btn-trigger');
    const searchInput = document.getElementById('swap-person-search-input');
    if (!container) return;

    if (forceClose || container.classList.contains('is-open')) {
      container.classList.remove('is-open');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    } else {
      container.classList.add('is-open');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      if (searchInput) {
        setTimeout(() => searchInput.focus(), 60);
      }
    }
  }

  function selectSwapPerson(id) {
    const select = document.getElementById('swap-new-person-select');
    const selectedDisplay = document.getElementById('swap-person-selected-display');
    const shiftSelect = document.getElementById('swap-shift-select');

    if (select) select.value = id;

    const member = state.members.find(m => m.id === id);
    if (member && selectedDisplay) {
      const shiftId = shiftSelect ? shiftSelect.value : null;
      const shift = shiftId && state.currentSchedule ? state.currentSchedule.shifts.find(s => s.id === shiftId) : null;
      const timeOk = shift ? isMemberAvailableForTime(member, shift.time) : true;
      const modOk = shift ? getMemberPrefs(member).includes(shift.type) : true;
      const statusHtml = (timeOk && modOk)
        ? '<span class="opt-status-available">Disponível</span>'
        : (timeOk ? '<span class="opt-status-other">No horário</span>' : '<span class="opt-status-outside">Fora do horário</span>');

      selectedDisplay.innerHTML = `
        <span class="opt-name">${escapeHtml(member.name)}</span>
        <span class="opt-sep">•</span>
        ${statusHtml}
        <span class="opt-active-tag">(${member.active ? 'Ativo' : 'Em pausa'})</span>
      `;
    }

    document.querySelectorAll('.custom-dropdown-item').forEach(el => {
      if (el.getAttribute('data-id') === id) {
        el.classList.add('is-selected');
      } else {
        el.classList.remove('is-selected');
      }
    });

    toggleSwapPersonDropdown(true);
  }

  function filterSwapPersonOptions(query) {
    const norm = normalizeSearchText(query || '');
    const items = document.querySelectorAll('.custom-dropdown-item');
    items.forEach(item => {
      const name = item.getAttribute('data-name') || '';
      if (normalizeSearchText(name).includes(norm)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  function confirmSwap() {
    const shiftSelect = document.getElementById('swap-shift-select');
    const oldPersonSelect = document.getElementById('swap-old-person-select');
    const newPersonSelect = document.getElementById('swap-new-person-select');

    if (!shiftSelect || !oldPersonSelect || !newPersonSelect || !state.currentSchedule) return;

    const shiftId = shiftSelect.value;
    const oldId = oldPersonSelect.value;
    const newId = newPersonSelect.value;

    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    const newMember = state.members.find(m => m.id === newId);
    const oldMember = state.members.find(m => m.id === oldId);

    if (!shift || !newMember) return;

    // 1. REGRAS DE CONTAGEM & JUSTIÇA:
    // A contagem de quem foi substituído fica congelada (não ganha o plantão não realizado)
    if (oldMember && (oldMember.count || 0) > 0) {
      oldMember.count = Math.max(0, oldMember.count - 1);
    }

    // O ministro substituto ganha +1 na contagem total e +1 no contador de substituições
    newMember.count = (newMember.count || 0) + 1;
    newMember.subsCount = (newMember.subsCount || 0) + 1;

    // 2. Realiza a substituição marcando o destaque visual
    shift.assigned = shift.assigned.map(p => {
      if (p.id === oldId) {
        return {
          id: newMember.id,
          name: newMember.name,
          role: newMember.role,
          isSubstitute: true,
          originalId: oldMember ? oldMember.id : oldId,
          originalName: oldMember ? oldMember.name : p.name,
          substitutedAt: new Date().toISOString()
        };
      }
      return p;
    });

    saveToStorage();
    renderAll();
    closeSwapModal();
    showToast(`Substituição confirmada: ${newMember.name} assumiu no lugar de ${oldMember ? oldMember.name : 'outro ministro'}!`);
  }

  /**
   * Desfaz a substituição e restaura o ministro original
   */
  async function revertSwap(shiftId, substituteId) {
    if (!state.currentSchedule) return;
    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const assignedSub = shift.assigned.find(p => p.id === substituteId && p.isSubstitute);
    if (!assignedSub) return;

    const originalMember = state.members.find(m => m.id === assignedSub.originalId);
    const substituteMember = state.members.find(m => m.id === substituteId);

    const confirmed = await showConfirmModal({
      title: 'Desfazer Substituição',
      message: `Deseja desfazer a substituição e recolocar <strong>"${escapeHtml(assignedSub.originalName)}"</strong> nesta escala?<br><span style="font-size:0.8rem; color:var(--text-light); margin-top:6px; display:inline-block;">As contagens de atendimento de ambos os ministros serão recalculadas automaticamente.</span>`,
      confirmText: 'Sim, Restaurar Original',
      cancelText: 'Cancelar',
      type: 'warning'
    });

    if (!confirmed) return;

    // Reverte contagens
    if (originalMember) {
      originalMember.count = (originalMember.count || 0) + 1;
    }
    if (substituteMember && (substituteMember.count || 0) > 0) {
      substituteMember.count = Math.max(0, substituteMember.count - 1);
      if (substituteMember.subsCount && substituteMember.subsCount > 0) {
        substituteMember.subsCount--;
      }
    }

    // Restaura escalado original
    shift.assigned = shift.assigned.map(p => {
      if (p.id === substituteId && p.isSubstitute) {
        return {
          id: originalMember ? originalMember.id : assignedSub.originalId,
          name: originalMember ? originalMember.name : assignedSub.originalName,
          role: originalMember ? originalMember.role : 'Ministro(a)',
          isSubstitute: false
        };
      }
      return p;
    });

    saveToStorage();
    renderAll();
    showToast(`Substituição desfeita: ${assignedSub.originalName} retornou à escala.`);
  }

  /* ==========================================================================
     GERENCIAMENTO DE MINISTRO EXTRA DE ÚLTIMA HORA
     ========================================================================== */

  /**
   * Retorna os ministros ativos ordenados pela sequência cíclica a partir do ponteiro atual
   */
  function getMembersInQueueOrder() {
    const active = getActiveMembers();
    if (active.length === 0) return [];
    const ordered = [];
    const ptr = state.rotationPointer % active.length;
    for (let i = 0; i < active.length; i++) {
      const idx = (ptr + i) % active.length;
      ordered.push({
        ...active[idx],
        sequencePosition: i + 1
      });
    }
    return ordered;
  }

  function openAddMinisterModal(shiftId) {
    if (!state.currentSchedule || !state.currentSchedule.shifts) {
      showToast('Gere uma escala primeiro para poder adicionar ministros.', true);
      return;
    }

    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const shiftIdInput = document.getElementById('add-minister-shift-id');
    const shiftDescEl = document.getElementById('add-minister-shift-desc');
    const searchInput = document.getElementById('add-minister-search');

    if (shiftIdInput) shiftIdInput.value = shiftId;
    if (shiftDescEl) {
      const dateParts = shift.date.split('-');
      shiftDescEl.textContent = `Celebração: Dia ${dateParts[2]}/${dateParts[1]} (${shift.title}) às ⏰ ${shift.time}`;
    }
    if (searchInput) searchInput.value = '';

    renderAddMinisterList();
    openModal('modal-add-minister');
  }

  function closeAddMinisterModal() {
    closeModal('modal-add-minister');
  }

  function filterAddMinisterList() {
    renderAddMinisterList();
  }

  function renderAddMinisterList() {
    const container = document.getElementById('add-minister-list');
    const shiftId = document.getElementById('add-minister-shift-id')?.value;
    const searchInput = document.getElementById('add-minister-search');
    if (!container || !shiftId || !state.currentSchedule) return;

    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const query = (searchInput?.value || '').trim().toLowerCase();
    const orderedMembers = getMembersInQueueOrder();
    const assignedIds = shift.assigned.map(p => p.id);

    // Filtra por busca se houver
    const filtered = orderedMembers.filter(m => {
      if (!query) return true;
      const nameMatch = m.name.toLowerCase().includes(query);
      const roleMatch = (m.role || '').toLowerCase().includes(query);
      return nameMatch || roleMatch;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 18px 0;">
          <p style="color:var(--text-muted); margin:0;">Nenhum ministro encontrado para a busca informada.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(m => {
      const isAlreadyAssigned = assignedIds.includes(m.id);
      const isTop = m.sequencePosition === 1;

      // Badges de funções
      const roles = m.role ? m.role.split(',').map(s => s.trim()).filter(Boolean) : ['Ministro da Eucaristia'];
      const rolesHtml = roles.map(r => `<span class="badge badge-secondary" style="font-size:0.65rem; padding:1px 5px;">${escapeHtml(r)}</span>`).join(' ');

      // Verificação de disponibilidade de horário e modalidade para esta celebração
      const isTimeOk = isMemberAvailableForTime(m, shift.time);
      const isModOk = getMemberPrefs(m).includes(shift.type);
      let availBadge = '';
      if (isTimeOk && isModOk) {
        availBadge = `<span class="badge" style="background:#ecfdf5; color:#047857; font-size:0.68rem; padding:2px 6px;">🟢 Disponível às ${shift.time}</span>`;
      } else if (!isTimeOk) {
        availBadge = `<span class="badge" style="background:#fef2f2; color:#b91c1c; font-size:0.68rem; padding:2px 6px;">⚠️ Fora do horário</span>`;
      } else {
        availBadge = `<span class="badge" style="background:#fffbeb; color:#b45309; font-size:0.68rem; padding:2px 6px;">🟡 Outra modalidade</span>`;
      }

      return `
        <div class="extra-minister-item ${isTop ? 'is-next' : ''} ${isAlreadyAssigned ? 'is-already-assigned' : ''}">
          <div class="extra-minister-left">
            <span class="extra-minister-pos-badge ${isTop ? 'is-top' : ''}">
              ${isTop ? '⭐ ' : ''}${m.sequencePosition}º da fila
            </span>
            <div class="extra-minister-name">
              <div>
                <strong>${escapeHtml(m.name)}</strong>
                ${m.active ? '<span style="font-size:0.75rem; color:#10b981; margin-left:4px;">● Ativo</span>' : '<span style="font-size:0.75rem; color:#94a3b8; margin-left:4px;">○ Pausa</span>'}
              </div>
              <div class="extra-minister-roles" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-top:2px;">
                ${rolesHtml}
                ${availBadge}
              </div>
            </div>
          </div>
          <div class="extra-minister-right">
            <span class="extra-minister-count">${m.count || 0} plantões</span>
            ${isAlreadyAssigned ? `
              <span class="badge badge-secondary" style="font-size:0.72rem; padding:4px 8px; color:var(--text-muted);">
                ✓ Já escalado
              </span>
            ` : `
              <button type="button" class="btn btn-sm btn-emerald" onclick="App.confirmAddExtraMinister('${m.id}')">
                ➕ Escalar
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  function confirmAddExtraMinister(memberId) {
    const shiftId = document.getElementById('add-minister-shift-id')?.value;
    if (!shiftId || !state.currentSchedule) return;

    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const member = state.members.find(m => m.id === memberId);
    if (!member) return;

    if (shift.assigned.some(p => p.id === memberId)) {
      showToast('Este ministro já está escalado nesta celebração.', true);
      return;
    }

    // Adiciona como ministro extra
    shift.assigned.push({
      id: member.id,
      name: member.name,
      role: member.role,
      isExtra: true,
      addedAt: new Date().toISOString()
    });

    // Incrementa contagem do ministro
    member.count = (member.count || 0) + 1;

    saveToStorage();
    renderAll();
    closeAddMinisterModal();
    showToast(`Ministro ${member.name} adicionado com sucesso como reforço de última hora!`);
  }

  async function removeExtraMinister(shiftId, memberId) {
    if (!state.currentSchedule) return;
    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const assignedExtra = shift.assigned.find(p => p.id === memberId && p.isExtra);
    if (!assignedExtra) return;

    const confirmed = await showConfirmModal({
      title: 'Remover Ministro de Última Hora',
      message: `Deseja remover <strong>"${escapeHtml(assignedExtra.name)}"</strong> desta celebração?<br><span style="font-size:0.8rem; color:var(--text-light); margin-top:6px; display:inline-block;">A contagem de plantões do ministro será reduzida em 1 automaticamente.</span>`,
      confirmText: 'Sim, Remover Ministro',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    // Remove da celebração
    shift.assigned = shift.assigned.filter(p => !(p.id === memberId && p.isExtra));

    // Decrementa contagem
    const member = state.members.find(m => m.id === memberId);
    if (member && member.count > 0) {
      member.count -= 1;
    }

    saveToStorage();
    renderAll();
    showToast(`Ministro ${assignedExtra.name} removido da celebração.`);
  }

  /* ==========================================================================
     MODAL DE REMOÇÃO DE MINISTRO DA CELEBRAÇÃO
     ========================================================================== */

  function openRemoveMinisterModal(shiftId) {
    if (!state.currentSchedule || !state.currentSchedule.shifts) {
      showToast('Gere uma escala primeiro para poder remover ministros.', true);
      return;
    }

    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    if (!shift.assigned || shift.assigned.length === 0) {
      showToast('Esta celebração não possui ministros escalados.', true);
      return;
    }

    const shiftIdInput = document.getElementById('remove-minister-shift-id');
    const shiftDescEl = document.getElementById('remove-minister-shift-desc');

    if (shiftIdInput) shiftIdInput.value = shiftId;
    if (shiftDescEl) {
      const dateParts = shift.date.split('-');
      shiftDescEl.textContent = `Celebração: Dia ${dateParts[2]}/${dateParts[1]} (${shift.title}) às ⏰ ${shift.time}`;
    }

    renderRemoveMinisterList();
    openModal('modal-remove-minister');
  }

  function closeRemoveMinisterModal() {
    closeModal('modal-remove-minister');
  }

  function renderRemoveMinisterList() {
    const container = document.getElementById('remove-minister-list');
    const shiftId = document.getElementById('remove-minister-shift-id')?.value;
    if (!container || !shiftId || !state.currentSchedule) return;

    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift || !shift.assigned || shift.assigned.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 18px 0; text-align: center;">
          <p style="color:var(--text-muted); margin:0;">Não há ministros restantes nesta celebração.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = shift.assigned.map(p => {
      let tagHtml = '<span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:0.7rem; padding:2px 6px;">Original</span>';
      if (p.isExtra) {
        tagHtml = '<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.7rem; padding:2px 6px;">⚡ Extra</span>';
      } else if (p.isSubstitute) {
        tagHtml = '<span class="badge" style="background:#ede9fe; color:#6d28d9; font-size:0.7rem; padding:2px 6px;">🔄 Substituto</span>';
      }

      return `
        <div class="extra-minister-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:8px; background:var(--bg-card);">
          <div style="display:flex; flex-direction:column; gap:3px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <strong style="font-size:0.92rem;">${escapeHtml(p.name)}</strong>
              ${tagHtml}
            </div>
            <span style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(p.role || 'Ministro')}</span>
          </div>
          <button type="button" class="btn btn-sm" style="background:#ef4444; color:#fff; border:none; padding:6px 12px; font-weight:700; border-radius:6px; cursor:pointer;" onclick="App.confirmRemovePersonFromShift('${shift.id}', '${p.id}')">
            🗑️ Remover
          </button>
        </div>
      `;
    }).join('');
  }

  async function confirmRemovePersonFromShift(shiftId, personId) {
    if (!state.currentSchedule || !state.currentSchedule.shifts) return;
    const shift = state.currentSchedule.shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const person = shift.assigned.find(p => p.id === personId);
    if (!person) return;

    const confirmed = await showConfirmModal({
      title: 'Remover Ministro da Celebração',
      message: `Tem certeza de que deseja remover <strong>"${escapeHtml(person.name)}"</strong> da celebração do dia <strong>${shift.day}/${state.currentSchedule.month + 1} às ${shift.time}</strong>?<br><span style="font-size:0.8rem; color:var(--text-light); margin-top:6px; display:inline-block;">A contagem de plantões do ministro será ajustada automaticamente (-1 plantão).</span>`,
      confirmText: 'Sim, Remover',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    // Remove do array de escalados do shift
    shift.assigned = shift.assigned.filter(p => p.id !== personId);

    // Ajusta o count do membro se não for substituto congelado
    if (!person.isSubstitute) {
      const member = state.members.find(m => m.id === personId || m.name === person.name);
      if (member && member.count && member.count > 0) {
        member.count -= 1;
      }
    }

    saveToStorage();
    renderAll();
    showToast(`"${person.name}" removido(a) da celebração com sucesso.`);

    // Se o modal estiver aberto, atualiza a lista de ministros
    renderRemoveMinisterList();
    if (shift.assigned.length === 0) {
      setTimeout(() => closeRemoveMinisterModal(), 700);
    }
  }

  /* ==========================================================================
     EXPORTAÇÃO PARA WHATSAPP
     ========================================================================== */

  function exportToWhatsApp() {
    if (!state.currentSchedule || !state.currentSchedule.shifts || state.currentSchedule.shifts.length === 0) {
      showToast('Gere uma escala primeiro para poder exportar.', true);
      return;
    }

    const { monthName, year, shifts, isPartial, startDay, endDay } = state.currentSchedule;
    const partialSuffix = isPartial ? ` (DIAS ${String(startDay || 1).padStart(2, '0')} A ${String(endDay || 31).padStart(2, '0')})` : '';
    let text = `*ESCALA DE MINISTROS DA EUCARISTIA (MESC) - ${monthName.toUpperCase()} / ${year}${partialSuffix}*\n`;
    text += `_Paróquia Nossa Senhora Aparecida_\n\n`;

    shifts.forEach(shift => {
      const parts = shift.date.split('-');
      const dateFormatted = `${parts[2]}/${parts[1]}`;
      const dayName = getDayName(shift.dayOfWeek);

      if (shift.isExcludedDay || shift.type === 'sem_missa') {
        text += `🚫 *${dateFormatted} (${dayName})* - SEM MISSA _(Removido pelo escalante)_

`;
        return;
      }

      const typeIcon = shift.type === 'festa' ? '⭐' : (shift.type === 'weekend' ? '⛪' : '📅');
      
      let headerLine = `${typeIcon} *${dateFormatted} (${dayName})* - ${shift.time}`;

      // Apenas na missa de terça-feira às 15h, manter a inscrição diferenciada da Novena
      if (shift.dayOfWeek === 2 && (shift.time === '15:00' || shift.isTuesdayNovena)) {
        headerLine += ` * Novena de N. Sra. Aparecida`;
      } else if (shift.type === 'festa' && shift.title) {
        headerLine += ` - ${shift.title}`;
      }

      text += `${headerLine}\n`;
      shift.assigned.forEach(p => {
        if (p.isExtra) {
          text += `   • ⚡ *${p.name}* _(Reforço de Última Hora)_\n`;
        } else if (p.isSubstitute) {
          text += `   • 🔄 *${p.name}* _(Substituto de ${p.originalName})_\n`;
        } else {
          text += `   • ${p.name}\n`;
        }
      });
      text += `\n`;
    });

    text += `*LEMBRETES IMPORTANTES AOS MINISTROS (MESC):*\n`;
    text += `• CHEGAR UMA HORA ANTES DO HORÁRIO DA CELEBRAÇÃO\n`;
    text += `• CADA MINISTRO DEVERÁ LEVAR CONSIGO UM SANGUÍNEO PARA USÁ-LO NO MOMENTO DA DISTRIBUIÇÃO DA SANTA COMUNHÃO\n`;
    text += `• QUALQUER PROBLEMA PARA O CUMPRIMENTO DA ESCALA FAVOR AVISAR COM ANTECEDÊNCIA\n\n`;

    text += `_Nossa Senhora Aparecida, rogai por nós!_\n\n`;
    text += `_Gerado pelo Sistema de Escalas - Paróquia Nossa Senhora Aparecida._`;

    // Copia para área de transferência
    navigator.clipboard.writeText(text).then(() => {
      showToast('Escala formatada copiada para o WhatsApp! Basta colar no grupo.');
    }).catch(err => {
      console.error(err);
      showToast('Não foi possível copiar automaticamente.', true);
    });
  }

  /**
   * Exclui a escala gerada vigente e reverte a contagem de plantões dos ministros
   */
  async function confirmDeleteCurrentSchedule() {
    if (!state.currentSchedule || !state.currentSchedule.shifts || state.currentSchedule.shifts.length === 0) {
      showToast('Não há nenhuma escala vigente para remover.', true);
      return;
    }

    const { monthName, year } = state.currentSchedule;
    const confirmed = await showConfirmModal({
      title: 'Remover Escala Vigente?',
      message: `Tem certeza de que deseja remover a escala de <strong>${escapeHtml(monthName)} de ${escapeHtml(year)}</strong>?<br><br>⚠️ Esta ação irá excluir a grade de horários gerada e <strong>reverter a contagem de plantões de todos os ministros escalados</strong>, mantendo os próximos rodízios equilibrados.<br><br>Essa ação não poderá ser desfeita.`,
      confirmText: 'Sim, Remover Escala',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    // Calcula exatamente quantas vezes cada ministro foi alocado nesta escala
    const memberShiftsCount = {};
    state.currentSchedule.shifts.forEach(shift => {
      (shift.assigned || []).forEach(p => {
        if (p.id) {
          memberShiftsCount[p.id] = (memberShiftsCount[p.id] || 0) + 1;
        }
      });
    });

    // Reverte a contagem de plantões dos ministros
    state.members.forEach(m => {
      if (memberShiftsCount[m.id]) {
        m.count = Math.max(0, (m.count || 0) - memberShiftsCount[m.id]);
      }
    });

    state.currentSchedule = null;
    saveToStorage();
    renderAll();
    showToast('Escala vigente removida com sucesso e a contagem dos ministros foi ajustada!');
  }

  /* ==========================================================================
     HELPERS & UTILITÁRIOS
     ========================================================================== */

  function getMonthName(m) {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[m] || '';
  }

  function getDayName(d) {
    const days = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ];
    return days[d] || '';
  }

  /* ==========================================================================
     MODAL DE CONFIRMAÇÃO COM IDENTIDADE VISUAL
     ========================================================================== */

  let confirmResolveCallback = null;

  function showConfirmModal({
    title = 'Confirmar Ação',
    message = 'Deseja prosseguir com esta ação?',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'danger' // 'danger' ou 'warning'
  }) {
    return new Promise(resolve => {
      confirmResolveCallback = resolve;
      const modal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('confirm-modal-title');
      const msgEl = document.getElementById('confirm-modal-message');
      const iconWrap = document.getElementById('confirm-icon-wrapper');
      const btnAction = document.getElementById('confirm-btn-action');
      const btnCancel = document.getElementById('confirm-btn-cancel');

      if (!modal) {
        resolve(true);
        return;
      }

      titleEl.textContent = title;
      msgEl.innerHTML = message;
      btnAction.textContent = confirmText;
      btnCancel.textContent = cancelText;

      iconWrap.className = `confirm-icon-wrapper ${type}`;
      if (type === 'danger') {
        btnAction.className = 'btn btn-danger';
        iconWrap.innerHTML = `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        `;
      } else {
        btnAction.className = 'btn btn-gold';
        iconWrap.innerHTML = `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        `;
      }

      openModal('modal-confirm');
    });
  }

  function closeConfirmModal(result = false) {
    closeModal('modal-confirm');
    if (confirmResolveCallback) {
      confirmResolveCallback(result);
      confirmResolveCallback = null;
    }
  }

  function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    if (isError) {
      toast.style.borderLeftColor = '#ef4444';
    }
    toast.innerHTML = `
      <span>${isError ? '⚠️' : '✨'}</span>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const s = String(str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // API Pública
  
  /* ==========================================================================
     GERENCIADOR DE DIAS SEM MISSA (EXCEÇÕES ESPECÍFICAS DO MÊS)
     ========================================================================== */
  let tempExcludedDays = [];

  function openExcludedDaysModal() {
    const monthSelect = document.getElementById('gen-month-select');
    const yearSelect = document.getElementById('gen-year-select');
    if (!monthSelect || !yearSelect) return;

    const month = parseInt(monthSelect.value, 10);
    const year = parseInt(yearSelect.value, 10);
    const monthName = getMonthName(month);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Seg ...

    const titleEl = document.getElementById('excluded-modal-month-name');
    if (titleEl) titleEl.textContent = `${monthName} de ${year}`;

    // Inicializa working set temporário com os dias já excluídos
    tempExcludedDays = [...(state.excludedDays || [])];

    const grid = document.getElementById('excluded-days-calendar-grid');
    if (grid) {
      const weekHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      let html = weekHeaders.map(w => `<div class="excluded-cal-th">${w}</div>`).join('');

      // Células vazias antes do dia 1
      for (let i = 0; i < firstDayOfWeek; i++) {
        html += `<div class="excluded-day-btn is-empty"></div>`;
      }

      // Dias 1..totalDays
      for (let d = 1; d <= totalDays; d++) {
        const isExcluded = tempExcludedDays.includes(d);
        html += `
          <button type="button" class="excluded-day-btn ${isExcluded ? 'is-excluded' : ''}" onclick="App.toggleExcludedDay(${d}, this)" title="Clique para alternar entre com missa ou sem missa">
            <span class="day-num">${d}</span>
            <span class="day-status">${isExcluded ? '🚫 Sem Missa' : 'Missa'}</span>
          </button>
        `;
      }

      grid.innerHTML = html;
    }

    const modal = document.getElementById('modal-excluded-days');
    if (modal) {
      modal.style.display = '';
      modal.classList.add('open');
    }
    openModal('modal-excluded-days');
  }

  function closeExcludedDaysModal() {
    closeModal('modal-excluded-days');
  }

  function toggleExcludedDay(day, btnEl) {
    day = parseInt(day, 10);
    const idx = tempExcludedDays.indexOf(day);
    if (idx >= 0) {
      tempExcludedDays.splice(idx, 1);
      if (btnEl) {
        btnEl.classList.remove('is-excluded');
        const statusSpan = btnEl.querySelector('.day-status');
        if (statusSpan) statusSpan.textContent = 'Missa';
      }
    } else {
      tempExcludedDays.push(day);
      if (btnEl) {
        btnEl.classList.add('is-excluded');
        const statusSpan = btnEl.querySelector('.day-status');
        if (statusSpan) statusSpan.textContent = '🚫 Sem Missa';
      }
    }
  }

  function clearAllExcludedDays() {
    tempExcludedDays = [];
    const grid = document.getElementById('excluded-days-calendar-grid');
    if (grid) {
      grid.querySelectorAll('.excluded-day-btn').forEach(btn => {
        btn.classList.remove('is-excluded');
        const statusSpan = btn.querySelector('.day-status');
        if (statusSpan) statusSpan.textContent = 'Missa';
      });
    }
  }

  function saveExcludedDaysModal() {
    state.excludedDays = [...tempExcludedDays].sort((a, b) => a - b);
    if (state.currentSchedule) {
      state.currentSchedule.excludedDays = [...state.excludedDays];
    }
    closeExcludedDaysModal();
    renderExcludedDaysSummary();
    updateGenerationPreview();
    if (state.excludedDays.length > 0) {
      showToast(`${state.excludedDays.length} dia(s) marcado(s) sem celebração neste mês.`);
    } else {
      showToast('Nenhum dia excluído. Todas as celebrações normais foram mantidas.');
    }
  }

  function removeExcludedDay(day) {
    day = parseInt(day, 10);
    if (Array.isArray(state.excludedDays)) {
      state.excludedDays = state.excludedDays.filter(d => d !== day);
      renderExcludedDaysSummary();
      updateGenerationPreview();
    }
  }

  function renderExcludedDaysSummary() {
    const container = document.getElementById('excluded-days-tags-container');
    const badge = document.getElementById('excluded-days-badge');
    const btnText = document.getElementById('excluded-days-btn-text');
    const monthSelect = document.getElementById('gen-month-select');
    const yearSelect = document.getElementById('gen-year-select');

    const month = monthSelect ? parseInt(monthSelect.value, 10) : 0;
    const year = yearSelect ? parseInt(yearSelect.value, 10) : 2026;
    const list = state.excludedDays || [];

    if (badge) {
      if (list.length > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = list.length.toString();
      } else {
        badge.style.display = 'none';
      }
    }

    if (btnText) {
      btnText.textContent = list.length > 0 ? 'Editar Dias Sem Missa' : 'Marcar Dias Sem Missa';
    }

    if (container) {
      if (list.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
      } else {
        container.style.display = 'flex';
        const weekDaysShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        container.innerHTML = `
          <span style="font-size:0.75rem; font-weight:700; color:#ef4444; margin-right:4px;">Dias sem missa:</span>
          ${list.map(d => {
            const dateObj = new Date(year, month, d);
            const wName = weekDaysShort[dateObj.getDay()] || '';
            const dayFormatted = String(d).padStart(2, '0');
            const monthFormatted = String(month + 1).padStart(2, '0');
            return `
              <span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #f87171; font-size:0.75rem; padding: 4px 8px; display:inline-flex; align-items:center; gap:5px; border-radius: 4px;">
                <span>🚫 Dia ${dayFormatted}/${monthFormatted} (${wName})</span>
                <button type="button" onclick="App.removeExcludedDay(${d})" title="Remover e reativar missa neste dia" style="background:transparent; border:none; color:#991b1b; cursor:pointer; font-weight:900; padding:0 2px; font-size:0.85rem; line-height:1;">&times;</button>
              </span>
            `;
          }).join('')}
        `;
      }
    }
  }

  return {
    init,
    switchTab,
    handleAddMember,
    removeMember,
    toggleMemberStatus,
    clearAllMembers,
    filterMembersList,
    toggleMemberModalityFilter,
    toggleMemberCommunityFilter,
    handleMemberRoleFilterChange,
    handleMemberCommunityFilterChange,
    changeMembersPage,
    handleCommunityChange,
    populateRoleFilter,
    validateMemberNameInput,
    openEditMemberModal,
    closeEditMemberModal,
    handleSaveEditMember,
    handleRoleChange,
    handleTimeCheckChange,
    formatTimeInput,
    handleGenerateSchedule,
    resetRotationPointer,
    setScheduleFilter,
    setScheduleView,
    handleAddFesta,
    removeFesta,
    loadDefaultHolidays,
    openSwapModal,
    openSwapForShift,
    closeSwapModal,
    handleSwapShiftChange,
    confirmSwap,
    revertSwap,
    closeConfirmModal,
    exportToWhatsApp,
    handleTimeInput,
    handleSegmentChange,
    handlePeriodTypeChange,
    handlePartialDaysInput,
    getSelectedScheduleRange,
    openExcludedDaysModal,
    closeExcludedDaysModal,
    toggleExcludedDay,
    clearAllExcludedDays,
    saveExcludedDaysModal,
    removeExcludedDay,
    renderExcludedDaysSummary,
    updateGenerationPreview,
    parseAndValidateTimes,
    validateTimeFormat,
    openAddMinisterModal,
    closeAddMinisterModal,
    filterAddMinisterList,
    renderAddMinisterList,
    confirmAddExtraMinister,
    removeExtraMinister,
    openRemoveMinisterModal,
    closeRemoveMinisterModal,
    confirmRemovePersonFromShift,
    highlightSchedulePerson,
    clearScheduleHighlight,
    renderScheduleWeekConfig,
    toggleDayEnabled,
    toggleDayTime,
    updateDayTimePersons,
    openAddTimeModal,
    closeAddTimeModal,
    maskTimeInput,
    confirmAddTimeModal,
    handleQueueModeChange,
    toggleSwapPersonDropdown,
    selectSwapPerson,
    filterSwapPersonOptions,
    addCustomTime,
    removeCustomTime,
    resetScheduleConfigToDefault,
    confirmDeleteCurrentSchedule
  };
})();

// Inicializa quando o DOM estiver pronto
window.App = App;
document.addEventListener('DOMContentLoaded', App.init);

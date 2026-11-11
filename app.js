// Sound Manager for audio playback
class SoundManager {
    constructor() {
        this.sounds = {};
        this.muted = this.loadMutedState();
        this.soundPaths = {
            flip: 'sounds/flip.mp3',
            enterStudy: 'sounds/enter-study.mp3',
            exitStudy: 'sounds/exit-study.mp3',
            correct: 'sounds/correct.mp3',
            wrong: 'sounds/wrong.mp3'
        };
        this.preloadSounds();
    }

    loadMutedState() {
        try {
            const saved = localStorage.getItem('sparkdeck-sounds-muted');
            return saved === 'true';
        } catch (error) {
            console.warn('Could not load sound preferences:', error);
            return false;
        }
    }

    saveMutedState() {
        try {
            localStorage.setItem('sparkdeck-sounds-muted', this.muted.toString());
        } catch (error) {
            console.warn('Could not save sound preferences:', error);
        }
    }

    preloadSounds() {
        for (const [key, path] of Object.entries(this.soundPaths)) {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = path;

            // Handle loading errors gracefully
            audio.addEventListener('error', () => {
                console.warn(`Sound file not found: ${path}. Sound will be skipped.`);
            });

            this.sounds[key] = audio;
        }
    }

    play(soundName) {
        if (this.muted) return;

        const audio = this.sounds[soundName];
        if (!audio) {
            console.warn(`Sound "${soundName}" not found.`);
            return;
        }

        // Reset to beginning if already playing
        audio.currentTime = 0;

        // Play and handle errors
        audio.play().catch(err => {
            console.warn(`Could not play sound "${soundName}":`, err.message);
        });
    }

    toggleMute() {
        this.muted = !this.muted;
        this.saveMutedState();
        return this.muted;
    }

    isMuted() {
        return this.muted;
    }
}

// Simple SparkDeck App (extracted from index.html)
class SparkDeckApp {
    constructor() {
        this.soundManager = new SoundManager();
        this.migrateOldLocalStorage(); // Migrate from old StudyFlow keys
        this.decks = this.loadDecks();
        this.folders = this.loadFolders();
        this.settings = this.loadSettings();
        this.stats = this.loadStats();
        this.currentFolderId = null; // null = root view, folderId = viewing specific folder
        this.currentDeck = null;
        this.currentCardIndex = 0;
        this.showingFront = true;
        this.tempCards = [];
        this.creationMode = null;

        // Quiz state
        this.quizMode = null; // 'mc', 'written', 'mixed'
        this.quizCards = []; // Shuffled cards for quiz
        this.quizCurrentIndex = 0;
        this.quizScore = 0;
        this.quizAnswered = false;
        this.originalDeckIndex = null; // Track which deck we're quizzing
        this.currentQuizQuestion = null; // Smart question data for current card
        this.currentQuestionType = null; // 'mc' or 'written' for current question

        // Editing state
        this.editingDeckIndex = null;  // Index of deck being edited (null = creating new)
        this.editingCardIndex = null;  // Index of card being edited (null = adding new)

        // Stats state
        this.currentStatsPeriod = 'lifetime';

        // Search and filter state
        this.searchQuery = '';
        this.categoryFilter = '';

        this.initializeElements();
        this.setupEventListeners();
        this.populateFolderOptions(this.deckFolder);
        this.renderDecks();
        this.updateMuteButton();
        this.updateStatsToggleButton();
        this.applyStatsTabVisibility();
        this.applyAllVisionSettings();
        this.renderStats();
    }

    // Migrate old StudyFlow localStorage keys to SparkDeck
    migrateOldLocalStorage() {
        try {
            // Migrate decks
            const oldDecks = localStorage.getItem('studyflow-decks');
            if (oldDecks && !localStorage.getItem('sparkdeck-decks')) {
                localStorage.setItem('sparkdeck-decks', oldDecks);
                localStorage.removeItem('studyflow-decks');
            }

            // Migrate folders
            const oldFolders = localStorage.getItem('studyflow-folders');
            if (oldFolders && !localStorage.getItem('sparkdeck-folders')) {
                localStorage.setItem('sparkdeck-folders', oldFolders);
                localStorage.removeItem('studyflow-folders');
            }

            // Migrate sound preferences
            const oldSoundsMuted = localStorage.getItem('studyflow-sounds-muted');
            if (oldSoundsMuted && !localStorage.getItem('sparkdeck-sounds-muted')) {
                localStorage.setItem('sparkdeck-sounds-muted', oldSoundsMuted);
                localStorage.removeItem('studyflow-sounds-muted');
            }
        } catch (error) {
            console.warn('Could not migrate old localStorage data:', error);
        }
    }

    initializeElements() {
        // Navigation
        this.navTabs = document.querySelectorAll('.nav-tab');
        this.tabContents = document.querySelectorAll('.tab-content');

        // Create deck elements
        this.deckName = document.getElementById('deck-name');
        this.deckCategory = document.getElementById('deck-category');
        this.deckFolder = document.getElementById('deck-folder');
        this.autoMethodBtn = document.getElementById('auto-method-btn');
        this.manualMethodBtn = document.getElementById('manual-method-btn');
        this.autoInput = document.getElementById('auto-input');
        this.manualInput = document.getElementById('manual-input');
        this.notesInput = document.getElementById('notes-input');
        this.generateBtn = document.getElementById('generate-btn');
        this.generateStatus = document.getElementById('generate-status');
        this.cardFront = document.getElementById('card-front');
        this.cardBack = document.getElementById('card-back');
        this.cardMediaInput = document.getElementById('card-media');
        this.addCardBtn = document.getElementById('add-card-btn');
        this.cardsPreview = document.getElementById('cards-preview');
        this.previewCards = document.getElementById('preview-cards');
        this.saveDeckBtn = document.getElementById('save-deck-btn');
        this.cancelDeckBtn = document.getElementById('cancel-deck-btn');
        this.createTabHeading = document.getElementById('create-tab-heading');
        this.cancelCardEditBtn = document.getElementById('cancel-card-edit-btn');
        this.deckShuffle = document.getElementById('deck-shuffle');

        // Study overlay elements
        this.studyOverlay = document.getElementById('study-overlay');
        this.studyProgress = document.getElementById('study-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.flashcard = document.getElementById('flashcard');
        this.cardContent = document.getElementById('card-content');
        this.cardMediaArea = document.getElementById('card-media-area');
        this.prevBtn = document.getElementById('prev-btn');
        this.flipBtn = document.getElementById('flip-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.endStudyBtn = document.getElementById('end-study-btn');

        // Quiz overlay elements
        this.quizOverlay = document.getElementById('quiz-overlay');
        this.quizProgress = document.getElementById('quiz-progress');
        this.quizProgressFill = document.getElementById('quiz-progress-fill');
        this.quizQuestion = document.getElementById('quiz-question');
        this.quizMcOptions = document.getElementById('quiz-mc-options');
        this.quizWrittenInput = document.getElementById('quiz-written-input');
        this.quizAnswerInput = document.getElementById('quiz-answer-input');
        this.quizSubmitAnswer = document.getElementById('quiz-submit-answer');
        this.quizFeedback = document.getElementById('quiz-feedback');
        this.quizFeedbackText = document.getElementById('quiz-feedback-text');
        this.quizCorrectAnswer = document.getElementById('quiz-correct-answer');
        this.quizNextBtn = document.getElementById('quiz-next-btn');
        this.endQuizBtn = document.getElementById('end-quiz-btn');

        // Quiz results elements
        this.quizResultsOverlay = document.getElementById('quiz-results-overlay');
        this.quizScoreEl = document.getElementById('quiz-score');
        this.quizScoreBreakdown = document.getElementById('quiz-score-breakdown');
        this.quizRetryBtn = document.getElementById('quiz-retry-btn');
        this.quizBackBtn = document.getElementById('quiz-back-btn');

        // Other elements
        this.decksList = document.getElementById('decks-list');
        this.announcements = document.getElementById('announcements');

        // Help modal elements (dialog)
        this.openHelpBtn = document.getElementById('open-help-btn');
        this.helpModal = document.getElementById('help-modal');
        this.closeHelpBtn = document.getElementById('close-help-btn');
        this.mainEl = document.querySelector('main');
        this.lastFocusedBeforeHelp = null;

        // Folder and generic app modal elements
        this.addFolderBtn = document.getElementById('add-folder-btn');
        this.appContainer = document.querySelector('.container');

        // Sound control
        this.muteToggleBtn = document.getElementById('mute-toggle-btn');

        // Vision settings elements
        this.darkModeBtn = document.getElementById('dark-mode-btn');
        this.fontSizeGroup = document.getElementById('font-size-group');
        this.highContrastBtn = document.getElementById('high-contrast-btn');
        this.reducedMotionBtn = document.getElementById('reduced-motion-btn');

        // Stats elements
        this.statsNavTab = document.getElementById('stats-nav-tab');
        this.statsToggleBtn = document.getElementById('stats-toggle-btn');
        this.statsPeriodBtns = document.querySelectorAll('.stats-period-btn');
        this.statsDecksCount = document.getElementById('stats-decks-count');
        this.statsSessionsCount = document.getElementById('stats-sessions-count');
        this.statsCardsStudied = document.getElementById('stats-cards-studied');
        this.statsSummary = document.getElementById('stats-summary');
        this.resetStatsBtn = document.getElementById('reset-stats-btn');

        // Generic modal elements (used for prompts/confirmations)
        this.modal = document.getElementById('app-modal');
        this.modalOverlay = document.getElementById('modal-overlay');
        this.modalTitle = document.getElementById('modal-title');
        this.modalDesc = document.getElementById('modal-desc');
        this.modalContent = document.getElementById('modal-content');
        this.modalCancelBtn = document.getElementById('modal-cancel-btn');
        this.modalConfirmBtn = document.getElementById('modal-confirm-btn');
        this._lastFocusedEl = null;

        // Search and filter elements
        this.deckSearch = document.getElementById('deck-search');
        this.categoryFilterSelect = document.getElementById('category-filter');
        this.clearFiltersBtn = document.getElementById('clear-filters-btn');
        this.searchResultsInfo = document.getElementById('search-results-info');

        // Custom category elements
        this.customCategoryWrapper = document.getElementById('custom-category-wrapper');
        this.customCategoryInput = document.getElementById('custom-category');

        // Back to decks button
        this.backToDecksBtn = document.getElementById('back-to-decks-btn');

        // Import/Export buttons (Settings)
        this.importBtn = document.getElementById('import-btn');
        this.exportAllBtn = document.getElementById('export-all-btn');
        this.exportCsvBtn = document.getElementById('export-csv-btn');
        this.exportTextBtn = document.getElementById('export-text-btn');
    }

    setupEventListeners() {
        // Navigation
        this.navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Create deck
        this.autoMethodBtn.addEventListener('click', () => this.setCreationMode('auto'));
        this.manualMethodBtn.addEventListener('click', () => this.setCreationMode('manual'));
        this.generateBtn.addEventListener('click', () => this.generateCards());
        this.addCardBtn.addEventListener('click', () => this.addManualCard());
        this.saveDeckBtn.addEventListener('click', () => this.saveDeck());
        this.cancelDeckBtn.addEventListener('click', () => this.cancelDeck());
        if (this.cancelCardEditBtn) {
            this.cancelCardEditBtn.addEventListener('click', () => this.cancelEditCard());
        }
        if (this.backToDecksBtn) {
            this.backToDecksBtn.addEventListener('click', () => this.cancelDeck());
        }
        this.deckFolder.addEventListener('change', (e) => this.onDeckFolderSelectChanged(e));

        // Study mode
        this.flipBtn.addEventListener('click', () => this.flipCard());
        this.flashcard.addEventListener('click', () => this.flipCard());
        this.flashcard.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                this.flipCard();
            }
        });
        this.prevBtn.addEventListener('click', () => this.previousCard());
        this.nextBtn.addEventListener('click', () => this.nextCard());
        this.endStudyBtn.addEventListener('click', () => this.endStudy());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Skip shortcuts when typing in input fields
            const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '');
            const isTyping = ['input', 'textarea', 'select'].includes(tag);

            // Skip if a modal is open (except help modal shortcuts)
            const isModalOpen = this.isAppModalOpen();

            // Global Help shortcut (Shift + / => ?)
            if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !isTyping) {
                e.preventDefault();
                this.openHelpModal();
                return;
            }

            // Study mode shortcuts
            if (this.currentDeck && !this.quizMode) {
                switch(e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.previousCard();
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.nextCard();
                        break;
                    case 'Escape':
                        e.preventDefault();
                        if (this.isHelpOpen()) {
                            this.closeHelpModal();
                        } else {
                            this.endStudy();
                        }
                        break;
                }
            }

            // Quiz mode shortcuts
            if (this.quizMode) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (this.isHelpOpen()) {
                        this.closeHelpModal();
                    } else {
                        this.endQuiz();
                    }
                }
            }

            // Global navigation hotkeys (only when not typing and no modal/overlay open)
            // Skip if a browser/OS modifier is held (Alt, Ctrl, Meta) to avoid
            // conflicting with browser shortcuts like Alt+D (address bar) or Ctrl+D (bookmark)
            if (!isTyping && !isModalOpen && !this.isHelpOpen() && !this.quizMode && !e.altKey && !e.ctrlKey && !e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 'd':
                        // Go to My Decks tab
                        e.preventDefault();
                        if (this.currentDeck) this.endStudy();
                        this.switchTab('decks');
                        break;
                    case 'h':
                        // Go to Home (root folder view)
                        if (this.currentFolderId) {
                            e.preventDefault();
                            this.navigateToHome();
                        }
                        break;
                    case 'c':
                    case 'n':
                        // Go to Create Deck tab (c = create, n = new)
                        e.preventDefault();
                        if (this.currentDeck) this.endStudy();
                        this.switchTab('create');
                        this.deckName.focus();
                        break;
                    case 'f':
                        // Create new folder
                        e.preventDefault();
                        if (this.currentDeck) this.endStudy();
                        this.promptAddFolder();
                        break;
                    case 's':
                        // Start studying (first deck or focused deck)
                        e.preventDefault();
                        if (!this.currentDeck && this.decks.length > 0) {
                            this.startStudy(0);
                        }
                        break;
                    case '1':
                    case '2':
                    case '3':
                    case '4':
                    case '5':
                    case '6':
                    case '7':
                    case '8':
                    case '9':
                        // Quick study deck by number
                        const deckIndex = parseInt(e.key) - 1;
                        if (deckIndex < this.decks.length) {
                            e.preventDefault();
                            this.startStudy(deckIndex);
                        }
                        break;
                }
            }
        });

        // Help modal events
        if (this.openHelpBtn) this.openHelpBtn.addEventListener('click', () => this.openHelpModal());
        if (this.closeHelpBtn) this.closeHelpBtn.addEventListener('click', () => this.closeHelpModal());
        if (this.helpModal) this.helpModal.addEventListener('close', () => this.closeHelpModal(true));

        // Trap focus within help dialog and handle Escape when it's open
        document.addEventListener('keydown', (e) => {
            if (!this.isHelpOpen()) return;
            if (e.key === 'Tab') this.trapFocus(e);
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeHelpModal();
            }
        });

        // Folder actions
        if (this.addFolderBtn) {
            this.addFolderBtn.addEventListener('click', () => this.promptAddFolder());
        }

        // Sound toggle
        if (this.muteToggleBtn) {
            this.muteToggleBtn.addEventListener('click', () => this.toggleMute());
        }

        // Vision settings toggles
        if (this.darkModeBtn) {
            this.darkModeBtn.addEventListener('click', () => this.toggleDarkMode());
        }
        if (this.fontSizeGroup) {
            this.fontSizeGroup.addEventListener('change', (e) => {
                if (e.target && e.target.name === 'font-size') {
                    this.setFontSize(e.target.value);
                }
            });
        }
        if (this.highContrastBtn) {
            this.highContrastBtn.addEventListener('click', () => this.toggleHighContrast());
        }
        if (this.reducedMotionBtn) {
            this.reducedMotionBtn.addEventListener('click', () => this.toggleReducedMotion());
        }

        // Quiz mode event listeners
        if (this.endQuizBtn) {
            this.endQuizBtn.addEventListener('click', () => this.endQuiz());
        }
        if (this.quizSubmitAnswer) {
            this.quizSubmitAnswer.addEventListener('click', () => this.submitWrittenAnswer());
        }
        if (this.quizAnswerInput) {
            this.quizAnswerInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submitWrittenAnswer();
                }
            });
        }
        if (this.quizNextBtn) {
            this.quizNextBtn.addEventListener('click', () => this.nextQuizQuestion());
        }
        if (this.quizRetryBtn) {
            this.quizRetryBtn.addEventListener('click', () => this.retryQuiz());
        }
        if (this.quizBackBtn) {
            this.quizBackBtn.addEventListener('click', () => this.exitQuizResults());
        }

        // Stats toggle
        if (this.statsToggleBtn) {
            this.statsToggleBtn.addEventListener('click', () => this.toggleStatsTab());
        }

        // Reset stats button
        if (this.resetStatsBtn) {
            this.resetStatsBtn.addEventListener('click', () => this.resetStats());
        }

        // Import/Export buttons (Settings)
        if (this.exportAllBtn) {
            this.exportAllBtn.addEventListener('click', () => this.exportAllData());
        }
        if (this.exportCsvBtn) {
            this.exportCsvBtn.addEventListener('click', () => this.exportAllAsCSV());
        }
        if (this.exportTextBtn) {
            this.exportTextBtn.addEventListener('click', () => this.exportAllAsText());
        }
        if (this.importBtn) {
            this.importBtn.addEventListener('click', () => this.triggerImport());
        }

        // Stats period filter buttons
        this.statsPeriodBtns.forEach(btn => {
            btn.addEventListener('click', () => this.setStatsPeriod(btn.dataset.period));
        });

        // Search and filter events
        if (this.deckSearch) {
            this.deckSearch.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }
        if (this.categoryFilterSelect) {
            this.categoryFilterSelect.addEventListener('change', (e) => this.handleCategoryFilter(e.target.value));
        }
        if (this.clearFiltersBtn) {
            this.clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        }

        // Custom category handling
        if (this.deckCategory) {
            this.deckCategory.addEventListener('change', (e) => this.handleCategoryChange(e.target.value));
        }
    }

    // Escape HTML entities to prevent XSS when interpolating user data into innerHTML
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    announce(message) {
        this.announcements.textContent = message;
        setTimeout(() => {
            this.announcements.textContent = '';
        }, 1000);
    }

    toggleMute() {
        const isMuted = this.soundManager.toggleMute();
        this.updateMuteButton();
        this.announce(isMuted ? 'Sounds muted' : 'Sounds enabled');
    }

    updateMuteButton() {
        if (!this.muteToggleBtn) return;
        const isMuted = this.soundManager.isMuted();
        const wasActive = document.activeElement === this.muteToggleBtn;

        this.muteToggleBtn.textContent = isMuted ? '🔇 Disabled' : '🔊 Enabled';
        this.muteToggleBtn.setAttribute('aria-label', isMuted ? 'Sound effects disabled. Click to enable.' : 'Sound effects enabled. Click to disable.');

        // Force screen readers to re-announce by briefly removing and restoring focus
        if (wasActive) {
            this.muteToggleBtn.blur();
            setTimeout(() => {
                this.muteToggleBtn.focus();
            }, 10);
        }
    }

    // Search and filter methods
    handleSearch(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.updateClearFiltersButton();
        this.renderDecks();
    }

    handleCategoryFilter(category) {
        this.categoryFilter = category;
        this.updateClearFiltersButton();
        this.renderDecks();
    }

    clearFilters() {
        // Only clear category filter, keep search text
        this.categoryFilter = '';
        if (this.categoryFilterSelect) this.categoryFilterSelect.value = '';
        this.updateClearFiltersButton();
        this.renderDecks();
        this.announce('Category filter cleared');
    }

    updateClearFiltersButton() {
        if (!this.clearFiltersBtn) return;
        // Only show clear button when category filter is active (not for text search)
        const hasCategoryFilter = !!this.categoryFilter;
        this.clearFiltersBtn.classList.toggle('hidden', !hasCategoryFilter);
    }

    // Filter decks based on search query and category
    filterDecks(deckIndices) {
        return deckIndices.filter(idx => {
            const deck = this.decks[idx];

            // Search filter
            if (this.searchQuery) {
                const nameMatch = deck.name.toLowerCase().includes(this.searchQuery);
                const categoryMatch = deck.category && deck.category.toLowerCase().includes(this.searchQuery);
                if (!nameMatch && !categoryMatch) return false;
            }

            // Category filter
            if (this.categoryFilter) {
                if (deck.category !== this.categoryFilter) return false;
            }

            return true;
        });
    }

    // Get all categories used in decks (including custom ones)
    getAllCategories() {
        const categories = new Set();
        this.decks.forEach(deck => {
            if (deck.category) {
                categories.add(deck.category);
            }
        });
        return Array.from(categories).sort();
    }

    // Update the category filter dropdown to include custom categories
    updateCategoryFilterOptions() {
        if (!this.categoryFilterSelect) return;

        const defaultCategories = [
            'Biology', 'Chemistry', 'Physics', 'Math', 'History', 'Geography',
            'Literature', 'Language', 'Computer Science', 'Art', 'Music',
            'Psychology', 'Economics', 'Philosophy', 'Medicine', 'Law',
            'Engineering', 'Business', 'Other'
        ];

        const allCategories = this.getAllCategories();
        const customCategories = allCategories.filter(cat => !defaultCategories.includes(cat));

        // Only update if there are custom categories to add
        const existingOptions = Array.from(this.categoryFilterSelect.options).map(opt => opt.value);

        customCategories.forEach(cat => {
            if (!existingOptions.includes(cat)) {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                // Insert before "Other" option
                const otherOption = this.categoryFilterSelect.querySelector('option[value="Other"]');
                if (otherOption) {
                    this.categoryFilterSelect.insertBefore(option, otherOption);
                } else {
                    this.categoryFilterSelect.appendChild(option);
                }
            }
        });
    }

    updateSearchResultsInfo(totalDecks, filteredCount) {
        if (!this.searchResultsInfo) return;

        const hasFilters = this.searchQuery || this.categoryFilter;

        if (!hasFilters) {
            this.searchResultsInfo.classList.add('hidden');
            return;
        }

        this.searchResultsInfo.classList.remove('hidden');

        if (filteredCount === 0) {
            this.searchResultsInfo.classList.add('no-results');
            let message = 'No decks found';
            if (this.searchQuery && this.categoryFilter) {
                message += ` matching "${this.searchQuery}" in category ${this.categoryFilter}`;
            } else if (this.searchQuery) {
                message += ` matching "${this.searchQuery}"`;
            } else if (this.categoryFilter) {
                message += ` in category ${this.categoryFilter}`;
            }
            this.searchResultsInfo.textContent = message;
        } else {
            this.searchResultsInfo.classList.remove('no-results');
            // Simpler message: just show how many were found
            let message = `Found ${filteredCount} deck${filteredCount !== 1 ? 's' : ''}`;
            if (this.searchQuery && this.categoryFilter) {
                message += ` matching "${this.searchQuery}" in category ${this.categoryFilter}`;
            } else if (this.searchQuery) {
                message += ` matching "${this.searchQuery}"`;
            } else if (this.categoryFilter) {
                message += ` in category ${this.categoryFilter}`;
            }
            this.searchResultsInfo.textContent = message;
        }
    }

    // Handle category dropdown change for custom category input
    handleCategoryChange(value) {
        if (!this.customCategoryWrapper) return;

        if (value === 'Other') {
            this.customCategoryWrapper.classList.remove('hidden');
            if (this.customCategoryInput) {
                this.customCategoryInput.focus();
            }
        } else {
            this.customCategoryWrapper.classList.add('hidden');
            if (this.customCategoryInput) {
                this.customCategoryInput.value = '';
            }
        }
    }

    // Get the actual category value (handles custom category)
    getSelectedCategory() {
        const selected = this.deckCategory.value;
        if (selected === 'Other' && this.customCategoryInput && this.customCategoryInput.value.trim()) {
            return this.customCategoryInput.value.trim();
        }
        return selected === 'Other' ? 'Other' : selected;
    }

    switchTab(tabName) {
        // Update nav tabs
        this.navTabs.forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`).setAttribute('aria-selected', 'true');

        // Update tab content
        this.tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Re-render stats when switching to stats tab
        if (tabName === 'stats') {
            this.renderStats();
        }

        this.announce(`Switched to ${tabName} tab`);
    }

    loadDecks() {
        try {
            const saved = localStorage.getItem('sparkdeck-decks');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.warn('Could not load decks:', error);
            return [];
        }
    }

    saveDecks() {
        try {
            localStorage.setItem('sparkdeck-decks', JSON.stringify(this.decks));
            this.syncToCloud();
            return true;
        } catch (error) {
            console.warn('Could not save decks:', error);
            return false;
        }
    }

    // Folder persistence
    loadFolders() {
        try {
            const saved = localStorage.getItem('sparkdeck-folders');
            let folders = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(folders)) folders = [];

            // Migration: Add parentFolderId to existing folders
            folders = folders.map(folder => {
                if (!folder.hasOwnProperty('parentFolderId')) {
                    folder.parentFolderId = null; // Existing folders become root-level
                }
                return folder;
            });

            return folders;
        } catch (error) {
            console.warn('Could not load folders:', error);
            return [];
        }
    }

    saveFolders() {
        try {
            localStorage.setItem('sparkdeck-folders', JSON.stringify(this.folders));
            this.syncToCloud();
            return true;
        } catch (error) {
            console.warn('Could not save folders:', error);
            return false;
        }
    }

    // Settings persistence
    loadSettings() {
        try {
            const saved = localStorage.getItem('sparkdeck-settings');
            const defaults = {
                statsEnabled: true,
                // Vision settings
                darkMode: false,
                fontSize: 'medium', // 'small', 'medium', 'large', 'extra-large'
                highContrast: false,
                reducedMotion: false
            };
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch (error) {
            console.warn('Could not load settings:', error);
            return {
                statsEnabled: true,
                darkMode: false,
                fontSize: 'medium',
                highContrast: false,
                reducedMotion: false
            };
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('sparkdeck-settings', JSON.stringify(this.settings));
            this.syncToCloud();
            return true;
        } catch (error) {
            console.warn('Could not save settings:', error);
            return false;
        }
    }

    // Vision settings methods
    toggleDarkMode() {
        this.settings.darkMode = !this.settings.darkMode;
        this.saveSettings();
        this.applyDarkMode();
        this.updateDarkModeButton();
        this.announce(this.settings.darkMode ? 'Dark mode enabled' : 'Dark mode disabled');
    }

    applyDarkMode() {
        if (this.settings.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    updateDarkModeButton() {
        if (!this.darkModeBtn) return;
        const isOn = this.settings.darkMode;
        this.darkModeBtn.textContent = isOn ? 'On' : 'Off';
        this.darkModeBtn.setAttribute('aria-label', isOn ? 'Dark mode enabled. Click to disable.' : 'Dark mode disabled. Click to enable.');
    }

    setFontSize(size) {
        const sizes = ['small', 'medium', 'large', 'extra-large'];
        if (!sizes.includes(size) || size === this.settings.fontSize) return;
        this.settings.fontSize = size;
        this.saveSettings();
        this.applyFontSize();
        this.updateFontSizeButton();
        const sizeLabels = { 'small': 'Small', 'medium': 'Medium', 'large': 'Large', 'extra-large': 'Extra Large' };
        this.announce(`Font size: ${sizeLabels[this.settings.fontSize]}`);
    }

    applyFontSize() {
        // Remove all font size classes
        document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-extra-large');
        // Add the current font size class
        document.body.classList.add(`font-${this.settings.fontSize}`);
    }

    updateFontSizeButton() {
        if (!this.fontSizeGroup) return;
        const current = this.settings.fontSize || 'medium';
        this.fontSizeGroup.querySelectorAll('input[name="font-size"]').forEach(radio => {
            radio.checked = radio.value === current;
        });
    }

    toggleHighContrast() {
        this.settings.highContrast = !this.settings.highContrast;
        this.saveSettings();
        this.applyHighContrast();
        this.updateHighContrastButton();
        this.announce(this.settings.highContrast ? 'High contrast enabled' : 'High contrast disabled');
    }

    applyHighContrast() {
        if (this.settings.highContrast) {
            document.body.classList.add('high-contrast');
            // High contrast overrides dark mode for maximum visibility
            document.body.classList.remove('dark-mode');
        } else {
            document.body.classList.remove('high-contrast');
            // Restore dark mode if it was enabled
            if (this.settings.darkMode) {
                document.body.classList.add('dark-mode');
            }
        }
    }

    updateHighContrastButton() {
        if (!this.highContrastBtn) return;
        const isOn = this.settings.highContrast;
        this.highContrastBtn.textContent = isOn ? 'On' : 'Off';
        this.highContrastBtn.setAttribute('aria-label', isOn ? 'High contrast enabled. Click to disable.' : 'High contrast disabled. Click to enable.');
    }

    toggleReducedMotion() {
        this.settings.reducedMotion = !this.settings.reducedMotion;
        this.saveSettings();
        this.applyReducedMotion();
        this.updateReducedMotionButton();
        this.announce(this.settings.reducedMotion ? 'Reduced motion enabled' : 'Reduced motion disabled');
    }

    applyReducedMotion() {
        if (this.settings.reducedMotion) {
            document.body.classList.add('reduced-motion');
        } else {
            document.body.classList.remove('reduced-motion');
        }
    }

    updateReducedMotionButton() {
        if (!this.reducedMotionBtn) return;
        const isOn = this.settings.reducedMotion;
        this.reducedMotionBtn.textContent = isOn ? 'On' : 'Off';
        this.reducedMotionBtn.setAttribute('aria-label', isOn ? 'Reduced motion enabled. Click to disable.' : 'Reduced motion disabled. Click to enable.');
    }

    applyAllVisionSettings() {
        this.applyDarkMode();
        this.applyFontSize();
        this.applyHighContrast();
        this.applyReducedMotion();
        this.updateDarkModeButton();
        this.updateFontSizeButton();
        this.updateHighContrastButton();
        this.updateReducedMotionButton();
    }

    // Stats persistence
    loadStats() {
        try {
            const saved = localStorage.getItem('sparkdeck-stats');
            const defaults = { studySessions: [] };
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch (error) {
            console.warn('Could not load stats:', error);
            return { studySessions: [] };
        }
    }

    saveStats() {
        try {
            localStorage.setItem('sparkdeck-stats', JSON.stringify(this.stats));
            this.syncToCloud();
            return true;
        } catch (error) {
            console.warn('Could not save stats:', error);
            return false;
        }
    }

    // ---- Cloud Sync Methods ----
    // These methods handle syncing data between localStorage and the Neon database.
    // The database is the source of truth for cross-device access.
    // localStorage is the fast cache for the current session.

    // Load data received from the database into the app.
    // Called by auth.js after fetching from the api-data endpoint.
    loadFromCloud(data) {
        // End any active study/quiz session before replacing data
        if (this.currentDeck) this.endStudy();
        if (this.quizMode) this.endQuiz();

        if (data.folders && Array.isArray(data.folders)) {
            this.folders = data.folders;
            localStorage.setItem('sparkdeck-folders', JSON.stringify(this.folders));
        }

        if (data.decks && Array.isArray(data.decks)) {
            this.decks = data.decks;
            localStorage.setItem('sparkdeck-decks', JSON.stringify(this.decks));
        }

        if (data.settings) {
            this.settings = { ...this.settings, ...data.settings };
            localStorage.setItem('sparkdeck-settings', JSON.stringify(this.settings));
            this.applySettings();
        }

        if (data.stats) {
            this.stats = { ...this.stats, ...data.stats };
            localStorage.setItem('sparkdeck-stats', JSON.stringify(this.stats));
        }

        // Re-render everything with the new data
        this.populateFolderOptions(this.deckFolder);
        this.renderDecks();
        this.renderStats();
    }

    // Apply all settings (called after loading from cloud)
    applySettings() {
        this.applyAllVisionSettings();
        this.applyStatsTabVisibility();
        this.updateStatsToggleButton();
    }

    // Send all current data to the database.
    // Uses debouncing to avoid flooding the API with rapid saves.
    syncToCloud() {
        // _getAuthToken is set by auth.js after login
        if (!this._getAuthToken) return;

        // Debounce: wait 2 seconds after the last save before syncing
        if (this._syncTimeout) {
            clearTimeout(this._syncTimeout);
        }

        this._syncTimeout = setTimeout(() => {
            this._doCloudSync();
        }, 2000);
    }

    // Returns true when the cloud save succeeded, false otherwise.
    async _doCloudSync() {
        const getToken = this._getAuthToken;
        if (!getToken) return false;
        try {
            const token = await getToken();

            const data = {
                decks: this.decks || [],
                folders: this.folders || [],
                settings: this.settings || {},
                stats: this.stats || { studySessions: [] }
            };

            const response = await fetch('/.netlify/functions/api-data', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.status === 403) {
                const body = await response.json().catch(() => ({}));
                if (body && body.code === 'email_not_verified') {
                    // The server says this account is device-only. Stop trying,
                    // and let auth.js update the banner.
                    this._getAuthToken = null;
                    if (typeof this.onCloudSyncBlocked === 'function') this.onCloudSyncBlocked();
                    return false;
                }
            }

            if (!response.ok) {
                console.warn('Cloud sync failed:', response.status);
                return false;
            }
            return true;
        } catch (error) {
            // Non-fatal — localStorage still has the data
            console.warn('Cloud sync error (data saved locally):', error);
            return false;
        }
    }

    // Send any change still waiting in the 2-second debounce right away.
    // Used before signing out so the last edit isn't left behind.
    async flushCloudSync() {
        if (!this._syncTimeout) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = null;
        await this._doCloudSync();
    }

    // Drop any pending cloud save without sending it (e.g. after sign-out).
    cancelPendingCloudSync() {
        if (this._syncTimeout) clearTimeout(this._syncTimeout);
        this._syncTimeout = null;
    }

    // Re-read everything from localStorage. Used when a different person
    // signs in on this device and auth.js has swapped their data in.
    reloadFromLocal() {
        if (this.currentDeck) this.endStudy();
        if (this.quizMode) this.endQuiz();
        this.cancelPendingCloudSync();
        this.decks = this.loadDecks();
        this.folders = this.loadFolders();
        this.settings = this.loadSettings();
        this.stats = this.loadStats();
        this.currentFolderId = null;
        this.applySettings();
        this.populateFolderOptions(this.deckFolder);
        this.renderDecks();
        this.renderStats();
    }

    // Combine this device's data with what is already in the cloud, without
    // overwriting or deleting anything from either side. Used the first time
    // an account syncs after a device-only (unverified) period.
    //   - Every cloud folder, deck, and study session is kept as-is.
    //   - Local folders and decks that the cloud doesn't have are added.
    //     They are matched by name and folder location, because folder IDs
    //     change every time the server saves.
    //   - If a deck exists in both places with different cards, both are kept;
    //     the local one gets "(from this device)" added to its name.
    //   - Cloud settings are kept.
    // Returns { data, addedDecks, keptBoth, addedFolders }.
    mergeLocalIntoCloud(cloud, local) {
        const cloudFolders = Array.isArray(cloud.folders) ? cloud.folders.map(f => ({ ...f })) : [];
        const cloudDecks = Array.isArray(cloud.decks) ? cloud.decks.map(d => ({ ...d })) : [];
        const localFolders = Array.isArray(local.folders) ? local.folders : [];
        const localDecks = Array.isArray(local.decks) ? local.decks : [];

        const pathOf = (folders, id) => {
            const names = [];
            const seen = new Set();
            let cur = id ? folders.find(f => f.id === id) : null;
            while (cur && !seen.has(cur.id)) {
                seen.add(cur.id);
                names.unshift(String(cur.name).trim().toLowerCase());
                cur = cur.parentFolderId ? folders.find(f => f.id === cur.parentFolderId) : null;
            }
            return names.join('/');
        };

        // Folder path -> id in the merged result ('' is the top level).
        const folderIdByPath = new Map([['', null]]);
        cloudFolders.forEach(f => folderIdByPath.set(pathOf(cloudFolders, f.id), f.id));

        // Add local folders the cloud lacks, parents first (shorter paths first).
        let addedFolders = 0;
        const localWithPaths = localFolders
            .map(f => ({ f, path: pathOf(localFolders, f.id) }))
            .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
        localWithPaths.forEach(({ f, path }) => {
            if (!path || folderIdByPath.has(path)) return;
            const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
            const newId = `f_m${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            cloudFolders.push({
                id: newId,
                name: f.name,
                parentFolderId: folderIdByPath.get(parentPath) || null,
                created: f.created || new Date().toISOString()
            });
            folderIdByPath.set(path, newId);
            addedFolders++;
        });

        const cardsKey = (cards) => JSON.stringify((Array.isArray(cards) ? cards : []).map(c => [
            String(c.front || ''), String(c.back || ''), c.mediaUrl ? String(c.mediaUrl) : ''
        ]));
        const sameDeck = (a, b) =>
            String(a.category || '') === String(b.category || '') &&
            (a.shuffle !== false) === (b.shuffle !== false) &&
            cardsKey(a.cards) === cardsKey(b.cards);

        let addedDecks = 0;
        let keptBoth = 0;
        localDecks.forEach(localDeck => {
            const path = pathOf(localFolders, localDeck.folderId);
            const folderId = folderIdByPath.has(path) ? folderIdByPath.get(path) : null;
            const inSamePlace = (d) => (d.folderId || null) === (folderId || null);
            const nameKey = String(localDeck.name || '').trim().toLowerCase();

            const twin = cloudDecks.find(d => inSamePlace(d) && String(d.name || '').trim().toLowerCase() === nameKey);
            if (!twin) {
                cloudDecks.push({ ...localDeck, folderId });
                addedDecks++;
                return;
            }
            if (sameDeck(twin, localDeck)) return;

            // Different content: keep both. Reuse an existing identical copy
            // if a previous merge already added one.
            let copyName = `${localDeck.name} (from this device)`;
            let n = 2;
            while (true) {
                const existing = cloudDecks.find(d => inSamePlace(d) && d.name === copyName);
                if (!existing) break;
                if (sameDeck(existing, localDeck)) return;
                copyName = `${localDeck.name} (from this device ${n++})`;
            }
            cloudDecks.push({ ...localDeck, name: copyName, folderId });
            keptBoth++;
        });

        // Study history: keep every session from both sides, no duplicates.
        const sessions = [];
        const seenSessions = new Set();
        const addSessions = (list) => (Array.isArray(list) ? list : []).forEach(s => {
            const key = `${s.timestamp}|${s.deckName}|${s.cardsStudied}`;
            if (seenSessions.has(key)) return;
            seenSessions.add(key);
            sessions.push(s);
        });
        addSessions(cloud.stats && cloud.stats.studySessions);
        addSessions(local.stats && local.stats.studySessions);
        sessions.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

        return {
            data: {
                folders: cloudFolders,
                decks: cloudDecks,
                settings: cloud.settings || local.settings || {},
                stats: { ...(local.stats || {}), ...(cloud.stats || {}), studySessions: sessions }
            },
            addedDecks,
            keptBoth,
            addedFolders
        };
    }

    async resetStats() {
        const confirmed = await this.openConfirmModal({
            title: 'Reset Stats',
            message: 'Are you sure you want to reset all your study statistics? This will clear your study session history. This action cannot be undone.',
            confirmText: 'Reset',
        });

        if (!confirmed) return;

        this.stats = { studySessions: [] };
        this.saveStats();
        this.renderStats();
        this.announce('Stats have been reset');
    }

    // Stats tab toggle
    toggleStatsTab() {
        this.settings.statsEnabled = !this.settings.statsEnabled;
        this.saveSettings();
        this.updateStatsToggleButton();
        this.applyStatsTabVisibility();
        this.announce(this.settings.statsEnabled ? 'Stats tab enabled' : 'Stats tab disabled');
    }

    updateStatsToggleButton() {
        if (!this.statsToggleBtn) return;
        const enabled = this.settings.statsEnabled;
        this.statsToggleBtn.textContent = enabled ? 'Enabled' : 'Disabled';
        this.statsToggleBtn.setAttribute('aria-label',
            enabled ? 'Stats tab enabled. Click to disable.' : 'Stats tab disabled. Click to enable.'
        );
    }

    applyStatsTabVisibility() {
        if (!this.statsNavTab) return;
        if (this.settings.statsEnabled) {
            this.statsNavTab.classList.remove('hidden');
            this.statsNavTab.removeAttribute('aria-hidden');
        } else {
            this.statsNavTab.classList.add('hidden');
            this.statsNavTab.setAttribute('aria-hidden', 'true');
            // If currently on stats tab, switch to decks
            if (document.querySelector('[data-tab="stats"].active')) {
                this.switchTab('decks');
            }
        }
    }

    // Stats period selection
    setStatsPeriod(period) {
        this.currentStatsPeriod = period;

        // Update button states
        this.statsPeriodBtns.forEach(btn => {
            const isActive = btn.dataset.period === period;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive.toString());
        });

        this.renderStats();
        this.announce(`Viewing ${period} stats`);
    }

    // Record a study session
    recordStudySession(deckName, cardCount) {
        const session = {
            timestamp: new Date().toISOString(),
            deckName: deckName,
            cardsStudied: cardCount
        };
        this.stats.studySessions.push(session);
        this.saveStats();
    }

    // Calculate stats for a given period
    getStatsForPeriod(period) {
        const now = new Date();
        let startDate;

        switch (period) {
            case 'daily':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'weekly':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                break;
            case 'monthly':
                startDate = new Date(now);
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'lifetime':
            default:
                startDate = new Date(0); // Beginning of time
                break;
        }

        // Filter study sessions
        const sessions = this.stats.studySessions.filter(s => {
            const sessionDate = new Date(s.timestamp);
            return sessionDate >= startDate;
        });

        // Count decks created in period
        const decksCreated = this.decks.filter(d => {
            if (!d.created) return period === 'lifetime';
            const deckDate = new Date(d.created);
            return deckDate >= startDate;
        }).length;

        // Sum cards studied
        const cardsStudied = sessions.reduce((sum, s) => sum + (s.cardsStudied || 0), 0);

        return {
            decksCreated,
            studySessions: sessions.length,
            cardsStudied
        };
    }

    // Render stats
    renderStats() {
        const stats = this.getStatsForPeriod(this.currentStatsPeriod);

        if (this.statsDecksCount) {
            this.statsDecksCount.textContent = stats.decksCreated;
        }
        if (this.statsSessionsCount) {
            this.statsSessionsCount.textContent = stats.studySessions;
        }
        if (this.statsCardsStudied) {
            this.statsCardsStudied.textContent = stats.cardsStudied;
        }

        // Update summary message
        if (this.statsSummary) {
            const periodLabels = {
                lifetime: 'all time',
                weekly: 'the past 7 days',
                monthly: 'the past 30 days',
                daily: 'today'
            };
            const periodLabel = periodLabels[this.currentStatsPeriod];

            if (stats.studySessions === 0 && stats.decksCreated === 0) {
                this.statsSummary.innerHTML = `<p>No activity recorded for ${periodLabel}. Start studying to track your progress!</p>`;
            } else {
                this.statsSummary.innerHTML = `<p>During ${periodLabel}, you created ${stats.decksCreated} deck${stats.decksCreated !== 1 ? 's' : ''}, completed ${stats.studySessions} study session${stats.studySessions !== 1 ? 's' : ''}, and studied ${stats.cardsStudied} card${stats.cardsStudied !== 1 ? 's' : ''}.</p>`;
            }
        }
    }

    // Navigation methods for drill-down UI
    navigateToFolder(folderId) {
        this.currentFolderId = folderId;
        this.renderDecks();
        const folder = this.folders.find(f => f.id === folderId);
        if (folder) {
            this.announce(`Viewing folder: ${folder.name}`);
        }
    }

    navigateToHome() {
        this.currentFolderId = null;
        this.renderDecks();
        this.announce('Viewing all folders');
    }

    generateFolderId() {
        return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    populateFolderOptions(selectEl, selectedId = '') {
        if (!selectEl) return;
        const current = selectedId !== undefined && selectedId !== null ? selectedId : (selectEl.value || '');
        selectEl.innerHTML = '';
        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = '(No folder)';
        selectEl.appendChild(optNone);

        const foldersSorted = [...this.folders].sort((a, b) => a.name.localeCompare(b.name));
        foldersSorted.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            selectEl.appendChild(opt);
        });

        const optNew = document.createElement('option');
        optNew.value = '__NEW__';
        optNew.textContent = 'New folder…';
        selectEl.appendChild(optNew);

        selectEl.value = current;
        if (selectEl.value !== current) {
            selectEl.value = '';
        }
    }

    onDeckFolderSelectChanged(e) {
        if (e.target.value === '__NEW__') {
            this.promptAddFolder({ focusSelectAfter: true, applyToSelect: e.target });
        }
    }

    async promptAddFolder({ focusSelectAfter = false, applyToSelect = null, parentFolderId = null } = {}) {
        const isSubfolder = parentFolderId !== null && parentFolderId !== undefined;
        const parentFolder = isSubfolder ? this.folders.find(f => f.id === parentFolderId) : null;

        const title = isSubfolder ? `Create subfolder in ${parentFolder?.name || 'folder'}` : 'Create folder';

        const name = await this.openTextModal({
            title: title,
            label: 'Folder name',
            confirmText: 'Create',
        });
        if (!name || !name.trim()) {
            if (applyToSelect) applyToSelect.value = '';
            return;
        }
        const finalName = name.trim();

        // Check for duplicate names within the same parent folder
        const dup = this.folders.find(f =>
            f.name.toLowerCase() === finalName.toLowerCase() &&
            f.parentFolderId === parentFolderId
        );
        if (dup) {
            this.announce(`A folder named "${finalName}" already exists in this location.`);
            if (applyToSelect) {
                applyToSelect.value = dup.id;
            }
            return;
        }

        const folder = {
            id: this.generateFolderId(),
            name: finalName,
            parentFolderId: parentFolderId || null,
            created: new Date().toISOString()
        };
        this.folders.push(folder);
        if (this.saveFolders()) {
            const location = isSubfolder ? ` in ${parentFolder.name}` : '';
            this.announce(`Folder "${finalName}" created${location}.`);
            this.populateFolderOptions(this.deckFolder, folder.id);
            this.renderDecks();
            if (applyToSelect) {
                this.populateFolderOptions(applyToSelect, folder.id);
                applyToSelect.value = folder.id;
            }
            if (focusSelectAfter) (applyToSelect || this.deckFolder).focus();
        } else {
            this.announce('Error saving folder. Please try again.');
        }
    }

    async renameFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;
        const newName = await this.openTextModal({
            title: 'Rename folder',
            label: 'Folder name',
            initialValue: folder.name,
            confirmText: 'Rename',
        });
        if (!newName || !newName.trim()) return;
        const finalName = newName.trim();
        const dup = this.folders.find(f => f.id !== folderId && f.parentFolderId === folder.parentFolderId && f.name.toLowerCase() === finalName.toLowerCase());
        if (dup) {
            this.announce(`A folder named "${finalName}" already exists.`);
            return;
        }
        folder.name = finalName;
        if (this.saveFolders()) {
            this.populateFolderOptions(this.deckFolder, this.deckFolder.value);
            this.renderDecks();
            this.announce('Folder renamed.');
        }
    }

    async deleteFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;

        // Check for subfolders
        const subfolders = this.folders.filter(f => f.parentFolderId === folderId);
        const hasSubfolders = subfolders.length > 0;

        let message = `Delete folder "${folder.name}"?`;
        if (hasSubfolders) {
            message += ` This folder contains ${subfolders.length} subfolder${subfolders.length > 1 ? 's' : ''}. Subfolders and decks will be moved to the parent folder.`;
        } else {
            message += ` Decks will be moved to the parent folder.`;
        }

        const confirmDelete = await this.openConfirmModal({
            title: 'Delete folder',
            message: message,
            confirmText: 'Delete',
        });
        if (!confirmDelete) return;

        // Move decks to parent folder (or null if root level)
        this.decks.forEach(d => {
            if (d.folderId === folderId) {
                d.folderId = folder.parentFolderId;
            }
        });

        // Move subfolders to parent folder
        this.folders.forEach(f => {
            if (f.parentFolderId === folderId) {
                f.parentFolderId = folder.parentFolderId;
            }
        });

        // Remove the folder
        this.folders = this.folders.filter(f => f.id !== folderId);

        // Navigate to parent folder if we're viewing the deleted folder
        if (this.currentFolderId === folderId) {
            this.currentFolderId = folder.parentFolderId;
        }

        this.saveFolders();
        this.saveDecks();
        this.populateFolderOptions(this.deckFolder, this.deckFolder.value === folderId ? '' : this.deckFolder.value);
        this.renderDecks();
        this.announce('Folder deleted. Contents moved to parent folder.');
    }


    renderDecks() {
        // Update category filter options with custom categories
        this.updateCategoryFilterOptions();

        if (this.decks.length === 0 && this.folders.length === 0) {
            this.decksList.innerHTML = `
                <div class="empty-state">
                    <h3>Welcome to SparkDeck!</h3>
                    <p>Create your first deck to get started studying.</p>
                    <button type="button" class="empty-create-btn">Create Your First Deck</button>
                </div>
            `;
            const emptyCreateBtn = this.decksList.querySelector('.empty-create-btn');
            if (emptyCreateBtn) {
                emptyCreateBtn.addEventListener('click', () => this.switchTab('create'));
            }
            this.updateSearchResultsInfo(0, 0);
            return;
        }

        this.decksList.innerHTML = '';

        // Render breadcrumb navigation
        this.renderBreadcrumb();

        // Group decks by folder
        const groups = new Map();
        const filteredGroups = new Map(); // For filtered results
        let totalDeckCount = 0;
        let filteredDeckCount = 0;

        this.decks.forEach((deck, idx) => {
            const key = deck.folderId || null;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(idx);
            totalDeckCount++;
        });

        // Apply search/filter to each group
        const hasFilters = this.searchQuery || this.categoryFilter;
        for (const [folderId, deckIndices] of groups) {
            const filtered = hasFilters ? this.filterDecks(deckIndices) : deckIndices;
            filteredGroups.set(folderId, filtered);
            filteredDeckCount += filtered.length;
        }

        // Update search results info
        this.updateSearchResultsInfo(totalDeckCount, filteredDeckCount);

        const foldersSorted = [...this.folders].sort((a, b) => a.name.localeCompare(b.name));

        // If we're viewing a specific folder, show subfolders and decks
        if (this.currentFolderId) {
            const folder = this.folders.find(f => f.id === this.currentFolderId);
            if (folder) {
                const folderDecks = filteredGroups.get(this.currentFolderId) || [];
                const allFolderDecks = groups.get(this.currentFolderId) || [];
                const subfolders = this.folders.filter(f => f.parentFolderId === this.currentFolderId);
                const sortedSubfolders = [...subfolders].sort((a, b) => a.name.localeCompare(b.name));

                // Show content if there are decks (filtered or unfiltered) or subfolders
                const hasContent = allFolderDecks.length > 0 || sortedSubfolders.length > 0;

                if (!hasContent) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.className = 'empty-state';
                    emptyMsg.innerHTML = `
                        <p>This folder is empty.</p>
                        <div class="button-group">
                            <button type="button" class="empty-subfolder-btn">Create Subfolder</button>
                            <button type="button" class="empty-create-btn">Create Deck</button>
                        </div>
                    `;
                    const emptySubfolderBtn = emptyMsg.querySelector('.empty-subfolder-btn');
                    if (emptySubfolderBtn) {
                        emptySubfolderBtn.addEventListener('click', () => this.promptAddFolder({ parentFolderId: this.currentFolderId }));
                    }
                    const emptyCreateDeckBtn = emptyMsg.querySelector('.empty-create-btn');
                    if (emptyCreateDeckBtn) {
                        emptyCreateDeckBtn.addEventListener('click', () => this.switchTab('create'));
                    }
                    this.decksList.appendChild(emptyMsg);
                } else {
                    // Show "Create Subfolder" button
                    const actionSection = document.createElement('div');
                    actionSection.className = 'folder-actions-bar';
                    actionSection.innerHTML = `
                        <button type="button" class="action-subfolder-btn">Create Subfolder</button>
                    `;
                    actionSection.querySelector('.action-subfolder-btn').addEventListener('click', () => {
                        this.promptAddFolder({ parentFolderId: this.currentFolderId });
                    });
                    this.decksList.appendChild(actionSection);

                    // Show subfolders
                    if (sortedSubfolders.length > 0) {
                        const subfoldersSection = document.createElement('section');
                        subfoldersSection.className = 'subfolders-section';
                        subfoldersSection.setAttribute('aria-labelledby', 'subfolders-heading');

                        const subfoldersHeading = document.createElement('h3');
                        subfoldersHeading.id = 'subfolders-heading';
                        subfoldersHeading.textContent = 'Folders';
                        subfoldersSection.appendChild(subfoldersHeading);

                        sortedSubfolders.forEach(subfolder => {
                            const subfolderDecks = groups.get(subfolder.id) || [];
                            const subfolderCard = this.createFolderCard(subfolder, subfolderDecks.length);
                            subfoldersSection.appendChild(subfolderCard);
                        });

                        this.decksList.appendChild(subfoldersSection);
                    }

                    // Show decks
                    if (folderDecks.length > 0) {
                        const decksSection = document.createElement('section');
                        decksSection.className = 'folder-decks-section';
                        decksSection.setAttribute('aria-labelledby', 'current-folder-decks-heading');

                        const heading = document.createElement('h3');
                        heading.id = 'current-folder-decks-heading';
                        heading.textContent = `Decks (${folderDecks.length})`;
                        decksSection.appendChild(heading);

                        folderDecks.forEach(deckIndex => {
                            const deckEl = this.createDeckCard(deckIndex);
                            decksSection.appendChild(deckEl);
                        });

                        this.decksList.appendChild(decksSection);
                    }
                }
            }
            return;
        }

        // Root view: Show only root-level folders (parentFolderId === null) + unorganized decks
        // Hide folders when searching/filtering to show flat search results
        const rootFolders = foldersSorted.filter(f => !f.parentFolderId);
        if (rootFolders.length > 0 && !hasFilters) {
            const foldersSection = document.createElement('section');
            foldersSection.className = 'folders-section';
            foldersSection.setAttribute('aria-labelledby', 'folders-heading');

            const foldersHeading = document.createElement('h3');
            foldersHeading.id = 'folders-heading';
            foldersHeading.textContent = 'Folders';
            foldersSection.appendChild(foldersHeading);

            rootFolders.forEach(folder => {
                const folderId = folder.id;
                const folderDecks = groups.get(folderId) || [];
                const deckCount = folderDecks.length;

                const folderCard = this.createFolderCard(folder, deckCount);
                foldersSection.appendChild(folderCard);
            });

            this.decksList.appendChild(foldersSection);
        }

        // When filtering, show results under "Search Results" heading
        // Otherwise show under "My Decks"
        const unorganizedDecks = filteredGroups.get(null) || [];
        const allUnorganizedDecks = groups.get(null) || [];

        if (hasFilters) {
            // Show Search Results section when filtering
            const resultsSection = document.createElement('section');
            resultsSection.className = 'search-results-section';
            resultsSection.setAttribute('aria-labelledby', 'search-results-heading');

            const resultsHeading = document.createElement('h3');
            resultsHeading.id = 'search-results-heading';
            resultsHeading.textContent = `Search Results (${filteredDeckCount})`;
            resultsSection.appendChild(resultsHeading);

            if (filteredDeckCount > 0) {
                // Show all filtered decks (from all folders) in one list
                for (const [folderId, deckIndices] of filteredGroups) {
                    deckIndices.forEach(deckIndex => {
                        const deckEl = this.createDeckCard(deckIndex);
                        resultsSection.appendChild(deckEl);
                    });
                }
            } else {
                const noResults = document.createElement('p');
                noResults.className = 'empty-state';
                noResults.textContent = 'No decks match your search criteria.';
                resultsSection.appendChild(noResults);
            }

            this.decksList.appendChild(resultsSection);
        } else if (allUnorganizedDecks.length > 0) {
            // Normal view - show My Decks
            const myDecksSection = document.createElement('section');
            myDecksSection.className = 'my-decks-section';
            myDecksSection.setAttribute('aria-labelledby', 'my-decks-heading');

            const myDecksHeading = document.createElement('h3');
            myDecksHeading.id = 'my-decks-heading';
            myDecksHeading.textContent = 'My Decks';
            myDecksSection.appendChild(myDecksHeading);

            unorganizedDecks.forEach(deckIndex => {
                const deckEl = this.createDeckCard(deckIndex);
                myDecksSection.appendChild(deckEl);
            });

            this.decksList.appendChild(myDecksSection);
        }
    }

    // Build folder path from current folder to root
    getFolderPath(folderId) {
        const path = [];
        let currentId = folderId;

        while (currentId) {
            const folder = this.folders.find(f => f.id === currentId);
            if (!folder) break;
            path.unshift(folder); // Add to beginning
            currentId = folder.parentFolderId;
        }

        return path;
    }

    // Count total items in folder (decks + subfolders recursively)
    countFolderItems(folderId) {
        // Count direct decks
        let count = this.decks.filter(d => d.folderId === folderId).length;

        // Count subfolders recursively
        const subfolders = this.folders.filter(f => f.parentFolderId === folderId);
        subfolders.forEach(subfolder => {
            count += this.countFolderItems(subfolder.id);
        });

        return count;
    }

    renderBreadcrumb() {
        const breadcrumbNav = document.createElement('nav');
        breadcrumbNav.setAttribute('aria-label', 'Breadcrumb');
        breadcrumbNav.className = 'breadcrumb-nav';

        const breadcrumbList = document.createElement('ol');
        breadcrumbList.className = 'breadcrumb';

        // Home link
        const homeItem = document.createElement('li');
        homeItem.className = 'breadcrumb-item';

        if (this.currentFolderId) {
            const homeLink = document.createElement('button');
            homeLink.type = 'button';
            homeLink.className = 'breadcrumb-link';
            homeLink.textContent = 'Home';
            homeLink.setAttribute('aria-label', 'Navigate to home');
            homeLink.onclick = () => this.navigateToHome();
            homeItem.appendChild(homeLink);
        } else {
            homeItem.textContent = 'Home';
            homeItem.setAttribute('aria-current', 'page');
        }

        breadcrumbList.appendChild(homeItem);

        // Build full path to current folder
        if (this.currentFolderId) {
            const folderPath = this.getFolderPath(this.currentFolderId);

            folderPath.forEach((folder, index) => {
                // Separator
                const separator = document.createElement('li');
                separator.className = 'breadcrumb-separator';
                separator.setAttribute('aria-hidden', 'true');
                separator.textContent = '›';
                breadcrumbList.appendChild(separator);

                // Folder item
                const folderItem = document.createElement('li');
                folderItem.className = 'breadcrumb-item';

                const isLast = index === folderPath.length - 1;

                if (isLast) {
                    // Current folder - not clickable
                    folderItem.textContent = folder.name;
                    folderItem.setAttribute('aria-current', 'page');
                } else {
                    // Parent folder - clickable
                    const folderLink = document.createElement('button');
                    folderLink.type = 'button';
                    folderLink.className = 'breadcrumb-link';
                    folderLink.textContent = folder.name;
                    folderLink.setAttribute('aria-label', `Navigate to ${folder.name}`);
                    folderLink.onclick = () => this.navigateToFolder(folder.id);
                    folderItem.appendChild(folderLink);
                }

                breadcrumbList.appendChild(folderItem);
            });
        }

        breadcrumbNav.appendChild(breadcrumbList);
        this.decksList.appendChild(breadcrumbNav);
    }

    createFolderCard(folder, deckCount) {
        const folderCard = document.createElement('article');
        folderCard.className = 'folder-card';
        folderCard.setAttribute('aria-labelledby', `folder-title-${folder.id}`);

        const folderButton = document.createElement('button');
        folderButton.type = 'button';
        folderButton.className = 'folder-card-button';
        folderButton.setAttribute('role', 'heading');
        folderButton.setAttribute('aria-level', '4');

        // Count subfolders
        const subfolderCount = this.folders.filter(f => f.parentFolderId === folder.id).length;

        // Build count text
        let countParts = [];
        if (deckCount > 0) countParts.push(`${deckCount} ${deckCount === 1 ? 'deck' : 'decks'}`);
        if (subfolderCount > 0) countParts.push(`${subfolderCount} ${subfolderCount === 1 ? 'folder' : 'folders'}`);
        const countText = countParts.length > 0 ? countParts.join(', ') : 'Empty';

        const safeFolderName = this.escapeHtml(folder.name);
        folderButton.setAttribute('aria-label', `Open folder ${folder.name}, contains ${countText}`);
        folderButton.onclick = () => this.navigateToFolder(folder.id);

        folderButton.innerHTML = `
            <div class="folder-card-icon">📁</div>
            <div class="folder-card-content">
                <h4 id="folder-title-${folder.id}" class="folder-card-title">${safeFolderName}</h4>
                <p class="folder-card-count">${countText}</p>
            </div>
        `;

        folderCard.appendChild(folderButton);

        // Folder actions (rename/delete)
        const folderActions = document.createElement('div');
        folderActions.className = 'folder-actions';
        folderActions.innerHTML = `
            <button type="button" class="folder-rename-btn" aria-label="Rename folder ${safeFolderName}">Rename</button>
            <button type="button" class="folder-delete-btn" aria-label="Delete folder ${safeFolderName}">Delete</button>
        `;
        folderActions.querySelector('.folder-rename-btn').addEventListener('click', () => {
            this.renameFolder(folder.id);
        });
        folderActions.querySelector('.folder-delete-btn').addEventListener('click', () => {
            this.deleteFolder(folder.id);
        });
        folderCard.appendChild(folderActions);

        return folderCard;
    }

    createDeckCard(deckIndex) {
        const deck = this.decks[deckIndex];
        const deckEl = document.createElement('article');
        deckEl.className = 'deck-card';
        deckEl.setAttribute('aria-labelledby', `deck-title-${deckIndex}`);
        const menuId = `deck-menu-${deckIndex}`;
        const menuBtnId = `deck-menu-btn-${deckIndex}`;

        const safeName = this.escapeHtml(deck.name);
        const safeCategory = this.escapeHtml(deck.category);
        const quizBlocked = deck.cards.length < 4;
        deckEl.innerHTML = `
            <div class="deck-header">
                <h4 id="deck-title-${deckIndex}" class="deck-title">${safeName}</h4>
                <div class="deck-menu-container">
                    <button type="button"
                            id="${menuBtnId}"
                            class="deck-menu-btn"
                            aria-haspopup="menu"
                            aria-expanded="false"
                            aria-controls="${menuId}"
                            aria-label="Actions for ${safeName}">⋮</button>
                    <div id="${menuId}"
                         class="deck-menu"
                         role="menu"
                         aria-labelledby="${menuBtnId}"
                         hidden>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="study" data-deck-index="${deckIndex}">Study</button>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="quiz" data-deck-index="${deckIndex}" ${quizBlocked ? `disabled aria-describedby="quiz-note-${deckIndex}"` : ''}>Quiz${quizBlocked ? ' (needs 4 cards)' : ''}</button>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="edit" data-deck-index="${deckIndex}">Edit Cards</button>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="export" data-deck-index="${deckIndex}">Export Backup File (JSON)</button>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="export-csv" data-deck-index="${deckIndex}">Export Spreadsheet (CSV)</button>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="export-text" data-deck-index="${deckIndex}">Export Text File</button>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="move" data-deck-index="${deckIndex}">Move to Folder…</button>
                        <button type="button" role="menuitem" class="deck-menu-item" data-action="toggle-shuffle" data-deck-index="${deckIndex}">${deck.shuffle === false ? 'Enable Shuffle' : 'Disable Shuffle'}</button>
                        <div class="deck-menu-separator" role="separator"></div>
                        <button type="button" role="menuitem" class="deck-menu-item deck-menu-item--danger" data-action="delete" data-deck-index="${deckIndex}">Delete</button>
                    </div>
                </div>
            </div>
            <p>${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''} &bull; ${safeCategory}${deck.shuffle === false ? ' &bull; Sequential' : ''}</p>
            <div class="button-group deck-actions">
                <button type="button" class="deck-study-btn" data-deck-index="${deckIndex}" aria-label="Study deck ${safeName}">Study</button>
                <button type="button" class="deck-quiz-btn" data-deck-index="${deckIndex}" aria-label="Quiz deck ${safeName}" ${quizBlocked ? `disabled aria-describedby="quiz-note-${deckIndex}"` : ''}>Quiz</button>
            </div>
            ${quizBlocked ? `<p id="quiz-note-${deckIndex}" class="quiz-disabled-note">Quiz unlocks at 4 cards. This deck has ${deck.cards.length}, so add ${4 - deck.cards.length} more. To add cards, open the "Actions for ${safeName}" button next to the deck name and choose Edit Cards.</p>` : ''}
        `;

        // Setup menu button
        const menuBtn = deckEl.querySelector(`#${menuBtnId}`);
        const menu = deckEl.querySelector(`#${menuId}`);

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDeckMenu(menuBtn, menu);
        });

        // Setup menu items
        const menuItems = menu.querySelectorAll('[role="menuitem"]');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                // Close menu first before any action
                this.closeDeckMenu(menuBtn, menu, false);
                // For export, blur after menu closes so save dialog can focus
                if (action && action.startsWith('export')) {
                    document.activeElement?.blur();
                }
                this.handleDeckMenuAction(e.target);
            });
        });

        // Setup keyboard navigation for menu
        this.setupDeckMenuKeyboard(menuBtn, menu, menuItems);

        // Setup deck card Study/Quiz buttons
        const studyBtn = deckEl.querySelector('.deck-study-btn');
        if (studyBtn) {
            studyBtn.addEventListener('click', () => {
                this.startStudy(parseInt(studyBtn.dataset.deckIndex, 10));
            });
        }
        const quizBtn = deckEl.querySelector('.deck-quiz-btn');
        if (quizBtn) {
            quizBtn.addEventListener('click', () => {
                this.promptQuizMode(parseInt(quizBtn.dataset.deckIndex, 10));
            });
        }

        return deckEl;
    }

    toggleDeckMenu(btn, menu) {
        const isOpen = !menu.hidden;
        if (isOpen) {
            this.closeDeckMenu(btn, menu);
        } else {
            this.openDeckMenu(btn, menu);
        }
    }

    openDeckMenu(btn, menu) {
        // Close any other open menus first
        document.querySelectorAll('.deck-menu:not([hidden])').forEach(openMenu => {
            const openBtn = document.querySelector(`[aria-controls="${openMenu.id}"]`);
            if (openBtn) this.closeDeckMenu(openBtn, openMenu);
        });

        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');

        // Focus first menu item
        const firstItem = menu.querySelector('[role="menuitem"]');
        if (firstItem) firstItem.focus();

        // Close on outside click
        const closeHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== btn) {
                this.closeDeckMenu(btn, menu);
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    closeDeckMenu(btn, menu, restoreFocus = true) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (restoreFocus) {
            btn.focus();
        }
    }

    setupDeckMenuKeyboard(btn, menu, items) {
        const itemsArray = Array.from(items);

        btn.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.openDeckMenu(btn, menu);
            }
        });

        menu.addEventListener('keydown', (e) => {
            const currentIndex = itemsArray.indexOf(document.activeElement);

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    const nextIndex = (currentIndex + 1) % itemsArray.length;
                    itemsArray[nextIndex].focus();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    const prevIndex = (currentIndex - 1 + itemsArray.length) % itemsArray.length;
                    itemsArray[prevIndex].focus();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.closeDeckMenu(btn, menu);
                    break;
                case 'Tab':
                    this.closeDeckMenu(btn, menu);
                    break;
                case 'Home':
                    e.preventDefault();
                    itemsArray[0].focus();
                    break;
                case 'End':
                    e.preventDefault();
                    itemsArray[itemsArray.length - 1].focus();
                    break;
            }
        });
    }

    async handleDeckMenuAction(menuItem) {
        const action = menuItem.dataset.action;
        const deckIndex = parseInt(menuItem.dataset.deckIndex, 10);

        switch (action) {
            case 'study':
                this.startStudy(deckIndex);
                break;
            case 'quiz':
                this.promptQuizMode(deckIndex);
                break;
            case 'edit':
                this.editDeck(deckIndex);
                break;
            case 'export':
                this.exportDeck(deckIndex);
                break;
            case 'export-csv':
                this.exportDeckAs(deckIndex, 'csv');
                break;
            case 'export-text':
                this.exportDeckAs(deckIndex, 'text');
                break;
            case 'move':
                await this.promptMoveDeck(deckIndex);
                break;
            case 'toggle-shuffle':
                this.toggleDeckShuffle(deckIndex);
                break;
            case 'delete':
                await this.deleteDeck(deckIndex);
                break;
        }
    }

    editDeck(deckIndex) {
        const deck = this.decks[deckIndex];
        if (!deck) return;

        // Store editing state
        this.editingDeckIndex = deckIndex;
        this.editingCardIndex = null;

        // Load deck data into form
        this.deckName.value = deck.name;

        // Handle category - check if it's a predefined category or custom
        const predefinedCategories = [
            'Biology', 'Chemistry', 'Physics', 'Math', 'History', 'Geography',
            'Literature', 'Language', 'Computer Science', 'Art', 'Music',
            'Psychology', 'Economics', 'Philosophy', 'Medicine', 'Law',
            'Engineering', 'Business'
        ];
        const deckCategory = deck.category || 'Other';

        if (deckCategory === 'Other') {
            // Category is "Other" - show custom field empty so user can optionally customize
            this.deckCategory.value = 'Other';
            if (this.customCategoryWrapper) this.customCategoryWrapper.classList.remove('hidden');
            if (this.customCategoryInput) this.customCategoryInput.value = '';
        } else if (predefinedCategories.includes(deckCategory)) {
            // Standard predefined category
            this.deckCategory.value = deckCategory;
            if (this.customCategoryWrapper) this.customCategoryWrapper.classList.add('hidden');
            if (this.customCategoryInput) this.customCategoryInput.value = '';
        } else {
            // Custom category - show custom field with the value
            this.deckCategory.value = 'Other';
            if (this.customCategoryWrapper) this.customCategoryWrapper.classList.remove('hidden');
            if (this.customCategoryInput) this.customCategoryInput.value = deckCategory;
        }

        this.populateFolderOptions(this.deckFolder, deck.folderId || '');
        this.deckFolder.value = deck.folderId || '';

        // Load shuffle setting (default to true for old decks without the property)
        if (this.deckShuffle) this.deckShuffle.checked = deck.shuffle !== false;

        // Load cards into tempCards (create copies to avoid mutating original)
        this.tempCards = deck.cards.map(card => ({ ...card }));

        // Switch to Create tab and show manual mode
        this.switchTab('create');
        this.setCreationMode('manual');

        // Update UI for edit mode
        this.updateCreateTabForEditMode();

        // Show card preview
        this.showPreview();

        this.announce(`Editing deck "${deck.name}" with ${deck.cards.length} cards.`);
        this.deckName.focus();
    }

    updateCreateTabForEditMode() {
        const isEditing = this.editingDeckIndex !== null;
        const isEditingCard = this.editingCardIndex !== null;

        // Update heading
        if (this.createTabHeading) {
            if (isEditing) {
                const deck = this.decks[this.editingDeckIndex];
                this.createTabHeading.textContent = `Edit Deck: ${deck ? deck.name : ''}`;
            } else {
                this.createTabHeading.textContent = 'Create New Deck';
            }
        }

        // Update save button
        if (this.saveDeckBtn) {
            this.saveDeckBtn.textContent = isEditing ? 'Save Changes' : 'Save Deck';
        }

        // Update add card button
        if (this.addCardBtn) {
            this.addCardBtn.textContent = isEditingCard ? 'Update Card' : 'Add This Card';
        }

        // Show/hide cancel card edit button
        if (this.cancelCardEditBtn) {
            this.cancelCardEditBtn.classList.toggle('hidden', !isEditingCard);
        }
    }

    cancelEditCard() {
        this.editingCardIndex = null;
        this.cardFront.value = '';
        this.cardBack.value = '';
        if (this.cardMediaInput) this.cardMediaInput.value = '';
        this.updateCreateTabForEditMode();
        this.showPreview();
        this.announce('Card edit cancelled.');
        this.cardFront.focus();
    }

    editCard(index) {
        if (index < 0 || index >= this.tempCards.length) return;

        const card = this.tempCards[index];

        // Store editing state
        this.editingCardIndex = index;

        // Populate form with card data
        this.cardFront.value = card.front;
        this.cardBack.value = card.back;
        if (this.cardMediaInput) {
            this.cardMediaInput.value = card.mediaUrl || '';
        }

        // Show manual mode if not already visible
        this.setCreationMode('manual');

        // Update UI
        this.updateCreateTabForEditMode();
        this.showPreview();

        this.announce(`Editing card ${index + 1}. Update the fields and click Update Card.`);
        this.cardFront.focus();
    }

    async promptMoveDeck(deckIndex) {
        const deck = this.decks[deckIndex];
        if (!deck) return;

        // Build folder options
        const foldersSorted = [...this.folders].sort((a, b) => a.name.localeCompare(b.name));
        const options = [{ value: '', label: '(No folder)' }];
        foldersSorted.forEach(f => options.push({ value: f.id, label: f.name }));

        const currentFolder = deck.folderId || '';
        const currentFolderName = deck.folderId
            ? (this.folders.find(f => f.id === deck.folderId)?.name || 'Unknown')
            : '(No folder)';

        const newFolderId = await this.openSelectModal({
            title: `Move "${deck.name}"`,
            label: 'Select destination folder:',
            options: options,
            initialValue: currentFolder,
            confirmText: 'Move',
        });

        if (newFolderId === null) return; // Cancelled

        deck.folderId = newFolderId || null;
        this.saveDecks();
        this.renderDecks();

        const newFolderName = newFolderId
            ? (this.folders.find(f => f.id === newFolderId)?.name || 'Unknown')
            : '(No folder)';
        this.announce(`Moved "${deck.name}" to ${newFolderName}.`);
    }

    setCreationMode(mode) {
        this.creationMode = mode;
        this.autoInput.classList.toggle('hidden', mode !== 'auto');
        this.manualInput.classList.toggle('hidden', mode !== 'manual');

        if (mode === 'auto') {
            this.notesInput.focus();
            this.announce('Auto-generate mode selected. Paste your notes.');
        } else {
            this.cardFront.focus();
            this.announce('Manual mode selected. Create cards one at a time.');
        }
    }

    // Show a visible message under the Generate button. The element is a
    // role="status" live region, so screen readers hear it too.
    setGenerateStatus(message, type) {
        if (!this.generateStatus) return;
        this.generateStatus.classList.remove('is-error', 'is-success');
        if (type) this.generateStatus.classList.add(`is-${type}`);
        this.generateStatus.textContent = message || '';
    }

    generateCards() {
        const notes = this.notesInput.value.trim();
        if (!notes) {
            this.setGenerateStatus('Please paste your study notes into the box above first.', 'error');
            this.notesInput.focus();
            return;
        }

        const newCards = this.parseNotes(notes);

        if (newCards.length === 0) {
            this.setGenerateStatus(
                'No cards could be made from these notes. Put each item on its own line, as either a question ending in a question mark with the answer on the next line, "Term: definition", or "Term - definition". Open Help for more examples.',
                'error'
            );
            this.soundManager.play('wrong');
            return;
        }

        // Add to any cards already in this deck instead of replacing them.
        this.tempCards = (this.tempCards || []).concat(newCards);
        this.showPreview();

        const made = `${newCards.length} card${newCards.length !== 1 ? 's' : ''}`;
        this.setGenerateStatus(
            `Made ${made}. This deck now has ${this.tempCards.length} card${this.tempCards.length !== 1 ? 's' : ''}. Check them in the Cards Preview below, then select Save Deck. Cards are not saved until you do.`,
            'success'
        );
        if (this.cardsPreview && typeof this.cardsPreview.scrollIntoView === 'function') {
            const reduce = this.settings.reducedMotion ||
                (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            this.cardsPreview.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        }
    }

    parseNotes(notes) {
        const cards = [];
        const lines = notes.split('\n').map(line => line.trim()).filter(line => line);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes('?') && i + 1 < lines.length) {
                const question = line;
                const answer = lines[i + 1];
                if (!answer.includes('?')) {
                    cards.push({ front: question, back: answer });
                    i++;
                }
            }
            else if (line.toLowerCase().startsWith('definition:')) {
                const term = line.substring(11).trim();
                if (i + 1 < lines.length) {
                    const definition = lines[i + 1];
                    cards.push({ front: `What is ${term}?`, back: definition });
                    i++;
                }
            }
            else if (/\s[-\u2013\u2014]\s/.test(line) && !line.includes('?') && !line.includes(':')) {
                // "Term - definition" (hyphen, en dash, or em dash with spaces around it)
                const match = line.match(/^(.+?)\s[-\u2013\u2014]\s(.+)$/);
                if (match) {
                    const term = match[1].trim();
                    const definition = match[2].trim();
                    if (term && definition.length > 10) {
                        cards.push({ front: `What is ${term}?`, back: definition });
                    }
                }
            }
            else if (line.includes(':') && !line.includes('?')) {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const term = parts[0].trim();
                    const definition = parts.slice(1).join(':').trim();
                    if (definition.length > 10) {
                        cards.push({ front: `What is ${term}?`, back: definition });
                    }
                }
            }
        }

        return cards;
    }

    addManualCard() {
        const front = this.cardFront.value.trim();
        const back = this.cardBack.value.trim();
        const mediaUrl = this.cardMediaInput ? this.cardMediaInput.value.trim() : '';

        if (!front || !back) {
            this.announce('Please fill in both the front and back of the card.');
            if (!front) this.cardFront.focus();
            else this.cardBack.focus();
            return;
        }

        const cardData = { front, back };
        if (mediaUrl) {
            cardData.mediaUrl = mediaUrl;
        }

        if (this.editingCardIndex !== null) {
            // Update existing card
            this.tempCards[this.editingCardIndex] = cardData;
            this.announce(`Card ${this.editingCardIndex + 1} updated.`);
            this.editingCardIndex = null;
        } else {
            // Add new card
            this.tempCards.push(cardData);
            this.announce(`Card added. You now have ${this.tempCards.length} cards.`);
        }

        // Clear form
        this.cardFront.value = '';
        this.cardBack.value = '';
        if (this.cardMediaInput) this.cardMediaInput.value = '';

        this.updateCreateTabForEditMode();
        this.showPreview();
        this.cardFront.focus();
    }

    showPreview() {
        this.previewCards.innerHTML = '';
        this.tempCards.forEach((card, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = 'deck-card';

            // Highlight card being edited
            if (this.editingCardIndex === index) {
                cardElement.classList.add('editing');
            }

            cardElement.innerHTML = `
                <div class="deck-header">
                    <span>Card ${index + 1}</span>
                    <div class="card-actions">
                        <button type="button" class="card-edit-btn" aria-label="Edit card ${index + 1}">Edit</button>
                        <button type="button" class="card-remove-btn" aria-label="Remove card ${index + 1}">Remove</button>
                    </div>
                </div>
                <p><strong>Front:</strong> ${this.escapeHtml(card.front)}</p>
                <p><strong>Back:</strong> ${this.escapeHtml(card.back)}</p>
                ${card.mediaUrl ? `<p><strong>Link:</strong> ${this.escapeHtml(card.mediaUrl)}</p>` : ''}
            `;
            cardElement.querySelector('.card-edit-btn').addEventListener('click', () => this.editCard(index));
            cardElement.querySelector('.card-remove-btn').addEventListener('click', () => this.removeCard(index));
            this.previewCards.appendChild(cardElement);
        });

        this.cardsPreview.classList.remove('hidden');
    }

    removeCard(index) {
        this.tempCards.splice(index, 1);

        // Adjust editingCardIndex if a card is removed during editing
        if (this.editingCardIndex !== null && this.editingCardIndex !== undefined) {
            if (index === this.editingCardIndex) {
                // The card being edited was removed — cancel edit
                this.editingCardIndex = null;
                this.cardFront.value = '';
                this.cardBack.value = '';
                if (this.cardMediaInput) this.cardMediaInput.value = '';
                if (this.addCardBtn) this.addCardBtn.textContent = 'Add Card';
                if (this.cancelCardEditBtn) this.cancelCardEditBtn.classList.add('hidden');
            } else if (index < this.editingCardIndex) {
                this.editingCardIndex--;
            }
        }

        if (this.tempCards.length === 0) {
            this.cardsPreview.classList.add('hidden');
        } else {
            this.showPreview();
        }
        this.announce(`Card removed. ${this.tempCards.length} cards remaining.`);
    }

    saveDeck() {
        const name = this.deckName.value.trim();
        const category = this.getSelectedCategory();
        const folderId = this.deckFolder.value || null;
        const shuffle = this.deckShuffle ? this.deckShuffle.checked : true;

        if (!name) {
            this.announce('Please enter a deck name.');
            this.deckName.focus();
            return;
        }

        if (this.tempCards.length === 0) {
            this.announce('Please create at least one card before saving.');
            return;
        }

        if (this.editingDeckIndex !== null) {
            // Update existing deck
            const existingDeck = this.decks[this.editingDeckIndex];
            existingDeck.name = name;
            existingDeck.category = category;
            existingDeck.folderId = folderId;
            existingDeck.shuffle = shuffle;
            existingDeck.cards = this.tempCards;
            // Keep original created date

            if (this.saveDecks()) {
                this.announce(`Deck "${name}" updated successfully with ${this.tempCards.length} cards.`);
                this.renderDecks();
                this.resetCreateForm();
                this.switchTab('decks');
            } else {
                this.announce('Error saving deck. Please try again.');
            }
        } else {
            // Create new deck
            const deck = { name, category, folderId, shuffle, cards: this.tempCards, created: new Date().toISOString() };

            this.decks.push(deck);
            if (this.saveDecks()) {
                this.announce(`Deck "${name}" saved successfully with ${this.tempCards.length} cards.`);
                this.renderDecks();
                this.resetCreateForm();
                this.switchTab('decks');
            } else {
                this.announce('Error saving deck. Please try again.');
            }
        }
    }

    async cancelDeck() {
        if (this.tempCards.length > 0) {
            const ok = await this.openConfirmModal({
                title: 'Discard deck?',
                message: 'Are you sure you want to cancel? All unsaved cards will be lost.',
                confirmText: 'Discard',
            });
            if (!ok) return;
        }
        this.resetCreateForm();
        this.switchTab('decks');
    }

    resetCreateForm() {
        this.setGenerateStatus('');
        this.deckName.value = '';
        this.deckCategory.value = 'Biology';
        this.notesInput.value = '';
        this.cardFront.value = '';
        this.cardBack.value = '';
        if (this.cardMediaInput) this.cardMediaInput.value = '';
        this.tempCards = [];
        this.creationMode = null;
        this.editingDeckIndex = null;
        this.editingCardIndex = null;
        this.autoInput.classList.add('hidden');
        this.manualInput.classList.add('hidden');
        this.cardsPreview.classList.add('hidden');
        this.populateFolderOptions(this.deckFolder);
        this.deckFolder.value = '';
        // Reset custom category
        if (this.customCategoryWrapper) this.customCategoryWrapper.classList.add('hidden');
        if (this.customCategoryInput) this.customCategoryInput.value = '';
        // Reset shuffle to default (on)
        if (this.deckShuffle) this.deckShuffle.checked = true;
        this.updateCreateTabForEditMode();
    }

    toggleDeckShuffle(deckIndex) {
        const deck = this.decks[deckIndex];
        if (!deck) return;
        deck.shuffle = deck.shuffle === false ? true : false;
        this.saveDecks();
        this.renderDecks();
        const state = deck.shuffle ? 'enabled' : 'disabled';
        this.announce(`Shuffle ${state} for "${deck.name}".`);
    }

    async deleteDeck(index) {
        const deck = this.decks[index];
        const ok = await this.openConfirmModal({
            title: 'Delete deck',
            message: `Are you sure you want to delete "${deck.name}"?`,
            confirmText: 'Delete',
        });
        if (!ok) return;
        this.decks.splice(index, 1);
        this.saveDecks();
        this.renderDecks();
        this.announce(`Deck "${deck.name}" deleted.`);
    }

    // Shuffle array in place (Fisher-Yates algorithm)
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    startStudy(deckIndex) {
        const deck = this.decks[deckIndex];
        if (!deck || !deck.cards || deck.cards.length === 0) {
            this.announce('This deck has no cards to study.');
            return;
        }
        // Prevent double-click re-entry
        if (this.currentDeck) return;

        this.soundManager.play('enterStudy');

        // Create a copy of the cards, shuffled unless deck has shuffle disabled
        const shouldShuffle = deck.shuffle !== false;
        this.currentDeck = {
            ...deck,
            cards: shouldShuffle ? this.shuffleArray(deck.cards) : [...deck.cards]
        };
        this.currentCardIndex = 0;
        this.showingFront = true;

        // Record the study session for stats
        this.recordStudySession(this.currentDeck.name, this.currentDeck.cards.length);
        this.renderStats();

        // Show study overlay
        this.studyOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        this.displayCurrentCard();
        const orderText = shouldShuffle ? 'shuffled' : 'in order';
        this.announce(`Started studying "${deck.name}" with ${deck.cards.length} cards ${orderText}.`);
        this.flashcard.focus();
    }

    displayCurrentCard() {
        if (!this.currentDeck || !this.currentDeck.cards.length) return;

        const card = this.currentDeck.cards[this.currentCardIndex];
        const progress = Math.round(((this.currentCardIndex + 1) / this.currentDeck.cards.length) * 100);

        this.studyProgress.textContent = `Card ${this.currentCardIndex + 1} of ${this.currentDeck.cards.length}`;
        this.progressFill.style.width = `${progress}%`;

        const content = this.showingFront ? card.front : card.back;
        const side = this.showingFront ? 'front' : 'back';

        this.cardContent.textContent = content;
        const hasMedia = !this.showingFront && this.getSafeMediaUrl(card.mediaUrl);
        this.flashcard.setAttribute('aria-label',
            `Card ${this.currentCardIndex + 1} of ${this.currentDeck.cards.length}, showing ${side}. ${content}.${hasMedia ? ' This card has a video link below.' : ''} Press Space or Enter to flip.`
        );
        this.renderCardMedia(card);

        this.prevBtn.disabled = this.currentCardIndex === 0;
        this.nextBtn.disabled = this.currentCardIndex === this.currentDeck.cards.length - 1;
    }

    // Only allow http(s) links; anything else is ignored.
    getSafeMediaUrl(url) {
        if (typeof url !== 'string') return null;
        const trimmed = url.trim();
        return /^https?:\/\//i.test(trimmed) ? trimmed : null;
    }

    // Returns the 11-character video ID for common YouTube link formats, or null.
    getYouTubeId(url) {
        try {
            const u = new URL(url);
            const host = u.hostname.replace(/^www\.|^m\./, '');
            let id = null;
            if (host === 'youtu.be') {
                id = u.pathname.slice(1).split('/')[0];
            } else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
                if (u.pathname === '/watch') id = u.searchParams.get('v');
                else {
                    const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
                    if (m) id = m[2];
                }
            }
            return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
        } catch (_) {
            return null;
        }
    }

    // Show the card's link under the flashcard, on the back side only.
    renderCardMedia(card) {
        const area = this.cardMediaArea;
        if (!area) return;
        area.innerHTML = '';
        const url = this.showingFront ? null : this.getSafeMediaUrl(card && card.mediaUrl);
        if (!url) {
            area.classList.add('hidden');
            return;
        }
        area.classList.remove('hidden');

        const youTubeId = this.getYouTubeId(url);
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = youTubeId ? 'Open the video on YouTube (opens in a new tab)' : 'Open the linked resource (opens in a new tab)';

        if (youTubeId) {
            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.className = 'secondary-btn';
            playBtn.textContent = 'Play video here';
            playBtn.setAttribute('aria-expanded', 'false');
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const existing = area.querySelector('.media-embed-wrapper');
                if (existing) {
                    existing.remove();
                    playBtn.textContent = 'Play video here';
                    playBtn.setAttribute('aria-expanded', 'false');
                    return;
                }
                const wrapper = document.createElement('div');
                wrapper.className = 'media-embed-wrapper';
                const iframe = document.createElement('iframe');
                iframe.src = `https://www.youtube-nocookie.com/embed/${youTubeId}`;
                iframe.title = 'Video for this card';
                iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
                iframe.allowFullscreen = true;
                iframe.referrerPolicy = 'strict-origin-when-cross-origin';
                wrapper.appendChild(iframe);
                area.appendChild(wrapper);
                playBtn.textContent = 'Hide video';
                playBtn.setAttribute('aria-expanded', 'true');
                iframe.focus();
            });
            const row = document.createElement('div');
            row.className = 'button-group';
            row.style.justifyContent = 'center';
            row.style.alignItems = 'center';
            row.appendChild(playBtn);
            row.appendChild(link);
            area.appendChild(row);
        } else {
            const p = document.createElement('p');
            p.appendChild(link);
            area.appendChild(p);
        }
    }

    flipCard() {
        if (!this.currentDeck) return;

        this.soundManager.play('flip');
        this.showingFront = !this.showingFront;
        this.displayCurrentCard();

        const side = this.showingFront ? 'front' : 'back';
        const currentCard = this.currentDeck.cards[this.currentCardIndex];
        const content = currentCard[this.showingFront ? 'front' : 'back'];
        const mediaNote = !this.showingFront && this.getSafeMediaUrl(currentCard.mediaUrl) ? ' This card has a video link below.' : '';
        this.announce(`Flipped to ${side}: ${content}.${mediaNote}`);
    }

    previousCard() {
        if (this.currentCardIndex > 0) {
            this.currentCardIndex--;
            this.showingFront = true;
            this.displayCurrentCard();
            this.announce(`Previous card: ${this.currentDeck.cards[this.currentCardIndex].front}`);
        }
    }

    nextCard() {
        if (this.currentCardIndex < this.currentDeck.cards.length - 1) {
            this.currentCardIndex++;
            this.showingFront = true;
            this.displayCurrentCard();
            this.announce(`Next card: ${this.currentDeck.cards[this.currentCardIndex].front}`);
        } else {
            this.announce('You have reached the end of the flashcards. Great job!');
        }
    }

    endStudy() {
        this.soundManager.play('exitStudy');
        this.currentDeck = null;
        if (this.cardMediaArea) {
            this.cardMediaArea.innerHTML = '';
            this.cardMediaArea.classList.add('hidden');
        }

        // Hide study overlay
        this.studyOverlay.classList.add('hidden');
        document.body.style.overflow = '';

        this.announce('Study session ended.');
    }

    // ===== Quiz Mode Methods =====

    async promptQuizMode(deckIndex) {
        // Prevent re-entry if already in quiz or study mode
        if (this.quizMode || this.currentDeck) return;

        const deck = this.decks[deckIndex];
        if (!deck || deck.cards.length < 4) {
            this.announce('You need at least 4 cards to start a quiz.');
            return;
        }

        this.originalDeckIndex = deckIndex;

        // Show quiz mode selection modal
        const mode = await this.openQuizModeModal();
        if (!mode) return; // Cancelled

        this.startQuiz(deckIndex, mode);
    }

    openQuizModeModal() {
        return new Promise((resolve) => {
            this.modalTitle.textContent = 'Choose Quiz Mode';
            this.modalDesc.textContent = 'Select how you want to be quizzed.';
            this.modalContent.innerHTML = `
                <div class="quiz-mode-options" role="radiogroup" aria-label="Quiz mode options">
                    <label class="quiz-mode-option">
                        <input type="radio" name="quiz-mode" value="mc" checked>
                        <span class="quiz-mode-label">
                            <strong>Multiple Choice</strong>
                            <span>Pick the correct answer from 4 options</span>
                        </span>
                    </label>
                    <label class="quiz-mode-option">
                        <input type="radio" name="quiz-mode" value="written">
                        <span class="quiz-mode-label">
                            <strong>Written</strong>
                            <span>Type your answer</span>
                        </span>
                    </label>
                    <label class="quiz-mode-option">
                        <input type="radio" name="quiz-mode" value="mixed">
                        <span class="quiz-mode-label">
                            <strong>Mixed</strong>
                            <span>Random mix of both types</span>
                        </span>
                    </label>
                </div>
            `;
            this.modalConfirmBtn.textContent = 'Start Quiz';
            this.modalCancelBtn.textContent = 'Cancel';

            // Ensure confirm button is enabled (may be disabled from previous text modal)
            this.modalConfirmBtn.disabled = false;

            const firstRadio = this.modalContent.querySelector('input[type="radio"]');
            const cleanup = this._openModalCommon({
                initialFocus: firstRadio,
                onConfirm: () => {
                    const selected = this.modalContent.querySelector('input[name="quiz-mode"]:checked');
                    cleanup();
                    resolve(selected ? selected.value : null);
                },
                onCancel: () => {
                    cleanup();
                    resolve(null);
                },
            });
        });
    }

    startQuiz(deckIndex, mode) {
        this.soundManager.play('enterStudy');
        const deck = this.decks[deckIndex];

        this.quizMode = mode;
        const shouldShuffle = deck.shuffle !== false;
        this.quizCards = shouldShuffle ? this.shuffleArray(deck.cards) : [...deck.cards];
        this.quizCurrentIndex = 0;
        this.quizScore = 0;
        this.quizAnswered = false;
        this.originalDeckIndex = deckIndex;
        this.currentQuizQuestion = null;
        this.currentQuestionType = null;

        // Show quiz overlay
        this.quizOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        this.displayQuizQuestion();
        this.announce(`Started ${mode === 'mc' ? 'multiple choice' : mode === 'written' ? 'written' : 'mixed'} quiz on "${deck.name}" with ${deck.cards.length} questions.`);
    }

    /**
     * Generate a smart exam-like question from a flashcard
     * Detects patterns like "ABBREV (Full Term)" or "Term: Definition"
     * Returns an object with question text, expected answer, and question type
     */
    generateSmartQuestion(card) {
        const front = card.front.trim();
        const back = card.back.trim();

        // Pattern 1: Abbreviation with expansion - "LLM (Large Language Model)"
        // Also handles reverse: "Large Language Model (LLM)"
        const abbrevPattern = /^([A-Z]{2,10})\s*\(([^)]+)\)(.*)$/i;
        const reverseAbbrevPattern = /^(.+?)\s*\(([A-Z]{2,10})\)(.*)$/i;

        let abbrevMatch = front.match(abbrevPattern);
        let reverseMatch = front.match(reverseAbbrevPattern);

        if (abbrevMatch) {
            // Format: "LLM (Large Language Model) definition..."
            const abbrev = abbrevMatch[1].toUpperCase();
            const fullTerm = abbrevMatch[2].trim();
            const extraInfo = abbrevMatch[3].trim();

            // Randomly choose between question types for variety
            const questionTypes = [
                { question: `What does ${abbrev} stand for?`, answer: fullTerm, type: 'expansion' },
                { question: `What is ${fullTerm.toLowerCase().startsWith('a ') || fullTerm.toLowerCase().startsWith('an ') ? '' : this.getArticle(fullTerm)} ${fullTerm}?`, answer: back, type: 'definition' }
            ];

            // For written mode, prefer the expansion question (shorter answer)
            const selected = questionTypes[Math.floor(Math.random() * questionTypes.length)];
            return {
                question: selected.question,
                answer: selected.answer,
                answerForDisplay: selected.type === 'expansion' ? fullTerm : back,
                originalFront: front,
                originalBack: back
            };
        }

        if (reverseMatch && reverseMatch[2].match(/^[A-Z]{2,10}$/)) {
            // Format: "Large Language Model (LLM) definition..."
            const fullTerm = reverseMatch[1].trim();
            const abbrev = reverseMatch[2].toUpperCase();

            const questionTypes = [
                { question: `What is the abbreviation for ${fullTerm}?`, answer: abbrev, type: 'abbreviation' },
                { question: `What is ${this.getArticle(fullTerm)} ${fullTerm}?`, answer: back, type: 'definition' }
            ];

            const selected = questionTypes[Math.floor(Math.random() * questionTypes.length)];
            return {
                question: selected.question,
                answer: selected.answer,
                answerForDisplay: selected.type === 'abbreviation' ? abbrev : back,
                originalFront: front,
                originalBack: back
            };
        }

        // Pattern 2: Term with colon definition - "Photosynthesis: The process..."
        const colonPattern = /^([^:]+):\s*(.+)$/;
        const colonMatch = front.match(colonPattern);
        if (colonMatch) {
            const term = colonMatch[1].trim();
            return {
                question: `What is ${this.getArticle(term)} ${term}?`,
                answer: back || colonMatch[2].trim(),
                answerForDisplay: back || colonMatch[2].trim(),
                originalFront: front,
                originalBack: back
            };
        }

        // Pattern 3: Question already ends with ? - use as-is
        if (front.endsWith('?')) {
            return {
                question: front,
                answer: back,
                answerForDisplay: back,
                originalFront: front,
                originalBack: back
            };
        }

        // Pattern 4: Short term (1-4 words) - likely a vocabulary term
        const wordCount = front.split(/\s+/).length;
        if (wordCount <= 4 && !front.includes('.')) {
            return {
                question: `What is ${this.getArticle(front)} ${front}?`,
                answer: back,
                answerForDisplay: back,
                originalFront: front,
                originalBack: back
            };
        }

        // Default: Use front as-is (it might be a complete question or statement)
        return {
            question: front,
            answer: back,
            answerForDisplay: back,
            originalFront: front,
            originalBack: back
        };
    }

    /**
     * Get the appropriate article (a/an) for a word, or empty string if none needed
     */
    getArticle(word) {
        if (!word) return '';
        const trimmed = word.trim();

        // Skip articles for compound terms (2+ words) - they often don't need articles
        // e.g., "context compression", "machine learning" sound better without "a"
        if (trimmed.includes(' ')) {
            return '';
        }

        // Skip articles for abstract noun suffixes (often uncountable)
        const abstractSuffixes = /(tion|sion|ment|ness|ity|ing|ism|ance|ence)$/i;
        if (trimmed.match(abstractSuffixes)) {
            return '';
        }

        const firstChar = trimmed.charAt(0).toLowerCase();
        const vowels = ['a', 'e', 'i', 'o', 'u'];
        // Special cases for common exceptions
        const useAn = vowels.includes(firstChar) ||
                      trimmed.match(/^(hour|honest|heir|honor)/i) ||
                      trimmed.match(/^[AEFHILMNORSX]$/i); // Single letters that sound like vowels
        return useAn ? 'an' : 'a';
    }

    displayQuizQuestion() {
        const card = this.quizCards[this.quizCurrentIndex];
        const total = this.quizCards.length;
        const current = this.quizCurrentIndex + 1;
        const progress = Math.round((current / total) * 100);

        // Update progress
        this.quizProgress.textContent = `Question ${current} of ${total}`;
        this.quizProgressFill.style.width = `${progress}%`;

        // Generate smart question
        this.currentQuizQuestion = this.generateSmartQuestion(card);
        this.quizQuestion.textContent = this.currentQuizQuestion.question;

        // Determine question type for this card
        let questionType = this.quizMode;
        if (this.quizMode === 'mixed') {
            questionType = Math.random() < 0.5 ? 'mc' : 'written';
        }
        this.currentQuestionType = questionType;

        // Reset UI
        this.quizFeedback.classList.add('hidden');
        this.quizFeedback.classList.remove('correct', 'incorrect');
        this.quizAnswered = false;

        // Announce question for screen readers before focusing on answers
        this.announce(`Question ${current} of ${total}: ${this.currentQuizQuestion.question}`);

        if (questionType === 'mc') {
            this.showMultipleChoice(card);
        } else {
            this.showWrittenInput();
        }
    }

    showMultipleChoice(correctCard) {
        this.quizMcOptions.classList.remove('hidden');
        this.quizWrittenInput.classList.add('hidden');

        // Generate options
        const options = this.generateMCOptions(correctCard);

        // Clear previous options
        this.quizMcOptions.innerHTML = '';

        // Create option buttons using DOM methods (safe from HTML injection)
        options.forEach((opt, idx) => {
            const letter = String.fromCharCode(65 + idx); // A, B, C, D
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quiz-option';
            btn.dataset.correct = opt.isCorrect;

            // Simple aria-label - question is announced separately when arriving
            btn.setAttribute('aria-label', `Option ${letter}: ${opt.answer}`);

            const letterSpan = document.createElement('span');
            letterSpan.className = 'quiz-option-letter';
            letterSpan.setAttribute('aria-hidden', 'true');
            letterSpan.textContent = letter;

            const textSpan = document.createElement('span');
            textSpan.className = 'quiz-option-text';
            textSpan.setAttribute('aria-hidden', 'true');
            textSpan.textContent = opt.answer;

            btn.appendChild(letterSpan);
            btn.appendChild(textSpan);
            this.quizMcOptions.appendChild(btn);
        });

        // Add event listeners to options
        const optionBtns = this.quizMcOptions.querySelectorAll('.quiz-option');
        optionBtns.forEach(btn => {
            btn.addEventListener('click', () => this.selectMCOption(btn, optionBtns));
        });

        // Delay focus so screen reader announces question first
        if (optionBtns.length > 0) {
            setTimeout(() => optionBtns[0].focus(), 100);
        }
    }

    generateMCOptions(correctCard) {
        // Use smart question answer (could be abbreviation, expansion, or definition)
        const correctAnswer = this.currentQuizQuestion.answer;
        const questionText = this.currentQuizQuestion.question.toLowerCase();

        // Determine what kind of distractors we need based on question type
        const isAskingForAbbreviation = questionText.includes('abbreviation for');
        const isAskingForExpansion = questionText.includes('stand for');

        let distractors = [];

        if (isAskingForAbbreviation || isAskingForExpansion) {
            // For abbreviation questions, find other abbreviations/expansions from cards
            const abbrevPattern = /^([A-Z]{2,10})\s*\(([^)]+)\)/i;
            const reversePattern = /^(.+?)\s*\(([A-Z]{2,10})\)/i;

            this.quizCards.forEach(card => {
                if (card === correctCard) return;

                let match = card.front.match(abbrevPattern);
                if (match) {
                    if (isAskingForAbbreviation) {
                        // Add the abbreviation as a distractor
                        distractors.push(match[1].toUpperCase());
                    } else {
                        // Add the full term as a distractor
                        distractors.push(match[2].trim());
                    }
                }

                match = card.front.match(reversePattern);
                if (match && match[2].match(/^[A-Z]{2,10}$/)) {
                    if (isAskingForAbbreviation) {
                        distractors.push(match[2].toUpperCase());
                    } else {
                        distractors.push(match[1].trim());
                    }
                }
            });

            // Remove duplicates and the correct answer
            distractors = [...new Set(distractors)].filter(d =>
                d.toLowerCase() !== correctAnswer.toLowerCase()
            );
        }

        // If we don't have enough distractors, fall back to card backs
        if (distractors.length < 3) {
            const otherCards = this.quizCards.filter(c =>
                c !== correctCard && c.back.toLowerCase() !== correctAnswer.toLowerCase()
            );
            const shuffledOthers = this.shuffleArray(otherCards);
            const backDistractors = shuffledOthers.map(c => c.back);

            // Add unique backs to fill remaining slots
            for (const back of backDistractors) {
                if (distractors.length >= 3) break;
                if (!distractors.some(d => d.toLowerCase() === back.toLowerCase())) {
                    distractors.push(back);
                }
            }
        }

        // Shuffle and pick up to 3 distractors
        distractors = this.shuffleArray(distractors).slice(0, 3);

        // If still not enough, duplicate what we have
        while (distractors.length < 3 && distractors.length > 0) {
            distractors.push(distractors[distractors.length % distractors.length]);
        }

        // Create options array
        const options = [
            { answer: correctAnswer, isCorrect: true },
            ...distractors.map(d => ({ answer: d, isCorrect: false }))
        ];

        // Shuffle options
        return this.shuffleArray(options);
    }

    selectMCOption(selectedBtn, allBtns) {
        if (this.quizAnswered) return;
        this.quizAnswered = true;

        const isCorrect = selectedBtn.dataset.correct === 'true';

        // Mark all options as disabled
        allBtns.forEach(btn => {
            btn.classList.add('disabled');
            if (btn.dataset.correct === 'true') {
                btn.classList.add('correct');
            }
        });

        if (isCorrect) {
            this.quizScore++;
            this.soundManager.play('correct');
            selectedBtn.classList.add('correct');
        } else {
            this.soundManager.play('wrong');
            selectedBtn.classList.add('incorrect');
        }

        // Use smart question answer for feedback display
        const correctAnswer = this.currentQuizQuestion.answerForDisplay;
        this.showQuizFeedback(isCorrect, correctAnswer);
    }

    showWrittenInput() {
        this.quizMcOptions.classList.add('hidden');
        this.quizWrittenInput.classList.remove('hidden');
        this.quizAnswerInput.value = '';

        // Simple aria-label - question is announced separately when arriving
        this.quizAnswerInput.setAttribute('aria-label', 'Type your answer');

        // Delay focus so screen reader announces question first
        setTimeout(() => this.quizAnswerInput.focus(), 100);
    }

    submitWrittenAnswer() {
        if (this.quizAnswered) return;

        const userAnswer = this.quizAnswerInput.value.trim();
        if (!userAnswer) {
            this.announce('Please enter an answer.');
            return;
        }

        this.quizAnswered = true;
        // Use smart question answer for validation
        const correctAnswer = this.currentQuizQuestion.answer;
        const displayAnswer = this.currentQuizQuestion.answerForDisplay;
        const isCorrect = this.checkWrittenAnswer(userAnswer, correctAnswer);

        if (isCorrect) {
            this.quizScore++;
            this.soundManager.play('correct');
        } else {
            this.soundManager.play('wrong');
        }

        this.showQuizFeedback(isCorrect, displayAnswer);
    }

    checkWrittenAnswer(userAnswer, correctAnswer) {
        // Normalize both strings for comparison
        const normalize = (str) => str.toLowerCase().trim()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' '); // Normalize whitespace

        const normalizedUser = normalize(userAnswer);
        const normalizedCorrect = normalize(correctAnswer);

        // Exact match
        if (normalizedUser === normalizedCorrect) return true;

        // Check if user answer contains all key words from correct answer (80%+ match)
        const correctWords = normalizedCorrect.split(' ').filter(w => w.length > 2);
        const userWords = normalizedUser.split(' ');

        if (correctWords.length === 0) return normalizedUser === normalizedCorrect;

        const matchedWords = correctWords.filter(word =>
            userWords.some(uw => uw.includes(word) || word.includes(uw))
        );

        return matchedWords.length / correctWords.length >= 0.8;
    }

    showQuizFeedback(isCorrect, correctAnswer) {
        this.quizFeedback.classList.remove('hidden', 'correct', 'incorrect');
        this.quizFeedback.classList.add(isCorrect ? 'correct' : 'incorrect');

        this.quizFeedbackText.textContent = isCorrect ? 'Correct!' : 'Incorrect';

        if (!isCorrect) {
            this.quizCorrectAnswer.textContent = `The correct answer was: ${correctAnswer}`;
        } else {
            this.quizCorrectAnswer.textContent = '';
        }

        this.quizNextBtn.focus();
        this.announce(isCorrect ? 'Correct!' : `Incorrect. The correct answer was: ${correctAnswer}`);
    }

    nextQuizQuestion() {
        this.quizCurrentIndex++;

        if (this.quizCurrentIndex >= this.quizCards.length) {
            this.showQuizResults();
        } else {
            this.displayQuizQuestion();
        }
    }

    showQuizResults() {
        // Hide quiz overlay
        this.quizOverlay.classList.add('hidden');

        // Show results overlay
        this.quizResultsOverlay.classList.remove('hidden');

        const total = this.quizCards.length;
        const correct = this.quizScore;
        const percentage = Math.round((correct / total) * 100);

        // Determine score category
        let scoreClass = 'good';
        if (percentage >= 90) scoreClass = 'excellent';
        else if (percentage >= 70) scoreClass = 'good';
        else if (percentage >= 50) scoreClass = 'needs-work';
        else scoreClass = 'poor';

        this.quizScoreEl.textContent = `${percentage}%`;
        this.quizScoreEl.className = `quiz-score ${scoreClass}`;

        this.quizScoreBreakdown.textContent = `You got ${correct} out of ${total} questions correct.`;

        this.soundManager.play(percentage >= 70 ? 'correct' : 'wrong');
        this.announce(`Quiz complete! You scored ${percentage}%. ${correct} out of ${total} correct.`);

        this.quizRetryBtn.focus();
    }

    retryQuiz() {
        // Hide results
        this.quizResultsOverlay.classList.add('hidden');

        // Restart with same deck and mode
        this.startQuiz(this.originalDeckIndex, this.quizMode);
    }

    endQuiz() {
        this.soundManager.play('exitStudy');

        // Reset quiz state
        this.quizMode = null;
        this.quizCards = [];
        this.quizCurrentIndex = 0;
        this.quizScore = 0;

        // Hide overlays
        this.quizOverlay.classList.add('hidden');
        this.quizResultsOverlay.classList.add('hidden');
        document.body.style.overflow = '';

        this.announce('Quiz ended.');
    }

    exitQuizResults() {
        this.quizMode = null;
        this.quizCards = [];
        this.quizResultsOverlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // ===== Modal Helpers =====
    isAppModalOpen() {
        return this.modal && !this.modal.classList.contains('hidden');
    }

    isHelpOpen() {
        return this.helpModal && this.helpModal.open === true;
    }

    getFocusableElementsInModal() {
        if (!this.helpModal) return [];
        const selectors = [
            'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled])',
            'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
        ];
        return Array.from(this.helpModal.querySelectorAll(selectors.join(',')))
            .filter(el => el.offsetParent !== null || el === document.activeElement);
    }

    openHelpModal() {
        if (!this.helpModal || this.isHelpOpen()) return;
        this.lastFocusedBeforeHelp = document.activeElement;
        try { this.helpModal.showModal(); } catch (_) { this.helpModal.show(); }
        this.helpModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        const dialog = this.helpModal.querySelector('.modal-dialog');
        if (dialog) dialog.focus();
        const focusables = this.getFocusableElementsInModal();
        if (focusables.length) focusables[0].focus();
        this.announce('Help opened.');
    }

    closeHelpModal() {
        if (!this.helpModal || !this.isHelpOpen()) return;
        if (!arguments[0]) {
            try { this.helpModal.close(); } catch (_) {}
        }
        this.helpModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (this.lastFocusedBeforeHelp && typeof this.lastFocusedBeforeHelp.focus === 'function') {
            this.lastFocusedBeforeHelp.focus();
        } else if (this.openHelpBtn) {
            this.openHelpBtn.focus();
        }
        this.announce('Help closed.');
    }

    trapFocus(e) {
        const focusables = this.getFocusableElementsInModal();
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
            if (active === first || !this.helpModal.contains(active)) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (active === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }
}

// Global functions for onclick events
function switchTab(tabName) {
    app.switchTab(tabName);
}

// App instance - initialized by auth.js when user signs in
let app;

// Modal helpers added to SparkDeckApp prototype
SparkDeckApp.prototype.openTextModal = function({ title, label, initialValue = '', confirmText = 'Save', cancelText = 'Cancel' }) {
    return new Promise((resolve) => {
        const inputId = 'modal-text-input';
        this.modalTitle.textContent = title;
        this.modalDesc.textContent = `${label} input dialog.`;
        this.modalContent.innerHTML = `
            <label for="${inputId}">${label}:</label>
            <input type="text" id="${inputId}" value="${this.escapeHtml(initialValue)}">
        `;
        this.modalConfirmBtn.textContent = confirmText;
        this.modalCancelBtn.textContent = cancelText;

        const inputEl = this.modalContent.querySelector(`#${inputId}`);
        const removeInputListener = () => inputEl.removeEventListener('input', updateConfirmState);
        const cleanup = this._openModalCommon({
            initialFocus: inputEl,
            onConfirm: () => { removeInputListener(); cleanup(); resolve(inputEl.value); },
            onCancel: () => { removeInputListener(); cleanup(); resolve(null); },
        });

        const updateConfirmState = () => {
            const hasText = inputEl.value.trim().length > 0;
            this.modalConfirmBtn.disabled = !hasText;
        };
        inputEl.addEventListener('input', updateConfirmState);
        updateConfirmState();

        setTimeout(() => { inputEl.select(); }, 0);
    });
};

SparkDeckApp.prototype.openConfirmModal = function({ title, message, confirmText = 'OK', cancelText = 'Cancel' }) {
    return new Promise((resolve) => {
        this.modalTitle.textContent = title;
        this.modalDesc.textContent = message;
        const p = document.createElement('p');
        p.textContent = message;
        this.modalContent.innerHTML = '';
        this.modalContent.appendChild(p);
        this.modalConfirmBtn.textContent = confirmText;
        this.modalCancelBtn.textContent = cancelText;
        const cleanup = this._openModalCommon({
            initialFocus: this.modalConfirmBtn,
            onConfirm: () => { cleanup(); resolve(true); },
            onCancel: () => { cleanup(); resolve(false); },
        });
    });
};

SparkDeckApp.prototype.openSelectModal = function({ title, label, options, initialValue = '', confirmText = 'OK', cancelText = 'Cancel' }) {
    return new Promise((resolve) => {
        const selectId = 'modal-select-input';
        this.modalTitle.textContent = title;
        this.modalDesc.textContent = `${label} selection dialog.`;

        let optionsHtml = options.map(opt =>
            `<option value="${this.escapeHtml(opt.value)}"${opt.value === initialValue ? ' selected' : ''}>${this.escapeHtml(opt.label)}</option>`
        ).join('');

        this.modalContent.innerHTML = `
            <label for="${selectId}">${label}</label>
            <select id="${selectId}">${optionsHtml}</select>
        `;
        this.modalConfirmBtn.textContent = confirmText;
        this.modalCancelBtn.textContent = cancelText;

        const selectEl = this.modalContent.querySelector(`#${selectId}`);
        const cleanup = this._openModalCommon({
            initialFocus: selectEl,
            onConfirm: () => { cleanup(); resolve(selectEl.value); },
            onCancel: () => { cleanup(); resolve(null); },
        });
    });
};

// Internal modal open/close with focus trap
SparkDeckApp.prototype._openModalCommon = function({ initialFocus, onConfirm, onCancel }) {
    this._lastFocusedEl = document.activeElement;
    this.modal.classList.remove('hidden');
    this.modalOverlay.classList.remove('hidden');
    this.modalOverlay.setAttribute('aria-hidden', 'false');
    if (this.appContainer) this.appContainer.setAttribute('aria-hidden', 'true');

    const focusable = () => Array.from(this.modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.offsetParent !== null);
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            doCancel();
        } else if (e.key === 'Tab') {
            const els = focusable();
            if (els.length === 0) return;
            const first = els[0];
            const last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    document.addEventListener('keydown', keyHandler);

    const doConfirm = () => { this._restoreModalClose(); onConfirm && onConfirm(); };
    const doCancel = () => { this._restoreModalClose(); onCancel && onCancel(); };
    const clickOutside = (e) => { if (e.target === this.modalOverlay) doCancel(); };
    this.modalConfirmBtn.onclick = doConfirm;
    this.modalCancelBtn.onclick = doCancel;
    this.modalOverlay.addEventListener('click', clickOutside);

    (initialFocus || this.modalConfirmBtn).focus();

    return () => {
        document.removeEventListener('keydown', keyHandler);
        this.modalOverlay.removeEventListener('click', clickOutside);
        this.modalConfirmBtn.onclick = null;
        this.modalCancelBtn.onclick = null;
    };
};

SparkDeckApp.prototype._restoreModalClose = function() {
    this.modal.classList.add('hidden');
    this.modalOverlay.classList.add('hidden');
    this.modalOverlay.setAttribute('aria-hidden', 'true');
    if (this.appContainer) this.appContainer.removeAttribute('aria-hidden');
    if (this._lastFocusedEl && typeof this._lastFocusedEl.focus === 'function') {
        this._lastFocusedEl.focus();
    }
};

// For backward compatibility
SparkDeckApp.prototype._closeModal = function() {
    this._restoreModalClose();
};

// ===== Import/Export Methods =====

// Export a single deck as JSON file
SparkDeckApp.prototype.exportDeck = function(deckIndex) {
    const deck = this.decks[deckIndex];
    if (!deck) {
        this.announce('Deck not found.');
        return;
    }

    const exportData = {
        version: '1.0',
        type: 'deck',
        exportedAt: new Date().toISOString(),
        deck: {
            name: deck.name,
            category: deck.category,
            cards: deck.cards,
            created: deck.created
        }
    };

    const filename = `${deck.name.replace(/[^a-z0-9]/gi, '-')}.json`;
    this._downloadJSON(exportData, filename);

    // Delay announcement to let menu close/blur events settle for screen readers
    setTimeout(() => {
        this.announce(`Downloading ${filename}. Check your Downloads folder.`);
    }, 150);
};

// Export all data (decks + folders) as JSON file
SparkDeckApp.prototype.exportAllData = function() {
    if (this.decks.length === 0 && this.folders.length === 0) {
        this.announce('No data to export.');
        return;
    }

    // Blur so download notification can be announced
    document.activeElement?.blur();

    const exportData = {
        version: '1.0',
        type: 'backup',
        exportedAt: new Date().toISOString(),
        decks: this.decks.map(deck => ({
            name: deck.name,
            category: deck.category,
            folderId: deck.folderId,
            cards: deck.cards,
            created: deck.created
        })),
        folders: this.folders.map(folder => ({
            id: folder.id,
            name: folder.name,
            parentFolderId: folder.parentFolderId,
            created: folder.created
        }))
    };

    const date = new Date().toISOString().split('T')[0];
    const filename = `sparkdeck-backup-${date}.json`;
    this._downloadJSON(exportData, filename);
    this.announce(`Downloading ${filename}. Contains ${this.decks.length} decks and ${this.folders.length} folders.`);
};

// Helper: full folder path for a deck, like "Science / Biology", or "" at top level
SparkDeckApp.prototype._getFolderPath = function(folderId) {
    const names = [];
    const seen = new Set();
    let current = folderId ? this.folders.find(f => f.id === folderId) : null;
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(current.name);
        current = current.parentFolderId ? this.folders.find(f => f.id === current.parentFolderId) : null;
    }
    return names.join(' / ');
};

// Build CSV text for a list of decks: a header row, then one row per card.
// Columns: Folder, Deck, Category, Card Number, Front, Back, Link.
// This is also the format CSV import reads, so files round-trip.
SparkDeckApp.prototype._buildCSV = function(decks) {
    const cell = (value) => {
        let text = value === undefined || value === null ? '' : String(value);
        // Stop spreadsheet apps from treating card text as a formula.
        // Import removes this apostrophe again.
        if (/^[=+@\t\r]/.test(text) || /^-\S/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    };

    const rows = [['Folder', 'Deck', 'Category', 'Card Number', 'Front', 'Back', 'Link']];
    let cardCount = 0;
    decks.forEach(deck => {
        const folder = this._getFolderPath(deck.folderId) || '(No folder)';
        const cards = Array.isArray(deck.cards) ? deck.cards : [];
        cards.forEach((card, i) => {
            rows.push([folder, deck.name, deck.category || '', i + 1, card.front, card.back, card.mediaUrl || '']);
            cardCount++;
        });
    });

    // Byte order mark so Excel opens accented characters and emoji correctly.
    return { text: '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n'), cardCount };
};

// Build a plain, human-readable text listing of decks and cards.
SparkDeckApp.prototype._buildText = function(decks) {
    const now = new Date();
    const cardCount = decks.reduce((sum, d) => sum + (Array.isArray(d.cards) ? d.cards.length : 0), 0);
    const lines = [
        'SparkDeck flashcards',
        `Exported ${now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`,
        `${decks.length} deck${decks.length !== 1 ? 's' : ''}, ${cardCount} card${cardCount !== 1 ? 's' : ''}`,
        ''
    ];
    decks.forEach(deck => {
        const cards = Array.isArray(deck.cards) ? deck.cards : [];
        const folder = this._getFolderPath(deck.folderId);
        lines.push('========================================');
        lines.push(`Deck: ${deck.name}`);
        if (folder) lines.push(`Folder: ${folder}`);
        lines.push(`Category: ${deck.category || 'None'}`);
        lines.push(`Cards: ${cards.length}`);
        lines.push('========================================');
        lines.push('');
        cards.forEach((card, i) => {
            lines.push(`Card ${i + 1}`);
            lines.push(`Front: ${card.front}`);
            lines.push(`Back: ${card.back}`);
            if (card.mediaUrl) lines.push(`Link: ${card.mediaUrl}`);
            lines.push('');
        });
    });
    return { text: lines.join('\r\n'), cardCount };
};

// Export all decks as a CSV spreadsheet.
SparkDeckApp.prototype.exportAllAsCSV = function() {
    if (this.decks.length === 0) {
        this.announce('No decks to export.');
        return;
    }
    document.activeElement?.blur();
    const { text, cardCount } = this._buildCSV(this.decks);
    const date = new Date().toISOString().split('T')[0];
    const filename = `sparkdeck-cards-${date}.csv`;
    this._downloadFile(text, filename, 'text/csv;charset=utf-8');
    this.announce(`Downloading ${filename}. Contains ${this.decks.length} decks and ${cardCount} cards.`);
};

// Export all decks as a plain text file.
SparkDeckApp.prototype.exportAllAsText = function() {
    if (this.decks.length === 0) {
        this.announce('No decks to export.');
        return;
    }
    document.activeElement?.blur();
    const { text, cardCount } = this._buildText(this.decks);
    const date = new Date().toISOString().split('T')[0];
    const filename = `sparkdeck-cards-${date}.txt`;
    this._downloadFile(text, filename, 'text/plain;charset=utf-8');
    this.announce(`Downloading ${filename}. Contains ${this.decks.length} decks and ${cardCount} cards.`);
};

// Export one deck as CSV ('csv') or plain text ('text').
SparkDeckApp.prototype.exportDeckAs = function(deckIndex, format) {
    const deck = this.decks[deckIndex];
    if (!deck) {
        this.announce('Deck not found.');
        return;
    }
    const base = deck.name.replace(/[^a-z0-9]/gi, '-');
    const built = format === 'csv' ? this._buildCSV([deck]) : this._buildText([deck]);
    const filename = `${base}.${format === 'csv' ? 'csv' : 'txt'}`;
    this._downloadFile(built.text, filename, format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8');
    // Delay announcement to let menu close/blur events settle for screen readers
    setTimeout(() => {
        this.announce(`Downloading ${filename}. Check your Downloads folder.`);
    }, 150);
};

// Helper: Download JSON data as file
SparkDeckApp.prototype._downloadJSON = function(data, filename) {
    this._downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
};

// Helper: Download any text content as a file
SparkDeckApp.prototype._downloadFile = function(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Import deck(s) from file - triggers file picker
SparkDeckApp.prototype.triggerImport = function() {
    // Create hidden file input if it doesn't exist
    let fileInput = document.getElementById('import-file-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'import-file-input';
        fileInput.accept = '.json,application/json,.csv,text/csv';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (e) => this._handleImportFile(e));
        document.body.appendChild(fileInput);
    }
    fileInput.value = ''; // Reset so same file can be selected again
    fileInput.click();
};

// Sanitize a string by stripping HTML tags (for imported data)
SparkDeckApp.prototype._stripHtml = function(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent || '';
};

// Sanitize and validate cards from imported data
SparkDeckApp.prototype._sanitizeCards = function(cards) {
    if (!Array.isArray(cards)) return [];
    return cards
        .filter(c => c && c.front && c.back)
        .map(c => ({
            front: this._stripHtml(String(c.front)).slice(0, 50000),
            back: this._stripHtml(String(c.back)).slice(0, 50000),
            mediaUrl: (typeof c.mediaUrl === 'string' && /^https?:\/\//i.test(c.mediaUrl))
                ? c.mediaUrl.slice(0, 2000) : undefined
        }));
};

// Show an import result on screen (under the Import button) and announce it.
SparkDeckApp.prototype._reportImport = function(message, type) {
    const status = document.getElementById('import-status');
    if (status) {
        status.classList.remove('is-error', 'is-success');
        if (type) status.classList.add(`is-${type}`);
        status.textContent = message;
    }
    this.announce(message);
};

// Handle the imported file
SparkDeckApp.prototype._handleImportFile = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 5 MB is far more than any real deck file; anything bigger is likely the wrong file.
    if (file.size > 5 * 1024 * 1024) {
        this._reportImport('That file is too large to import (the limit is 5 MB). Please choose a SparkDeck backup file or a CSV spreadsheet.', 'error');
        return;
    }

    const isCSV = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    if (isCSV) {
        try {
            await this._importCSV(await file.text(), file.name);
        } catch (error) {
            console.warn('CSV import error:', error);
            this._reportImport('Could not read that CSV file. Please check that it is a spreadsheet saved as CSV.', 'error');
        }
        return;
    }

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.version || !data.type) {
            this._reportImport('This file is not a SparkDeck export. Please choose a SparkDeck backup file or a CSV spreadsheet.', 'error');
            return;
        }

        if (data.type === 'deck') {
            await this._importSingleDeck(data);
        } else if (data.type === 'backup') {
            await this._importBackup(data);
        } else {
            this._reportImport('This file is not a SparkDeck export. Please choose a SparkDeck backup file or a CSV spreadsheet.', 'error');
        }
    } catch (error) {
        console.warn('Import error:', error);
        this._reportImport('Could not read that file. Please choose a SparkDeck backup file (.json) or a spreadsheet saved as CSV (.csv).', 'error');
    }
};

// Import a single deck
SparkDeckApp.prototype._importSingleDeck = async function(data) {
    const deck = data.deck;
    if (!deck || !deck.name || !Array.isArray(deck.cards)) {
        this.announce('Invalid deck data.');
        return;
    }

    // Sanitize imported data
    const safeName = this._stripHtml(String(deck.name)).slice(0, 200);
    const safeCategory = this._stripHtml(String(deck.category || 'Other')).slice(0, 100);
    const safeCards = this._sanitizeCards(deck.cards);

    if (!safeName) {
        this.announce('Invalid deck name.');
        return;
    }

    // Check for duplicate name
    const existingIndex = this.decks.findIndex(d => d.name.toLowerCase() === safeName.toLowerCase());
    if (existingIndex !== -1) {
        const confirmed = await this.openConfirmModal({
            title: 'Deck already exists',
            message: `A deck named "${safeName}" already exists. Do you want to replace it?`,
            confirmText: 'Replace',
            cancelText: 'Cancel'
        });
        if (!confirmed) {
            this._reportImport('Import cancelled. Nothing was changed.');
            return;
        }
        // Replace existing deck
        this.decks[existingIndex] = {
            name: safeName,
            category: safeCategory,
            folderId: null, // Don't preserve folder from import
            cards: safeCards,
            created: deck.created || new Date().toISOString()
        };
    } else {
        // Add new deck
        this.decks.push({
            name: safeName,
            category: safeCategory,
            folderId: null,
            cards: safeCards,
            created: deck.created || new Date().toISOString()
        });
    }

    if (this.saveDecks()) {
        this.renderDecks();
        this._reportImport(`Imported the deck "${safeName}" with ${safeCards.length} card${safeCards.length !== 1 ? 's' : ''}.`, 'success');
    } else {
        this.announce('Error saving imported deck.');
    }
};

// Import a full backup
SparkDeckApp.prototype._importBackup = async function(data) {
    if (!Array.isArray(data.decks)) {
        this.announce('Invalid backup data.');
        return;
    }

    const deckCount = data.decks.length;
    const folderCount = data.folders ? data.folders.length : 0;

    const confirmed = await this.openConfirmModal({
        title: 'Import backup',
        message: `This backup contains ${deckCount} deck${deckCount !== 1 ? 's' : ''} and ${folderCount} folder${folderCount !== 1 ? 's' : ''}. Existing data will be merged. Continue?`,
        confirmText: 'Import',
        cancelText: 'Cancel'
    });

    if (!confirmed) {
        this._reportImport('Import cancelled. Nothing was changed.');
        return;
    }

    // Create a map of old folder IDs to new folder IDs
    const folderIdMap = new Map();

    // Import folders first (if any)
    if (Array.isArray(data.folders)) {
        for (const folder of data.folders) {
            const safeFolderName = this._stripHtml(String(folder.name || '')).slice(0, 200);
            if (!safeFolderName) continue;

            // Check for duplicate folder name at same level
            const existingFolder = this.folders.find(f =>
                f.name.toLowerCase() === safeFolderName.toLowerCase() &&
                f.parentFolderId === (folderIdMap.get(folder.parentFolderId) || folder.parentFolderId || null)
            );

            if (existingFolder) {
                // Map old ID to existing folder ID
                folderIdMap.set(folder.id, existingFolder.id);
            } else {
                // Create new folder with new ID
                const newFolder = {
                    id: this.generateFolderId(),
                    name: safeFolderName,
                    parentFolderId: folderIdMap.get(folder.parentFolderId) || folder.parentFolderId || null,
                    created: folder.created || new Date().toISOString()
                };
                // Map old ID to new ID
                folderIdMap.set(folder.id, newFolder.id);
                this.folders.push(newFolder);
            }
        }
        this.saveFolders();
    }

    // Import decks
    let importedCount = 0;
    let skippedCount = 0;

    for (const deck of data.decks) {
        if (!deck.name || !Array.isArray(deck.cards)) continue;

        const safeName = this._stripHtml(String(deck.name)).slice(0, 200);
        const safeCategory = this._stripHtml(String(deck.category || 'Other')).slice(0, 100);
        const safeCards = this._sanitizeCards(deck.cards);
        if (!safeName) continue;

        // Check for duplicate name
        const existingIndex = this.decks.findIndex(d => d.name.toLowerCase() === safeName.toLowerCase());
        if (existingIndex !== -1) {
            skippedCount++;
            continue; // Skip duplicates in bulk import
        }

        // Map folder ID if applicable
        const mappedFolderId = deck.folderId ? (folderIdMap.get(deck.folderId) || deck.folderId) : null;
        // Check if mapped folder exists, otherwise set to null
        const folderExists = mappedFolderId ? this.folders.some(f => f.id === mappedFolderId) : true;

        this.decks.push({
            name: safeName,
            category: safeCategory,
            folderId: folderExists ? mappedFolderId : null,
            cards: safeCards,
            created: deck.created || new Date().toISOString()
        });
        importedCount++;
    }

    if (this.saveDecks()) {
        this.populateFolderOptions(this.deckFolder);
        this.renderDecks();
        let message = `Imported ${importedCount} deck${importedCount !== 1 ? 's' : ''}`;
        if (skippedCount > 0) {
            message += `, skipped ${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''}`;
        }
        this._reportImport(message + '.', 'success');
    } else {
        this.announce('Error saving imported data.');
    }
};

// ---- CSV import ----
// Expected format (the same one "Download Spreadsheet (CSV)" creates):
//   First row: column names. Front and Back are required. Optional: Deck,
//   Category, Folder, Link. Other columns (like Card Number) are ignored.
//   Each following row is one card.
// A file with no recognizable header, where every row has at least two
// columns, is read as front,back pairs without a header.

// Split CSV text into rows of cells. Handles quoted cells, "" inside quotes,
// commas and line breaks inside quotes, Windows line endings, and a leading
// byte order mark. Detects comma, semicolon, or tab separators.
SparkDeckApp.prototype._parseCSV = function(text) {
    text = String(text || '').replace(/^﻿/, '');
    // Pick the separator that appears most in the first line (outside quotes).
    let firstLine = '';
    let inQ = false;
    for (const ch of text) {
        if (ch === '"') inQ = !inQ;
        if (!inQ && (ch === '\n' || ch === '\r')) break;
        if (!inQ) firstLine += ch;
    }
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const ch of firstLine) if (ch in counts) counts[ch]++;
    const sep = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');

    const rows = [];
    let row = [];
    let cellText = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { cellText += '"'; i++; }
                else inQuotes = false;
            } else {
                cellText += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === sep) {
            row.push(cellText); cellText = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cellText); rows.push(row);
            row = []; cellText = '';
        } else {
            cellText += ch;
        }
    }
    if (cellText !== '' || row.length) { row.push(cellText); rows.push(row); }
    if (inQuotes) throw new Error('Unclosed quote in CSV');
    return rows;
};

// Undo the apostrophe that export adds in front of formula-like text.
SparkDeckApp.prototype._csvCellValue = function(value) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    return /^'[=+@\-\t\r]/.test(text) ? text.slice(1) : text;
};

// Find or create a folder path like "Science / Biology". Returns its id or null.
SparkDeckApp.prototype._ensureFolderPath = function(pathText) {
    const clean = String(pathText || '').trim();
    if (!clean || clean.toLowerCase() === '(no folder)') return null;
    let parentId = null;
    for (const rawName of clean.split('/')) {
        const name = this._stripHtml(rawName).trim().slice(0, 200);
        if (!name) continue;
        let folder = this.folders.find(f =>
            f.name.toLowerCase() === name.toLowerCase() && (f.parentFolderId || null) === parentId);
        if (!folder) {
            if (this.folders.length >= 200) return parentId; // stay within the cloud limit
            folder = { id: this.generateFolderId(), name, parentFolderId: parentId, created: new Date().toISOString() };
            this.folders.push(folder);
        }
        parentId = folder.id;
    }
    return parentId;
};

SparkDeckApp.prototype._importCSV = async function(text, fileName) {
    const rows = this._parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
    if (rows.length === 0) {
        this._reportImport('That CSV file is empty.', 'error');
        return;
    }
    if (rows.length > 10001) {
        this._reportImport('That CSV file has more than 10,000 rows. Please split it into smaller files.', 'error');
        return;
    }

    // Work out which column is which.
    const names = {
        front: ['front', 'question', 'term'],
        back: ['back', 'answer', 'definition'],
        deck: ['deck', 'deck name'],
        category: ['category'],
        folder: ['folder'],
        link: ['link', 'media', 'media url', 'video', 'url']
    };
    const header = rows[0].map(h => String(h).trim().toLowerCase());
    const col = {};
    Object.keys(names).forEach(key => {
        const idx = header.findIndex(h => names[key].includes(h));
        if (idx !== -1) col[key] = idx;
    });

    let dataRows;
    let headerless = false;
    if (col.front !== undefined && col.back !== undefined) {
        dataRows = rows.slice(1).map((r, i) => ({ r, line: i + 2 }));
    } else if (rows.every(r => r.length >= 2) && col.front === undefined && col.back === undefined) {
        // No header: read as front, back.
        col.front = 0; col.back = 1;
        headerless = true;
        dataRows = rows.map((r, i) => ({ r, line: i + 1 }));
    } else {
        this._reportImport('This CSV file needs a first row with column names, including "Front" and "Back". Optional columns are Deck, Category, Folder, and Link. Open Help for the full format.', 'error');
        return;
    }

    const defaultDeckName = (String(fileName || 'Imported deck').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported deck').slice(0, 200);
    const groups = new Map();
    const skippedLines = [];
    dataRows.forEach(({ r, line }) => {
        const get = (key) => (col[key] !== undefined ? this._csvCellValue(r[col[key]]) : '');
        const front = get('front');
        const back = get('back');
        if (!front || !back) { skippedLines.push(line); return; }
        const deckName = this._stripHtml(get('deck')).slice(0, 200).trim() || defaultDeckName;
        const folderPath = get('folder');
        const key = `${folderPath.toLowerCase()}|${deckName.toLowerCase()}`;
        if (!groups.has(key)) {
            groups.set(key, { deckName, folderPath, category: this._stripHtml(get('category')).slice(0, 100).trim(), cards: [] });
        }
        const link = get('link');
        groups.get(key).cards.push({ front, back, mediaUrl: link || undefined });
    });

    if (groups.size === 0) {
        this._reportImport('No cards were found. Every card needs text in both the Front and Back columns.', 'error');
        return;
    }
    if (this.decks.length + groups.size > 500) {
        this._reportImport(`This file would bring you to more than 500 decks, which is the limit. Nothing was imported.`, 'error');
        return;
    }

    const cardTotal = Array.from(groups.values()).reduce((n, g) => n + g.cards.length, 0);
    let message = headerless
        ? `This file has no column names (no "Front" and "Back" in the first row), so the first column is used as the front of each card and the second column as the back, starting from the very first row. If that's not right, choose Cancel and add a first row with column names. `
        : '';
    message += `This file has ${cardTotal} card${cardTotal !== 1 ? 's' : ''} in ${groups.size} deck${groups.size !== 1 ? 's' : ''}. They will be added as new decks; your existing decks are not changed. Decks whose name is already used in the same folder get "(imported)" added to their name.`;
    if (skippedLines.length) {
        message += ` ${skippedLines.length} row${skippedLines.length !== 1 ? 's are' : ' is'} missing a front or back and will be skipped.`;
    }
    const confirmed = await this.openConfirmModal({
        title: 'Import spreadsheet',
        message,
        confirmText: 'Import',
        cancelText: 'Cancel'
    });
    if (!confirmed) {
        this._reportImport('Import cancelled. Nothing was changed.');
        return;
    }

    let renamed = 0;
    groups.forEach(group => {
        const folderId = this._ensureFolderPath(group.folderPath);
        let name = group.deckName;
        const taken = (n) => this.decks.some(d =>
            d.name.toLowerCase() === n.toLowerCase() && (d.folderId || null) === (folderId || null));
        if (taken(name)) {
            renamed++;
            name = `${group.deckName} (imported)`;
            let i = 2;
            while (taken(name)) name = `${group.deckName} (imported ${i++})`;
        }
        this.decks.push({
            name,
            category: group.category || 'Other',
            folderId,
            cards: this._sanitizeCards(group.cards),
            created: new Date().toISOString()
        });
    });

    this.saveFolders();
    if (this.saveDecks()) {
        this.populateFolderOptions(this.deckFolder);
        this.renderDecks();
        let done = `Imported ${cardTotal} card${cardTotal !== 1 ? 's' : ''} into ${groups.size} deck${groups.size !== 1 ? 's' : ''}.`;
        if (renamed) done += ` ${renamed} deck${renamed !== 1 ? 's were' : ' was'} renamed with "(imported)" because the name was already used.`;
        if (skippedLines.length) {
            const shown = skippedLines.slice(0, 10).join(', ');
            done += ` Skipped ${skippedLines.length} row${skippedLines.length !== 1 ? 's' : ''} missing a front or back (row${skippedLines.length !== 1 ? 's' : ''} ${shown}${skippedLines.length > 10 ? ', and more' : ''}).`;
        }
        this._reportImport(done, 'success');
    } else {
        this._reportImport('Could not save the imported decks. Your device storage may be full.', 'error');
    }
};

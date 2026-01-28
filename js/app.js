import STUDY_DATA from './data.js';

class StudyTracker {
    constructor() {
        this.currentSubject = "Reasoning";
        this.currentSubdivision = null;
        this.isEditMode = false;
        // storage structure: { subjectName: { topicName: { classIndex: dateStr } } }
        this.storageData = JSON.parse(localStorage.getItem('study_tracker_v2')) || {};
        this.metadata = JSON.parse(localStorage.getItem('study_tracker_meta')) || {
            lastStudied: null, // { subject, subdivision, topic }
            dailyStats: {} // { 'YYYY-MM-DD': count }
        };

        // DOM Elements
        this.topicsContainer = document.getElementById('topics-container');
        this.subdivisionNav = document.getElementById('subdivision-nav');
        this.subjectTitle = document.getElementById('current-subject-title');
        this.subjectProgressText = document.getElementById('subject-progress-text');
        this.subjectPercentageText = document.getElementById('subject-percentage');
        this.subjectCircleFill = document.getElementById('subject-progress-circle-fill');
        this.overallPercentageText = document.getElementById('overall-percentage');
        this.overallProgressBar = document.getElementById('overall-progress-inner');
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.dailyMotivation = document.getElementById('daily-motivation');
        this.quickJumpBtn = document.getElementById('quick-jump-btn');
        this.toastContainer = document.getElementById('toast-container');
        this.contentContainerOuter = document.getElementById('content-container-outer');
        this.topicModal = document.getElementById('topic-modal');
        this.topicClassesGrid = document.getElementById('topic-classes-grid');
        this.modalTopicTitle = document.getElementById('modal-topic-title');
        this.modalTopicBadge = document.getElementById('modal-topic-badge');
        this.topicModalClose = document.getElementById('topic-modal-close');
        this.activeTopic = null;

        this.init();
    }

    init() {
        this.addEventListeners();
        this.render();
        this.updateOverallProgress();
        this.updateDailyMotivation();
    }

    addEventListeners() {
        this.navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const subject = btn.dataset.subject;
                if (subject !== this.currentSubject) {
                    this.switchSubject(subject);
                }
            });
        });

        this.quickJumpBtn.addEventListener('click', () => this.handleQuickJump());
        if (this.topicModalClose) this.topicModalClose.addEventListener('click', () => this.closeTopicModal());

        // Modal background close
        if (this.topicModal) {
            this.topicModal.addEventListener('click', (e) => {
                if (e.target === this.topicModal) this.closeTopicModal();
            });
        }

        // Event delegation for cards to open modal
        this.topicsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.topic-card');
            if (card) {
                const topicName = card.dataset.topic;
                this.openTopicModal(topicName);
            }
        });

        // Change delegation for class items inside modal
        this.topicClassesGrid.addEventListener('click', (e) => {
            const classItem = e.target.closest('.class-item');
            if (classItem) {
                const checkbox = classItem.querySelector('input[type="checkbox"]');
                if (!checkbox) return;

                const { subject, topic, classIndex } = checkbox.dataset;
                const idx = parseInt(classIndex);
                const isCompleted = !!(this.storageData[subject] && this.storageData[subject][topic] && this.storageData[subject][topic][idx]);

                if (isCompleted && !this.isEditMode) {
                    this.showToast("Completed classes are locked. Unlock Admin to edit.", "info");
                    return;
                }

                const newState = !isCompleted;
                if (e.target.type === 'checkbox') e.preventDefault();
                this.toggleClass(subject, topic, idx, newState, checkbox);
            }
        });
    }

    async switchSubject(subject) {
        // Animation: slide out
        if (this.contentContainerOuter) this.contentContainerOuter.classList.add('slide-out-left');

        await new Promise(resolve => setTimeout(resolve, 400));

        this.currentSubject = subject;
        this.currentSubdivision = null; // Reset subdivision on subject change

        // Update Nav UI
        this.navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subject === subject);
        });

        this.subjectTitle.textContent = subject;
        this.applySubjectTheme(subject);
        this.render();

        // Animation: slide in
        if (this.contentContainerOuter) {
            this.contentContainerOuter.classList.remove('slide-out-left');
            this.contentContainerOuter.classList.add('slide-in-right');

            setTimeout(() => {
                this.contentContainerOuter.classList.remove('slide-in-right');
            }, 400);
        }
    }

    switchSubdivision(subName) {
        this.currentSubdivision = subName;
        this.applySubdivisionTheme(subName);
        this.render();

        // Add highlight pulse to active sub-btn
        const activeBtn = this.subdivisionNav.querySelector(`.sub-btn.active`);
        if (activeBtn) {
            activeBtn.classList.add('newly-active');
            setTimeout(() => activeBtn.classList.remove('newly-active'), 600);
        }
    }

    applySubjectTheme(subject) {
        // Remove existing theme classes
        document.body.classList.remove('theme-reasoning', 'theme-mathematics', 'theme-science');
        document.body.classList.add(`theme-${subject.toLowerCase()}`);
    }

    applySubdivisionTheme(subName) {
        // Remove existing subdivision theme classes
        document.body.classList.remove('theme-physics', 'theme-chemistry', 'theme-biology');
        if (['Physics', 'Chemistry', 'Biology'].includes(subName)) {
            document.body.classList.add(`theme-${subName.toLowerCase()}`);
        }
    }

    openTopicModal(topicTitle) {
        const topicData = this.findTopicData(this.currentSubject, topicTitle);
        if (!topicData) return;

        this.activeTopic = topicData;
        this.modalTopicTitle.textContent = topicTitle;
        this.renderModalClasses();
        this.topicModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    closeTopicModal() {
        this.topicModal.classList.add('hidden');
        this.activeTopic = null;
        document.body.style.overflow = '';
        this.render(); // Refresh cards to show current progress
    }

    renderModalClasses() {
        const subject = this.currentSubject;
        const topic = this.activeTopic;
        const completedData = (this.storageData[subject] && this.storageData[subject][topic.name]) || {};
        const completedCount = Object.keys(completedData).length;

        this.modalTopicBadge.textContent = `${completedCount}/${topic.classes} Completed`;

        let badgeClass = 'pill-badge';
        if (completedCount === topic.classes) {
            badgeClass += ' done';
        } else if (completedCount > 0) {
            badgeClass += ' in-progress';
        }
        this.modalTopicBadge.className = badgeClass;

        this.topicClassesGrid.innerHTML = Array.from({ length: topic.classes }, (_, i) => {
            const classIdx = i + 1;
            const completionTimestamp = completedData[classIdx];
            const isChecked = !!completionTimestamp;

            return `
                <div class="class-item ${isChecked ? 'completed' : ''}">
                    <div class="class-left">
                        <input type="checkbox" 
                               data-subject="${subject}" 
                               data-topic="${topic.name}" 
                               data-class-index="${classIdx}" 
                               ${isChecked ? 'checked' : ''}>
                        <span class="class-name">Lesson ${classIdx}</span>
                    </div>
                    ${isChecked ? `<span class="completion-date">${completionTimestamp}</span>` : ''}
                </div>
            `;
        }).join('');
    }

    toggleClass(subject, topicTitle, classIdx, isChecked, checkboxEl) {
        if (!this.storageData[subject]) this.storageData[subject] = {};
        if (!this.storageData[subject][topicTitle]) this.storageData[subject][topicTitle] = {};

        if (isChecked) {
            const date = new Date();
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const hours = date.getHours();
            const mins = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = String(hours % 12 || 12).padStart(2, '0');
            const dateStr = `${day}/${month} ${displayHours}:${mins} ${ampm}`;

            this.storageData[subject][topicTitle][classIdx] = dateStr;

            this.metadata.lastStudied = { subject, topic: topicTitle };
            this.showToast("Progress Saved! ✨", "success");
        } else {
            delete this.storageData[subject][topicTitle][classIdx];
            this.showToast("Progress Reverted.", "info");
        }

        this.saveData();
        this.renderModalClasses(); // Update modal immediately
        this.updateSubjectProgress();
        this.updateOverallProgress();
    }

    findTopicData(subjectName, topicTitle) {
        const subject = STUDY_DATA[subjectName];
        if (!subject) return null;

        if (subject.subdivisions) {
            for (const sub of subject.subdivisions) {
                const topic = sub.topics.find(t => t.name === topicTitle);
                if (topic) return topic;
            }
        } else if (subject.topics) {
            return subject.topics.find(t => t.name === topicTitle);
        }
        return null;
    }

    getTopicIcon(topicName) {
        const iconMap = {
            // Reasoning
            "Coding & Decoding": "💻",
            "Alphabetical Series": "🔠",
            "Number Series": "🔢",
            "Syllogism": "🧠",
            "Analogy": "🤝",
            "Venn Diagram": "⭕",
            "Ranking": "🏆",
            "Seating Arrangement": "🪑",
            "Blood Relation": "👨‍👩‍👧‍👦",
            "Direction": "⬆️",
            "Calendar": "📅",
            "Statement & Conclusion": "📝",
            "Statement & Argument": "🗣️",
            "Statement & Assumption": "💭",
            "Statement & Course of Action": "🚀",
            "Counting of Figures": "📐",
            "Mirror Image": "🪞",
            "Water Image": "💧",

            // Mathematics
            "Calculation": "➗",
            "Ratio & Proportion": "📉",
            "Percentage": "📈",
            "Profit & Loss": "💰",
            "Discount": "🏷️",
            "Simple Interest": "🏦",
            "Compound Interest": "💹",
            "Age": "🎂",
            "Time & Work": "⏱️",
            "Time & Distance": "🚗",
            "Train & Race": "🚂",
            "Pipes & Cisterns": "🚰",
            "Boats & Streams": "⛵",
            "Partnership": "🤝",
            "HCF & LCM": "🔢",
            "Mixture & Alligation": "🧪",
            "Average": "📊",
            "Data Interpretation": "📋",
            "Statistics": "📉",
            "Surds & Indices": "√",
            "Number System": "🔟",
            "AP & GP": "📏",
            "Algebra": "🧮",
            "Polynomials & Equations": "📝",
            "Trigonometry": "📐",
            "Height & Distance": "🔭",
            "Mensuration": "📏",
            "Geometry": "📐",
            "Simplification": "✅",

            // Science
            "Light": "💡",
            "Human Eye": "👁️",
            "Heat": "🔥",
            "Electricity": "⚡",
            "Magnetic Effects of Current": "🧲",
            "Motion": "🏃",
            "Laws of Motion": "⚖️",
            "Gravitation": "🌎",
            "Work, Power & Energy": "🔋",
            "Sound": "🔊",
            "Thermal Heat": "🌡️",
            "Electronics": "📟",
            "Matter": "⚛️",
            "Matter Around Us Is Pure": "🔬",
            "Atoms & Molecules": "🔬",
            "Structure of Atom": "⚛️",
            "Chemical Reactions & Equations": "🧪",
            "Acids, Bases & Salts": "🧪",
            "Metals & Non-metals": "💎",
            "Carbon & Its Compounds": "💎",
            "Unit of Life": "🧬",
            "Tissues": "🔬",
            "Diversity in Living Organisms": "🌿",
            "Life Processes": "🌱",
            "Control & Coordination": "🧠",
            "How Do Organisms Reproduce": "👪",
            "Heredity & Evolution": "🧬",
            "Nutrition & Diseases": "🍎",
            "YouTube Science Classes": "📺"
        };
        return iconMap[topicName] || "📚";
    }

    showToast(message, type = "info") {
        if (!this.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    saveData() {
        localStorage.setItem('study_tracker_v2', JSON.stringify(this.storageData));
        localStorage.setItem('study_tracker_meta', JSON.stringify(this.metadata));
    }

    updateDailyMotivation() {
        const today = new Date().toISOString().split('T')[0];
        const count = this.metadata.dailyStats[today] || 0;
        if (this.dailyMotivation) {
            this.dailyMotivation.textContent = `Today completed: ${count} classes`;
        }
    }

    handleQuickJump() {
        let target = this.findNextIncomplete();

        if (target) {
            this.currentSubject = target.subject;
            this.currentSubdivision = target.subdivision;
            this.render();

            setTimeout(() => {
                this.openTopicModal(target.topic);
            }, 500);
        } else {
            alert("All topics are completed! Great job!");
        }
    }

    findNextIncomplete() {
        for (const [subjectName, subjectData] of Object.entries(STUDY_DATA)) {
            if (subjectData.subdivisions) {
                for (const sub of subjectData.subdivisions) {
                    for (const topic of sub.topics) {
                        if (!this.isCompleted(subjectName, topic)) {
                            return { subject: subjectName, subdivision: sub.name, topic: topic.name };
                        }
                    }
                }
            } else {
                for (const topic of subjectData.topics) {
                    if (!this.isCompleted(subjectName, topic)) {
                        return { subject: subjectName, subdivision: null, topic: topic.name };
                    }
                }
            }
        }
        return null;
    }

    isCompleted(subject, topic) {
        const completed = (this.storageData[subject] && this.storageData[subject][topic.name]) || {};
        return Object.keys(completed).length === topic.classes;
    }

    render() {
        const subjectData = STUDY_DATA[this.currentSubject];
        this.renderSubdivisions(subjectData);

        let topicsToShow = [];
        if (subjectData.subdivisions) {
            if (!this.currentSubdivision) {
                this.currentSubdivision = subjectData.subdivisions[0].name;
            }
            const activeSub = subjectData.subdivisions.find(s => s.name === this.currentSubdivision);
            topicsToShow = activeSub ? activeSub.topics : [];

            const subBtns = this.subdivisionNav.querySelectorAll('.sub-btn');
            subBtns.forEach(btn => {
                const isActive = btn.dataset.name === this.currentSubdivision;
                btn.classList.toggle('active', isActive);
            });
        } else {
            topicsToShow = subjectData.topics;
        }

        this.renderTopics(topicsToShow);
        this.updateSubjectProgress();
    }

    renderSubdivisions(subjectData) {
        if (subjectData.subdivisions) {
            this.subdivisionNav.classList.remove('hidden');
            this.subdivisionNav.innerHTML = subjectData.subdivisions.map(sub => `
                <button class="sub-btn ${this.currentSubdivision === sub.name ? 'active' : ''}" 
                        data-name="${sub.name}">
                    ${sub.name}
                </button>
            `).join('');

            this.subdivisionNav.querySelectorAll('.sub-btn').forEach(btn => {
                btn.addEventListener('click', () => this.switchSubdivision(btn.dataset.name));
            });
        } else {
            this.subdivisionNav.classList.add('hidden');
            this.subdivisionNav.innerHTML = '';
        }
    }

    renderTopics(topics) {
        this.topicsContainer.innerHTML = '';
        topics.forEach(topic => {
            const card = this.createTopicCard(topic);
            this.topicsContainer.appendChild(card);
        });
    }

    createTopicCard(topic) {
        const subject = this.currentSubject;
        const completedData = (this.storageData[subject] && this.storageData[subject][topic.name]) || {};
        const completedCount = Object.keys(completedData).length;
        const isTopicCompleted = completedCount === topic.classes;

        const card = document.createElement('div');
        card.className = `topic-card ${isTopicCompleted ? 'completed' : ''}`;
        card.dataset.topic = topic.name;

        card.innerHTML = `
            <div class="topic-info-left" style="overflow: hidden;">
                <div class="icon-box">${this.getTopicIcon(topic.name)}</div>
                <div class="topic-details" style="overflow: hidden;">
                    <span class="topic-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.95rem;">${topic.name}</span>
                    <span class="topic-lessons-count" style="font-size: 0.8rem;">${completedCount}/${topic.classes} Lessons</span>
                </div>
            </div>
            <div class="topic-info-right" style="display: flex; align-items: center; flex-shrink: 0; gap: 0.5rem;">
                ${isTopicCompleted ?
                '<span class="pill-badge done" style="font-size: 0.70rem; padding: 0.2rem 0.5rem;">DONE</span>' :
                (completedCount > 0 ? '<span class="pill-badge in-progress" style="font-size: 0.70rem; padding: 0.2rem 0.5rem;">In Progress</span>' : '')
            }
                <span class="topic-arrow" style="font-size: 0.8rem;">❯</span>
            </div>
        `;

        return card;
    }

    updateSubjectProgress() {
        const subjectData = STUDY_DATA[this.currentSubject];
        let totalClasses = 0;
        let completedClasses = 0;
        let totalTopics = 0;
        let completedTopics = 0;

        const countStats = (topics) => {
            topics.forEach(topic => {
                totalTopics++;
                totalClasses += topic.classes;
                const completed = (this.storageData[this.currentSubject] && this.storageData[this.currentSubject][topic.name]) || {};
                const count = Object.keys(completed).length;
                completedClasses += count;
                if (count === topic.classes) completedTopics++;
            });
        };

        if (subjectData.subdivisions) {
            subjectData.subdivisions.forEach(sub => countStats(sub.topics));
        } else {
            countStats(subjectData.topics);
        }

        const percentage = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;

        if (this.subjectProgressText) this.subjectProgressText.innerHTML = `<span class="pill-badge">🧠 ${completedClasses} / ${totalClasses} Completed</span>`;
        if (this.subjectPercentageText) this.subjectPercentageText.textContent = `${percentage}%`;
        if (this.subjectCircleFill) this.subjectCircleFill.setAttribute('stroke-dasharray', `${percentage}, 100`);

        // Update subdivision nav if visible to ensure active state is correct
        if (this.currentSubject === 'Science' && this.currentSubdivision) {
            this.applySubdivisionTheme(this.currentSubdivision);
        }
    }

    updateLastStudied() {
        if (this.metadata.lastStudied) {
            const lastStudiedEl = document.getElementById('last-studied-display');
            if (lastStudiedEl) {
                lastStudiedEl.textContent = `Last Studied: ${this.metadata.lastStudied.topic}`;
            }
        }
    }

    updateOverallProgress() {
        let totalClasses = 0;
        let completedClasses = 0;

        Object.entries(STUDY_DATA).forEach(([subjectName, subjectData]) => {
            const countGlobal = (topics) => {
                topics.forEach(topic => {
                    totalClasses += topic.classes;
                    const completed = (this.storageData[subjectName] && this.storageData[subjectName][topic.name]) || {};
                    completedClasses += Object.keys(completed).length;
                });
            };

            if (subjectData.subdivisions) {
                subjectData.subdivisions.forEach(sub => countGlobal(sub.topics));
            } else {
                countGlobal(subjectData.topics);
            }
        });

        const percentage = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
        if (this.overallPercentageText) this.overallPercentageText.textContent = `${percentage}%`;
        if (this.overallProgressBar) this.overallProgressBar.style.width = `${percentage}%`;

        this.updateLastStudied();
    }
}

class AdminController {
    constructor(trackerInstance) {
        this.tracker = trackerInstance;
        this.password = 'admin123';
        this.isUnlocked = false;
        this.isEditMode = false;
        this.pendingAction = null;

        this.unlockBtn = document.getElementById('unlock-btn');
        this.adminControls = document.getElementById('admin-controls');
        this.editBtn = document.getElementById('edit-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.editModeLabel = document.getElementById('edit-mode-label');

        this.passwordModal = document.getElementById('password-modal');
        this.passwordInput = document.getElementById('password-input');
        this.passwordError = document.getElementById('password-error');
        this.modalDescription = document.getElementById('modal-description');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.confirmBtn = document.getElementById('confirm-btn');

        this.resetModal = document.getElementById('reset-modal');
        this.resetCancelBtn = document.getElementById('reset-cancel-btn');
        this.resetConfirmBtn = document.getElementById('reset-confirm-btn');

        this.init();
    }

    init() {
        this.addEventListeners();
        document.body.classList.remove('edit-mode');
    }

    addEventListeners() {
        this.unlockBtn.addEventListener('click', () => this.showPasswordModal('unlock'));
        this.editBtn.addEventListener('click', () => this.toggleEditMode());
        this.resetBtn.addEventListener('click', () => this.showResetConfirmation());
        this.cancelBtn.addEventListener('click', () => this.hidePasswordModal());
        this.confirmBtn.addEventListener('click', () => this.verifyPassword());
        this.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.verifyPassword();
        });
        this.resetCancelBtn.addEventListener('click', () => this.hideResetModal());
        this.resetConfirmBtn.addEventListener('click', () => this.performReset());
        this.passwordModal.addEventListener('click', (e) => {
            if (e.target === this.passwordModal) this.hidePasswordModal();
        });
        this.resetModal.addEventListener('click', (e) => {
            if (e.target === this.resetModal) this.hideResetModal();
        });
    }

    showPasswordModal(action) {
        this.pendingAction = action;
        this.passwordModal.classList.remove('hidden');
        this.passwordInput.value = '';
        this.passwordError.classList.add('hidden');
        this.modalDescription.textContent = action === 'unlock' ? 'Enter password to unlock admin controls' : 'Enter password to reset all progress';
        setTimeout(() => this.passwordInput.focus(), 100);
    }

    hidePasswordModal() {
        this.passwordModal.classList.add('hidden');
        this.passwordInput.value = '';
        this.passwordError.classList.add('hidden');
        this.pendingAction = null;
    }

    verifyPassword() {
        if (this.passwordInput.value === this.password) {
            this.hidePasswordModal();
            if (this.pendingAction === 'unlock') this.unlockAdminControls();
            else if (this.pendingAction === 'reset') this.showResetConfirmation();
        } else {
            this.passwordError.classList.remove('hidden');
            this.passwordInput.value = '';
            this.passwordInput.focus();
        }
    }

    unlockAdminControls() {
        this.isUnlocked = true;
        this.unlockBtn.classList.add('hidden');
        this.adminControls.classList.remove('hidden');
    }

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        this.tracker.isEditMode = this.isEditMode;
        document.body.classList.toggle('edit-mode', this.isEditMode);
        this.editBtn.classList.toggle('active', this.isEditMode);
        this.editModeLabel.classList.toggle('visible', this.isEditMode);
        this.tracker.showToast(this.isEditMode ? "Edit Mode Enabled – LIVE ⚡" : "Edit Mode Disabled.", this.isEditMode ? "success" : "info");
    }

    showResetConfirmation() {
        this.resetModal.classList.remove('hidden');
    }

    hideResetModal() {
        this.resetModal.classList.add('hidden');
    }

    performReset() {
        localStorage.removeItem('study_tracker_v2');
        localStorage.removeItem('study_tracker_meta');
        this.hideResetModal();
        window.location.reload();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tracker = new StudyTracker();
    new AdminController(tracker);
});

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

        // Event delegation for class items
        this.topicsContainer.addEventListener('click', (e) => {
            const classItem = e.target.closest('.class-item');
            if (classItem) {
                const checkbox = classItem.querySelector('input[type="checkbox"]');
                if (!checkbox) return;

                const { subject, subdivision, topic, classIndex } = checkbox.dataset;
                const idx = parseInt(classIndex);
                const isCompleted = !!(this.storageData[subject] && this.storageData[subject][topic] && this.storageData[subject][topic][idx]);

                // Normal Mode Restriction: Cannot undo/uncheck completed items
                if (isCompleted && !this.isEditMode) {
                    this.showToast("Completed classes are locked. Unlock Admin to edit.", "info");
                    return;
                }

                // Manual Toggle Logic
                const newState = !isCompleted;

                // Prevent default if we clicked the checkbox directly to handle it manually
                if (e.target.type === 'checkbox') {
                    e.preventDefault();
                }

                this.toggleClass(subject, subdivision || null, topic, idx, newState, checkbox);
            }
        });

        this.quickJumpBtn.addEventListener('click', () => this.handleQuickJump());
    }

    switchSubject(subject) {
        this.currentSubject = subject;
        this.currentSubdivision = null; // Reset subdivision on subject change

        // Update Nav UI
        this.navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subject === subject);
        });

        this.subjectTitle.textContent = subject;
        this.render();
    }

    switchSubdivision(subName) {
        this.currentSubdivision = subName;
        this.render();
    }

    toggleClass(subject, subdivision, topicTitle, classIdx, isChecked, checkboxEl) {
        if (!this.storageData[subject]) this.storageData[subject] = {};
        if (!this.storageData[subject][topicTitle]) this.storageData[subject][topicTitle] = {};

        const today = new Date().toISOString().split('T')[0];
        if (!this.metadata.dailyStats[today]) this.metadata.dailyStats[today] = 0;

        if (isChecked) {
            const date = new Date();
            const dateStr = `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
            this.storageData[subject][topicTitle][classIdx] = dateStr;

            // Updated last studied and daily count
            this.metadata.lastStudied = { subject, subdivision, topic: topicTitle };
            this.metadata.dailyStats[today]++;
            this.showToast("Class marked as completed! ✨", "success");
        } else {
            delete this.storageData[subject][topicTitle][classIdx];
            if (this.metadata.dailyStats[today] > 0) this.metadata.dailyStats[today]--;
            this.showToast("Class reverted to pending.", "info");
        }

        this.saveData();

        // Granular UI Update instead of this.render()
        this.updateItemUI(checkboxEl, isChecked, topicTitle, subject);
        this.updateSubjectProgress();
        this.updateOverallProgress();
        this.updateDailyMotivation();

        // Auto-collapse behavior only in normal mode
        if (isChecked && !this.isEditMode) {
            const card = document.querySelector(`.topic-card[data-topic="${topicTitle}"]`);
            if (card) {
                setTimeout(() => card.classList.remove('expanded'), 300);
            }
        }
    }

    updateItemUI(checkboxEl, isChecked, topicTitle, subjectName) {
        const itemWrapper = checkboxEl.closest('.class-item');
        const topicCard = checkboxEl.closest('.topic-card');

        // 1. Update the individual item
        if (itemWrapper) {
            itemWrapper.classList.toggle('completed', isChecked);

            // Force checkbox state (very important for manual toggles)
            const checkbox = itemWrapper.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = isChecked;

            // Remove old date if exists, add new one if checked
            const existingDate = itemWrapper.querySelector('.completion-date');
            if (existingDate) existingDate.remove();

            if (isChecked) {
                const dateStr = this.storageData[subjectName][topicTitle][checkboxEl.dataset.classIndex];
                const dateSpan = document.createElement('span');
                dateSpan.className = 'completion-date';
                dateSpan.textContent = `Completed on ${dateStr}`;
                itemWrapper.appendChild(dateSpan);
            }
        }

        // 2. Update parent card status and badge
        if (topicCard) {
            const completedData = this.storageData[subjectName][topicTitle] || {};
            const completedCount = Object.keys(completedData).length;
            const topicData = this.findTopicData(subjectName, topicTitle);
            const totalClasses = topicData ? topicData.classes : 0;

            const isFullyCompleted = completedCount === totalClasses;
            topicCard.classList.toggle('completed', isFullyCompleted);

            const badge = topicCard.querySelector('.topic-status-badge');
            if (badge) {
                badge.textContent = `${completedCount}/${totalClasses} DONE`;
            }
        }
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
                const card = document.querySelector(`.topic-card[data-topic="${target.topic}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('expanded');
                    card.classList.add('last-studied');
                    setTimeout(() => card.classList.remove('last-studied'), 2000);
                }
            }, 100);
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
            subBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.name === this.currentSubdivision));
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
        const subdivision = this.currentSubdivision;
        const completedData = (this.storageData[subject] && this.storageData[subject][topic.name]) || {};
        const completedCount = Object.keys(completedData).length;
        const isTopicCompleted = completedCount === topic.classes;

        const isLastStudied = this.metadata.lastStudied &&
            this.metadata.lastStudied.subject === subject &&
            this.metadata.lastStudied.topic === topic.name;

        const isYouTubeScience = topic.name === "YouTube Science Classes";

        const card = document.createElement('div');
        card.className = `topic-card ${isTopicCompleted ? 'completed' : ''} ${isLastStudied ? 'last-studied' : ''} ${isYouTubeScience ? 'full-width' : ''}`;
        card.dataset.topic = topic.name;

        card.innerHTML = `
            <div class="topic-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="topic-title-group">
                    <span class="topic-type">${topic.classes} Classes</span>
                    <h3 class="topic-title">${topic.name}</h3>
                </div>
                <div class="topic-header-right">
                    <div class="topic-status-badge">
                        ${completedCount}/${topic.classes} DONE
                    </div>
                    <span class="expand-icon">▼</span>
                </div>
            </div>
            <div class="classes-list ${isYouTubeScience ? 'grid-layout' : ''}">
                ${Array.from({ length: topic.classes }, (_, i) => {
            const classIdx = i + 1;
            const completionDate = completedData[classIdx];
            const isChecked = !!completionDate;

            return `
                        <label class="class-item ${isChecked ? 'completed' : ''}">
                            <div class="class-left">
                                <input type="checkbox" 
                                       data-subject="${subject}" 
                                       ${subdivision ? `data-subdivision="${subdivision}"` : ''}
                                       data-topic="${topic.name}" 
                                       data-class-index="${classIdx}" 
                                       ${isChecked ? 'checked' : ''}>
                                <span class="class-name">Class ${classIdx}</span>
                            </div>
                            ${isChecked ? `<span class="completion-date">Completed on ${completionDate}</span>` : ''}
                        </label>
                    `;
        }).join('')}
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

        if (this.subjectProgressText) this.subjectProgressText.textContent = `${completedTopics}/${totalTopics} Topics Completed`;
        if (this.subjectPercentageText) this.subjectPercentageText.textContent = `${percentage}%`;
        if (this.subjectCircleFill) this.subjectCircleFill.setAttribute('stroke-dasharray', `${percentage}, 100`);
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

import STUDY_DATA from './data.js';

class StudyTracker {
    constructor() {
        this.currentSubject = "Reasoning";
        this.currentSubdivision = null;
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

        // Event delegation for checkboxes
        this.topicsContainer.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const { subject, subdivision, topic, classIndex } = e.target.dataset;
                this.toggleClass(subject, subdivision || null, topic, parseInt(classIndex), e.target.checked);
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

    toggleClass(subject, subdivision, topicTitle, classIdx, isChecked) {
        if (!this.storageData[subject]) this.storageData[subject] = {};
        if (!this.storageData[subject][topicTitle]) this.storageData[subject][topicTitle] = {};

        const today = new Date().toISOString().split('T')[0];
        if (!this.metadata.dailyStats[today]) this.metadata.dailyStats[today] = 0;

        if (isChecked) {
            const date = new Date();
            const dateStr = `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
            this.storageData[subject][topicTitle][classIdx] = dateStr;

            // Phase 2: Update last studied and daily count
            this.metadata.lastStudied = { subject, subdivision, topic: topicTitle };
            this.metadata.dailyStats[today]++;

            // Phase 2: Auto-collapse behavior
            const card = document.querySelector(`.topic-card[data-topic="${topicTitle}"]`);
            if (card) {
                setTimeout(() => card.classList.remove('expanded'), 300);
            }
        } else {
            delete this.storageData[subject][topicTitle][classIdx];
            if (this.metadata.dailyStats[today] > 0) this.metadata.dailyStats[today]--;
        }

        this.saveData();
        this.render(); // Re-render to update UI and progress
        this.updateOverallProgress();
        this.updateDailyMotivation();
    }

    saveData() {
        localStorage.setItem('study_tracker_v2', JSON.stringify(this.storageData));
        localStorage.setItem('study_tracker_meta', JSON.stringify(this.metadata));
    }

    updateDailyMotivation() {
        const today = new Date().toISOString().split('T')[0];
        const count = this.metadata.dailyStats[today] || 0;
        this.dailyMotivation.textContent = `Today completed: ${count} classes`;
    }

    handleQuickJump() {
        // Look for the next incomplete class globally
        let target = this.findNextIncomplete();

        if (target) {
            this.currentSubject = target.subject;
            this.currentSubdivision = target.subdivision;
            this.render();

            // Wait for render, then scroll to the topic and expand it
            setTimeout(() => {
                const card = document.querySelector(`.topic-card[data-topic="${target.topic}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('expanded');
                    card.classList.add('last-studied'); // Temporary visual cue
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
            // If no subdivision selected, pick the first one
            if (!this.currentSubdivision) {
                this.currentSubdivision = subjectData.subdivisions[0].name;
            }
            const activeSub = subjectData.subdivisions.find(s => s.name === this.currentSubdivision);
            topicsToShow = activeSub ? activeSub.topics : [];

            // Update subdivision nav buttons active state
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

            // Add click events to sub-buttons
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

        // Phase 2: Check if this was the last studied topic
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

        this.subjectProgressText.textContent = `${completedTopics}/${totalTopics} Topics Completed`;
        this.subjectPercentageText.textContent = `${percentage}%`;
        this.subjectCircleFill.setAttribute('stroke-dasharray', `${percentage}, 100`);
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
        this.overallPercentageText.textContent = `${percentage}%`;
        this.overallProgressBar.style.width = `${percentage}%`;
    }
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StudyTracker();
});

(function () {

    const { ipcRenderer } = require('electron');
    const remote = require('@electron/remote');
    var updatePhoneInfoInterval = null;

    const QUICK_REPLY_STORAGE_KEY = 'quickReplyTemplates';
    const QR_CSS_ID = 'quick-reply-styles'; //id for injected style tag
    let quickReplyButton = null;
    let quickReplyPanel = null;
    let messageInputTarget = null; //store the target input element

    //create stylesheet
    function injectQuickReplyCSS() {
        if (document.getElementById(QR_CSS_ID)) return; //check if already injected

        const styles = `
            :root {
                --qr-bg: #ffffff;
                --qr-border: #e2e8f0;
                --qr-text: #0f172a;
                --qr-muted-text: #64748b;
                --qr-input-bg: #f8fafc;
                --qr-input-border: #cbd5e1;
                --qr-button-hover-bg: #f1f5f9;
                --qr-primary: #2563eb; /* Example primary color */
                --qr-primary-text: #ffffff;
                --qr-radius: 0.5rem;
            }

            /* Optional: Add dark mode support based on WA's body class */
            body.dark {
                --qr-bg: #1f2937; /* Darker background */
                --qr-border: #374151;
                --qr-text: #f3f4f6;
                --qr-muted-text: #9ca3af;
                --qr-input-bg: #374151;
                --qr-input-border: #4b5563;
                --qr-button-hover-bg: #374151;
            }

            .qr-trigger-button {
                padding: 0 8px;
                height: 40px;
                border: none;
                background-color: transparent;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--qr-muted-text); /* Use variable */
                border-radius: var(--qr-radius);
                transition: background-color 0.2s ease;
            }
            .qr-trigger-button:hover {
                background-color: var(--qr-button-hover-bg); /* Use variable */
            }
            .qr-trigger-button svg {
                 width: 20px;
                 height: 20px;
            }

            .qr-panel {
                position: absolute;
                left: -9999px;
                top: -9999px;
                background-color: var(--qr-bg);
                border: 1px solid var(--qr-border);
                border-radius: var(--qr-radius);
                padding: 8px;
                z-index: 1100;
                max-height: 250px;
                width: 250px;
                overflow-y: auto;
                display: none; /* Controlled by JS */
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                color: var(--qr-text);
                padding-top: 28px;
            }
            .qr-panel-placeholder {
                padding: 10px;
                text-align: center;
                color: var(--qr-muted-text);
                font-style: italic;
                font-size: 0.9em;
            }

            .qr-template-button {
                display: block;
                width: 100%;
                padding: 8px 12px;
                margin-bottom: 4px;
                border: none;
                background-color: transparent;
                color: var(--qr-text);
                text-align: left;
                cursor: pointer;
                border-radius: calc(var(--qr-radius) - 2px); /* Slightly smaller radius */
                transition: background-color 0.1s ease;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis; /* Add ellipsis for long text */
            }
            .qr-template-button:hover {
                background-color: var(--qr-button-hover-bg);
            }

            .qr-add-container {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--qr-border);
                display: flex;
                gap: 5px;
            }
            .qr-add-input {
                flex-grow: 1;
                padding: 6px 10px;
                border: 1px solid var(--qr-input-border);
                border-radius: var(--qr-radius);
                background-color: var(--qr-input-bg);
                color: var(--qr-text);
                font-size: 0.9em;
                 min-width: 0; /* Prevent flex overflow issues */
            }
            .qr-add-button {
                padding: 6px 12px;
                border: 1px solid var(--qr-input-border); /* Match input border */
                background-color: var(--qr-button-hover-bg); /* Subtle background */
                color: var(--qr-text);
                cursor: pointer;
                border-radius: var(--qr-radius);
                font-size: 0.9em;
                transition: background-color 0.1s ease;
                flex-shrink: 0; /* Prevent shrinking */
            }
            .qr-add-button:hover {
                 background-color: var(--qr-border); /* Slightly darker hover */
            }

            .qr-panel-close-button {
                position: absolute;
                top: 4px;
                right: 4px;
                width: 20px;
                height: 20px;
                padding: 0;
                border: none;
                background: transparent;
                cursor: pointer;
                color: var(--qr-muted-text);
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%; /* Make it round */
                transition: background-color 0.2s ease;
            }
            .qr-panel-close-button:hover {
                background-color: var(--qr-button-hover-bg);
                color: var(--qr-text); /* Darken icon on hover */
            }
            .qr-panel-close-button svg {
                width: 16px; /* Smaller icon */
                height: 16px;
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.id = QR_CSS_ID;
        styleSheet.type = "text/css";
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
        console.log("quick reply css injected");
    }


    function getQuickReplies() {
        return JSON.parse(localStorage.getItem(QUICK_REPLY_STORAGE_KEY) || '[]');
    }

    function saveQuickReplies(replies) {
        localStorage.setItem(QUICK_REPLY_STORAGE_KEY, JSON.stringify(replies));
    }

    function insertQuickReply(text) {
        if (!messageInputTarget) return;

        messageInputTarget.focus();
        document.execCommand('insertText', false, text);

        //hide panel
        if (quickReplyPanel) quickReplyPanel.style.display = 'none';

        //find and click send button
        const sendButtonSelector = 'button[aria-label="Enviar"], button[aria-label="Send"]';
        setTimeout(() => {
            const footer = messageInputTarget.closest('footer');
            const sendButton = footer?.querySelector(sendButtonSelector);
            if (sendButton) {
                console.log("send button found");
                sendButton.click();
            } else {
                console.warn("send button not found with ", sendButtonSelector);
                messageInputTarget.focus();
            }
        }, 50);
    }

    function openQuickReplyPanel() {
        const shouldDisplay = !quickReplyPanel || quickReplyPanel.style.display === 'none';

        if (!quickReplyPanel) {
            quickReplyPanel = document.createElement('div');
            quickReplyPanel.className = 'qr-panel';
            document.body.appendChild(quickReplyPanel);
        }

        quickReplyPanel.innerHTML = '';

        const closeButton = document.createElement('button');
        closeButton.className = 'qr-panel-close-button';
        closeButton.title = 'Close';
        closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`; // Simple X icon
        closeButton.onclick = () => {
            if (quickReplyPanel) {
                quickReplyPanel.style.display = 'none';
            }
        };
        quickReplyPanel.appendChild(closeButton);


        const replies = getQuickReplies();
        if (replies.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'qr-panel-placeholder';
            placeholder.textContent = 'No templates saved yet.';
            quickReplyPanel.appendChild(placeholder);
        } else {
            replies.forEach(reply => {
                const btn = document.createElement('button');
                btn.className = 'qr-template-button';
                btn.textContent = reply;
                btn.title = reply;
                btn.onclick = () => insertQuickReply(reply);
                quickReplyPanel.appendChild(btn);
            });
        }

        const addContainer = document.createElement('div');
        addContainer.className = 'qr-add-container';
        const addInput = document.createElement('input');
        addInput.className = 'qr-add-input';
        addInput.type = 'text';
        addInput.placeholder = 'New template...';
        const addButton = document.createElement('button');
        addButton.className = 'qr-add-button';
        addButton.textContent = 'Add';

        addInput.onkeydown = (e) => {
            if (e.key === 'Enter' && addInput.value.trim()) {
                addButton.click();
            }
        };
        addButton.onclick = () => {
            if (addInput.value.trim()) {
                const currentReplies = getQuickReplies();
                currentReplies.push(addInput.value.trim());
                saveQuickReplies(currentReplies);
                addInput.value = '';
                openQuickReplyPanel();
                const refreshedInput = quickReplyPanel.querySelector('.qr-add-input');
                refreshedInput?.focus();
            }
        };
        addContainer.appendChild(addInput);
        addContainer.appendChild(addButton);
        quickReplyPanel.appendChild(addContainer);

        if (shouldDisplay) {
            if (quickReplyButton) {
                const buttonRect = quickReplyButton.getBoundingClientRect();
                const panelMargin = 5;

                let panelLeft = buttonRect.left;
                let panelBottom = window.innerHeight - buttonRect.top + panelMargin;

                //set panel style 
                quickReplyPanel.style.left = `${panelLeft}px`;
                quickReplyPanel.style.bottom = `${panelBottom}px`;
                quickReplyPanel.style.top = 'auto';
                quickReplyPanel.style.right = 'auto';

            } else {
                console.warn("quick reply button not found");
            }

            quickReplyPanel.style.display = 'block';
            const addInput = quickReplyPanel.querySelector('.qr-add-input');
            addInput?.focus();
        } else {
            quickReplyPanel.style.display = 'none';
        }
    }


    function injectQuickReplyButton(targetElement) {
        if (quickReplyButton && quickReplyButton.parentElement) {
            quickReplyButton.parentElement.removeChild(quickReplyButton);
        }
        quickReplyButton = null;

        if (!targetElement) return;

        quickReplyButton = document.createElement('button');
        quickReplyButton.className = 'qr-trigger-button';
        quickReplyButton.title = 'Quick Replies';
        quickReplyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`;
        quickReplyButton.onclick = openQuickReplyPanel;

        const attachmentButtonSelector = 'button[title="Adjuntar"], button[title="Attach"]'; //check for spanish/english
        const composerFooter = targetElement.closest('footer');
        const attachmentButton = composerFooter?.querySelector(attachmentButtonSelector);
        //find specific div containing the attachment button
        const attachmentButtonContainer = attachmentButton?.closest('div.x100vrsf'); //this may change

        if (attachmentButtonContainer && attachmentButtonContainer.parentElement) {
            //insert after attachment button
            attachmentButtonContainer.parentElement.insertBefore(quickReplyButton, attachmentButtonContainer.nextSibling);
        } else {
            //fallback: insert before emojis button
            const emojiButtonSelector = 'button[aria-label="Selector de expresiones"]';
            const emojiButton = composerFooter?.querySelector(emojiButtonSelector);
            if (emojiButton && emojiButton.parentElement) {
                emojiButton.parentElement.insertBefore(quickReplyButton, emojiButton);
            }
            //fallback: append to footer
            else if (composerFooter) {
                composerFooter.appendChild(quickReplyButton);
            } else {
                console.error("could not find location to inject button");
            }
        }
    }

    function updatePhoneInfo() {
        if (window.Store == undefined || window.Store.Conn == undefined) {
            return;
        }
        ipcRenderer.send('phoneinfoupdate', {
            'info': window.Store.Stream.info,
            'me': "+" + window.Store.Conn.me.split("@")[0],
            'battery': window.Store.Conn.battery,
            'plugged': window.Store.Conn.plugged,
            'platform': window.Store.Conn.platform,
            'phoneActive': window.Store.Stream.phoneActive,
            'phone': {
                'manufacturer': window.Store.Conn.phone.device_manufacturer,
                'model': window.Store.Conn.phone.device_model,
                'mcc': window.Store.Conn.phone.mcc,
                'mnc': window.Store.Conn.phone.mnc,
                'os_build_number': window.Store.Conn.phone.os_build_number,
                'os_version': window.Store.Conn.phone.os_version,
                'wa_version': window.Store.Conn.phone.wa_version
            }
        });
        if (updatePhoneInfoInterval != null) {
            clearInterval(updatePhoneInfoInterval);
            updatePhoneInfoInterval = null;
            setInterval(updatePhoneInfo, 2000)
        }
    }

    console.log("Waiting for DOMContentLoaded");
    document.addEventListener('DOMContentLoaded', function () {
        console.log("DOMContentLoaded event");

        injectQuickReplyCSS();
        updatePhoneInfoInterval = setInterval(updatePhoneInfo, 500);

        document.body.addEventListener('click', function (event) {
            if (!quickReplyPanel || quickReplyPanel.style.display === 'none') {
                return;
            }

            const emojiButtonSelector = 'button[aria-label="Selector de expresiones"]';
            const attachmentButtonSelector = 'button[title="Adjuntar"], button[title="Attach"]';

            //check for where were the clicks to close (or not) the modal
            const clickedEmojiButton = event.target.closest(emojiButtonSelector);
            const clickedAttachmentButton = event.target.closest(attachmentButtonSelector);
            const clickedInsidePanel = quickReplyPanel.contains(event.target);
            const clickedTriggerButton = quickReplyButton && quickReplyButton.contains(event.target);


            if ((clickedEmojiButton || clickedAttachmentButton) && !clickedInsidePanel && !clickedTriggerButton) {
                quickReplyPanel.style.display = 'none';
            }

        }, true);

        var observer = new MutationObserver(function (mutations) {
            var inputSearch = document.querySelector("input.input-search");
            if (inputSearch) {
                document.addEventListener("keydown", function (event) {
                    const isModifier = event.ctrlKey || event.metaKey;
                    if ((event.keyCode === 75 || event.keyCode == 70) && isModifier)
                        inputSearch.focus();
                });
            }

            const potentialInput = document.querySelector('footer [contenteditable="true"]');
            const qrButtonExists = quickReplyButton && document.contains(quickReplyButton);

            if (potentialInput) {
                if (!messageInputTarget || messageInputTarget !== potentialInput) {
                    console.log("msg input area found");
                    messageInputTarget = potentialInput;
                    console.log("injecting QR button due to new/changed input target");
                    injectQuickReplyButton(messageInputTarget);
                } else if (messageInputTarget === potentialInput && !qrButtonExists) {
                    console.warn("qr button missing from DOM, re-injecting.");
                    injectQuickReplyButton(messageInputTarget);
                }
            } else if (!potentialInput && messageInputTarget) {
                console.log("msg input area lost");
                messageInputTarget = null;
                if (quickReplyPanel) quickReplyPanel.style.display = 'none';
            }
        });

        var config = { childList: true, subtree: true };
        observer.observe(document.querySelector("body"), config);

    }, false);

    setInterval(function () {
        Array.from(document.querySelectorAll('audio')).map(function (audio) {
            audio.playbackRate = (window.audioRate || 1)
        });
        if (window.audioRate) {
            Array.from(document.querySelectorAll('.meta-audio *:first-child')).map(function (span) {
                span.innerHTML = window.audioRate.toFixed(1) + "x&nbsp;";
            });
        }
    }, 200);

    var NativeNotification = Notification;
    Notification = function (title, options) {
        if (remote.getGlobal("config").currentSettings.quietMode) {
            return;
        }
        var notification = new NativeNotification(title, options);
        notification.addEventListener('click', function () {
            ipcRenderer.send('notificationClick');
        });
        return notification;
    }
    Notification.prototype = NativeNotification.prototype;
    Notification.permission = NativeNotification.permission;
    Notification.requestPermission = NativeNotification.requestPermission.bind(Notification);

})();

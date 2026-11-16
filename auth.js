// auth.js
// ========
// Handles Firebase Authentication for SparkDeck.
// This file manages sign up, sign in, sign out, and auth state changes.
// It shows/hides the auth screen vs the main app based on login status.
// After login, it syncs user data with the Neon database via Netlify Functions.

(function () {
    // ---- DOM References ----
    const authScreen = document.getElementById('auth-screen');
    const appContainer = document.getElementById('app-container');
    const authError = document.getElementById('auth-error');
    const announcements = document.getElementById('announcements');

    // Login form elements
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    // Signup form elements
    const signupForm = document.getElementById('signup-form');
    const signupEmail = document.getElementById('signup-email');
    const signupPassword = document.getElementById('signup-password');
    const signupConfirm = document.getElementById('signup-confirm-password');
    const signupSubmitBtn = document.getElementById('signup-submit-btn');

    // Toggle buttons and their containers
    const showSignupBtn = document.getElementById('show-signup-btn');
    const showLoginBtn = document.getElementById('show-login-btn');
    const authToggleLogin = document.getElementById('auth-toggle-login');
    const authToggleSignup = document.getElementById('auth-toggle-signup');
    const authDivider = authScreen.querySelector('.auth-divider');

    // Forgot password elements
    const showResetBtn = document.getElementById('show-reset-btn');
    const authToggleForgot = document.getElementById('auth-toggle-forgot');
    const resetForm = document.getElementById('reset-form');
    const resetEmail = document.getElementById('reset-email');
    const resetSubmitBtn = document.getElementById('reset-submit-btn');
    const resetStatus = document.getElementById('reset-status');
    const resetBackBtn = document.getElementById('reset-back-btn');
    const authToggleReset = document.getElementById('auth-toggle-reset');

    // Email link screen (reset password / verify email links land here)
    const actionScreen = document.getElementById('action-screen');
    const actionError = document.getElementById('action-error');
    const actionLoading = document.getElementById('action-loading');
    const newPasswordForm = document.getElementById('new-password-form');
    const newPasswordHeading = document.getElementById('new-password-heading');
    const newPasswordEmail = document.getElementById('new-password-email');
    const newPassword = document.getElementById('new-password');
    const newPasswordConfirm = document.getElementById('new-password-confirm');
    const newPasswordSubmitBtn = document.getElementById('new-password-submit-btn');
    const newPasswordRuleList = document.getElementById('new-password-requirements');
    const actionResult = document.getElementById('action-result');
    const actionResultHeading = document.getElementById('action-result-heading');
    const actionResultMessage = document.getElementById('action-result-message');
    const actionContinueBtn = document.getElementById('action-continue-btn');
    const actionRetryBtn = document.getElementById('action-retry-btn');

    // Sign out button (in main app header)
    const signOutBtn = document.getElementById('sign-out-btn');
    const userEmailDisplay = document.getElementById('user-email-display');

    // Email verification banner
    const verifyBanner = document.getElementById('verify-email-banner');
    const verifyEmailAddress = document.getElementById('verify-email-address');
    const verifyCheckBtn = document.getElementById('verify-check-btn');
    const verifyResendBtn = document.getElementById('verify-resend-btn');
    const verifyStatus = document.getElementById('verify-email-status');
    const cloudSyncStatus = document.getElementById('cloud-sync-status');

    // Password rule checklist (signup form)
    const passwordRuleList = document.getElementById('password-requirements');

    // ---- Validation Rules ----

    // A complete address: something@domain.tld, where the last part has at
    // least two letters. Rejects things like "abc@a" or "abc@a." that the
    // browser and Firebase would otherwise accept.
    var EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

    var PASSWORD_MIN = 8;
    var PASSWORD_MAX = 64;
    // Symbols we accept, listed in the signup form so users know exactly what counts.
    var PASSWORD_SPECIALS = '!@#$%^&*()-_=+[]{};:,.?/~';

    var PASSWORD_RULES = [
        { id: 'length',  label: '8 to 64 characters',
          test: function (p) { return p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX; } },
        { id: 'upper',   label: 'an uppercase letter',
          test: function (p) { return /[A-Z]/.test(p); } },
        { id: 'lower',   label: 'a lowercase letter',
          test: function (p) { return /[a-z]/.test(p); } },
        { id: 'number',  label: 'a number',
          test: function (p) { return /[0-9]/.test(p); } },
        { id: 'special', label: 'one of the listed symbols',
          test: function (p) {
              for (var i = 0; i < p.length; i++) {
                  if (PASSWORD_SPECIALS.indexOf(p[i]) !== -1) return true;
              }
              return false;
          } }
    ];

    function isValidEmail(email) {
        return EMAIL_PATTERN.test(email);
    }

    function getUnmetPasswordRules(password) {
        return PASSWORD_RULES.filter(function (rule) { return !rule.test(password); });
    }

    // Update the visible checklist under the password field. Each item gets a
    // text status (not just a color) so it reads correctly with a screen reader.
    function updatePasswordChecklist(password, list) {
        list = list || passwordRuleList;
        if (!list) return;
        PASSWORD_RULES.forEach(function (rule) {
            var item = list.querySelector('[data-rule="' + rule.id + '"]');
            if (!item) return;
            var met = rule.test(password);
            item.classList.toggle('rule-met', met);
            var status = item.querySelector('.rule-status');
            if (status) status.textContent = met ? '(done)' : '(not met yet)';
        });
    }

    // "Your password still needs an uppercase letter and a number."
    function describeUnmetRules(unmet) {
        var missing = unmet.map(function (rule) { return rule.label; });
        var list = missing.length === 1
            ? missing[0]
            : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1];
        return 'Your password still needs ' + list + '.';
    }

    // ---- Show / Hide Password Buttons ----
    // Each button names the field(s) it controls in data-toggle-for. Its
    // label says what pressing it will do: "Show password" while hidden,
    // "Hide password" while shown. The change is also announced, because
    // some screen readers don't re-read a focused button when its name changes.

    var passwordToggles = [];

    function setupPasswordToggle(button) {
        var fields = button.getAttribute('data-toggle-for').split(' ').map(function (id) {
            return document.getElementById(id);
        }).filter(Boolean);
        if (fields.length === 0) return;
        var plural = fields.length > 1;
        var showLabel = plural ? 'Show passwords' : 'Show password';
        var hideLabel = plural ? 'Hide passwords' : 'Hide password';

        function setShown(shown) {
            fields.forEach(function (field) { field.type = shown ? 'text' : 'password'; });
            button.textContent = shown ? hideLabel : showLabel;
        }

        button.addEventListener('click', function () {
            var shown = fields[0].type === 'password';
            setShown(shown);
            announce(plural
                ? (shown ? 'Passwords shown' : 'Passwords hidden')
                : (shown ? 'Password shown' : 'Password hidden'));
        });

        passwordToggles.push(function () { setShown(false); });
    }

    // Put every password field back to hidden (when switching screens,
    // after signing in, and so on), so a password is never left on show.
    function hideAllPasswords() {
        passwordToggles.forEach(function (hide) { hide(); });
    }

    document.querySelectorAll('.password-toggle').forEach(setupPasswordToggle);

    // ---- Helper Functions ----

    var announceTimer = null;
    function announce(message) {
        if (!announcements) return;
        // Clear first, then set on the next tick, so the same message twice
        // in a row is still spoken. Each new message restarts the clean-up timer.
        clearTimeout(announceTimer);
        announcements.textContent = '';
        setTimeout(function () {
            announcements.textContent = message;
            announceTimer = setTimeout(function () { announcements.textContent = ''; }, 3000);
        }, 50);
    }

    function showError(message) {
        authError.textContent = message;
        authError.classList.remove('hidden');
        authError.setAttribute('role', 'alert');
        announce(message);
    }

    function clearError() {
        authError.textContent = '';
        authError.classList.add('hidden');
    }

    function setLoading(button, loading) {
        if (loading) {
            button.dataset.originalText = button.textContent;
            button.textContent = 'Please wait...';
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
        }
    }

    // Convert Firebase error codes to friendly messages
    function getFriendlyError(errorCode) {
        switch (errorCode) {
            case 'auth/email-already-in-use':
                return 'An account with this email already exists. Try signing in instead.';
            case 'auth/invalid-email':
                return 'Please enter a valid email address.';
            case 'auth/weak-password':
            case 'auth/password-does-not-meet-requirements':
                return 'That password is too weak. Please follow the password rules listed under the password field.';
            case 'auth/user-not-found':
                return 'No account found with this email. Try signing up instead.';
            case 'auth/wrong-password':
                return 'Incorrect password. Please try again.';
            case 'auth/invalid-credential':
                return 'Incorrect email or password. Please try again.';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please wait a moment and try again.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your internet connection.';
            default:
                return 'Something went wrong. Please try again.';
        }
    }

    // ---- Per-account data on this device ----
    // The app keeps the signed-in person's decks, folders, settings, and stats
    // in four localStorage keys. OWNER_KEY records whose data that is. When a
    // different person signs in on this device, the previous person's data is
    // moved into their own "vault" key and the new person's vault (if any) is
    // restored. Nothing is deleted, so device-only decks survive sign-out and
    // someone else signing in on the same device.

    var LOCAL_KEYS = ['sparkdeck-decks', 'sparkdeck-folders', 'sparkdeck-settings', 'sparkdeck-stats'];
    var OWNER_KEY = 'sparkdeck-local-owner';

    function vaultKey(uid) { return 'sparkdeck-vault-' + uid; }

    // Returns true if the working data was swapped for a different person's.
    function useLocalDataFor(uid) {
        try {
            var owner = localStorage.getItem(OWNER_KEY);
            if (owner === uid) return false;
            if (!owner) {
                // Data saved before this feature existed: it belongs to whoever
                // signs in first, which matches how the app always behaved.
                localStorage.setItem(OWNER_KEY, uid);
                return false;
            }

            // 1. Save the previous person's data. If this fails (storage full),
            //    we stop here and touch nothing else.
            var snapshot = {};
            LOCAL_KEYS.forEach(function (k) { snapshot[k] = localStorage.getItem(k); });
            localStorage.setItem(vaultKey(owner), JSON.stringify(snapshot));

            // 2. Bring back this person's data, or start with an empty deck list.
            //    Display settings carry over if they have none saved yet.
            var saved = localStorage.getItem(vaultKey(uid));
            var restore = saved ? JSON.parse(saved) : {};
            LOCAL_KEYS.forEach(function (k) {
                if (!saved && k === 'sparkdeck-settings') return;
                if (restore[k] !== null && restore[k] !== undefined) localStorage.setItem(k, restore[k]);
                else localStorage.removeItem(k);
            });
            if (saved) localStorage.removeItem(vaultKey(uid));
            localStorage.setItem(OWNER_KEY, uid);
            return true;
        } catch (error) {
            console.warn('Could not switch local data to the signed-in account:', error);
            return false;
        }
    }

    // "Device-only pending" marks an account that has used this device while
    // unverified. The first cloud sync after verification then merges instead
    // of replacing, so neither the local decks nor the cloud decks are lost.
    function pendingKey(uid) { return 'sparkdeck-device-only-' + uid; }
    function markDeviceOnly(uid) { try { localStorage.setItem(pendingKey(uid), new Date().toISOString()); } catch (_) {} }
    function isDeviceOnlyPending(uid) { try { return !!localStorage.getItem(pendingKey(uid)); } catch (_) { return false; } }
    function clearDeviceOnly(uid) { try { localStorage.removeItem(pendingKey(uid)); } catch (_) {} }

    function setCloudStatus(message, type) {
        if (!cloudSyncStatus) return;
        cloudSyncStatus.classList.remove('is-error', 'is-success');
        if (type) cloudSyncStatus.classList.add('is-' + type);
        cloudSyncStatus.textContent = message || '';
    }

    function isStillSignedInAs(uid) {
        return !!(auth.currentUser && auth.currentUser.uid === uid);
    }

    function enterDeviceOnly(user) {
        markDeviceOnly(user.uid);
        if (window.app) {
            window.app._getAuthToken = null;
            window.app.cancelPendingCloudSync();
        }
    }

    // Call a Netlify Function. If the server says the email isn't verified,
    // refresh the ID token once (it may have been issued before verifying)
    // and try again. Returns the fetch Response, or { notVerified: true }.
    async function callApi(user, path, method, forceFreshToken) {
        var token = await user.getIdToken(!!forceFreshToken);
        var response = await fetch('/.netlify/functions/' + path, {
            method: method,
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (response.status === 403) {
            var body = await response.clone().json().catch(function () { return {}; });
            if (body && body.code === 'email_not_verified') {
                if (!forceFreshToken) return callApi(user, path, method, true);
                return { notVerified: true };
            }
        }
        return response;
    }

    // ---- Database Sync ----
    // After sign-in (or right after verifying), connect this device to the
    // cloud. Unverified accounts stay device-only and never touch the server's
    // database. Returns a short result string for messages.

    var syncPromise = null;
    var syncPromiseUid = null;

    function syncWithDatabase(firebaseUser) {
        if (syncPromise && syncPromiseUid === firebaseUser.uid) return syncPromise;
        syncPromiseUid = firebaseUser.uid;
        syncPromise = doSyncWithDatabase(firebaseUser).finally(function () {
            syncPromise = null;
            syncPromiseUid = null;
        });
        return syncPromise;
    }

    async function doSyncWithDatabase(firebaseUser) {
        var app = window.app;
        if (!app) return 'error';
        var uid = firebaseUser.uid;

        // No cloud saves until this function decides it's safe.
        app._getAuthToken = null;

        try {
            // They may have clicked the link in another tab or on another device.
            if (!firebaseUser.emailVerified) {
                try { await firebaseUser.reload(); } catch (_) {}
                if (!isStillSignedInAs(uid)) return 'cancelled';
                firebaseUser = auth.currentUser;
            }

            if (!firebaseUser.emailVerified) {
                enterDeviceOnly(firebaseUser);
                return 'device-only';
            }

            // Step 1: Make sure the account has a database row.
            var mergeNeeded = isDeviceOnlyPending(uid);
            var userResponse = await callApi(firebaseUser, 'api-user', 'POST', mergeNeeded);
            if (userResponse.notVerified) { enterDeviceOnly(firebaseUser); return 'device-only'; }
            if (!userResponse.ok) {
                console.warn('Could not register user in database:', userResponse.status);
                return 'error';
            }

            // Step 2: Load what's already in the cloud.
            var dataResponse = await callApi(firebaseUser, 'api-data', 'GET', false);
            if (dataResponse.notVerified) { enterDeviceOnly(firebaseUser); return 'device-only'; }
            if (!dataResponse.ok) {
                var errorBody = await dataResponse.json().catch(function () { return {}; });
                console.warn('Could not load data from database:', dataResponse.status, JSON.stringify(errorBody));
                return 'error';
            }
            var cloudData = await dataResponse.json();
            if (!isStillSignedInAs(uid)) return 'cancelled';

            var hasCloudData =
                (Array.isArray(cloudData.decks) && cloudData.decks.length > 0) ||
                (Array.isArray(cloudData.folders) && cloudData.folders.length > 0) ||
                (cloudData.stats && Array.isArray(cloudData.stats.studySessions) && cloudData.stats.studySessions.length > 0);
            var hasLocalData = (app.decks && app.decks.length > 0) || (app.folders && app.folders.length > 0);

            var tokenGetter = function () { return firebaseUser.getIdToken(); };

            // Step 3a: First sync after a device-only period. Merge, never replace.
            if (mergeNeeded) {
                if (!hasCloudData) {
                    app._getAuthToken = tokenGetter;
                    var uploaded = hasLocalData ? await app._doCloudSync() : true;
                    if (uploaded) clearDeviceOnly(uid);
                    return uploaded ? (hasLocalData ? 'uploaded' : 'synced') : 'error';
                }

                // Merge using the app's data as it is right now, so edits made
                // while the cloud data was loading are included.
                var result = app.mergeLocalIntoCloud(cloudData, {
                    decks: app.decks, folders: app.folders, settings: app.settings, stats: app.stats
                });
                if (result.data.decks.length > 500 || result.data.folders.length > 200) {
                    // Too big to save in one go. Leave everything as it is on
                    // both sides and keep this device in merge mode.
                    console.warn('Merged data exceeds cloud limits; merge postponed.');
                    return 'too-large';
                }
                app.loadFromCloud(result.data);
                app._getAuthToken = tokenGetter;
                var merged = await app._doCloudSync();
                if (merged) clearDeviceOnly(uid);
                lastMergeResult = result;
                return merged ? 'merged' : 'error';
            }

            // Step 3b: Normal sign-in for a verified account.
            if (hasCloudData) {
                app.loadFromCloud(cloudData);
                app._getAuthToken = tokenGetter;
                announce('Data synced from cloud.');
                return 'synced';
            }
            app._getAuthToken = tokenGetter;
            if (hasLocalData) {
                await app._doCloudSync();
                announce('Data backed up to cloud.');
                return 'uploaded';
            }
            return 'synced';
        } catch (error) {
            // Sync failure is non-fatal — the app keeps working with local data.
            console.warn('Database sync failed (app still works locally):', error);
            return 'error';
        }
    }

    var lastMergeResult = null;

    // Turn a sync result into a message for people who just verified.
    function describeSyncResult(result) {
        switch (result) {
            case 'uploaded':
                return { text: 'Cloud sync is on. Your decks are now backed up and will appear on any device where you sign in.', type: 'success' };
            case 'synced':
                return { text: 'Cloud sync is on. Your decks will now be backed up and appear on any device where you sign in.', type: 'success' };
            case 'merged': {
                var r = lastMergeResult || { addedDecks: 0, keptBoth: 0, addedFolders: 0 };
                var parts = ['Cloud sync is on. We combined the decks on this device with the ones already in your account, and nothing was deleted.'];
                if (r.addedDecks || r.addedFolders) {
                    parts.push('Added from this device: ' + r.addedDecks + ' deck' + (r.addedDecks === 1 ? '' : 's') +
                        ' and ' + r.addedFolders + ' folder' + (r.addedFolders === 1 ? '' : 's') + '.');
                }
                if (r.keptBoth) {
                    parts.push(r.keptBoth + ' deck' + (r.keptBoth === 1 ? ' was' : 's were') +
                        ' different on this device than in your account, so we kept both. The copies from this device end with "(from this device)".');
                }
                return { text: parts.join(' '), type: 'success' };
            }
            case 'too-large':
                return { text: 'Your email is verified, but this device and your account together have more decks or folders than one account can hold (500 decks, 200 folders). Nothing was changed. Your decks on this device are still saved here.', type: 'error' };
            case 'device-only':
                return { text: 'Our server has not seen your verification yet. Please wait a minute, then select "I\'ve verified my email" again.', type: 'error' };
            case 'error':
                return { text: 'Your email is verified, but we could not reach the cloud just now. Your decks are safe on this device, and we will try again the next time you sign in.', type: 'error' };
            default:
                return null;
        }
    }

    // ---- Form Toggle ----
    // The auth screen has three views: 'login', 'signup', and 'reset'
    // (forgot password). Each view shows its own form and the links under it.

    function showAuthView(view) {
        loginForm.classList.toggle('hidden', view !== 'login');
        authToggleForgot.classList.toggle('hidden', view !== 'login');
        authToggleLogin.classList.toggle('hidden', view !== 'login');
        signupForm.classList.toggle('hidden', view !== 'signup');
        authToggleSignup.classList.toggle('hidden', view !== 'signup');
        resetForm.classList.toggle('hidden', view !== 'reset');
        authToggleReset.classList.toggle('hidden', view !== 'reset');
        clearError();
        setResetStatus('');
        hideAllPasswords();
    }

    showSignupBtn.addEventListener('click', function () {
        showAuthView('signup');
        signupEmail.focus();
        announce('Switched to sign up form');
    });

    showLoginBtn.addEventListener('click', function () {
        showAuthView('login');
        loginEmail.focus();
        announce('Switched to sign in form');
    });

    showResetBtn.addEventListener('click', function () {
        // Carry over whatever they already typed in the sign-in email field.
        var typed = loginEmail.value.trim();
        if (typed) resetEmail.value = typed;
        showAuthView('reset');
        resetEmail.focus();
        announce('Switched to reset password form');
    });

    resetBackBtn.addEventListener('click', function () {
        var typed = resetEmail.value.trim();
        if (typed && !loginEmail.value.trim()) loginEmail.value = typed;
        showAuthView('login');
        loginEmail.focus();
        announce('Switched to sign in form');
    });

    // ---- Forgot Password ----
    // Firebase emails a link to its own page where the person picks a new
    // password. We show the same message whether or not an account exists
    // for the address, so this form can't be used to find out who has an
    // account.

    function setResetStatus(message, type) {
        if (!resetStatus) return;
        resetStatus.classList.remove('is-error', 'is-success');
        if (type) resetStatus.classList.add('is-' + type);
        resetStatus.textContent = message || '';
    }

    function sendResetEmail(email) {
        // After choosing a new password, Firebase's page offers a Continue
        // button that comes back here. If this site's address isn't on the
        // Firebase project's authorized domains list, send the plain email.
        var settings = { url: window.location.origin + '/' };
        return auth.sendPasswordResetEmail(email, settings).catch(function (error) {
            if (error && (error.code === 'auth/unauthorized-continue-uri' ||
                          error.code === 'auth/invalid-continue-uri' ||
                          error.code === 'auth/missing-continue-uri')) {
                return auth.sendPasswordResetEmail(email);
            }
            throw error;
        });
    }

    resetForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearError();
        setResetStatus('');

        var email = resetEmail.value.trim();

        if (!email) {
            showError('Please enter your email address.');
            resetEmail.focus();
            return;
        }

        if (!isValidEmail(email)) {
            showError('Please enter a complete email address, like name@example.com.');
            resetEmail.focus();
            return;
        }

        setLoading(resetSubmitBtn, true);

        var sentMessage = 'If ' + email + ' belongs to a SparkDeck account, a password reset email is on its way. ' +
            'Open it and select the link inside to choose a new password. ' +
            'The email comes from noreply@sparkdeck-8d613.firebaseapp.com. If it doesn\'t show up within a few minutes, ' +
            'check your spam or junk folder. The link expires after one hour.';

        sendResetEmail(email)
            .then(function () {
                setResetStatus(sentMessage, 'success');
            })
            .catch(function (error) {
                var code = error && error.code;
                if (code === 'auth/user-not-found') {
                    // Same message as a real account, on purpose.
                    setResetStatus(sentMessage, 'success');
                } else if (code === 'auth/too-many-requests') {
                    showError('Too many reset requests. Please wait a few minutes and try again.');
                } else {
                    console.warn('Password reset email failed:', error);
                    showError(getFriendlyError(code));
                }
            })
            .finally(function () {
                setLoading(resetSubmitBtn, false);
            });
    });

    // ---- Sign Up ----

    signupForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearError();

        var email = signupEmail.value.trim();
        var password = signupPassword.value;
        var confirm = signupConfirm.value;

        if (!email || !password) {
            showError('Please enter both email and password.');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Please enter a complete email address, like name@example.com.');
            signupEmail.focus();
            return;
        }

        var unmet = getUnmetPasswordRules(password);
        if (unmet.length > 0) {
            showError(describeUnmetRules(unmet));
            signupPassword.focus();
            return;
        }

        if (password !== confirm) {
            showError('Passwords do not match.');
            signupConfirm.focus();
            return;
        }

        setLoading(signupSubmitBtn, true);

        auth.createUserWithEmailAndPassword(email, password)
            .then(function () {
                // The verification email is sent by the auth observer below,
                // which handles new and existing accounts the same way.
                announce('Account created! Welcome to SparkDeck.');
            })
            .catch(function (error) {
                showError(getFriendlyError(error.code));
            })
            .finally(function () {
                setLoading(signupSubmitBtn, false);
            });
    });

    // ---- Sign In ----

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearError();

        var email = loginEmail.value.trim();
        var password = loginPassword.value;

        if (!email || !password) {
            showError('Please enter both email and password.');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Please enter a complete email address, like name@example.com.');
            loginEmail.focus();
            return;
        }

        setLoading(loginSubmitBtn, true);

        auth.signInWithEmailAndPassword(email, password)
            .then(function () {
                announce('Signed in successfully! Welcome back.');
            })
            .catch(function (error) {
                showError(getFriendlyError(error.code));
            })
            .finally(function () {
                setLoading(loginSubmitBtn, false);
            });
    });

    // ---- Password Checklist ----

    signupPassword.addEventListener('input', function () {
        updatePasswordChecklist(signupPassword.value);
    });

    // ---- Email Verification Banner ----
    // Unverified users can still use the app. The banner just reminds them,
    // and lets them resend the email or re-check once they've clicked the link.

    function setVerifyStatus(message) {
        if (verifyStatus) verifyStatus.textContent = message;
    }

    // Send the verification email automatically once per account on this
    // device. This covers brand-new signups and accounts created before
    // verification existed. After that, the Resend button is the way to
    // get another, so we never spam people on every sign-in.
    function autoSendVerificationOnce(user) {
        if (!user || user.emailVerified) return;
        var key = 'sparkdeck-verify-sent-' + user.uid;
        try {
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, new Date().toISOString());
        } catch (_) {
            // Storage blocked: still send, the Resend button covers the rest.
        }
        user.sendEmailVerification()
            .then(function () {
                setVerifyStatus('We just sent a verification email to ' + user.email + '. It can take a few minutes to arrive.');
            })
            .catch(function (error) {
                console.warn('Could not send verification email:', error);
                try { localStorage.removeItem(key); } catch (_) {}
                if (error && error.code === 'auth/too-many-requests') {
                    setVerifyStatus('We could not send a verification email just now because too many were requested. Please wait a few minutes, then select Resend verification email.');
                } else {
                    setVerifyStatus('We could not send a verification email just now. Please select Resend verification email to try again.');
                }
            });
    }

    function updateVerifyBanner(user) {
        if (!verifyBanner) return;
        if (user && !user.emailVerified) {
            if (verifyEmailAddress) verifyEmailAddress.textContent = user.email || 'your email address';
            verifyBanner.classList.remove('hidden');
        } else {
            verifyBanner.classList.add('hidden');
            setVerifyStatus('');
        }
    }

    if (verifyResendBtn) {
        verifyResendBtn.addEventListener('click', function () {
            var user = auth.currentUser;
            if (!user) return;
            setLoading(verifyResendBtn, true);
            user.sendEmailVerification()
                .then(function () {
                    setVerifyStatus('Verification email sent to ' + user.email + '. It can take a few minutes to arrive.');
                })
                .catch(function (error) {
                    if (error && error.code === 'auth/too-many-requests') {
                        setVerifyStatus('We already sent a few emails recently. Please wait a few minutes before asking for another.');
                    } else {
                        setVerifyStatus('Sorry, we could not send the email right now. Please try again later.');
                    }
                })
                .finally(function () {
                    setLoading(verifyResendBtn, false);
                });
        });
    }

    if (verifyCheckBtn) {
        verifyCheckBtn.addEventListener('click', function () {
            var user = auth.currentUser;
            if (!user) return;
            setLoading(verifyCheckBtn, true);
            // reload() fetches the latest account info, including emailVerified.
            user.reload()
                .then(function () {
                    var refreshed = auth.currentUser;
                    if (refreshed && refreshed.emailVerified) {
                        setVerifyStatus('Thank you, your email is verified! Turning on cloud sync…');
                        // Get a fresh ID token so the server sees the verified status,
                        // then connect this device's decks to the cloud safely.
                        return refreshed.getIdToken(true)
                            .catch(function () {})
                            .then(function () { return syncWithDatabase(refreshed); })
                            .then(function (result) {
                                if (result === 'device-only') {
                                    var msg = describeSyncResult(result);
                                    setVerifyStatus(msg.text);
                                    return;
                                }
                                updateVerifyBanner(refreshed);
                                var info = describeSyncResult(result);
                                if (info) setCloudStatus(info.text, info.type);
                                // Focus the message so screen readers read it and
                                // keyboard focus isn't lost when the banner hides.
                                if (cloudSyncStatus && info) {
                                    cloudSyncStatus.setAttribute('tabindex', '-1');
                                    cloudSyncStatus.focus();
                                } else {
                                    var heading = appContainer.querySelector('h1');
                                    if (heading) heading.focus();
                                }
                            });
                    } else {
                        setVerifyStatus('Your email is not verified yet. Open the link in the email we sent, then try this button again.');
                    }
                })
                .catch(function () {
                    setVerifyStatus('Could not check right now. Please check your internet connection and try again.');
                })
                .finally(function () {
                    setLoading(verifyCheckBtn, false);
                });
        });
    }

    // ---- Sign Out ----

    signOutBtn.addEventListener('click', async function () {
        // Send any last change that is still waiting to sync.
        if (window.app && window.app.flushCloudSync) {
            try { await window.app.flushCloudSync(); } catch (_) {}
        }
        auth.signOut()
            .then(function () {
                announce('Signed out successfully.');
            })
            .catch(function (error) {
                console.warn('Sign out error:', error);
            });
    });

    // ---- Auth State Observer ----
    // This is the core of the auth flow.
    // Firebase calls this callback whenever the user's auth state changes
    // (sign in, sign out, page load with existing session).

    // While the email link screen is open, the observer only records that
    // Firebase is ready. The normal screen is shown when the person leaves
    // the link screen (see leaveActionScreen).
    var authReady = false;
    var resolveAuthReady;
    var authReadyPromise = new Promise(function (resolve) { resolveAuthReady = resolve; });
    var justVerifiedEmail = false;

    auth.onAuthStateChanged(function (user) {
        authReady = true;
        resolveAuthReady();
        if (actionActive) return;
        handleAuthState(user);
    });

    function handleAuthState(user) {
        hideAllPasswords();
        if (user) {
            // User is signed in - show the app, hide auth screen
            authScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');

            // Show the user's email in the header
            if (userEmailDisplay) {
                userEmailDisplay.textContent = user.email;
            }

            // Make sure the decks on screen belong to this account.
            var swapped = useLocalDataFor(user.uid);

            // Initialize SparkDeckApp if it hasn't been created yet
            if (!window.app) {
                window.app = new SparkDeckApp();
            } else if (swapped) {
                window.app.reloadFromLocal();
            }
            window.app.onCloudSyncBlocked = function () {
                if (auth.currentUser) markDeviceOnly(auth.currentUser.uid);
            };

            setCloudStatus('');
            updateVerifyBanner(user);
            autoSendVerificationOnce(user);

            // Sync data with the database (async, doesn't block the UI).
            // If they verified somewhere else, this notices and turns sync on.
            // justVerifiedEmail: they arrived from a verification link, and we
            // already refreshed the account, so still show the "sync is on" message.
            var wasUnverified = !user.emailVerified || justVerifiedEmail;
            justVerifiedEmail = false;
            syncWithDatabase(user).then(function (result) {
                if (!isStillSignedInAs(user.uid)) return;
                updateVerifyBanner(auth.currentUser);
                if (wasUnverified && auth.currentUser.emailVerified) {
                    var info = describeSyncResult(result);
                    if (info) setCloudStatus(info.text, info.type);
                } else if (result === 'merged' || result === 'too-large') {
                    var info2 = describeSyncResult(result);
                    if (info2) setCloudStatus(info2.text, info2.type);
                }
            });

            // Move focus to the main app heading
            var heading = appContainer.querySelector('h1');
            if (heading) {
                heading.setAttribute('tabindex', '-1');
                heading.focus();
            }
        } else {
            // User is signed out - show auth screen, hide app
            authScreen.classList.remove('hidden');
            appContainer.classList.add('hidden');

            // Clear the user email display
            if (userEmailDisplay) {
                userEmailDisplay.textContent = '';
            }

            // Clear the token getter and drop any save that hadn't been sent,
            // so nothing from this account can be sent with someone else's sign-in.
            if (window.app) {
                window.app._getAuthToken = null;
                window.app.cancelPendingCloudSync();
            }
            setCloudStatus('');

            // Move focus to the auth screen heading
            var authHeading = authScreen.querySelector('h1');
            if (authHeading) {
                authHeading.setAttribute('tabindex', '-1');
                authHeading.focus();
            }

            updateVerifyBanner(null);

            // Reset forms
            loginForm.reset();
            signupForm.reset();
            resetForm.reset();
            updatePasswordChecklist('');

            // Show login form by default
            showAuthView('login');
        }
    }

    // ---- Email Link Screen ----
    // Firebase's emails (reset password, verify email, undo an email change)
    // link to this page with ?mode=...&oobCode=... once the Firebase console's
    // "action URL" points here. We handle the link ourselves instead of on
    // Firebase's page, so every control is labelled and the password rules
    // match the sign-up form.

    var actionParams = readActionParams();
    var actionActive = !!actionParams;
    var resetCode = null;
    var resetAccountEmail = '';
    var prefillEmail = '';

    function readActionParams() {
        try {
            var params = new URLSearchParams(window.location.search);
            var mode = params.get('mode');
            var code = params.get('oobCode');
            if (!mode || !code) return null;
            // Take the one-time code out of the address bar and history right away.
            history.replaceState(null, '', window.location.pathname + window.location.hash);
            return { mode: mode, code: code };
        } catch (_) {
            return null;
        }
    }

    function showActionError(message) {
        actionError.textContent = message;
        actionError.classList.remove('hidden');
        announce(message);
    }

    function clearActionError() {
        actionError.textContent = '';
        actionError.classList.add('hidden');
    }

    // Show the finished (or failed) result with one clear next step.
    // options: { heading, message, retry: bool, retryLabel }
    async function showActionResult(options) {
        await authReadyPromise;
        actionLoading.classList.add('hidden');
        newPasswordForm.classList.add('hidden');
        clearActionError();
        actionResultHeading.textContent = options.heading;
        actionResultMessage.textContent = options.message;
        actionContinueBtn.textContent = auth.currentUser ? 'Continue to SparkDeck' : 'Sign in to SparkDeck';
        actionRetryBtn.textContent = options.retryLabel || 'Send a New Reset Link';
        actionRetryBtn.classList.toggle('hidden', !options.retry || !!auth.currentUser);
        actionResult.classList.remove('hidden');
        actionResultHeading.focus();
    }

    function leaveActionScreen(nextView) {
        actionActive = false;
        actionScreen.classList.add('hidden');
        newPasswordForm.reset();
        updatePasswordChecklist('', newPasswordRuleList);
        if (!authReady) return; // the observer shows the right screen when Firebase is ready
        handleAuthState(auth.currentUser);
        if (!auth.currentUser) {
            if (nextView === 'reset') {
                showAuthView('reset');
                if (prefillEmail) resetEmail.value = prefillEmail;
                resetEmail.focus();
            } else if (prefillEmail) {
                loginEmail.value = prefillEmail;
                loginPassword.focus();
            }
        }
    }

    // A friendly explanation for a link that can't be used.
    function linkProblem(error, kind) {
        var code = error && error.code;
        if (code === 'auth/network-request-failed') {
            return { heading: 'We could not check your link',
                message: 'Network error. Please check your internet connection, then open the link from your email again.' };
        }
        if (code === 'auth/user-disabled') {
            return { heading: 'This account is turned off',
                message: 'The account this link is for has been disabled, so it cannot be used.' };
        }
        if (kind === 'reset') {
            return { heading: 'This reset link no longer works',
                message: 'Password reset links work once and expire after one hour. This one has expired or was already used. You can ask for a new one.',
                retry: true };
        }
        if (kind === 'verify') {
            return { heading: 'This verification link no longer works',
                message: 'It has expired or was already used. If your email is not verified yet, sign in and select Resend verification email to get a new link.' };
        }
        return { heading: 'This link no longer works',
            message: 'It has expired or was already used.' };
    }

    async function startActionFlow(params) {
        authScreen.classList.add('hidden');
        appContainer.classList.add('hidden');
        actionScreen.classList.remove('hidden');
        var heading = actionScreen.querySelector('h1');
        heading.setAttribute('tabindex', '-1');
        heading.focus();

        if (params.mode === 'resetPassword') {
            try {
                resetAccountEmail = await auth.verifyPasswordResetCode(params.code);
            } catch (error) {
                return showActionResult(linkProblem(error, 'reset'));
            }
            resetCode = params.code;
            prefillEmail = resetAccountEmail;
            newPasswordEmail.textContent = resetAccountEmail;
            actionLoading.classList.add('hidden');
            newPasswordForm.classList.remove('hidden');
            newPasswordHeading.focus();
            return;
        }

        if (params.mode === 'verifyEmail') {
            try {
                await auth.applyActionCode(params.code);
            } catch (error) {
                await authReadyPromise;
                var user = auth.currentUser;
                if (user) { try { await user.reload(); } catch (_) {} }
                if (auth.currentUser && auth.currentUser.emailVerified) {
                    return showActionResult({ heading: 'Your email is already verified',
                        message: 'There is nothing more to do. Cloud sync is on for your account.' });
                }
                return showActionResult(linkProblem(error, 'verify'));
            }
            await authReadyPromise;
            if (auth.currentUser) {
                try { await auth.currentUser.reload(); } catch (_) {}
                justVerifiedEmail = true;
            }
            return showActionResult({ heading: 'Your email is verified',
                message: auth.currentUser
                    ? 'Thank you! SparkDeck will now back up your decks and keep them in sync on every device where you sign in.'
                    : 'Thank you! When you sign in, SparkDeck will back up your decks and keep them in sync on every device where you sign in.' });
        }

        if (params.mode === 'recoverEmail') {
            try {
                var info = await auth.checkActionCode(params.code);
                await auth.applyActionCode(params.code);
                prefillEmail = (info && info.data && info.data.email) || '';
            } catch (error) {
                return showActionResult(linkProblem(error, 'recover'));
            }
            return showActionResult({ heading: 'Your sign-in email was changed back',
                message: 'Your account uses ' + (prefillEmail || 'your previous email address') +
                    ' again. If you did not ask for the email change, reset your password now to keep your account safe.',
                retry: true, retryLabel: 'Reset My Password' });
        }

        if (params.mode === 'verifyAndChangeEmail') {
            try {
                await auth.applyActionCode(params.code);
            } catch (error) {
                return showActionResult(linkProblem(error, 'change'));
            }
            return showActionResult({ heading: 'Your new email is confirmed',
                message: 'Use your new email address the next time you sign in.' });
        }

        return showActionResult({ heading: 'We do not recognize this link',
            message: 'This link is not one SparkDeck knows how to open. Please check that you copied the whole link from the email.' });
    }

    newPassword.addEventListener('input', function () {
        updatePasswordChecklist(newPassword.value, newPasswordRuleList);
    });

    newPasswordForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        clearActionError();

        var password = newPassword.value;
        var confirm = newPasswordConfirm.value;

        var unmet = getUnmetPasswordRules(password);
        if (unmet.length > 0) {
            showActionError(describeUnmetRules(unmet));
            newPassword.focus();
            return;
        }
        if (password !== confirm) {
            showActionError('Passwords do not match.');
            newPasswordConfirm.focus();
            return;
        }

        setLoading(newPasswordSubmitBtn, true);
        try {
            await auth.confirmPasswordReset(resetCode, password);
        } catch (error) {
            setLoading(newPasswordSubmitBtn, false);
            var code = error && error.code;
            if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
                return showActionResult(linkProblem(error, 'reset'));
            }
            showActionError(getFriendlyError(code));
            newPassword.focus();
            return;
        }

        // Sign straight in with the new password, so it doesn't have to be
        // typed again. Skipped if someone else is signed in on this device.
        await authReadyPromise;
        var current = auth.currentUser;
        var signedIn = false;
        if (!current || (current.email || '').toLowerCase() === resetAccountEmail.toLowerCase()) {
            try {
                if (window.app && window.app.flushCloudSync) {
                    try { await window.app.flushCloudSync(); } catch (_) {}
                }
                await auth.signInWithEmailAndPassword(resetAccountEmail, password);
                signedIn = true;
            } catch (signInError) {
                console.warn('Signing in after password reset failed:', signInError);
            }
        }
        setLoading(newPasswordSubmitBtn, false);
        hideAllPasswords();
        newPasswordForm.reset();
        updatePasswordChecklist('', newPasswordRuleList);

        showActionResult({ heading: 'Your password is changed',
            message: signedIn
                ? 'Your new password is saved, and you are signed in as ' + resetAccountEmail + '.'
                : 'Your new password is saved. Use it the next time you sign in as ' + resetAccountEmail + '.' });
    });

    actionContinueBtn.addEventListener('click', function () {
        leaveActionScreen('login');
    });

    actionRetryBtn.addEventListener('click', function () {
        leaveActionScreen('reset');
    });

    if (actionActive) startActionFlow(actionParams);
})();

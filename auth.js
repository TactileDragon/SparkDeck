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
    function updatePasswordChecklist(password) {
        if (!passwordRuleList) return;
        PASSWORD_RULES.forEach(function (rule) {
            var item = passwordRuleList.querySelector('[data-rule="' + rule.id + '"]');
            if (!item) return;
            var met = rule.test(password);
            item.classList.toggle('rule-met', met);
            var status = item.querySelector('.rule-status');
            if (status) status.textContent = met ? '(done)' : '(not met yet)';
        });
    }

    // ---- Helper Functions ----

    function announce(message) {
        if (announcements) {
            announcements.textContent = message;
            setTimeout(function () { announcements.textContent = ''; }, 3000);
        }
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

    showSignupBtn.addEventListener('click', function () {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        authToggleLogin.classList.add('hidden');
        authToggleSignup.classList.remove('hidden');
        clearError();
        signupEmail.focus();
        announce('Switched to sign up form');
    });

    showLoginBtn.addEventListener('click', function () {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authToggleSignup.classList.add('hidden');
        authToggleLogin.classList.remove('hidden');
        clearError();
        loginEmail.focus();
        announce('Switched to sign in form');
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
            var missing = unmet.map(function (rule) { return rule.label; });
            var list = missing.length === 1
                ? missing[0]
                : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1];
            showError('Your password still needs ' + list + '.');
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

    auth.onAuthStateChanged(function (user) {
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
            var wasUnverified = !user.emailVerified;
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
            updatePasswordChecklist('');
            clearError();

            // Show login form by default
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
        }
    });
})();

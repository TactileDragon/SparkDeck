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

    // ---- Database Sync ----
    // After login, sync user data between localStorage and the Neon database.
    // The database is the source of truth for cross-device persistence.
    // localStorage acts as a fast cache for the current session.

    async function syncWithDatabase(firebaseUser) {
        try {
            var token = await firebaseUser.getIdToken();

            // Step 1: Ensure user record exists in the database
            var userResponse = await fetch('/.netlify/functions/api-user', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!userResponse.ok) {
                console.warn('Could not register user in database:', userResponse.status);
                return;
            }

            // Step 2: Load user data from the database
            var dataResponse = await fetch('/.netlify/functions/api-data', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!dataResponse.ok) {
                var errorBody = await dataResponse.json().catch(function() { return {}; });
                console.warn('Could not load data from database:', dataResponse.status, JSON.stringify(errorBody));
                return;
            }

            var cloudData = await dataResponse.json();

            // Step 3: Decide which direction to sync
            var hasCloudDecks = cloudData.decks && cloudData.decks.length > 0;
            var hasCloudFolders = cloudData.folders && cloudData.folders.length > 0;
            var hasCloudData = hasCloudDecks || hasCloudFolders;

            if (hasCloudData) {
                // Database has data — load it into the app
                if (window.app && window.app.loadFromCloud) {
                    window.app.loadFromCloud(cloudData);
                }
                announce('Data synced from cloud.');
            } else {
                // Database is empty — upload current localStorage data
                var hasLocalDecks = window.app && window.app.decks && window.app.decks.length > 0;
                var hasLocalFolders = window.app && window.app.folders && window.app.folders.length > 0;

                if (hasLocalDecks || hasLocalFolders) {
                    await uploadToDatabase(token);
                    announce('Data backed up to cloud.');
                }
            }

            // Store the token getter so app.js can use it for saves
            if (window.app) {
                window.app._getAuthToken = function () {
                    return firebaseUser.getIdToken();
                };
            }
        } catch (error) {
            // Sync failure is non-fatal — app works with localStorage
            console.warn('Database sync failed (app still works locally):', error);
        }
    }

    async function uploadToDatabase(token) {
        if (!window.app) return;

        var data = {
            decks: window.app.decks || [],
            folders: window.app.folders || [],
            settings: window.app.settings || {},
            stats: window.app.stats || { studySessions: [] }
        };

        await fetch('/.netlify/functions/api-data', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
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
                        // Refresh the ID token so the server sees the verified status too.
                        refreshed.getIdToken(true).catch(function () {});
                        updateVerifyBanner(refreshed);
                        announce('Thank you! Your email address is verified.');
                        var heading = appContainer.querySelector('h1');
                        if (heading) heading.focus();
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

    signOutBtn.addEventListener('click', function () {
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

            updateVerifyBanner(user);
            autoSendVerificationOnce(user);

            // Initialize SparkDeckApp if it hasn't been created yet
            if (!window.app) {
                window.app = new SparkDeckApp();
            }

            // Sync data with the database (async, doesn't block the UI)
            syncWithDatabase(user);

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

            // Clear the token getter
            if (window.app) {
                window.app._getAuthToken = null;
            }

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

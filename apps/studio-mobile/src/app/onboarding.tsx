import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CockpitMark } from '@/components/cockpit/CockpitMark';
import {
  COCKPIT_BG,
  COCKPIT_BG_RAISED,
  COCKPIT_CYAN,
  COCKPIT_EMBER,
  COCKPIT_HAIR,
  COCKPIT_HAIR_STRONG,
  COCKPIT_INK,
  COCKPIT_INK_DIM,
  COCKPIT_INK_FAINT,
  COCKPIT_INK_MUTED,
} from '@/components/cockpit/tokens';
import { useIdentity } from '@/identity/IdentityContext';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

type OnboardingStep = 'welcome' | 'folders' | 'minimap' | 'getstarted';

// Avatar slug palette — must match the live DB CHECK constraint
// `profiles.avatar_color ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`. The slug is sent
// to the server; the hex is rendered locally only.
const AVATAR_PALETTE = [
  { key: 'violet', color: '#7C3AED' },
  { key: 'blue', color: '#2563EB' },
  { key: 'cyan', color: '#0891B2' },
  { key: 'green', color: '#059669' },
  { key: 'amber', color: '#D97706' },
  { key: 'pink', color: '#DB2777' },
] as const;

const ONBOARDING_FRIENDLY_ERRORS: Record<string, string> = {
  'identity/missing-display-name': 'Enter a display name.',
  'identity/missing-workspace-name': 'Enter a workspace name.',
  'identity/onboarding-invalid-input': 'Check your details and try again.',
  'identity/onboarding-session-missing': 'Your session expired. Please sign in again.',
  'identity/onboarding-provider-unavailable': "Couldn't reach the server. Try again in a moment.",
  'identity/onboarding-response-malformed': 'The server returned an unexpected response.',
  'identity/create-workspace-failed': "Couldn't create your workspace. Try again.",
  'identity/no-session': 'Your session expired. Please sign in again.',
  'identity/provider-network-failed': 'Network error. Check your connection.',
  'identity/provider-rate-limited': 'Too many attempts. Wait a moment, then try again.',
  'identity/provider-rejected': 'Request rejected. Try again later.',
};

function deriveDisplayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  if (!local) return '';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
    .slice(0, 80);
}

export default function OnboardingScreen() {
  const identity = useIdentity();
  // Preview mode: /onboarding?preview=1 — UI-only walk-through that does NOT
  // call createInitialWorkspace, does NOT require sign-in, and exits back to
  // /account-identity. Used for design QA without creating a new account.
  const params = useLocalSearchParams<{ preview?: string | string[] }>();
  const previewParam = Array.isArray(params.preview) ? params.preview[0] : params.preview;
  const isPreview = previewParam === '1';

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [displayName, setDisplayName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_PALETTE[0].key);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Pre-fill display name from existing profile (rare partial state) or from
  // the pending email's local-part so the Get Started form isn't empty.
  // Skipped in preview mode — preview never sends data to the server, and the
  // user may not even be signed in.
  useEffect(() => {
    if (isPreview) return;
    if (displayName) return;
    const fromProfile = identity.snapshot.profile?.displayName?.trim() ?? '';
    if (fromProfile) {
      setDisplayName(fromProfile);
      return;
    }
    const fromEmail = deriveDisplayNameFromEmail(identity.snapshot.pendingEmail ?? '');
    if (fromEmail) setDisplayName(fromEmail);
  }, [
    isPreview,
    identity.snapshot.profile?.displayName,
    identity.snapshot.pendingEmail,
    displayName,
  ]);

  // Reflect provider-level errors into the local banner. Skipped in preview
  // since preview never invokes a provider RPC.
  useEffect(() => {
    if (isPreview) return;
    const code = identity.snapshot.lastError?.code;
    if (code && ONBOARDING_FRIENDLY_ERRORS[code]) {
      setErrorCode(code);
    }
  }, [isPreview, identity.snapshot.lastError?.code]);

  const errorCopy = errorCode ? ONBOARDING_FRIENDLY_ERRORS[errorCode] ?? null : null;

  async function submitGetStarted() {
    if (busy) return;
    if (isPreview) {
      // Preview mode — no RPC, no profile/workspace creation, no
      // onboardingCompleted flip. Exit back to the signed-out entry.
      router.replace('/account-identity');
      return;
    }
    const cleanDisplayName = displayName.trim();
    const cleanWorkspaceName = workspaceName.trim();
    if (!cleanDisplayName) {
      setErrorCode('identity/missing-display-name');
      return;
    }
    if (!cleanWorkspaceName) {
      setErrorCode('identity/missing-workspace-name');
      return;
    }
    setErrorCode(null);
    setBusy(true);
    try {
      await identity.createInitialWorkspace({
        displayName: cleanDisplayName,
        workspaceName: cleanWorkspaceName,
        avatarColor,
      });
      // On success the snapshot transitions to sync_ready and the root index
      // gate redirects to /library on its next render. Nothing else to do.
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await identity.signOut();
    } finally {
      setBusy(false);
    }
  }

  function handleExitPreview() {
    if (busy) return;
    router.replace('/account-identity');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {step === 'welcome' ? (
            <WelcomeStep
              busy={busy}
              onContinue={() => setStep('folders')}
              onSkip={() => setStep('getstarted')}
            />
          ) : null}

          {step === 'folders' ? (
            <FeatureStep
              icon={{ ios: 'folder.fill', android: 'folder', web: 'folder' }}
              eyebrow="Step 1 of 3"
              heading="Organize chats into folders."
              subhead="Group related conversations into projects, drafts, or anything you choose. Folders keep your AI work findable as it scales."
              busy={busy}
              onContinue={() => setStep('minimap')}
              onBack={() => setStep('welcome')}
            />
          ) : null}

          {step === 'minimap' ? (
            <FeatureStep
              icon={{
                ios: 'list.bullet.indent',
                android: 'format_list_bulleted',
                web: 'format_list_bulleted',
              }}
              eyebrow="Step 2 of 3"
              heading="Navigate long chats with the MiniMap."
              subhead="A side rail of every turn lets you jump anywhere in a long conversation, see highlights, and never lose your place."
              busy={busy}
              onContinue={() => setStep('getstarted')}
              onBack={() => setStep('folders')}
            />
          ) : null}

          {step === 'getstarted' ? (
            <GetStartedStep
              displayName={displayName}
              workspaceName={workspaceName}
              avatarColor={avatarColor}
              busy={busy}
              errorCopy={errorCopy}
              isPreview={isPreview}
              onChangeDisplayName={(value) => {
                setDisplayName(value);
                if (errorCode) setErrorCode(null);
              }}
              onChangeWorkspaceName={(value) => {
                setWorkspaceName(value);
                if (errorCode) setErrorCode(null);
              }}
              onChangeAvatarColor={setAvatarColor}
              onSubmit={submitGetStarted}
              onBack={() => setStep('minimap')}
            />
          ) : null}

          {isPreview ? (
            <TouchableOpacity
              style={styles.signOutLink}
              onPress={handleExitPreview}
              activeOpacity={0.6}
              disabled={busy}
              accessibilityLabel="Exit preview">
              <Text style={styles.signOutLinkText}>Exit preview</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.signOutLink}
              onPress={handleSignOut}
              activeOpacity={0.6}
              disabled={busy}
              accessibilityLabel="Sign out">
              <Text style={styles.signOutLinkText}>Sign out</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Step components ────────────────────────────────────────────────────────

function WelcomeStep({
  busy,
  onContinue,
  onSkip,
}: {
  busy: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.stepRoot}>
      <View style={styles.heroBlock}>
        <CockpitMark size={84} />
        <Text style={styles.wordmark}>
          Cockpit <Text style={styles.wordmarkAccent}>Pro</Text>
        </Text>
        <Text style={styles.tagline}>
          Your AI workspace,{'\n'}organized like a cockpit.
        </Text>
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.eyebrow}>Welcome aboard</Text>
        <Text style={styles.heading}>{"Let's set up your cockpit."}</Text>
        <Text style={styles.subhead}>
          {"A short tour, then you'll name your workspace and you're cleared for takeoff."}
        </Text>
      </View>

      <View style={styles.actionsBlock}>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={onContinue}
          activeOpacity={0.7}
          disabled={busy}
          accessibilityLabel="Begin tour">
          <Text style={styles.primaryButtonText}>Begin tour</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={onSkip}
          activeOpacity={0.6}
          disabled={busy}
          accessibilityLabel="Skip to setup">
          <Text style={styles.linkButtonText}>Skip to setup</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FeatureStep({
  icon,
  eyebrow,
  heading,
  subhead,
  busy,
  onContinue,
  onBack,
}: {
  icon: SymbolName;
  eyebrow: string;
  heading: string;
  subhead: string;
  busy: boolean;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.stepRoot}>
      <View style={styles.featureMedallion}>
        <SymbolView name={icon} size={44} weight="regular" tintColor={COCKPIT_CYAN} />
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subhead}>{subhead}</Text>
      </View>

      <View style={styles.actionsBlock}>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={onContinue}
          activeOpacity={0.7}
          disabled={busy}>
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={onBack}
          activeOpacity={0.6}
          disabled={busy}>
          <Text style={styles.linkButtonTextNeutral}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function GetStartedStep({
  displayName,
  workspaceName,
  avatarColor,
  busy,
  errorCopy,
  isPreview,
  onChangeDisplayName,
  onChangeWorkspaceName,
  onChangeAvatarColor,
  onSubmit,
  onBack,
}: {
  displayName: string;
  workspaceName: string;
  avatarColor: string;
  busy: boolean;
  errorCopy: string | null;
  isPreview: boolean;
  onChangeDisplayName: (v: string) => void;
  onChangeWorkspaceName: (v: string) => void;
  onChangeAvatarColor: (slug: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  // In preview mode, the form fields are still rendered for design QA but the
  // submit button bypasses validation (handled in submitGetStarted).
  const canSubmit = isPreview || Boolean(displayName.trim() && workspaceName.trim());
  const submitLabel = isPreview ? 'Finish preview' : 'Create my workspace';

  return (
    <View style={styles.stepRoot}>
      <View style={styles.copyBlockTop}>
        <Text style={styles.eyebrow}>Pre-flight</Text>
        <Text style={styles.heading}>Name your cockpit.</Text>
        <Text style={styles.subhead}>
          You can change any of this later from your account settings.
        </Text>
      </View>

      <View style={styles.formCard}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>YOUR NAME</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={onChangeDisplayName}
            placeholder="How should we greet you?"
            placeholderTextColor={COCKPIT_INK_FAINT}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel="Display name"
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>WORKSPACE NAME</Text>
          <TextInput
            style={styles.input}
            value={workspaceName}
            onChangeText={onChangeWorkspaceName}
            placeholder="My Cockpit"
            placeholderTextColor={COCKPIT_INK_FAINT}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel="Workspace name"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>COCKPIT ACCENT</Text>
          <View style={styles.swatchRow}>
            {AVATAR_PALETTE.map((entry) => {
              const selected = entry.key === avatarColor;
              return (
                <TouchableOpacity
                  key={entry.key}
                  style={[
                    styles.swatch,
                    { backgroundColor: entry.color },
                    selected && styles.swatchSelected,
                  ]}
                  onPress={() => onChangeAvatarColor(entry.key)}
                  activeOpacity={0.7}
                  disabled={busy}
                  accessibilityLabel={`Select ${entry.key} accent`}
                />
              );
            })}
          </View>
        </View>

        {errorCopy ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{errorCopy}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actionsBlock}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!canSubmit || busy) && styles.buttonDisabled,
          ]}
          onPress={onSubmit}
          activeOpacity={0.7}
          disabled={!canSubmit || busy}
          accessibilityLabel={submitLabel}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>{submitLabel}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={onBack}
          activeOpacity={0.6}
          disabled={busy}>
          <Text style={styles.linkButtonTextNeutral}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COCKPIT_BG },
  kav: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
    backgroundColor: COCKPIT_BG,
  },
  stepRoot: { flex: 1, gap: 28 },
  heroBlock: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 12,
  },
  wordmark: {
    color: COCKPIT_INK,
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -0.5,
  },
  wordmarkAccent: {
    color: COCKPIT_EMBER,
  },
  tagline: {
    color: COCKPIT_INK_MUTED,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 300,
    fontWeight: '400',
  },
  featureMedallion: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COCKPIT_BG_RAISED,
    borderWidth: 1,
    borderColor: 'rgba(138,170,214,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    shadowColor: '#5B7BC9',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  copyBlock: { gap: 8, paddingHorizontal: 4, alignItems: 'center' },
  copyBlockTop: { gap: 8, paddingHorizontal: 4, paddingTop: 8 },
  eyebrow: {
    color: COCKPIT_CYAN,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heading: {
    color: COCKPIT_INK,
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: -0.5,
    lineHeight: 30,
    textAlign: 'center',
  },
  subhead: {
    color: COCKPIT_INK_DIM,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  formCard: {
    backgroundColor: COCKPIT_BG_RAISED,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COCKPIT_HAIR,
    padding: 16,
    gap: 14,
  },
  field: { gap: 6 },
  fieldLabel: {
    color: COCKPIT_INK_DIM,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 44,
    backgroundColor: COCKPIT_BG,
    borderWidth: 1,
    borderColor: COCKPIT_HAIR,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COCKPIT_INK,
    fontSize: 16,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COCKPIT_HAIR_STRONG,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: COCKPIT_INK,
  },
  errorBanner: {
    backgroundColor: 'rgba(225,85,84,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(225,85,84,0.32)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    color: '#E5A8A7',
    fontSize: 13,
    lineHeight: 17,
  },
  actionsBlock: { gap: 8 },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COCKPIT_EMBER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.5 },
  linkButton: { paddingVertical: 8, alignItems: 'center' },
  linkButtonText: {
    color: COCKPIT_CYAN,
    fontSize: 14,
    fontWeight: '600',
  },
  linkButtonTextNeutral: {
    color: COCKPIT_INK_DIM,
    fontSize: 14,
    fontWeight: '500',
  },
  signOutLink: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  signOutLinkText: {
    color: COCKPIT_INK_FAINT,
    fontSize: 13,
    fontWeight: '500',
  },
});

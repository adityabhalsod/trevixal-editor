# Protecting a document

Passwords, expiry, restrictions, the lock screen, redaction, locked sections
and read-only mode. Everything here is under *File*, *Tools* and *View*.

## Password protection

*File > Protect with password...* encrypts the document with a password you
choose. The saved envelope (`.tvx`, or the autosave in local storage) is
unreadable without it. The key is derived with PBKDF2-SHA256 (310,000 rounds
by default) and the content sealed with AES-GCM, using the browser's own
cryptography; there is no cipher code in the editor to audit or keep current.

Leave the password blank in the dialog to remove protection. The password is
never stored: lose it and the document is gone.

## Expiry

An optional expiry stops the document opening after a date. The status bar
says how long is left, rounding *down* so it never overstates the time:
forty-five days reads as "in 1 month", never "in 2 months". This string tells
someone when a document stops opening, and the failure mode of overstating it
is losing access while believing there was time.

## The lock screen

A password-protected document locks itself after ten minutes with nothing
typed, clicked or scrolled. The document is hidden, and only its password
brings it back. *File > Lock now* locks it at once, before you walk away.

The host sets the wait with `autoLockMinutes`, and `0` turns the timer off.
Without a password there is nothing to unlock with, so *Lock now* asks you to
protect the document first.

## Unlocking with a passkey

*File > Unlock with a passkey...* registers a passkey for a password-protected
document: your device's own sign-in, a fingerprint, a face or a PIN. The lock
screen then offers **Use a passkey** beside the password box. The page checks
the passkey's signature itself, over a challenge it makes just then, so no
server is involved and the key never leaves your device. Passkeys need a site
with a domain name, not a bare IP address.

## Digital signatures

*File > Sign document...* signs the document as it is now, under the name you
give, with a key kept in this browser. The status line then says who signed it
and when, with the key's fingerprint. After any change it says "Changed since
Ada signed it" instead, and a signature that has been tampered with says it
does not check out. The signature travels in the file, so whoever opens it
sees the same.

A signature proves the text is what the key's holder signed. It does not prove
who holds the key, so compare the fingerprint with one you got some other way
before relying on a name.

## Audit log

*Tools > Audit log...* lists who changed the document, when, and by how much:
characters in and out, formatting, and where. Edits by one person within a
minute of each other count as one entry. **Download CSV** saves the log. It is
kept in this browser, not in the document.

## Printing a protected document

A protected document prints under a faint diagonal watermark: "Protected ·
printed" and the date. The print preview shows it too.

## Restrictions

*File > Restrictions...* blocks copy, cut, paste, print, download or the
context menu, individually. A blocked attempt says so in the status line.

These keep an honest user honest. They are guard rails against casual
leakage, not a confidentiality control: anything rendered in a browser can be
read out of it, and a reader can always photograph the screen.

## Redaction

Select words and choose *Tools > Redact selection*. They turn into a black
bar. You still have them, under the bar, and running the command again brings
them back.

Nothing redacted leaves the editor. Every download, the print preview and the
printed page carry a fixed row of blocks, `█████`, in place of the words. The
row is the same length however long the words were, so their length does not
get out either. Copying, cutting or dragging the text does the same. The file
name comes from the redacted copy, so a redacted heading stays out of it.

Your own saved document keeps the words. That includes the autosave, the
workspace and an encrypted `.tvx`, since reopening it should give you back
what you wrote.

## Locked sections

Select blocks and choose *Tools > Lock selected blocks*. They become one
framed section marked *Locked*. The rest of the document stays editable, but
no edit can change the section: not typing, not a paste, not a deletion that
runs across it. Moving the blocks around it is fine. When an edit is refused,
the status line says why.

*Tools > Locked sections...* lists every locked section by its first words
and unlocks the one you pick.

## Read-only mode

*View > Read-only mode* locks the surface without a password. The menus that
would change the document are disabled; navigation, search and copying (if
not restricted) keep working.

## In the assembled editor

Nothing about protection is persisted by the demo. A reload starts
unprotected, as a demo should. Your own integration decides what to remember;
the [security extension](../extensions/security) page shows the calls.

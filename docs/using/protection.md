# Protecting a document

Passwords, expiry, restrictions and read-only mode. Everything here is under
*File* and *View*.

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

## Restrictions

*File > Restrictions...* blocks copy, cut, paste, print, download or the
context menu, individually. A blocked attempt says so in the status line.

These keep an honest user honest. They are guard rails against casual
leakage, not a confidentiality control: anything rendered in a browser can be
read out of it, and a reader can always photograph the screen.

## Read-only mode

*View > Read-only mode* locks the surface without a password. The menus that
would change the document are disabled; navigation, search and copying (if
not restricted) keep working.

## In the assembled editor

Nothing about protection is persisted by the demo. A reload starts
unprotected, as a demo should. Your own integration decides what to remember;
the [security extension](../extensions/security) page shows the calls.

AddOrHide 1.1.16 asks for the same permissions as 1.0.13.

- **No Watched tab on Hidden Videos opened from a private window:** browsers can't run extension pages inside a private window, so Hidden Videos opens as an ordinary window and couldn't tell where it was opened from. The 1.1.15 fix therefore had no effect. When opened from a private window, the page now gets `#private` and leaves the Watched list out of its tabs, its count, Restore all and Remove all. Opening it again from a normal window shows the list again.

**Install from source:** download `AddOrHide-1.1.16.zip`, unzip it, open `chrome://extensions`, turn on Developer mode, and choose Load unpacked.

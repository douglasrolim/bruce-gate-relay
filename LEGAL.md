# Legal notice and acceptable use

> **This is a notice and a disclaimer, not additional license terms.**
> The software is licensed under the GNU Affero General Public License v3.0 or later (see [LICENSE](LICENSE)).
> The AGPL does not allow extra restrictions to be added to the license, so nothing in this file
> restricts your rights under it. This file explains how the authors intend the project to be used
> and what you are responsible for. It is not legal advice.

## Authorized use only

Use bruce-gate-relay only with gates, garage doors and barriers that **you own or are explicitly
authorized to operate**. Capturing, storing or replaying radio signals of systems you are not
authorized to operate may be illegal where you live.

## Fixed-code remotes only

The project replays recordings of **fixed-code** remotes that you made yourself. It does not attempt
to defeat rolling-code (hopping-code) or encrypted systems, and must not be used for that. A rolling-code
remote will simply not work with a replayed recording.

## Radio regulations

You are responsible for complying with the radio rules of your country: allowed frequencies, transmit
power and duty cycle (for example FCC in the United States, ETSI/CE in the European Union, Anatel in
Brazil). Only transmit on frequencies that are legal in your region.

## Safety

A gate that opens remotely can hurt people, animals or vehicles. Only open a gate when you can be sure
it is safe to do so, and keep the gate's own safety devices (photocells, obstacle detection, edges)
working. **Do not use this project for safety-critical or life-safety purposes.**

## Security is your responsibility

You are responsible for securing your Google and Cloudflare accounts, the device token, the Access
service token, the device itself and the list of people who have access. Review the
[security model](SECURITY.md) and keep guest invites short.

## Location and privacy

The web app can use your phone's location to show nearby gates. The location is processed on your
phone; it is sent to the server only when you open a gate that requires proximity, and only the rounded
distance (for example "≈150 m") is kept in the activity log. Raw coordinates are never stored. Gate
locations set by an admin are stored in your own Cloudflare account. Browser geolocation can be spoofed,
so proximity checks are a deterrent, not a security control.

## No warranty, limitation of liability

The software is provided **"as is", without warranty of any kind** (see sections 15 and 16 of the
license). In plain words: the authors and contributors are not liable for any damage, injury,
unauthorized access, property loss, fines or other legal consequences that result from using or
misusing this project.

## No affiliation

This project is not affiliated with or endorsed by LilyGO, the Bruce project, Cloudflare, Google or any
gate manufacturer. All trademarks belong to their owners.

If you need legal certainty for your situation, ask a lawyer.

/**
 * The SetOut engine.
 *
 * One package, used by the designer in the browser, the workspace in the
 * browser and the API on the server, so the three can never disagree about a
 * size. It is pure: no screen, no network, no clock, no storage.
 *
 *   document     the design document, its format and its upgrades
 *   ruleset      the making rules as data, and a company's overrides
 *   spec         the cut list for a design, made to one company's rules
 *   panes        each pane as the toughener draws it, cut to its shape
 *   shapes       the shape each pane is cut to, and where it stands in the opening
 *   sliding      a sliding door on CRL's Serenity: its sizes, holes and header
 *   fittings     what the fitter takes: hinges, handle, seal, channel or clamps
 *   hinges       which of CRL's hinges each door hangs on: the styles, and each one's number
 *   crl          CRL's catalogue number for each of those, in the shower's finish
 *   photos       CRL's photo of a hinge or a handle, by catalogue number
 *   measure      what the customer measured, and the checks on it
 *   geometry     the shape of the enclosure, worked out from its panels
 *   layout       keeping panel widths in step with a measured run
 *   journey      the measuring screens each shape needs (being replaced by cards)
 *   cards        the measuring card deck
 *   templates    the standard layouts
 *   selfCheck    one known design, for health checks
 */
export * from './version';
export * from './types';
export * from './choices';
export * from './document';
export * from './ruleset';
export * from './rules';
export * from './panelModel';
export * from './fabrication';
export * from './spec';
export * from './sliding';
export * from './panes';
export * from './shapes';
export * from './fittings';
export * from './hinges';
export * from './crl';
export { CRL_CATALOGUE_DATE } from './crl-catalogue';
export * from './photos';
export * from './measure';
export * from './geometry';
export * from './layout';
export * from './journey';
export * from './cards';
export * from './templates';
export * from './selfCheck';

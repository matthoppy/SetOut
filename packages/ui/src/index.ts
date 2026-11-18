/**
 * Screens and parts shared by the designer and the workspace.
 *
 * The measuring cards, the drawings and the form parts move here in step 1,
 * so both apps draw a shower with the same components. The installation
 * drawings and the fitting guide are here already: staff read them in the
 * workspace, and a customer's fitter reads the same on the customer's page.
 */
export { SystemStatus } from './SystemStatus';
export { crlPhotoSrc } from './crlPhoto';
export { Elevation, OutOfSquare, SetOutBand, paneName } from './InstallDrawings';
export { FittingGuide } from './FittingGuide';

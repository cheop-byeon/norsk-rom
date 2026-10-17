const unavailable = () => { throw new Error('Local file-library storage is available in the installed Android and iOS app.'); };
export const listLocalLessons = async () => [];
export const saveLocalLesson = unavailable;
export const removeLocalLesson = async () => {};
export const importLocalFile = unavailable;
export const readLocalText = unavailable;

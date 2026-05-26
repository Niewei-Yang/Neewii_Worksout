export const yearStats = import.meta.glob('./year_*.svg', {
    import: 'ReactComponent',
});
export const yearGithubStats = import.meta.glob('./github_*.svg', {
    import: 'ReactComponent',
});
export const totalStat = import.meta.glob(['./github.svg', './grid.svg', './mol.svg'], { import: 'ReactComponent' });

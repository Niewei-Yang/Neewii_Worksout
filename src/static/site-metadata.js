const getBasePath = () => {
    const baseUrl = import.meta.env.BASE_URL;
    return baseUrl === '/' ? '' : baseUrl;
};
const data = {
    siteTitle: 'Neewii的Workouts Map',
    siteUrl: 'neewii-worksout.vercel.app',
    logo: 'https://avatars.githubusercontent.com/u/138655239?v=4',
    description: 'Personal site and blog',
    keywords: 'workouts, running, cycling, riding, roadtrip, hiking, swimming',
    navLinks: [
        {
            name: 'Summary',
            url: `${getBasePath()}/summary`,
        },
        {
            name: 'Strava',
            url: `https://www.strava.com/athletes/193524135`,
        },
        {
            name: 'WeihangのPage',
            url: 'https://weihang-worksout.vercel.app/',
        },
        {
            name: 'YihongのBlog',
            url: 'https://blog.yihong0618.me/',
        },
        {
            name: 'About',
            url: 'https://github.com/ben-29/workouts_page/blob/master/README-CN.md',
        },
    ],
};
export default data;

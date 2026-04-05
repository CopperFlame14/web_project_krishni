// Smart Campus - Custom API to mock Supabase SDK using our Express endpoints
window.APP_CONFIG = { SUPABASE_URL: 'internal-api' };

window.supabaseClient = {
    auth: {
        async getUser() {
            const user = JSON.parse(localStorage.getItem('campus_user') || 'null');
            return { data: { user } };
        },
        async signOut() {
            localStorage.removeItem('campus_token');
            localStorage.removeItem('campus_user');
            localStorage.removeItem('campus_role');
            window.location.href = '/login';
        }
    },
    from(tableName) {
        let endpoint = '';
        if (tableName === 'subjects') endpoint = '/subjects';
        else if (tableName === 'tasks') endpoint = '/tasks';
        else if (tableName === 'study_sessions') endpoint = '/sessions';
        else if (tableName === 'daily_progress') endpoint = '/progress';
        else if (tableName === 'daily_moods') endpoint = '/moods';
        else if (tableName === 'habits') endpoint = '/habits';
        else if (tableName === 'habit_logs') endpoint = '/habits/logs';
        else if (tableName === 'user_profiles') endpoint = '/profile';
        
        let queryParams = [];
        let singleResult = false;
        
        return {
            select(cols) { return this; },
            eq(col, val) { 
                if (col !== 'user_id') queryParams.push(`${col}=${val}`);
                return this; 
            },
            order(col, opts) { return this; },
            single() { singleResult = true; return this; },
            limit(n) { return this; },
            
            async then(resolve) {
                try {
                    let res = await fetch(`/api/planner${endpoint}`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('campus_token')}` }
                    });
                    let data = await res.json();
                    
                    if (Array.isArray(data)) {
                        for (let q of queryParams) {
                            let [k,v] = q.split('=');
                            data = data.filter(item => String(item[k]) === v);
                        }
                    }

                    if (singleResult && Array.isArray(data)) data = data.length > 0 ? data[0] : null;
                    resolve({ data, error: null });
                } catch(e) {
                    resolve({ data: null, error: e });
                }
            },
            
            async insert(arr) {
                try {
                    let res = await fetch(`/api/planner${endpoint}`, {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${localStorage.getItem('campus_token')}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(arr[0])
                    });
                    let data = await res.json();
                    return { data: singleResult ? data : [data], error: null };
                } catch(e) {
                    return { data: null, error: e };
                }
            },
            
            async update(obj) {
                 try {
                     let method = 'PUT';
                     let url = `/api/planner${endpoint}`;
                     if (tableName === 'tasks') {
                         let idEq = queryParams.find(q => q.startsWith('id='));
                         if (idEq) url += `/${idEq.split('=')[1]}`;
                     } else if (tableName === 'daily_moods') {
                         method = 'POST';
                         let dateEq = queryParams.find(q => q.startsWith('mood_date='));
                         if (dateEq) obj.mood_date = dateEq.split('=')[1];
                     }
                     
                     let res = await fetch(url, {
                        method: method,
                        headers: { 
                            'Authorization': `Bearer ${localStorage.getItem('campus_token')}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(obj)
                     });
                     let data = await res.json();
                     return { data, error: null };
                 } catch(e) {
                     return { data: null, error: e };
                 }
            },
            
            async delete() {
                 try {
                     if (tableName === 'habit_logs') {
                         return { data: [], error: null }; // handled by CASCADE
                     }
                     let url = `/api/planner${endpoint}`;
                     let idEq = queryParams.find(q => q.startsWith('id='));
                     if (idEq) url += `/${idEq.split('=')[1]}`;
                     
                     let res = await fetch(url, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('campus_token')}` }
                     });
                     let data = await res.json();
                     return { data, error: null };
                 } catch(e) {
                     return { data: null, error: e };
                 }
            }
        };
    }
};

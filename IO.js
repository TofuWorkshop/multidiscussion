import mariadb from "mysql2/promise";
import fs from "fs";

import {utilities} from "./utilities.js";

let pool;
try{
    pool = mariadb.createPool(JSON.parse(
        fs.readFileSync('db.config.json', 'utf-8')
    ));
}catch (err){
    console.error(err);
}

const SQLfunctions = {
    getChatLastAdmins: async function(chat_id) {
        try {
            let [rows] = await pool.query('SELECT id FROM ChatAdmins where chat_id = ?', [chat_id]);
            return rows.map(row => row['id']);
        }catch (err)
        {
            throw Error('查询过去记录的管理员列表出错：'+err);
        }
    }
    ,getSyncCount: async function ()
    {
        let [rows] = await pool.query('SELECT COUNT(*) as count FROM Sync')
        return rows[0].count;
    }
    ,findSyncviaChannels: async function (channel)
    {
        let [rows] = await pool.query('SELECT * FROM Sync WHERE channel = ?',
            [channel]);
        let ret = [];
        for(let row of rows)
        {
            ret.push({
                channel: row['channel'],
                group: row['group'],
                admin: row['admin']})
        }
        return ret;
    }
    ,checkChannelRecorded: async function(id){
        try{
            let [rows] = await pool.query('SELECT COUNT(*) AS count FROM Channels WHERE id = ?', [id]);
            console.log(rows[0])
            return rows[0].count > 0;
        } catch(e)
        {
            throw new Error('根据会话id查询频道信息出错');
        }
    }
    , searchCommonChannels(uid) {
        let [rows] = pool.query('SELECT channels.id, title FROM Chats\n' +
            '    JOIN Channels ON Chats.id = Channels.id\n' +
            '    JOIN Chatadmins ON Chats.id = Chatadmins.chat_id\n' +
            '    WHERE Chatadmins.id = ?', [uid]);
        return rows;
    }
    ,recordUser: function(userid, isbot){
        return pool.query( 'INSERT INTO Users(id, isbot) SELECT ? , ? WHERE NOT EXISTS (SELECT 1 FROM Users WHERE id = ?)', [userid, isbot, userid] )
    }
    ,async recordChat(id, type) {
        // const channelTypes = ['channel'];
        // const groupTypes = ['group', 'supergroup'];
        let [res] = await pool.query('INSERT INTO Chats(id) SELECT ? WHERE NOT EXISTS( SELECT 1 FROM Chats WHERE id = ? )', [id, id]);
        if(res.affectedRows)
            if (type === "channel") {
                await pool.query('INSERT INTO Channels(id) VALUES(?)', [id]);
            } else
                await pool.query('INSERT INTO Groups(id) VALUES(?)', [id]);
        //TODO 构造Promise
    }
    ,addChatAdmins: function(chat_id, admins_id){
        //可能会超过最大尺寸
        return pool.query(`INSERT INTO ChatAdmins(chat_id, id) VALUES 
                            ${utilities.strCartesianProduct(`(${chat_id},{})`, admins_id).join()}`);
    }
    ,async updateChatAdmins(chat_id, admins_id) {
        let old_admins_id= await this.getChatLastAdmins(chat_id);
        let [oiold, oicur] = utilities.diff(old_admins_id, admins_id);
        if(oiold.length)
            SQLfunctions.removeChatAdmins(chat_id, oiold);
        if(oicur.length)
            SQLfunctions.addChatAdmins(chat_id, oicur);
    }
    ,removeChatAdmins: function(chat_id, admins_id)
    {
        return pool.query('DELETE FROM ChatAdmins WHERE chat_id = ? AND id in (?)', [chat_id, admins_id]);
    }
    ,removeMyChat: function (chat_id)
    {
        return pool.query(`DELETE FROM Chats WHERE id = ?`,[chat_id]);
    }
    ,removeSyncWithChat: function(channel, admins){
        return pool.query('DELETE FROM Sync WHRER channel_id = ? AND admin_id IN (?)',
            [channel, admins]);
    }
}

export {
    SQLfunctions
}